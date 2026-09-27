/**
 * LabelBuddy AI - 手機連線啟動器（Cloudflare Tunnel）
 *
 * 用途：一次啟動「本機伺服器 ＋ Cloudflare Tunnel」，讓手機用 HTTPS 網址打開 App。
 *
 * 【為什麼需要 Tunnel】
 *   手機要連到筆電上的服務，本來只能走區域網路的 http://192.168.x.x:3000，
 *   但那個位址：
 *     1. 沒有 HTTPS → PWA 的 Service Worker（離線快取）不會生效
 *     2. 換一個 Wi-Fi 就失效
 *     3. 不能分享給別人（例如評審）
 *   Cloudflare Tunnel 把本機服務變成一個公開的 HTTPS 網址，三個問題一次解決，
 *   而且不用付費、不用設定路由器、不用固定 IP。
 *
 * 【為什麼用 .mjs 而不是 .bat】
 *   Windows 批次檔在 chcp 65001 下讀取含中文的內容會亂碼，連註解與變數都會解析失敗。
 *   因此 .bat 只保留純 ASCII 的引導程式碼，所有中文訊息與邏輯都放在這個 UTF-8 腳本裡。
 *   （沿用 scripts/launch.mjs 既有的模式）
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, openSync, readSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = Number(process.env.PORT) || 3000;
const LOCAL_URL = `http://127.0.0.1:${PORT}`;

/** cloudflared 的候選位置（依序尋找） */
const CLOUDFLARED_CANDIDATES = [
  process.env.CLOUDFLARED_PATH,
  'D:\\cloudflared\\cloudflared.exe',
  path.join(os.homedir(), '.workbuddy-ai', 'binaries', 'cloudflared', 'cloudflared.exe'),
  path.join(ROOT, 'cloudflared.exe'),
].filter(Boolean);

const CLOUDFLARED_DOWNLOAD =
  'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';

const C = {
  reset: '\u001b[0m',
  bold: '\u001b[1m',
  dim: '\u001b[2m',
  red: '\u001b[31m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  cyan: '\u001b[36m',
  magenta: '\u001b[35m',
};

const rule = () => '  ' + '─'.repeat(52);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function banner() {
  console.log('');
  console.log(rule());
  console.log(`  ${C.bold}LabelBuddy AI${C.reset}  ${C.dim}手機連線模式${C.reset}`);
  console.log(rule());
  console.log('');
}

/** 讓視窗停在原處，方便使用者看到錯誤訊息 */
function pause() {
  console.log('  按 Enter 鍵關閉視窗...');
  try {
    const fd = openSync('CONIN$', 'rs');
    const buf = Buffer.alloc(1);
    readSync(fd, buf, 0, 1, null);
  } catch {
    /* 非互動環境（例如管線執行）就略過 */
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

// ---------------------------------------------------------------
// 步驟 1：檢查依賴
// ---------------------------------------------------------------
function checkDeps() {
  const tsxCli = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  if (!existsSync(tsxCli)) {
    fail('找不到 node_modules，尚未安裝依賴。', `請先在專案目錄執行：${C.cyan}npm install${C.reset}`);
  }
  return tsxCli;
}

// ---------------------------------------------------------------
// 步驟 2：尋找 Node.js（沿用 launch.mjs 的策略）
// ---------------------------------------------------------------
function findNode() {
  const local = path.join(ROOT, 'node.exe');
  if (existsSync(local)) return { exe: local, from: '專案內附' };

  const probe = spawnSync('node', ['--version'], { shell: true, encoding: 'utf8' });
  if (probe.status === 0 && probe.stdout) {
    return { exe: process.execPath, from: `系統安裝（${probe.stdout.trim()}）` };
  }

  const wbRoot = path.join(os.homedir(), '.workbuddy-ai', 'binaries', 'node', 'versions');
  const currentFile = path.join(wbRoot, 'current');
  if (existsSync(currentFile)) {
    const ver = readFileSync(currentFile, 'utf8').trim();
    const cand = path.join(wbRoot, ver, 'node.exe');
    if (existsSync(cand)) return { exe: cand, from: `WorkBuddy 環境（${ver}）` };
  }
  const fallback = path.join(wbRoot, '22.22.2-3', 'node.exe');
  if (existsSync(fallback)) return { exe: fallback, from: 'WorkBuddy 環境' };

  return null;
}

// ---------------------------------------------------------------
// 步驟 3：尋找 cloudflared
// ---------------------------------------------------------------
function findCloudflared() {
  for (const p of CLOUDFLARED_CANDIDATES) {
    if (existsSync(p)) return p;
  }
  return null;
}

// ---------------------------------------------------------------
// 步驟 4：取得區域網路 IP（同一個 Wi-Fi 的備用網址）
// ---------------------------------------------------------------
function lanIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const info of ifaces[name] || []) {
      if (info.family === 'IPv4' && !info.internal) return info.address;
    }
  }
  return null;
}

// ---------------------------------------------------------------
// 步驟 5：等待伺服器就緒
// ---------------------------------------------------------------
async function waitForHealth(timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${LOCAL_URL}/api/health`);
      if (res.ok) return true;
    } catch {
      /* 還沒起來 */
    }
    await sleep(600);
  }
  return false;
}

/**
 * 產生 QR Code 並開啟（失敗不影響主流程）
 *
 * ⚠️ 這裡刻意用「非同步的 spawn」而不是 spawnSync。
 *    實測：對這個 Python venv 的 python.exe 呼叫 spawnSync 會直接回
 *      EBUSY（資源忙碌）
 *    但同樣的指令用非同步 spawn 就正常執行（exit 0）。
 *    這個差異只在 Windows ＋ venv 的 python.exe（本身是個轉向器）上出現，
 *    非同步版本兩邊都能跑，所以統一用非同步。
 */
async function showQrCode(url) {
  const py = path.join(
    os.homedir(),
    '.workbuddy-ai',
    'binaries',
    'python',
    'envs',
    'default',
    'Scripts',
    'python.exe'
  );
  if (!existsSync(py)) return false;

  const outDir = path.join(os.tmpdir(), 'labelbuddy-qr');
  try {
    mkdirSync(outDir, { recursive: true });
  } catch {
    /* ignore */
  }
  const outFile = path.join(outDir, 'phone-url.png');

  // ⚠️ 路徑一律轉成正斜線再交給 Python。
  //    Windows 的反斜線在 Python 字串裡是轉義字元，搭配 r"..." 原始字串時
  //    又會變成「保留雙反斜線」而找不到路徑（實測第一次就是這樣失敗）。
  //    正斜線在 Windows 的 Python 完全合法，最不容易出錯。
  const pyPath = outFile.replace(/\\/g, '/');

  const code = `
import qrcode
img = qrcode.make(${JSON.stringify(url)})
img = img.resize((560, 560))
img.save("${pyPath}")
`;

  const result = await new Promise((resolve) => {
    const child = spawn(py, ['-c', code], { stdio: ['ignore', 'pipe', 'pipe'] });
    let errText = '';
    child.stderr.on('data', (d) => (errText += d));
    child.on('error', (e) => resolve({ ok: false, detail: e.code || e.message }));
    child.on('close', (exitCode) => {
      const ok = exitCode === 0 && existsSync(outFile);
      const detail = errText.trim().split('\n').filter(Boolean).pop() || `exit ${exitCode}`;
      resolve({ ok, detail });
    });
  });

  if (!result.ok) {
    // 失敗不影響主流程，但要讓使用者看得見原因（否則會以為是壞掉）
    console.log(`  ${C.dim}（QR Code 產生失敗：${result.detail}）${C.reset}`);
    return false;
  }

  // 用預設看圖程式開啟
  spawn('cmd', ['/c', 'start', '', outFile], { detached: true, stdio: 'ignore' }).unref();
  return true;
}

// ---------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------
banner();

const tsxCli = checkDeps();
console.log(`  ${C.green}[1/5]${C.reset} 依賴檢查完成`);

const node = findNode();
if (!node) {
  fail('找不到 Node.js 執行檔。', `請安裝 Node.js 22 或以上版本：${C.cyan}https://nodejs.org${C.reset}`);
}
console.log(`  ${C.green}[2/5]${C.reset} 使用 Node：${C.dim}${node.from}${C.reset}`);

const cloudflared = findCloudflared();
if (!cloudflared) {
  fail(
    '找不到 cloudflared.exe。',
    `請用瀏覽器下載後放進 D:\\cloudflared\\ ：\n         ${C.cyan}${CLOUDFLARED_DOWNLOAD}${C.reset}`
  );
}
console.log(`  ${C.green}[3/5]${C.reset} cloudflared：${C.dim}${cloudflared}${C.reset}`);
console.log('');
console.log(`  ${C.dim}正在啟動本機伺服器（首次啟動需編譯，請稍候）...${C.reset}`);

// --- 啟動伺服器（背景）---
const server = spawn(node.exe, [tsxCli, 'server.ts'], {
  cwd: ROOT,
  stdio: 'ignore',
  env: { ...process.env, DISABLE_HMR: 'true' },
});

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    server.kill();
  } catch {
    /* ignore */
  }
  try {
    tunnel?.kill();
  } catch {
    /* ignore */
  }
  console.log('');
  console.log(`  ${C.dim}已停止。${C.reset}`);
  console.log('');
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

const healthy = await waitForHealth();
if (!healthy) {
  try {
    server.kill();
  } catch {
    /* ignore */
  }
  fail('本機伺服器在 90 秒內沒有就緒。', '請確認埠 3000 沒有被其他程式佔用。');
}
console.log(`  ${C.green}[4/5]${C.reset} 本機伺服器就緒：${C.dim}${LOCAL_URL}${C.reset}`);
console.log(`  ${C.dim}正在建立 Cloudflare Tunnel...${C.reset}`);

// --- 啟動 Tunnel ---
const tunnel = spawn(cloudflared, ['tunnel', '--url', LOCAL_URL, '--no-autoupdate'], {
  cwd: path.dirname(cloudflared),
  stdio: ['ignore', 'pipe', 'pipe'],
});

let publicUrl = null;
const urlPattern = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

function scan(chunk) {
  if (publicUrl) return;
  const m = String(chunk).match(urlPattern);
  if (m) publicUrl = m[0];
}
tunnel.stdout.on('data', scan);
tunnel.stderr.on('data', scan);

// 最多等 60 秒
const tunnelDeadline = Date.now() + 60000;
while (!publicUrl && Date.now() < tunnelDeadline) {
  if (tunnel.exitCode !== null) break;
  await sleep(400);
}

if (!publicUrl) {
  shutdown(1);
  fail('Cloudflare Tunnel 建立失敗。', '請確認網路可以連到 Cloudflare，然後重試。');
}

console.log(`  ${C.green}[5/5]${C.reset} Tunnel 建立完成`);
console.log('');

// --- 顯示結果 ---
const lan = lanIp();
const qrOk = await showQrCode(publicUrl);

console.log(rule());
console.log(`  ${C.bold}手機請開啟這個網址：${C.reset}`);
console.log('');
console.log(`  ${C.cyan}${C.bold}${publicUrl}${C.reset}`);
console.log('');
if (qrOk) {
  console.log(`  ${C.magenta}📱 QR Code 已開啟，用手機相機掃描即可${C.reset}`);
}
if (lan) {
  console.log(`  ${C.dim}🏠 同一個 Wi-Fi 也可用：http://${lan}:${PORT}${C.reset}`);
  console.log(`  ${C.dim}   （這個沒有 HTTPS，PWA 離線快取不會生效）${C.reset}`);
}
console.log(rule());
console.log('');
console.log(`  ${C.yellow}⚠ 這個網址每次重開都會不一樣${C.reset}`);
console.log(`  ${C.dim}停止：按 ${C.reset}${C.bold}Ctrl + C${C.reset}`);
console.log('');
console.log(`  ${C.dim}保持這個視窗開著，關掉就斷線了。${C.reset}`);
console.log('');

// 把網址寫到桌面，方便之後查
try {
  const desktop = path.join(os.homedir(), 'Desktop');
  if (existsSync(desktop)) {
    writeFileSync(path.join(desktop, '手機連線網址.txt'), `${publicUrl}\n`, 'utf8');
  }
} catch {
  /* ignore */
}
