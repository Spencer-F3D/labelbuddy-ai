/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 生理指標 AI 分析 — 端到端流程驗證
 * ============================================================================
 * 為什麼要獨立一支：
 *   `check-ui-cjk.mjs` 是「逐頁掃描」，但 AI 分析區塊**要按按鈕才會出現**，
 *   靜態掃描永遠看不到它。這支腳本會實際走完整條路徑：
 *     健康設定 → 展開生理指標 → 按「開始 AI 深入分析」→ 等結果 → 掃描文字
 *
 * 前置：dev server 要在跑（`npx tsx server.ts`）
 * 用法：`node scripts/check-indicator-ui.mjs`
 * 產出：`shots-cjk/ind-*.png`
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORT = 9337;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CJK = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/;
const ALLOWED = /^(中文|中)$/;

const dir = mkdtempSync(path.join(tmpdir(), 'lb-ind-'));
const chrome = spawn(
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${dir}`,
    '--no-first-run',
    '--disable-gpu',
    'about:blank',
  ],
  { stdio: 'ignore' }
);

let ws;
try {
  let target = null;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (target) break;
    } catch {}
  }
  ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 1 << 28 });
  await new Promise((res, rej) => {
    ws.on('open', res);
    ws.on('error', rej);
  });

  let id = 0;
  const pending = new Map();
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.id && pending.has(m.id)) {
      pending.get(m.id).resolve(m.result);
      pending.delete(m.id);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const i = ++id;
      pending.set(i, { resolve });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 400,
    height: 860,
    deviceScaleFactor: 2,
    mobile: true,
  });

  mkdirSync('shots-cjk', { recursive: true });
  const capture = async (name) => {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const { writeFileSync } = await import('node:fs');
    writeFileSync(path.join('shots-cjk', `${name}.png`), Buffer.from(shot.data, 'base64'));
  };

  console.log('開啟 App…');
  await send('Page.navigate', { url: 'http://127.0.0.1:3000' });
  await sleep(3500);
  await ev(`localStorage.setItem('labelbuddy-language','en');'ok'`);
  await send('Page.navigate', { url: 'http://127.0.0.1:3000' });
  await sleep(4000);

  console.log('前往健康設定…');
  await ev(`
    (() => {
      const b = [...document.querySelectorAll('button')].find(e => /open menu/i.test(e.getAttribute('aria-label')||''));
      if (b) b.click();
    })()
  `);
  await sleep(1000);
  // ⚠️ 選單項目不一定是 <button> —— 實測它可能是 <a> 或 [role="button"]。
  //    只查 'button' 會找不到，而且 click 靜默失敗（不會報錯，只是停在原頁）。
  const nav = await ev(`
    (() => {
      const el = [...document.querySelectorAll('button,a,[role="button"]')]
        .find(e => (e.innerText||'').trim().split('\\n')[0] === 'Health settings');
      if (!el) return 'nav-not-found';
      el.click();
      return 'nav-clicked';
    })()
  `);
  console.log('  →', nav);
  await sleep(2200);
  // 確認真的換頁了（否則後面全部都會找錯地方，卻不會報錯）
  // ⚠️ 不能用首頁副標題判斷「是否還在首頁」—— 那是頁首，每頁都有。
  //    改看「健康設定頁獨有的區塊標題」。
  const landed = await ev(`
    /Daily health measurements/i.test(document.body.innerText)
  `);
  console.log('  已到達健康設定頁:', landed);

  console.log('展開生理指標區塊…');
  // ⚠️ SettingsSection 用的是 <button aria-expanded>，**不是 <details>**。
  //    一開始查 'details' 完全找不到，而且不會報錯 —— 只是後面全部落空。
  const opened = await ev(`
    (() => {
      const btns = [...document.querySelectorAll('button[aria-expanded]')];
      // 區塊標題是「Daily health measurements」（不是 'blood pressure'）
      const target = btns.find(b => /daily health measurements/i.test(b.innerText||''));
      if (!target) return 'not-found:' + btns.length;
      if (target.getAttribute('aria-expanded') === 'false') target.click();
      target.scrollIntoView({ block: 'start' });
      return 'ok';
    })()
  `);
  console.log('  →', opened);
  await sleep(1200);
  await capture('ind-01-expanded');

  console.log('按下 AI 分析按鈕…');
  const clicked = await ev(`
    (() => {
      const b = [...document.querySelectorAll('button')].find(e => /start ai analysis/i.test(e.innerText||''));
      if (!b) return 'button-not-found';
      b.scrollIntoView({ block: 'center' });
      b.click();
      return 'clicked';
    })()
  `);
  console.log('  →', clicked);

  // 等結果出現（雲端 AI 約 8–12 秒）
  let appeared = false;
  for (let i = 0; i < 20; i++) {
    await sleep(2000);
    const has = await ev(`/AI analysis result|Analysed by cloud AI|Offline analysis/.test(document.body.innerText)`);
    if (has) {
      appeared = true;
      break;
    }
  }
  console.log(appeared ? '  ✅ 結果已出現' : '  ❌ 等不到結果');
  await sleep(800);
  await capture('ind-02-result');

  // 掃描結果區塊的文字
  const text = await ev(`
    (() => {
      const nodes = [...document.querySelectorAll('div')];
      const box = nodes.find(n => /AI analysis result|Analysed by cloud AI/.test(n.innerText||''));
      return box ? box.innerText : document.body.innerText;
    })()
  `);
  const lines = String(text).split('\n').map((l) => l.trim()).filter(Boolean);
  const bad = lines.filter((l) => CJK.test(l) && !ALLOWED.test(l));

  console.log();
  console.log('='.repeat(58));
  if (bad.length) {
    console.log(`❌ 發現 ${bad.length} 行中文：`);
    bad.slice(0, 10).forEach((l) => console.log(`   ${l.slice(0, 95)}`));
  } else {
    console.log('✅ AI 分析區塊零中文殘留');
  }
  console.log('='.repeat(58));
  console.log('\n── 區塊內容預覽 ──');
  lines.slice(0, 14).forEach((l) => console.log(`  ${l.slice(0, 88)}`));

  process.exitCode = bad.length ? 1 : 0;
} catch (e) {
  console.error('失敗：', e.message);
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch {}
  try { chrome.kill(); } catch {}
  await sleep(600);
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
  process.exit(process.exitCode ?? 0);
}
