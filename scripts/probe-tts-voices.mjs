/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * TTS 語音探針（列出「這台機器到底有哪些語音」）
 * ============================================================================
 *
 * 【為什麼需要這支】
 *   使用者已經回報過至少三輪「沒有聲音」，而每一次都**重現不出來**：
 *     2026-10-04：「網頁朗讀示範完全沒有聲」→ 三層查證後結論是「程式是對的」
 *     2026-10-08：「線上網站有按鈕但沒有聲音，音量已最大」
 *
 *   問題出在**診斷手段**：Web Speech API 的失敗是**靜默的**。
 *   裝置沒有某個語言的語音時，`speechSynthesis.speak()` 可能
 *   不觸發 `onstart`、也不觸發 `onerror` —— 什麼都不做，不報錯。
 *   於是「程式有沒有錯」和「這台機器有沒有那個語音」永遠分不開。
 *
 *   → 這支直接把**這台機器的語音清單**印出來，並且
 *     ① 呼叫 App **真正的** `findBestVoice()`（透過 Vite dev server 的 ESM 路徑）
 *     ② 實際 speak 一句，量「有沒有 onstart」
 *
 * ⚠️ 【為什麼一定要走 dev server 的 ESM 路徑】
 *   本專案踩過這個坑：探針頁載 UMD 版會繞過 App 真正跑的那份程式碼
 *   →「探針說可以、使用者說不行」。所以這裡是
 *   `await import('/src/utils/tts.ts')`，與 App 用的是同一支檔案。
 *
 * 用法（**需要先起 dev server**）：
 *   node scripts/probe-tts-voices.mjs http://127.0.0.1:3100
 *   node scripts/probe-tts-voices.mjs http://127.0.0.1:3100 --headful
 *   node scripts/probe-tts-voices.mjs http://127.0.0.1:3100 --browser=edge
 *
 * ⚠️ `--headless`（預設）**常常拿不到語音清單**（回空陣列）。
 *    要判斷「這台機器到底有沒有粵語語音」，請加 `--headful` 開真實視窗。
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const BASE = process.argv.find((a) => /^https?:\/\//.test(a)) ?? 'http://127.0.0.1:3100';
const PORT = 9666;
const HEADFUL = process.argv.includes('--headful');
const WANT_EDGE = process.argv.includes('--browser=edge');

const CHROME_CANDIDATES = WANT_EDGE
  ? ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']
  : [
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    ];

const BROWSER = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!BROWSER) {
  console.error(`❌ 找不到瀏覽器：${CHROME_CANDIDATES.join(' 或 ')}`);
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let chrome = null;
let ws = null;
let dir = null;
const pending = new Map();
let nextId = 1;

function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evalJs(expression, awaitPromise = true) {
  const r = await send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
  });
  if (r.exceptionDetails) {
    throw new Error(
      r.exceptionDetails.exception?.description ??
        JSON.stringify(r.exceptionDetails)
    );
  }
  return r.result.value;
}

const PROBE_VOICES = `(async () => {
  const out = { hasApi: false, voiceCount: 0, voices: [], zhHK: [], best: {}, isNative: null, ua: navigator.userAgent };
  out.hasApi = typeof window !== 'undefined' && 'speechSynthesis' in window;
  if (!out.hasApi) return out;

  const read = () => window.speechSynthesis.getVoices();
  let voices = read();
  if (!voices || voices.length === 0) {
    await new Promise((res) => {
      const t = setTimeout(res, 2000);
      window.speechSynthesis.addEventListener('voiceschanged', () => { clearTimeout(t); res(); }, { once: true });
    });
    voices = read();
  }
  out.voiceCount = voices ? voices.length : 0;
  out.voices = (voices || []).map((v) => ({ name: v.name, lang: v.lang, local: v.localService, def: v.default }));
  out.zhHK = out.voices.filter((v) => /zh-HK|yue/i.test(v.lang) || /cantonese|粵|廣東/i.test(v.name));

  try {
    const m = await import('/src/utils/tts.ts');
    out.isNative = m.isNativeTts();
    for (const lang of ['cantonese', 'mandarin', 'english']) {
      const v = m.findBestVoice(lang);
      out.best[lang] = v ? v.name + '（' + v.lang + '）' : null;
    }
  } catch (e) {
    out.best = { error: String(e && e.message ? e.message : e) };
  }
  return out;
})()`;

/** 實際 speak 一句，量有沒有 onstart。必須在使用者手勢之後呼叫（見下方 Input.dispatchMouseEvent）。 */
const PROBE_SPEAK = (lang) => `(async () => {
  const r = { lang: ${JSON.stringify(lang)}, started: false, error: null, ms: null };
  const u = new SpeechSynthesisUtterance('您好，這是語音測試。');
  u.lang = ${JSON.stringify(lang)};
  u.volume = 1;
  const t0 = performance.now();
  return await new Promise((res) => {
    let done = false;
    const finish = () => { if (!done) { done = true; r.ms = Math.round(performance.now() - t0); res(r); } };
    u.onstart = () => { r.started = true; finish(); };
    u.onerror = (e) => { r.error = String((e && e.error) || e); finish(); };
    setTimeout(finish, 1800);
    try { window.speechSynthesis.speak(u); } catch (e) { r.error = String(e); finish(); }
  });
})()`;

try {
  dir = mkdtempSync(path.join(tmpdir(), 'lb-tts-'));
  const args = [
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + dir,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=420,760',
    'about:blank',
  ];
  if (!HEADFUL) args.unshift('--headless=new');

  chrome = spawn(BROWSER, args, { stdio: 'ignore' });

  let target = null;
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    try {
      const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
      target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (target) break;
    } catch {}
  }
  if (!target) throw new Error('瀏覽器沒起來');

  ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((res, rej) => {
    ws.on('open', res);
    ws.on('error', rej);
  });
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    }
  });

  await send('Page.enable');
  await send('Runtime.enable');

  console.log(`\n🌐 ${BASE}`);
  console.log(`🧭 ${path.basename(BROWSER)}（${HEADFUL ? '真實視窗' : 'headless'}）`);

  let ready = false;
  for (let attempt = 1; attempt <= 8; attempt++) {
    await send('Page.navigate', { url: BASE });
    await sleep(2500);
    const ok = await evalJs(
      '(() => { try { const r = document.getElementById("root"); return !!(r && r.children.length > 0); } catch (e) { return false; } })()'
    );
    if (ok) {
      ready = true;
      break;
    }
    await sleep(2000);
  }
  if (!ready) throw new Error('App 載入失敗（dev server 有在跑嗎？）');

  /** ★ 真實使用者手勢：沒有它，Chrome 會以 `not-allowed` 擋下 speak() */
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 200, y: 400, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 200, y: 400, button: 'left', clickCount: 1 });
  await sleep(200);

  const v = await evalJs(PROBE_VOICES);

  console.log(`\n── 這台機器的語音清單 ─────────────────────────`);
  console.log(`   Web Speech API：${v.hasApi ? '有' : '❌ 沒有（此瀏覽器不支援）'}`);
  console.log(`   語音總數：${v.voiceCount}`);
  console.log(`   App 走的路徑：${v.isNative ? '原生（Capacitor）' : '瀏覽器（Web Speech）'}`);
  for (const voice of v.voices) {
    console.log(`     · ${voice.lang.padEnd(8)} ${voice.name}${voice.local ? '' : '（網路）'}${voice.def ? ' [預設]' : ''}`);
  }

  console.log(`\n── App 的 findBestVoice() 實際挑到什麼 ─────────`);
  for (const lang of ['cantonese', 'mandarin', 'english']) {
    const got = v.best[lang];
    console.log(`   ${lang.padEnd(10)} ${got ?? '❌ null（這台機器沒有這個語言的語音）'}`);
  }
  if (v.best.error) console.log(`   ⚠️ 呼叫 findBestVoice 失敗：${v.best.error}`);

  console.log(`\n── 實際 speak（送 zh-HK，也就是「只在本機」以外的預設朗讀語言）──`);
  const s = await evalJs(PROBE_SPEAK('zh-HK'));
  console.log(`   onstart：${s.started ? `✅ 有（${s.ms}ms）` : '❌ 沒有 —— 這就是「沒有聲音」'}`);
  if (s.error) console.log(`   onerror：${s.error}`);
  if (!s.started && !s.error) {
    console.log('   ⚠️ 既沒有 onstart 也沒有 onerror = 靜默 no-op');
    console.log('      → 這正是 tts.ts 的 watchdog 要抓的情況');
  }

  console.log(`\n── 判讀 ───────────────────────────────────────`);
  const hasZhHK = v.zhHK.length > 0;
  if (!v.hasApi) {
    console.log('   ❌ 這個瀏覽器沒有 Web Speech API —— 網頁版語音不可能有聲音。');
  } else if (v.voiceCount === 0) {
    console.log('   ⚠️ 語音清單是空的。若是 headless，請改用 --headful 重測。');
  } else if (!hasZhHK) {
    console.log('   ❌ 這台機器**沒有粵語（zh-HK）語音**。');
    console.log('      → App 預設朗讀語言是粵語（澳門使用者的情境），因此按了不會有聲音。');
    console.log('      → 解法：改用「普通話」或「English」，或在系統設定安裝粵語語音。');
  } else if (!s.started) {
    console.log('   ⚠️ 有粵語語音，但 speak() 沒有出聲 —— 可能是分頁靜音或系統音訊問題。');
  } else {
    console.log('   ✅ 這台機器一切正常（有粵語語音，speak 也有 onstart）。');
    console.log('      → 若使用者仍說沒聲音，請確認他選的朗讀語言與音量設定。');
  }
  console.log('');
} catch (e) {
  console.error('\n❌ ' + (e?.message ?? e));
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  if (dir) {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}
