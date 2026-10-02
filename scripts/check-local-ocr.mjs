/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 「只在本機」模式的端到端 OCR 實測（Local-only OCR end-to-end check）
 * ============================================================================
 *
 * 【為什麼需要這支腳本】
 *   使用者回報：「本機的 2 個模式（只送文字／只在本機）scan 唔到嘢，
 *   影得多好也不行」。這兩個模式都必須靠**瀏覽器端的 OCR** 讀出標籤文字，
 *   讀不到就整條路走不下去。
 *
 *   而現有的檢查都碰不到這一段：
 *     - `check-ui-cjk.mjs` 走的是「直接雲端」模式，**跳過瀏覽器 OCR**。
 *     - `ocr-smoke.ts` 測的是**伺服器端**的 tesseract，
 *       引擎一樣、參數一樣，但**執行環境不同**（Node vs 瀏覽器 WASM）。
 *   所以「伺服器讀得到」不代表「使用者的手機讀得到」。
 *
 * 【這支腳本做什麼】
 *   用真實 Chrome：
 *     ① 走完引導頁並選「只在本機」
 *     ② 把一張**真實照片**餵進相簿輸入框
 *     ③ 攔截送往 /api/analyze-label 的請求，**取出瀏覽器實際讀到的 ocrText**
 *     ④ 回報結果（成功／ocr_failed）與讀到的字數
 *
 *   第 ③ 步是關鍵：沒有它，只能看到「失敗」，看不到「為什麼失敗」。
 *
 * 用法：
 *   node scripts/check-local-ocr.mjs <圖片路徑> [http://127.0.0.1:3100]
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const IMAGE = process.argv[2];
const BASE = process.argv[3] ?? 'http://127.0.0.1:3100';
/**
 * 餵給瀏覽器的圖片 URL。
 *
 * 為什麼用 URL 而不是本機路徑：無法用 CDP 設定 input.files（不會觸發 React
 * onChange），所以改成在頁面裡 `fetch()` 一張**同源**圖片。
 * 預設把要測的圖放到 dist/ 再指定路徑即可（dist/ 已在 .gitignore）。
 * 用 `--url=/probe-hard.jpg` 覆寫。
 */
const IMAGE_URL = (process.argv.find((a) => a.startsWith('--url=')) || '').split('=')[1] || '/probe-hard.jpg';
const PORT = 9334;
const OUT = path.resolve('shots-local-ocr');

if (!IMAGE || !existsSync(IMAGE)) {
  console.error('用法：node scripts/check-local-ocr.mjs <圖片路徑> [baseUrl]');
  process.exit(2);
}

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.onEvent = () => {};
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) {
        this.onEvent(msg);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 180000);
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      throw new Error(`頁面執行錯誤: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    }
    return r.result.value;
  }
}

/** 點擊文字完全相符的按鈕 */
const clickExact = (text) => `
  (() => {
    const b = [...document.querySelectorAll('button')].find(e => (e.textContent || '').trim() === ${JSON.stringify(text)});
    if (!b) return false;
    b.click();
    return true;
  })()
`;

/** 點擊文字包含某字串的按鈕 */
const clickIncludes = (text) => `
  (() => {
    const b = [...document.querySelectorAll('button')].find(e => (e.textContent || '').includes(${JSON.stringify(text)}));
    if (!b) return false;
    b.click();
    return true;
  })()
`;

let chrome;
let cdp;
let exitCode = 0;
const userDataDir = mkdtempSync(path.join(tmpdir(), 'lb-local-ocr-'));

try {
  const exe = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!exe) throw new Error('找不到 Chrome 或 Edge');

  chrome = spawn(
    exe,
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--hide-scrollbars',
      '--window-size=390,844',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  let target = null;
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      target = list.find((t) => t.type === 'page');
      if (target) break;
    } catch {
      /* 還沒起來 */
    }
  }
  if (!target) throw new Error('Chrome 沒有起來');

  const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  await new Promise((res, rej) => {
    ws.on('open', res);
    ws.on('error', rej);
  });
  cdp = new CDP(ws);

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('DOM.enable');
  await cdp.send('Network.enable');

  /* ── 關鍵：攔截送往後端的請求，取出瀏覽器實際讀到的 ocrText ──
     ⚠️ `Network.requestWillBeSent` 的 `params.request.postData` **不一定有值**
        （第一版就是踩這個坑：拿不到 body，卻誤判成「App 送出空字串」）。
        正確做法是用 requestId 事後再呼叫 `Network.getRequestPostData`。 */
  const captured = { ocrText: null, ocrError: null, requests: [] };
  const consoleLogs = [];
  const pendingPost = [];
  cdp.onEvent((msg) => {
    if (msg.method === 'Network.requestWillBeSent' && msg.params.request.url.includes('/api/analyze-label')) {
      const reqId = msg.params.requestId;
      const inline = msg.params.request.postData;
      if (typeof inline === 'string' && inline.length) {
        recordBody(inline);
      } else {
        pendingPost.push(reqId);
      }
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const t = (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
      if (t) consoleLogs.push(`[${msg.params.type}] ${t}`);
    }
  });

  function recordBody(raw) {
    try {
      const body = JSON.parse(raw);
      captured.requests.push({
        hasOcrText: 'ocrText' in body,
        ocrTextLen: (body.ocrText || '').length,
        ocrError: body.ocrError ?? null,
        hasImage: 'imageBase64' in body,
        imageLen: (body.imageBase64 || '').length,
      });
      if ('ocrText' in body) {
        captured.ocrText = body.ocrText;
        captured.ocrError = body.ocrError ?? null;
      }
    } catch {
      /* 非 JSON 就略過 */
    }
  }

  const nav = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`).catch(() => null);
  await cdp.send('Page.navigate', { url: BASE });
  await sleep(4000);

  console.log('開啟 ' + BASE + '（模擬 390×844 手機）');

  /* ── 1. 語言閘門 ── */
  await cdp.eval(clickExact('中文').replace('return false;', 'return false;'));
  await cdp.eval(`
    (() => { const b = document.getElementById('onboarding-language-zh-TW'); if (b) b.click(); return true; })()
  `);
  await sleep(500);
  await cdp.eval(`(() => { const b = document.getElementById('onboarding-language-confirm'); if (b) b.click(); })()`);
  await sleep(1500);
  console.log('語言閘門：已選中文');

  /* ── 2. 走完引導頁，並在 AI 方式那一頁選「只在本機」 ── */
  let modePicked = false;
  for (let step = 0; step < 12; step++) {
    await sleep(900);
    const still = await cdp.eval(`(() => !!document.getElementById('onboarding-flow'))()`);
    if (!still) break;

    // 「只在本機」那一頁：點選該模式卡片（它是一個 <button>，內含「只在本機」）
    if (!modePicked) {
      const ok = await cdp.eval(clickIncludes('只在本機'));
      if (ok) {
        modePicked = true;
        console.log('已選分析模式：只在本機');
        await sleep(600);
      }
    }

    await cdp.eval(clickExact('下一步'));
  }
  await sleep(800);
  await cdp.eval(clickExact('開始使用'));
  await sleep(2000);
  console.log('引導頁完成｜模式已選：' + modePicked);

  /* ── 3. 把照片餵進相簿輸入框 ─────────────────────────────────
     ⚠️ 這一步踩過三個坑，最後的解法是兩件事**合起來**：
        ① 光用 CDP `DOM.setFileInputFiles`：files 設好了，但**不會觸發
           React 的 onChange**，整個流程不會啟動（白等 240 秒）。
        ② 光在頁面裡 `fetch()` 圖片再塞 DataTransfer：這個環境下 fetch 會
           `Failed to fetch`（同源、檔案確實存在也一樣）。
        → 所以：用 CDP 設本機檔案 + 自己 dispatch 一個冒泡的 change 事件。
     ⚠️ 兩個 hidden input：第一個有 capture（拍照）、第二個是相簿。 */
  const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  const { nodeIds } = await cdp.send('DOM.querySelectorAll', {
    nodeId: root.nodeId,
    selector: 'input[type=file]',
  });
  if (nodeIds.length < 2) throw new Error('找不到相簿輸入框（只找到 ' + nodeIds.length + ' 個）');

  await cdp.send('DOM.setFileInputFiles', {
    nodeId: nodeIds[nodeIds.length - 1],
    files: [path.resolve(IMAGE)],
  });
  const fed = await cdp.eval(`
    (() => {
      const inputs = [...document.querySelectorAll('input[type=file]')];
      const input = inputs[inputs.length - 1];
      const n = input.files ? input.files.length : 0;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return n;
    })()
  `);
  console.log(`餵入照片：${path.basename(IMAGE)}（input.files=${fed}，已派送 change）`);
  if (!fed) throw new Error('CDP 沒有把檔案設進 input');

  /* ── 4. 等結果 ──────────────────────────────────────────────
     ⚠️ 等待條件要同時看兩件事，第一版只用了寬鬆的 body 比對，結果在掃描頁
        就誤判成「已完成」，2 秒就結束 —— OCR 根本還沒跑。
        ① **攔到送往後端的請求**（＝瀏覽器 OCR 真的跑完了，最強的訊號）
        ② 畫面上出現結果頁的字（沿用 check-ui-cjk.mjs 已驗證過的判斷式）
     ⚠️ 瀏覽器 OCR 要載入 2.4MB 語言模型 + WASM，手機上數十秒是正常的。 */
  const RESULT_RE = /daily limit|每天上限|Why this result|ogranica|每天建議/i;
  let sawRequest = false;
  let sawResult = false;
  for (let i = 0; i < 120; i++) {
    await sleep(2000);
    sawRequest = sawRequest || captured.requests.length > 0;
    const bodyText = (await cdp.eval(`document.body.innerText || ''`)) || '';
    const failed = bodyText.includes('看不清楚標籤數字') || /cannot read the label/i.test(bodyText);
    if (sawRequest && (RESULT_RE.test(bodyText) || failed)) {
      sawResult = true;
      console.log(
        `\n流水線完成（約 ${(i + 1) * 2} 秒）：` +
          (failed ? '結果為 ocr_failed（App 說看不清楚）' : '產生了正常結果')
      );
      break;
    }
  }
  if (!sawRequest) console.log('\n⚠️ 等了 ' + 120 * 2 + ' 秒都沒攔到送往 /api/analyze-label 的請求');

  /* ── 5. 報告 ── */
  // 補抓那些 requestWillBeSent 沒帶 body 的請求
  for (const reqId of pendingPost) {
    try {
      const r = await cdp.send('Network.getRequestPostData', { requestId: reqId });
      if (r?.postData) recordBody(r.postData);
    } catch {
      /* 請求可能已被清掉 */
    }
  }

  const ocrLen = (captured.ocrText || '').length;
  console.log('\n──────── 瀏覽器實際讀到的內容 ────────');
  console.log('攔到的請求數：' + captured.requests.length);
  for (const r of captured.requests) {
    console.log(`  · ocrText=${r.ocrTextLen} 字  圖片=${r.hasImage ? r.imageLen + ' 字元' : '無'}  ocrError=${r.ocrError ?? '（無）'}`);
  }
  if (ocrLen > 0) {
    console.log('── ocrText 前 300 字 ──');
    console.log(captured.ocrText.slice(0, 300));
  }
  if (consoleLogs.length) {
    console.log('\n── 瀏覽器 console（前 10 筆）──');
    console.log(consoleLogs.slice(0, 10).join('\n'));
  }

  // 存一份供事後比對
  try {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(OUT, { recursive: true });
    writeFileSync(
      path.join(OUT, 'report.json'),
      JSON.stringify({ image: IMAGE, modePicked, sawResult, captured, consoleLogs }, null, 2),
      'utf8'
    );
    console.log('\n報告存於 ' + path.join(OUT, 'report.json'));
  } catch {}

  exitCode = ocrLen > 0 ? 0 : 1;
} catch (err) {
  console.error('❌ ' + (err?.message || err));
  exitCode = 1;
} finally {
  try {
    if (chrome) chrome.kill();
  } catch {}
  try {
    rmSync(userDataDir, { recursive: true, force: true });
  } catch {}
  process.exit(exitCode);
}
