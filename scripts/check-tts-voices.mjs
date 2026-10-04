/**
 * 檢查瀏覽器實際可用的語音（2026-10-04）。
 *
 * 【為什麼要查這個】
 *   使用者回報「網頁的朗讀示範完全沒有聲」。
 *   我先前依他的要求（鎖定粵語）**移除了粵語以外的降級**：
 *     `findBestVoice('cantonese')` 找不到粵語時直接 `return null`。
 *   若這台機器的 Chrome 沒有裝 zh-HK（粵語）語音，
 *   那就是「找不到語音 → 用 zh-HK 標籤 → 系統也沒有 → 完全不發聲，
 *   而且不會報錯」—— 正是本專案最常犯的那類 bug。
 *
 * 用法：node scripts/check-tts-voices.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORT = 9344;
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(path.join(tmpdir(), 'lb-voices-'));

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check', 'about:blank'],
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
  const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
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
  await sleep(2500);

  const out = await ev(`
    (async () => {
      if (!('speechSynthesis' in window)) return { supported: false };
      // 語音是非同步載入的，先等 voiceschanged
      await new Promise((res) => {
        if (speechSynthesis.getVoices().length) return res();
        const t = setTimeout(res, 3000);
        speechSynthesis.addEventListener('voiceschanged', () => { clearTimeout(t); res(); }, { once: true });
      });
      const voices = speechSynthesis.getVoices();
      const cn = voices.filter((v) => v.lang.toLowerCase().startsWith('zh') || /cantonese|粵|廣東/i.test(v.name));
      return {
        supported: true,
        total: voices.length,
        zhVoices: cn.map((v) => v.lang + ' | ' + v.name),
        hasZhHK: voices.some((v) => v.lang === 'zh-HK' || v.lang.toLowerCase().includes('yue')),
      };
    })()
  `);

  if (out.__error) {
    console.log('❌ 查詢失敗:', String(out.__error).slice(0, 300));
  } else if (!out.supported) {
    console.log('❌ 這個瀏覽器沒有 speechSynthesis');
  } else {
    console.log(`語音總數: ${out.total}`);
    console.log(`有粵語(zh-HK/yue)語音: ${out.hasZhHK ? '✅ 有' : '❌ 沒有'}`);
    console.log('中文相關語音:');
    if (out.zhVoices.length === 0) console.log('  （完全沒有中文語音）');
    for (const v of out.zhVoices) console.log('  ' + v);
  }
} finally {
  try { chrome.kill(); } catch {}
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
}
