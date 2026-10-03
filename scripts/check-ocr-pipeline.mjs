/**
 * 端到端測試「本機完整流水線」：OCR → 規則引擎解析。
 *
 * 【為什麼要合起來測】
 *   使用者說「本機 OCR 可能是規則引擎出問題，也可能是 OCR 出問題」。
 *   分開測沒有意義 —— 真正決定成敗的是**最後抽到幾個欄位**：
 *     OCR 讀到一堆字、但解析器抽不到數字 → 一樣是「識別不到任何東西」。
 *
 *   這支直接 import App 的兩個模組（OCR 與解析器）串起來跑，
 *   並用「標籤只佔畫面一小塊」的照片模擬真實情境。
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const BASE = process.argv[2] ?? 'http://127.0.0.1:3101';
const PORT = 9338;
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(path.join(tmpdir(), 'lb-pipe-'));

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
  const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 512 * 1024 * 1024 });
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
  await sleep(6000);

  /**
   * 依「表格在畫面中的佔比」產生測試圖。
   * 佔比越小 = 手機拿得越遠 = 真實最常見的失敗情境。
   */
  console.log('佔比  尺寸        OCR字數  結果  欄位  抽到的數值');
  console.log('─'.repeat(72));

  for (const ratio of [1.0, 0.6, 0.45, 0.33, 0.25]) {
    const out = await ev(`
      (async () => {
        const s = await import('/src/data/samples.ts');
        const p = await import('/server/labelParser.ts');
        const m = await import('/src/ocr/ocrBrowser.ts');
        const d = s.DEMO_LABELS['zh-TW'].ramen;
        const src = s.generateSampleLabelDataUrl(d.title, d.details, 'zh-TW');

        // 把標籤貼到一張 1600x1600 的「包裝照」中央，佔畫面 ratio
        const img = new Image();
        await new Promise((r) => { img.onload = r; img.src = src; });
        const FRAME = 1600;
        const c = document.createElement('canvas');
        c.width = FRAME; c.height = FRAME;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#cfcfcf'; ctx.fillRect(0, 0, FRAME, FRAME);
        const w = Math.round(FRAME * ${ratio});
        const h = Math.round(w * (img.naturalHeight / img.naturalWidth));
        ctx.drawImage(img, Math.round((FRAME - w) / 2), Math.round((FRAME - h) / 2), w, h);
        const photo = c.toDataURL('image/jpeg', 0.9);

        const ocr = await m.recognizeLabelTextInBrowser(photo);
        let r = null, err = null;
        try {
          r = p.buildRecognitionResult(ocr.text || '');
        } catch (e) { err = String(e && e.message ? e.message : e); }
        return {
          ratio: ${ratio},
          px: w + 'x' + h,
          ocrLen: (ocr.text || '').length,
          ok: r ? r.ok : null,
          matched: r ? r.matchedFields : -1,
          err: r?.error || err || '',
          // 抽到的實際數值 —— 這才是「能不能判斷」的依據
          vals: r?.profile
            ? '鈉' + r.profile.sodiumMg + ' 糖' + r.profile.sugarG + ' 碳水' + r.profile.carbsG + ' 熱量' + r.profile.energyKcal
            : '—',
          hasSodiumWord: /鈉|sodium/i.test(ocr.text || ''),
        };
      })()
    `);
    if (out.__error) { console.log(`ratio=${ratio}  ❌ ${out.__error.slice(0, 140)}`); continue; }
    console.log(
      `${String(out.ratio).padEnd(6)}${out.px.padEnd(12)}${String(out.ocrLen).padEnd(9)}` +
      `${(out.ok ? 'OK' : 'fail').padEnd(6)}${String(out.matched).padEnd(6)}${out.vals}`
    );
    if (out.err) console.log(`       ↳ ${out.err}`);
  }
} finally {
  try { chrome.kill(); } catch {}
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
}
