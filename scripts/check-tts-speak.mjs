/**
 * 直接執行 App 的 speakText()，觀察它到底發生什麼事（2026-10-04）。
 *
 * 【為什麼要這支】
 *   使用者回報「網頁的朗讀示範完全沒有聲」，但這台機器**明明有粵語語音**
 *   （zh-HK | Google 粤語（香港））。所以不能再用猜的。
 *   這支會逐項回報 speakText 內部每一步的實際結果：
 *     ① isTtsEnabled() 是否通過（音量 > 0）
 *     ② findBestVoice() 有沒有挑到語音
 *     ③ utterance.lang 實際送了什麼
 *     ④ speak() 之後 onstart / onend / onerror **有沒有真的觸發**
 *
 * ⚠️ 無頭瀏覽器沒有音效裝置，所以「有沒有聲音」量不到；
 *    但 onstart/onend/onerror 的觸發情形足以判斷是「被擋掉」還是「真的唸了」。
 *
 * 用法：node scripts/check-tts-speak.mjs http://127.0.0.1:3101
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const BASE = process.argv[2] ?? 'http://127.0.0.1:3101';
const PORT = 9345;
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(path.join(tmpdir(), 'lb-speak-'));

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
  const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  let id = 0; const pending = new Map();
  const logs = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.consoleAPICalled') {
      logs.push((m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' '));
    }
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
  await sleep(7000);

  /**
   * ★★ 關鍵：先用 CDP 送一個**真實的滑鼠點擊**。
   *
   * 【為什麼】第一次測試三種語言都回 `error:not-allowed` ——
   *   那是 Chrome 的「需要使用者手勢才准發聲」政策造成的。
   *   但無頭瀏覽器沒有任何手勢，所以那個結果**分不出**
   *   「程式有 bug」與「本來就需要手勢」。
   *   送一次真實點擊之後再測，才能分辨。
   */
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 200, y: 300, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 200, y: 300, button: 'left', clickCount: 1 });
  await sleep(500);
  console.log('（已送出一次模擬點擊，產生使用者手勢）\n');

  const out = await ev(`
    (async () => {
      const tts = await import('/src/utils/tts.ts');
      const settings = await import('/src/utils/ttsSettings.ts');

      // 等語音載入完成（真實使用者第一次開啟時也會遇到這個時序）
      await new Promise((res) => {
        if (speechSynthesis.getVoices().length) return res();
        const t = setTimeout(res, 3000);
        speechSynthesis.addEventListener('voiceschanged', () => { clearTimeout(t); res(); }, { once: true });
      });

      const before = settings.getTtsSettings();
      // 模擬使用者把音量拉到 80%
      settings.setTtsVolume(0.8);
      const after = settings.getTtsSettings();

      /**
       * ★ 測「文字語言 × 偏好語言」的配對 —— 這是 2026-10-04 修的 bug：
       *   原本用介面語言決定語音，導致英文語音去唸中文（聽起來像拼音）。
       *   正確行為：純拉丁文字一律英文語音；含中文則用中文語音。
       */
      const CASES = [
        { text: '鈉含量偏高，建議少吃', pref: 'cantonese', expect: 'cantonese' },
        { text: '鈉含量偏高，建議少吃', pref: 'english', expect: 'cantonese' },
        { text: '鈉含量偏高，建議少吃', pref: 'mandarin', expect: 'mandarin' },
        { text: 'Sodium is high, eat less', pref: 'cantonese', expect: 'english' },
        { text: 'Sodium is high, eat less', pref: 'english', expect: 'english' },
        { text: 'Nutrition Facts 營養標示', pref: 'cantonese', expect: 'cantonese' },
      ];

      const results = [];
      for (const c of CASES) {
        const r = await new Promise((res) => {
          const events = [];
          const ok = tts.speakText(c.text, {
            preferLanguage: c.pref,
            volume: 1,
            onStart: () => events.push('start'),
            onEnd: () => events.push('end'),
            onError: (e) => events.push('error:' + (e && e.error ? e.error : String(e))),
          });
          setTimeout(() => res({ ok, events }), 3000);
        });
        const d = tts.getLastTtsDiagnostic();
        results.push({
          text: c.text.slice(0, 12),
          pref: c.pref,
          actual: d.lang,
          expect: c.expect,
          ok: d.lang === c.expect,
          voiceFound: d.voiceName,
          events: r.events.join(','),
        });
        tts.stopSpeech();
        await new Promise((r2) => setTimeout(r2, 400));
      }
      return { before, after, results, voices: speechSynthesis.getVoices().length };
    })()
  `);

  if (out.__error) {
    console.log('❌ 測試腳本拋錯:', String(out.__error).slice(0, 500));
  } else {
    console.log(`瀏覽器語音數: ${out.voices}`);
    console.log(`設定（拉音量前）: volume=${out.before.volume}  voiceLang=${out.before.voiceLang}`);
    console.log(`設定（拉音量後）: volume=${out.after.volume}`);
    console.log('');
    console.log('文字          偏好       實際       預期       結果  語音／事件');
    console.log('─'.repeat(96));
    let pass = 0;
    for (const r of out.results) {
      if (r.ok) pass++;
      console.log(
        `${r.text.padEnd(14)}${r.pref.padEnd(11)}${String(r.actual).padEnd(11)}${r.expect.padEnd(11)}` +
          `${(r.ok ? '✅' : '❌').padEnd(6)}${r.voiceFound ?? '（沒挑到）'}  [${r.events}]`
      );
    }
    console.log(`\n配對正確 ${pass} / ${out.results.length}`);
    if (logs.length) {
      console.log('\n瀏覽器訊息:');
      for (const l of logs.slice(0, 8)) console.log('  ' + l);
    }
  }
} finally {
  try { chrome.kill(); } catch {}
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
}
