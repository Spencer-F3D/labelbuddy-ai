/**
 * 驗證右上角模式標籤是否**真的跟著模式變**（2026-10-04 使用者回報的 bug）。
 *
 * 【為什麼要這支】
 *   使用者說「右上角的模式標籤永遠是雲端 AI，要根據模式選擇去變」。
 *   根因是它顯示的是 `geminiConnected`（連線狀態）而不是分析模式。
 *   修完要能證明三種模式各自顯示不同的文字 —— 光說「改好了」不算。
 *
 * 用法：node scripts/check-mode-chip.mjs http://127.0.0.1:3100
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const BASE = process.argv[2] ?? 'http://127.0.0.1:3100';
const PORT = 9343;
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(path.join(tmpdir(), 'lb-chip-'));

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'],
  { stdio: 'ignore' });

try {
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(500);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find((t) => t.type === 'page');
    } catch {}
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  let id = 0; const pending = new Map();
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) return { __error: r.result.exceptionDetails.exception?.description };
    return r.result?.result?.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: BASE });
  await sleep(5000);

  /* 先完成引導（否則看不到主畫面），再逐一切換模式讀標籤 */
  await ev(`
    (async () => {
      localStorage.setItem('labelbuddy_onboarded_v1', 'true');
      localStorage.setItem('labelbuddy_profile_v1', JSON.stringify('senior'));
      return true;
    })()
  `);
  await send('Page.navigate', { url: BASE });
  await sleep(6000);

  console.log('模式            右上角標籤    圓點顏色');
  console.log('─'.repeat(48));

  for (const mode of ['cloud_image', 'cloud_text', 'local_only']) {
    await ev(`localStorage.setItem('labelbuddy_analysis_mode_v1', ${JSON.stringify(mode)})`);
    await send('Page.navigate', { url: BASE });
    await sleep(5000);
    const out = await ev(`
      (() => {
        const h = document.querySelector('header');
        if (!h) return { err: 'no header' };
        const chip = h.querySelector('div.rounded-full');
        if (!chip) return { err: 'no chip' };
        const dot = chip.querySelector('span');
        return {
          text: chip.textContent.trim(),
          dot: dot ? dot.className.match(/bg-[a-z]+-\\d+/)?.[0] ?? '' : '',
        };
      })()
    `);
    if (out.__error || out.err) {
      console.log(`${mode.padEnd(15)}❌ ${out.__error ?? out.err}`);
      continue;
    }
    console.log(`${mode.padEnd(15)}${String(out.text).padEnd(14)}${out.dot}`);
  }
} finally {
  try { chrome.kill(); } catch {}
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
}
