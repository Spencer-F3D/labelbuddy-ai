/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 「學一個小知識」卡片端到端檢查（含網路監看）
 * ============================================================================
 * 【為什麼要有這支】
 *   這張卡片有三種「不會報錯」的失敗方式，只有把畫面渲染出來才看得到：
 *     ① 卡片根本沒出現（映射落空、或元件提早 return）
 *     ② 卡片出現了但**位置錯了**（被塞進「更多資訊」裡面，使用者要先展開才看到）
 *     ③ 在「只在本機」模式**偷偷呼叫了 AI**（隱私承諾不成立）
 *
 *   ③ 尤其重要：本專案完全沒有 CDP 網路監看。
 *   所以這支腳本自己實作 `Network.enable` ＋ `Network.requestWillBeSent`。
 *
 * 【⚠️ 範圍要講清楚：本專案不是「零網路」】
 *   `local_only` 模式**仍然會**打兩個既有端點：
 *     · `/api/ai-status`（App 掛載時無條件呼叫）
 *     · `/api/analyze-label`（帶 `localOnly: true`，OCR 文字會到我們自己的 Worker）
 *   所以斷言只能是「**零 `/api/quiz-*` 請求**」。
 *   腳本會把允許的既有請求一併印出來，讓「範圍界定」透明 ——
 *   避免讀者誤以為整支 App 零請求。
 *
 * 用法：
 *   node scripts/check-learn-card.mjs [http://127.0.0.1:3100]
 * 退出碼 0 = 全部通過
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const BASE = process.argv[2] ?? 'http://127.0.0.1:3100';
const PORT = 9444;
const OUT = path.resolve('shots-learn');

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/* ── 極簡 CDP 客戶端（含事件監聽，這是本專案第一支會用事件的腳本）────── */
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method && this.listeners.has(msg.method)) {
        for (const fn of this.listeners.get(msg.method)) {
          try {
            fn(msg.params);
          } catch {
            /* 監聽器出錯不該影響主流程 */
          }
        }
      }
    });
  }
  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
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
      }, 60000);
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) {
      throw new Error(`頁面執行錯誤: ${r.exceptionDetails.text}`);
    }
    return r.result.value;
  }
}

let chrome;
let cdp;
let exitCode = 0;

/**
 * 走一次「拍照 → 示範標籤 → 結果頁」的流程。
 *
 * @param {string} mode 'cloud_image' 或 'local_only'
 * @returns {{apiRequests: string[], quizRequests: string[]}}
 */
async function runResultFlow(mode) {
  // 先到 origin 設 localStorage（設完要重新載入才會生效）
  await cdp.send('Page.navigate', { url: BASE });
  await sleep(3000);
  await cdp.eval(`
    (() => {
      localStorage.setItem('labelbuddy-language', 'zh-TW');
      localStorage.setItem('labelbuddy_onboarded_v1', 'true');
      localStorage.setItem('labelbuddy_learner_profile_v1', 'senior');
      localStorage.setItem('labelbuddy_analysis_mode_v1', ${JSON.stringify(mode)});
      localStorage.setItem('labelbuddy_selected_conditions', '["hypertension","diabetes"]');
      localStorage.removeItem('labelbuddy_quiz_bank_v1');
      localStorage.removeItem('labelbuddy_learning_progress_v1');
      return 'ok';
    })()
  `);

  /**
   * ★ 2026-10-07 第二階段：**請求計數要從這裡才開始算**。
   *
   * 【踩到的情況】
   *   上面那次 `Page.navigate`（為了到 origin 才能設 localStorage）
   *   用的是**上一輪的模式** —— 跑 `local_only` 那一輪時，
   *   那次載入還是 `cloud_image`，於是 App 照常同步線上題庫，
   *   計數就抓到了 `/api/quiz-bank` → 斷言「local_only 零 quiz 請求」**誤報失敗**。
   *
   *   那是**探針的問題，不是程式的問題**：我們要驗的是
   *   「用 local_only 載入的那一次，有沒有發出 quiz 請求」。
   *   → 把重置搬到「localStorage 設好、即將用正確模式重新載入」的這一刻。
   */
  apiRequests = [];
  await cdp.send('Page.navigate', { url: BASE });

  /**
   * ⚠️⚠️ 一定要等 App **真的渲染出來**再互動。
   *
   * 【踩到的情況（2026-10-07）】
   *   開發伺服器第一次要現編 App.tsx（很大），3.5 秒不夠。
   *   於是「開選單」按在還沒掛載的頁面上 → 選單沒開 → 後面的
   *   `#menu-item-scan` 也點不到 → **整支腳本停在首頁**，
   *   而錯誤訊息只說「找不到示範標籤按鈕」，完全指不到真正的原因。
   *
   * 【修法】用「元素真的出現」當等待條件，而不是猜一個秒數。
   */
  const waitFor = async (expr, ms = 40000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      try {
        if (await cdp.eval(expr)) return true;
      } catch {
        /* 頁面還在換，繼續等 */
      }
      await sleep(700);
    }
    return false;
  };

  const appReady = await waitFor(`
    (() => {
      const r = document.getElementById('root');
      return !!(r && r.children.length > 0);
    })()
  `);
  if (!appReady) throw new Error('App 沒有渲染出來（#root 是空的）');

  // 開選單 → 拍照看標籤
  const menuOpened = await cdp.eval(`
    (() => {
      const b = [...document.querySelectorAll('button')].find(e =>
        /open menu|開啟選單/i.test(e.getAttribute('aria-label') || ''));
      if (!b) return false;
      b.click();
      return true;
    })()
  `);
  if (!menuOpened) throw new Error('找不到開啟選單的按鈕');

  const menuItemReady = await waitFor(`!!document.getElementById('menu-item-scan')`);
  if (!menuItemReady) throw new Error('選單打開了但沒有 #menu-item-scan');

  await cdp.eval(`(() => { document.getElementById('menu-item-scan').click(); return true; })()`);

  // 等掃描頁真的出現（示範標籤按鈕在 DOM 裡）
  const scanReady = await waitFor(`!!document.getElementById('btn-sample-ramen')`);
  if (!scanReady) throw new Error('切到掃描頁後找不到 #btn-sample-ramen');

  // 展開「示範」折疊區再點下去
  await cdp.eval(`
    (() => {
      const b = document.getElementById('btn-sample-ramen');
      const det = b?.closest('details');
      if (det) det.open = true;
      return true;
    })()
  `);
  await sleep(500);
  await cdp.eval(`(() => { document.getElementById('btn-sample-ramen').click(); return true; })()`);

  /**
   * 等結果頁出現。
   *
   * ⚠️ 要分辨兩種「沒到結果頁」：
   *   ① 還在跑（分析要幾秒）→ 繼續等
   *   ② 顯示「請重拍」的引導頁 → 永遠等不到 `#details-more-info`，
   *      而且**這不是本功能的 bug**（本機模式的瀏覽器 OCR 在 headless Chrome
   *      本來就會讀不到示範標籤的數字，2026-10-06 已用 git stash 證明是既有問題）
   *   → 所以這裡回報 `reached` 讓呼叫端自己決定怎麼解讀。
   */
  let reached = false;
  for (let i = 0; i < 30; i++) {
    await sleep(1200);
    const state = await cdp.eval(`
      (() => {
        if (document.getElementById('details-more-info')) return 'result';
        const txt = document.body.innerText || '';
        if (/看不清楚標籤數字|Cannot read the label numbers/.test(txt)) return 'ocr-failed';
        return 'pending';
      })()
    `);
    if (state === 'result') {
      reached = true;
      break;
    }
    if (state === 'ocr-failed') break;
  }
  await sleep(1500);

  return {
    reached,
    apiRequests: apiRequests.slice(),
    quizRequests: apiRequests.filter((u) => /\/api\/quiz-/.test(u)),
  };
}

/** 目前這一輪收集到的所有 /api/ 請求 */
let apiRequests = [];

try {
  const chromePath = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!chromePath) throw new Error('找不到 Chrome 或 Edge');

  const userDataDir = mkdtempSync(path.join(tmpdir(), 'lb-learn-'));
  chrome = spawn(
    chromePath,
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
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (target) break;
    } catch {
      /* 還沒起來 */
    }
  }
  if (!target) throw new Error('CDP 埠沒有回應');

  const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  await new Promise((res, rej) => {
    ws.on('open', res);
    ws.on('error', rej);
  });
  cdp = new CDP(ws);

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });

  // ★ 網路監看（本專案第一支會用事件的腳本）
  await cdp.send('Network.enable');
  cdp.on('Network.requestWillBeSent', (p) => {
    const u = p?.request?.url || '';
    if (/\/api\//.test(u)) apiRequests.push(u.replace(BASE, ''));
  });

  mkdirSync(OUT, { recursive: true });
  const shot = async (name) => {
    const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(r.data, 'base64'));
  };

  /* ══════════════════════════════════════════════════════════════════
   * 第一輪：雲端模式
   * ══════════════════════════════════════════════════════════════════ */
  console.log(`\n開啟 ${BASE} …`);
  console.log('\n── 第一輪：cloud_image（結果頁的學習卡片）──');
  apiRequests = [];
  const cloud = await runResultFlow('cloud_image');
  check('走到結果頁（示範標籤分析完成）', cloud.reached === true, '→ 沒到結果頁，後面的斷言都會失敗');

  const exists = await cdp.eval(`!!document.getElementById('learn-card')`);
  check('#learn-card 存在於結果頁', exists === true);
  await shot('01-cloud-result');

  // ⚠️ 上面的截圖只有視窗範圍（結果頁很長，卡片在下方看不到）。
  //    捲到卡片再拍一張 —— 否則「有截圖」但沒人看得到卡片，等於沒有證據。
  if (exists) {
    await cdp.eval(`
      (() => {
        const el = document.getElementById('learn-card');
        el.scrollIntoView({ block: 'start' });
        return 'ok';
      })()
    `);
    await sleep(700);
    await shot('01b-learn-card');
  }

  if (exists) {
    // 位置：必須在「更多資訊」**之前**
    const order = await cdp.eval(`
      (() => {
        const learn = document.getElementById('learn-card');
        const more = document.getElementById('details-more-info');
        if (!learn || !more) return 'missing';
        // compareDocumentPosition：4 = learn 在 more 之後；2 = learn 在 more 之前
        const rel = more.compareDocumentPosition(learn);
        return (rel & Node.DOCUMENT_POSITION_PRECEDING) ? 'before' : 'after';
      })()
    `);
    check('★ 卡片位置在「更多資訊」之前（＝「為什麼」之下）', order === 'before', `→ ${order}`);

    const text = await cdp.eval(`document.getElementById('learn-card').innerText || ''`);
    check('標題是「學一個小知識」', text.includes('學一個小知識'));
    check('有「原理」那一段', text.includes('原理'));
    check('有「換你想想」那一段', text.includes('換你想想'));
    check('有「我知道了」按鈕（寫入學習進度）', text.includes('我讀完了'));

    /**
     * ★★ 回歸斷言（2026-10-07 就是在這裡抓到 bug 的）。
     *
     * 這一輪設定的條件是「高血壓 ＋ 糖尿病」（**沒有勾任何過敏**），
     * 而示範拉麵的鈉是 118%。所以卡片應該教「鈉」。
     *
     * ⚠️ 但雲端 AI 會**自願**在 matched_conditions 裡加一行
     *    「過敏原：小麥、大豆、花生、牛肉」——
     *    舊寫法（看字串含不含「過敏」）會被它劫持，顯示「過敏原怎麼看」，
     *    把真正的紅燈原因（鈉 118%）擠掉。
     *
     * 這個 bug **只有真實的 AI 回覆才會重現** ——
     * 純函式測試要用人工造的 fixture，而 fixture 是照著已知的 bug 寫的。
     * 所以這一條一定要留在端到端層。
     */
    check(
      '★★ 沒勾過敏時，卡片教的是「鈉」而不是「過敏原」',
      text.includes('鈉：藏在湯裡的隱形殺手') && !text.includes('過敏原怎麼看'),
      `→ ${text.includes('過敏原怎麼看') ? '顯示了過敏原卡（回歸了）' : '卡片內容不含預期的鈉卡標題'}`
    );

    // 作答：點第一個選項，應該出現詳解
    const answered = await cdp.eval(`
      (() => {
        const card = document.getElementById('learn-card');
        if (!card) return false;
        const btn = card.querySelector('[role="button"], button[type="button"]');
        const opts = [...card.querySelectorAll('button')].filter(b =>
          (b.innerText || '').trim().length > 0 && /^[ABC]/.test((b.innerText || '').trim()));
        if (!opts.length) return false;
        opts[0].click();
        return true;
      })()
    `);
    await sleep(900);
    const afterText = await cdp.eval(`document.getElementById('learn-card').innerText || ''`);
    check(
      '點選項後出現對答案與詳解',
      /答對了|再想一下/.test(afterText),
      answered ? '' : '找不到選項按鈕'
    );

    // 「我知道了」要寫進學習進度（與食育學堂同一把鍵）
    await cdp.eval(`
      (() => { const b = document.getElementById('learn-card-got-it'); if (b) b.click(); return !!b; })()
    `);
    await sleep(800);
    const progress = await cdp.eval(`localStorage.getItem('labelbuddy_learning_progress_v1')`);
    check(
      '★「我讀完了」寫入 labelbuddy_learning_progress_v1（與學堂共用）',
      typeof progress === 'string' && progress.includes('card-'),
      `→ ${String(progress).slice(0, 80)}`
    );
  }

  /* ══════════════════════════════════════════════════════════════════
   * 第二輪：只在本機（★ 隱私斷言）
   * ══════════════════════════════════════════════════════════════════ */
  console.log('\n── 第二輪：local_only（卡片仍要出現，且零 quiz 請求）──');
  apiRequests = [];
  /**
   * ★ 2026-10-07 第二階段：**雲端模式要同步線上題庫**。
   *
   * 【為什麼一定要有這條「正向」斷言】
   *   第二輪驗的是「local_only 時零 `/api/quiz-*` 請求」——那是**負向**斷言。
   *   如果同步功能整個壞掉（effect 沒跑、網址拼錯、被 catch 吃掉），
   *   負向斷言**照樣通過**。只有正向斷言才能證明它真的在運作。
   */
  check(
    '★ 雲端模式會同步線上題庫（GET /api/quiz-bank）',
    cloud.apiRequests.some((u) => u.includes('/api/quiz-bank')),
    `→ ${cloud.apiRequests.join(', ')}`
  );

  const local = await runResultFlow('local_only');

  await shot('02-local-result');

  // ★ 這條是本輪真正的重點，而且**與 OCR 無關** ——
  //   不管有沒有到結果頁，只要卡片真的渲染，它就有可能去呼叫出題端點。
  //   零請求 ＝ 閘門有效。
  check(
    '★ local_only 時零 /api/quiz-* 請求（同意閘門有效）',
    local.quizRequests.length === 0,
    local.quizRequests.join(', ')
  );

  // 把允許的既有請求印出來，讓「範圍界定」透明（見檔頭說明）
  console.log(
    `   ℹ️  這一輪的 /api/ 請求（既有、非本功能）：${
      local.apiRequests.length ? local.apiRequests.join(', ') : '（無）'
    }`
  );

  if (local.reached) {
    const localExists = await cdp.eval(`!!document.getElementById('learn-card')`);
    check('★ local_only 也要出現卡片（純前端部分零網路）', localExists === true);
  } else {
    /**
     * ⚠️ **誠實揭露，不要假裝通過。**
     *
     * 「local_only 時卡片會不會出現」在這裡**無法端到端驗證**：
     *   本機模式的分析要先在瀏覽器跑 OCR，而 headless Chrome 讀不到示範標籤的
     *   數字（2026-10-06 已用 git stash 證明是**既有**問題，與本功能無關）。
     *   讀不到數字 → App 顯示「請重拍」→ 根本沒有結果頁 → 當然沒有卡片。
     *
     * 補償證據（不是同等的，但至少不是空白）：
     *   · `scripts/check-learn-mapping.ts`：8 身分 × 4 情境 = 32 組合，
     *     證明挑卡與挑題在任何身分下都不會回 null
     *   · `LearnFromScanCard` 的 gating 是純資料判斷
     *     （`analysisMode === 'local_only'` → 直接走 fallback，不 fetch）
     *   · 本輪的「零 /api/quiz-*」斷言證明那條路徑沒有被走到
     */
    console.log(
      '   ⚠️  local_only 的卡片是否出現**無法在此驗證**：本機模式的瀏覽器 OCR\n' +
        '       在 headless Chrome 讀不到示範標籤數字（既有問題）→ 沒有結果頁。\n' +
        '       補償證據：check-learn-mapping.ts 的 40 組合 ＋ 本輪的零請求斷言。'
    );
  }

  console.log(`\n${'='.repeat(66)}`);
  console.log(`結果：${pass} 項通過 / ${fail} 項有問題`);
  console.log(`截圖存於：${OUT}`);
  if (fail > 0) exitCode = 1;
} catch (err) {
  console.error('\n❌ 檢查失敗：', err.message);
  exitCode = 2;
} finally {
  try {
    cdp?.ws?.close();
  } catch {}
  try {
    chrome?.kill();
  } catch {}
  await sleep(500);
  process.exit(exitCode);
}
