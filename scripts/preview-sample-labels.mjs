/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 示範標籤預覽（把 Canvas 畫出來的標籤存成 PNG）
 * ============================================================================
 * 用途：調整 `src/data/samples.ts` 的版面時，不必開 App、不必跑完整流程，
 *       就能直接看到標籤長什麼樣（中英文各一張）。
 *
 * 【為什麼用 import() 而不是複製一份繪圖程式碼】
 *   它透過 Vite dev server 的模組系統 `import('/src/data/samples.ts')`
 *   呼叫**真正的**繪製函式。若在腳本裡複製一份繪圖邏輯，
 *   那份遲早會跟本尊不一致，預覽就失去意義了。
 *
 * 前置：dev server 要在跑（`npx tsx server.ts`）。
 * 用法：`node scripts/preview-sample-labels.mjs`
 * 產出：`shots-cjk/label-<語言>_<樣本>.png`
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORT = 9336;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(path.join(tmpdir(), 'lb-label-'));
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
    if (r.exceptionDetails)
      throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description ?? ''));
    return r.result.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 620,
    height: 740,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await send('Page.navigate', { url: 'http://127.0.0.1:3000' });
  await sleep(4000);

  console.log('載入 samples 模組…');
  const urls = await ev(`
    (async () => {
      const m = await import('/src/data/samples.ts');
      const out = {};
      for (const lang of ['zh-TW','en']) {
        for (const which of ['ramen','oatmeal']) {
          const c = m.DEMO_LABELS[lang][which];
          out[lang + '_' + which] = m.generateSampleLabelDataUrl(c.title, c.details, lang);
        }
      }
      window.__labels = out;
      return Object.fromEntries(Object.entries(out).map(([k,v]) => [k, v.length]));
    })()
  `);
  console.log('已產生：', urls);

  mkdirSync('shots-cjk', { recursive: true });
  for (const key of ['zh-TW_ramen', 'en_ramen', 'en_oatmeal']) {
    // 把 data URL 放到一個乾淨的頁面上截圖
    await ev(`
      (() => {
        document.body.innerHTML = '';
        document.body.style.margin = '0';
        document.body.style.background = '#fff';
        const img = document.createElement('img');
        img.src = window.__labels['${key}'];
        img.style.width = '600px';
        img.style.height = '700px';
        document.body.appendChild(img);
      })()
    `);
    await sleep(900);
    const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 600, height: 700, scale: 1 } });
    writeFileSync(path.join('shots-cjk', `label-${key}.png`), Buffer.from(shot.data, 'base64'));
    console.log(`  ✅ shots-cjk/label-${key}.png`);
  }
} catch (e) {
  console.error('失敗：', e.message);
} finally {
  try { ws?.close(); } catch {}
  try { chrome.kill(); } catch {}
  await sleep(600);
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
  process.exit(0);
}
