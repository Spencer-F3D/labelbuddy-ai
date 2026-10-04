/**
 * 比較不同語言模型對「實拍條件的標籤」的辨識結果。
 *
 * 【為什麼要這支】
 *   使用者回報本機 OCR 出來是亂碼。第一次測試用乾淨的合成英文標籤去測，
 *   結果**純中文模型也讀得幾乎完美** —— 假設被推翻。
 *   所以這支改成模擬**實拍**：大面積彩色圖案、表格只佔畫面一半、
 *   模糊、低對比、JPEG 壓縮。
 *
 * 用法：node .tmp-lang.mjs http://127.0.0.1:3101 [en|zh]
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const BASE = process.argv[2] ?? 'http://127.0.0.1:3101';
const WHICH = process.argv[3] ?? 'en';
const PORT = 9342;
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(path.join(tmpdir(), 'lb-lang2-'));

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

  const LINES_EN = [
    'Servings per package: 1',
    'Serving Size: 22g',
    'Per Serving     %DI',
    'Energy          553kJ     6%',
    'Protein         2.50g',
    'Total Fat       5.30g',
    '- Saturated     2.70g    11%',
    'Carbohydrate    6.80g',
    '- Sugars        1.00g     1%',
    'Dietary fibre   0.20g',
    'Sodium          175mg     8%',
    'Calcium         101mg    13%',
  ];
  const LINES_ZH = [
    '營養標示',
    '每一份量 22 公克',
    '每份 熱量 132 大卡',
    '蛋白質 2.5 公克',
    '脂肪 5.3 公克',
    '飽和脂肪 2.7 公克',
    '碳水化合物 6.8 公克',
    '糖 1.0 公克',
    '膳食纖維 0.2 公克',
    '鈉 175 毫克',
    '鈣 101 毫克',
  ];
  const lines = WHICH === 'en' ? LINES_EN : LINES_ZH;

  const pageScript = `
    (async () => {
      const m = await import('/src/ocr/ocrBrowser.ts');
      const p = await import('/server/labelParser.ts');
      const LINES = ${JSON.stringify(lines)};
      const IS_EN = ${WHICH === 'en'};

      const W = 1200, H = 1600;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const ctx = c.getContext('2d');

      ctx.fillStyle = '#e8e2d4'; ctx.fillRect(0, 0, W, H);

      // 上半部：大面積彩色圖案（就是會變中文亂碼的那一塊）
      ctx.fillStyle = '#b03a2e'; ctx.fillRect(0, 0, W, 620);
      ctx.fillStyle = '#c8a24a'; ctx.beginPath(); ctx.arc(300, 260, 190, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f5e6c8'; ctx.beginPath(); ctx.arc(300, 260, 120, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7b3f00';
      ctx.beginPath(); ctx.arc(245, 235, 26, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(345, 235, 26, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(295, 305, 58, 0, Math.PI); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 54px Arial';
      ctx.fillText('CHEESE', 540, 200);
      ctx.fillText('DIP', 540, 265);
      ctx.font = '28px Arial';
      ctx.fillText('with crisp crackers', 540, 320);

      // 下半部：營養表格（只佔畫面約一半寬）
      const S = 620;
      const tx = (W - S) / 2;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(tx, 700, S, 760);
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 30px Arial';
      ctx.fillText(IS_EN ? 'Nutrition Information' : '營養標示', tx + 24, 750);
      ctx.font = '22px Arial';
      let y0 = 800;
      for (const line of LINES) {
        ctx.fillText(line, tx + 24, y0);
        y0 += 42;
      }
      if (IS_EN) {
        ctx.font = '18px Arial';
        ctx.fillText('* Percentage Daily Intakes are based on an', tx + 24, y0 + 24);
        ctx.fillText('average adult diet of 8700kJ.', tx + 24, y0 + 50);
      }

      // ★ 模擬實拍退化：模糊 + 降對比 + JPEG 壓縮
      const blurred = document.createElement('canvas');
      blurred.width = W; blurred.height = H;
      const bctx = blurred.getContext('2d');
      bctx.filter = 'blur(1.4px) contrast(78%) brightness(104%)';
      bctx.drawImage(c, 0, 0);
      const dataUrl = blurred.toDataURL('image/jpeg', 0.72);

      const started = Date.now();
      const r = await m.recognizeLabelTextInBrowser(dataUrl);
      let parsed = null;
      try { parsed = p.buildRecognitionResult(r.text || ''); } catch (e) {}
      return {
        ms: Date.now() - started,
        text: r.text || '',
        len: (r.text || '').length,
        matched: parsed ? parsed.matchedFields : -1,
        sodium: parsed && parsed.profile ? parsed.profile.sodiumMg : null,
        // ★ 一定要回報這個 —— 沒有它，引擎失敗與「讀不到字」看起來一樣
        ocrOk: r.ok,
        error: r.error ?? null,
        errorKind: r.errorKind ?? null,
      };
    })()
  `;

  const out = await ev(pageScript);
  if (out && out.__error) {
    console.log('❌ 頁面內腳本拋錯：');
    console.log(String(out.__error).slice(0, 800));
  } else {
    console.log(`=== ${WHICH === 'en' ? '英文' : '中文'}標籤（模擬實拍）===`);
    console.log(`耗時 ${out.ms}ms｜字數 ${out.len}｜欄位 ${out.matched}｜鈉 ${out.sodium}`);
    console.log(`OCR 成功=${out.ocrOk}  錯誤種類=${out.errorKind ?? '—'}`);
    if (out.error) console.log(`錯誤訊息: ${out.error}`);
    console.log('--- OCR 原文 ---');
    console.log(out.text || '(空)');
  }
} finally {
  try { chrome.kill(); } catch {}
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
}
