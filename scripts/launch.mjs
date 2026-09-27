/**
 * LabelBuddy AI - 啟動器
 *
 * 用途：尋找可用的 Node.js，啟動開發伺服器，並在就緒後自動開啟瀏覽器。
 *
 * 為什麼用 .mjs 而不是 .bat：
 *   Windows 批次檔（.bat）在 chcp 65001 下讀取含中文的內容會亂碼，
 *   連註解與變數都會解析失敗。因此 .bat 只保留純 ASCII 的引導程式碼，
 *   所有中文訊息與邏輯都放在這個 UTF-8 的 Node 腳本裡。
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, openSync, readSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = Number(process.env.PORT) || 3000;
const URL = `http://127.0.0.1:${PORT}`;

const C = {
  reset: '\u001b[0m',
  bold: '\u001b[1m',
  dim: '\u001b[2m',
  red: '\u001b[31m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  cyan: '\u001b[36m',
};

const rule = () => '  ' + '─'.repeat(46);

function banner() {
  console.log('');
  console.log(rule());
  console.log(`  ${C.bold}LabelBuddy AI${C.reset}  ${C.dim}銀髮安心食守護者${C.reset}`);
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
// 步驟 1：檢查依賴是否已安裝
// ---------------------------------------------------------------
function checkDeps() {
  const tsxCli = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  if (!existsSync(tsxCli)) {
    fail(
      '找不到 node_modules，尚未安裝依賴。',
      `請先在專案目錄執行：${C.cyan}npm install${C.reset}`
    );
  }
  return tsxCli;
}

// ---------------------------------------------------------------
// 步驟 2：尋找可用的 Node.js
// ---------------------------------------------------------------
function findNode() {
  // (1) 專案內自帶的 node
  const local = path.join(ROOT, 'node.exe');
  if (existsSync(local)) return { exe: local, from: '專案內附' };

  // (2) 系統 PATH 中的 node
  const probe = spawnSync('node', ['--version'], { shell: true, encoding: 'utf8' });
  if (probe.status === 0 && probe.stdout) {
    return { exe: process.execPath, from: `系統安裝（${probe.stdout.trim()}）` };
  }

  // (3) WorkBuddy 隔離環境：先讀 current 檔案解析版本，再退回已知版本
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
// 步驟 3：檢查埠是否被佔用
// ---------------------------------------------------------------
function portInUse() {
  const r = spawnSync('netstat', ['-ano'], { encoding: 'utf8', shell: true });
  if (!r.stdout) return false;
  return r.stdout
    .split('\n')
    .some((l) => /LISTENING/i.test(l) && new RegExp(`[:.]${PORT}\\s`).test(l));
}

// ---------------------------------------------------------------
// 步驟 4：等伺服器就緒後開啟瀏覽器（不阻塞主流程）
// ---------------------------------------------------------------
function openBrowserWhenReady() {
  const script = `
    const http = require('http');
    const url = ${JSON.stringify(URL)};
    const deadline = Date.now() + 90000;
    (function ping() {
      if (Date.now() > deadline) process.exit(0);
      const req = http.get(url + '/api/health', (res) => {
        res.resume();
        if (res.statusCode === 200) {
          const { spawn } = require('child_process');
          spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
          process.exit(0);
        }
        setTimeout(ping, 500);
      });
      req.on('error', () => setTimeout(ping, 500));
      req.setTimeout(2000, () => { req.destroy(); setTimeout(ping, 500); });
    })();
  `;
  const worker = spawn(process.execPath, ['-e', script], {
    detached: true,
    stdio: 'ignore',
  });
  worker.unref();
}

// ---------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------
banner();

const tsxCli = checkDeps();
console.log(`  ${C.green}[1/3]${C.reset} 依賴檢查完成`);

const node = findNode();
if (!node) {
  fail(
    '找不到 Node.js 執行檔。',
    `請安裝 Node.js 22 或以上版本：${C.cyan}https://nodejs.org${C.reset}`
  );
}
console.log(`  ${C.green}[2/3]${C.reset} 使用 Node：${C.dim}${node.from}${C.reset}`);

if (portInUse()) {
  console.log('');
  console.log(`  ${C.yellow}[提醒]${C.reset} 埠 ${PORT} 似乎已被佔用。`);
  console.log(`         若瀏覽器顯示的不是本專案，請關閉先前的視窗後重試。`);
}

openBrowserWhenReady();

console.log(`  ${C.green}[3/3]${C.reset} 正在啟動伺服器（首次啟動需編譯，請稍候）...`);
console.log('');
console.log(rule());
console.log(`    網址：${C.cyan}${URL}${C.reset}`);
console.log(`    停止：按 ${C.bold}Ctrl + C${C.reset}`);
console.log(rule());
console.log('');
console.log(`  ${C.dim}瀏覽器會在伺服器就緒後自動開啟${C.reset}`);
console.log('');

// 前景啟動，讓 Ctrl+C 能正常傳遞給伺服器
process.env.DISABLE_HMR = 'true';
const child = spawn(node.exe, [tsxCli, 'server.ts'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => {
  console.log('');
  console.log(`  ${C.dim}伺服器已停止（結束代碼 ${code}）。${C.reset}`);
  console.log('');
  pause();
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => child.kill(sig));
}
