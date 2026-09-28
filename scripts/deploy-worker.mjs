/**
 * LabelBuddy AI — Cloudflare Workers 部署助手
 *
 * 用途：一次完成「登入 Cloudflare → 設定 API 金鑰 → 部署上線」。
 *
 * 【為什麼需要這個腳本，而不是直接打 wrangler 指令】
 *   1. 要按正確的順序做四件事，漏一步就會失敗（例如沒設金鑰就部署，
 *      線上版本會沒有 AI 功能卻看起來「部署成功」）。
 *   2. 金鑰要從 .env 讀出來餵給 wrangler，不該讓使用者手動複製貼上。
 *   3. 中文訊息與錯誤說明放在這裡（.bat 不能放中文，見 scripts/launch.mjs 的說明）。
 *
 * 【為什麼不把金鑰寫進 wrangler.toml】
 *   那個檔案會進版控。金鑰一律用 `wrangler secret put` 存成加密的 Secret。
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, openSync, readSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const WRANGLER = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

/** 要上傳到 Cloudflare 的金鑰（.env 裡的名字 → Secret 名稱） */
const SECRETS = ['OPENROUTER_API_KEY', 'GEMINI_API_KEY'];

const C = {
  reset: '\u001b[0m',
  bold: '\u001b[1m',
  dim: '\u001b[2m',
  red: '\u001b[31m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  cyan: '\u001b[36m',
};

const rule = () => '  ' + '─'.repeat(52);

function banner() {
  console.log('');
  console.log(rule());
  console.log(`  ${C.bold}LabelBuddy AI${C.reset}  ${C.dim}部署到 Cloudflare Workers${C.reset}`);
  console.log(rule());
  console.log('');
}

function pause() {
  console.log('  按 Enter 鍵關閉視窗...');
  try {
    const fd = openSync('CONIN$', 'rs');
    const buf = Buffer.alloc(1);
    readSync(fd, buf, 0, 1, null);
  } catch {
    /* 非互動環境就略過 */
  }
}

function fail(msg, hint) {
  console.log(`  ${C.red}[錯誤]${C.reset} ${msg}`);
  if (hint) {
    console.log('');
    console.log(`         ${hint}`);
  }
  console.log('');
  pause();
  process.exit(1);
}

/**
 * 執行 wrangler，同時「即時顯示」與「捕捉輸出」。
 *
 * 【為什麼不直接用 spawnSync + capture】
 *   首次部署要上傳約 28 MB，若用 capture 使用者會盯著一個完全沒動靜的畫面
 *   一兩分鐘，會以為當掉了。這裡改成串流：邊跑邊印，同時累積起來解析網址。
 */
function wranglerStreaming(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [WRANGLER, ...args], {
      cwd: ROOT,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    });
    let all = '';
    const onData = (chunk) => {
      const text = chunk.toString();
      all += text;
      process.stdout.write(text);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (e) => resolve({ status: 1, output: String(e) }));
    child.on('close', (code) => resolve({ status: code ?? 1, output: all }));
  });
}

/** 執行 wrangler 並即時顯示輸出（互動式指令需要繼承 stdio） */
function wrangler(args, opts = {}) {
  return spawnSync(process.execPath, [WRANGLER, ...args], {
    cwd: ROOT,
    stdio: opts.capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
  });
}

/** 從 .env 讀出金鑰（不印出值） */
function readEnv() {
  const p = path.join(ROOT, '.env');
  if (!existsSync(p)) return {};
  const out = {};
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const [k, ...rest] = t.split('=');
    out[k.trim()] = rest.join('=').trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

// ---------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------
banner();

if (!existsSync(WRANGLER)) {
  fail(
    '找不到 wrangler。',
    `請先在專案目錄執行：${C.cyan}npm install${C.reset}`
  );
}

// --- 步驟 1：檢查登入狀態 ---
console.log(`  ${C.dim}[1/4]${C.reset} 檢查 Cloudflare 登入狀態...`);
const whoami = wrangler(['whoami'], { capture: true });
const whoamiText = `${whoami.stdout || ''}${whoami.stderr || ''}`;
const loggedIn = whoami.status === 0 && /account|email|associated/i.test(whoamiText) && !/not authenticated|not logged in/i.test(whoamiText);

if (!loggedIn) {
  console.log(`  ${C.yellow}尚未登入 Cloudflare${C.reset}`);
  console.log('');
  console.log('  接下來會開啟瀏覽器請你授權：');
  console.log(`    1. 選擇 ${C.bold}Allow${C.reset}`);
  console.log('    2. 授權完成後瀏覽器會說可以關閉視窗');
  console.log('    3. 回到這個視窗，程式會自動繼續');
  console.log('');
  console.log(`  ${C.dim}按 Enter 開始登入...${C.reset}`);
  pause();

  const login = wrangler(['login']);
  if (login.status !== 0) {
    fail(
      '登入失敗。',
      `可以手動執行：${C.cyan}node node_modules/wrangler/bin/wrangler.js login${C.reset}`
    );
  }
  console.log(`  ${C.green}✅ 登入成功${C.reset}`);
} else {
  const m = whoamiText.match(/[^\s]+@[^\s]+/);
  console.log(`  ${C.green}✅ 已登入${C.reset}${m ? ` ${C.dim}(${m[0]})${C.reset}` : ''}`);
}

// --- 步驟 2：上傳 API 金鑰 ---
console.log('');
console.log(`  ${C.dim}[2/4]${C.reset} 設定 API 金鑰（加密儲存，不會寫進版控）...`);
const env = readEnv();
let uploaded = 0;
for (const name of SECRETS) {
  const value = env[name];
  if (!value) {
    console.log(`  ${C.dim}  跳過 ${name}（.env 裡沒有）${C.reset}`);
    continue;
  }
  // 用 stdin 餵值，避免出現在指令列或歷史紀錄裡
  const r = spawnSync(
    process.execPath,
    [WRANGLER, 'secret', 'put', name],
    { cwd: ROOT, input: value + '\n', encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  );
  if (r.status === 0) {
    console.log(`  ${C.green}  ✅ ${name}${C.reset} ${C.dim}(${value.length} 字元)${C.reset}`);
    uploaded++;
  } else {
    console.log(`  ${C.yellow}  ⚠️ ${name} 設定失敗${C.reset} ${C.dim}${(r.stderr || '').trim().split('\n').pop() || ''}${C.reset}`);
  }
}
if (uploaded === 0) {
  console.log('');
  console.log(`  ${C.yellow}⚠️ 沒有成功上傳任何金鑰 —— 線上版本會只能用「本機模式」，無法呼叫雲端 AI。${C.reset}`);
}

// --- 步驟 3：部署 ---
console.log('');
console.log(`  ${C.dim}[3/4]${C.reset} 部署中（首次會上傳約 28 MB 的靜態資源，請稍候）...`);
console.log('');
const deploy = await wranglerStreaming(['deploy']);

if (deploy.status !== 0) {
  console.log('');
  fail(
    '部署失敗。',
    `請把上面的錯誤訊息告訴助手，或手動執行：${C.cyan}node node_modules/wrangler/bin/wrangler.js deploy${C.reset}`
  );
}

// --- 步驟 4：顯示結果 ---
// 從 wrangler 的輸出解析網址，而不是寫死 ——
// 網址格式是 <Worker名稱>.<子網域>.workers.dev，改名就會變。
const urlMatch = deploy.output.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/);
const siteUrl = urlMatch ? urlMatch[0] : '(請看上方 wrangler 輸出的網址)';

console.log('');
console.log(rule());
console.log(`  ${C.green}${C.bold}✅ 部署完成${C.reset}`);
console.log('');
console.log(`  ${C.bold}你的網址：${C.reset}`);
console.log(`  ${C.cyan}${C.bold}${siteUrl}${C.reset}`);
console.log('');
console.log(`  ${C.dim}⚠️ 格式是「<Worker名稱>.<子網域>.workers.dev」，${C.reset}`);
console.log(`  ${C.dim}   兩段剛好同名，所以看起來像重複 —— 這是正常的。${C.reset}`);
console.log('');
console.log(`  用手機打開這個網址就能用了。`);
console.log(`  ${C.dim}永久、有 HTTPS，所以 PWA 的離線快取也會生效。${C.reset}`);
console.log(rule());
console.log('');
pause();
