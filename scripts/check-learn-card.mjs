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
 * 【★ 2026-10-07：斷言已從「零 quiz 請求」擴大成「零 `/api/*`」】
 *
 *   在那之前，`local_only` 仍然會打兩個端點：
 *     · `/api/ai-status`（App 掛載時無條件呼叫 —— 但結果在那個模式下根本沒被讀取）
 *     · `/api/analyze-label`（帶 `localOnly: true`，OCR 文字會到我們自己的 Worker）
 *   也就是說「只在本機」當時**不是字面事實**，斷言只能縮到「零 quiz 請求」。
 *
 *   2026-10-07 把規則引擎抽成前後端共用的純函式之後，那個模式真的完全不連網，
 *   所以現在的斷言是**整個 `/api/` 都沒有請求**。
 *
 * 【兩條斷言必須成對，否則會假通過】
 *   · 第二輪（local_only）：零 `/api/*`      ← 負向
 *   · 第一輪（雲端）：**必須**看到 analyze-label ← 正向對照
 *   只驗負向的話，「監看器壞掉」也會讓它通過。
 *   另外還會檢查第二輪**真的跑到某個狀態**（不是逾時什麼都沒發生）。
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
      /**
       * ⚠️ `exceptionDetails.text` 常常只有 "Uncaught" 三個字，
       *    真正的訊息在 `exception.description`。
       *    不把它一起印出來的話，除錯時只會看到「頁面執行錯誤: Uncaught」——
       *    等於沒有訊息（2026-10-07 實際卡在這裡一次）。
       */
      const detail =
        r.exceptionDetails.exception?.description ??
        r.exceptionDetails.exception?.value ??
        JSON.stringify(r.exceptionDetails);
      throw new Error(`頁面執行錯誤: ${detail}\n  運算式：${expression.slice(0, 120)}`);
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

  /**
   * ★★ 2026-10-07：**一定要等到頁面真的在那個 origin 上**才能碰 localStorage。
   *
   * 【踩到的情況】
   *   原本這裡是 `await sleep(3000)`。開發伺服器第一次要現編 App.tsx
   *   （很大，改了檔案之後尤其慢），3 秒不夠 → 頁面還停在 `about:blank`
   *   → `localStorage.setItem` 直接丟
   *   `SecurityError: Access is denied for this document`。
   *
   *   ⚠️ 那個錯誤訊息**完全指不到真正的原因**（看起來像權限問題），
   *      而 `exceptionDetails.text` 還只回 "Uncaught" 三個字。
   *      兩層資訊不足疊在一起，會讓人往錯的方向查很久。
   *
   * 【修法】用「條件」等，不要猜秒數 —— 與本檔下方 `waitFor()` 同一個原則。
   *   `location.origin` 對得上，代表導覽真的完成了。
   */
  {
    const t0 = Date.now();
    let onOrigin = false;
    while (Date.now() - t0 < 40000) {
      try {
        const origin = await cdp.eval(`location.origin`);
        if (origin && origin !== 'null' && BASE.startsWith(origin)) {
          onOrigin = true;
          break;
        }
      } catch {
        /* 頁面還在換，繼續等 */
      }
      await sleep(500);
    }
    if (!onOrigin) throw new Error(`等不到頁面載入 ${BASE}（一直停在 about:blank？）`);
  }

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
  /**
   * ★ 2026-10-07：把「最後停在什麼狀態」回報給呼叫端。
   *
   * 【為什麼需要它 —— 防一種很隱蔽的假通過】
   *   第二輪（local_only）要斷言「零 `/api/*` 請求」。
   *   但如果**分析流程根本沒跑到**（例如 OCR 引擎沒載入、App 提早 return、
   *   或者選單沒點到），那也會是零請求 —— 於是斷言照樣通過，
   *   而它其實什麼都沒驗到。
   *
   *   `finalState` 讓呼叫端能區分：
   *     · `'result'`      → 真的走到結果頁（最好）
   *     · `'ocr-failed'`  → 本機分析**真的跑了**，只是讀不到數字（可接受，
   *                         而且此時零請求才真的證明「離線引擎連請重拍都自己算」）
   *     · `'pending'`     → 逾時，什麼都沒發生 → **零請求是假通過**
   */
  let finalState = 'pending';
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
      finalState = 'result';
      break;
    }
    if (state === 'ocr-failed') {
      finalState = 'ocr-failed';
      break;
    }
  }
  await sleep(1500);

  return {
    reached,
    finalState,
    apiRequests: apiRequests.slice(),
    quizRequests: apiRequests.filter((u) => /\/api\/quiz-/.test(u)),
    analyzeRequests: apiRequests.filter((u) => /\/api\/analyze-label/.test(u)),
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

  /**
   * ★★ 2026-10-07：**正向對照** —— 雲端模式一定要看得到 `/api/analyze-label`。
   *
   * 【為什麼非有這條不可】
   *   第二輪要斷言「local_only 零 `/api/*` 請求」。那是**負向**斷言：
   *   如果網路監看壞掉（`Network.enable` 失敗、事件沒收到、計數重置錯位），
   *   它會**照樣通過** —— 而且通過得理直氣壯。
   *
   *   有了這條正向對照，同一個監看器必須在雲端那一輪**看得到**請求。
   *   兩條一起看，才排得掉「監看器根本沒在工作」這個可能。
   *
   * ⚠️ 這條同時也守住「雲端模式沒有被這次改動弄壞」——
   *    我們把 local_only 改成不發請求，最怕的就是手滑讓雲端也不發了。
   */
  check(
    '★★ 雲端模式仍會打 /api/analyze-label（正向對照：證明網路監看真的在工作）',
    cloud.analyzeRequests.length > 0,
    `→ 這一輪的 /api/ 請求：${cloud.apiRequests.join(', ') || '（一個都沒有！監看器可能壞了）'}`
  );

  const local = await runResultFlow('local_only');

  await shot('02-local-result');

  // ★ 這條是本輪真正的重點，而且**與 OCR 無關** ——
  //   不管有沒有到結果頁，只要卡片真的渲染，它就有可能去呼叫出題端點。
  //   零請求 ＝ 閘門有效。
  /**
   * ★★ 2026-10-07：斷言從「零 `/api/quiz-*`」**擴大成「零 `/api/*`」**。
   *
   * 【為什麼範圍變大】
   *   以前 local_only 仍然會打兩個端點（`/api/ai-status` 與
   *   `/api/analyze-label`），所以只能斷言「零 quiz 請求」。
   *   2026-10-07 起那個模式真的完全不連網（規則引擎搬到裝置上，
   *   `ai-status` 也不再查），所以斷言可以是**整個 `/api/` 都沒有**。
   *
   * ★ 這是「只在本機」這個名字能不能當事實講的分界線。
   */
  check(
    '★★ local_only 時零 /api/* 請求（整個模式完全不連網）',
    local.apiRequests.length === 0,
    local.apiRequests.join(', ')
  );

  /**
   * ★★ 防「零請求是假通過」：分析流程必須**真的跑過**。
   *
   * 若停在 `'pending'`（逾時、引擎沒載入、選單沒點到），
   * 那零請求只是「什麼都沒發生」的同義詞，不代表離線引擎可用。
   */
  check(
    '★★ local_only 的分析流程真的跑過（不是因為什麼都沒發生才零請求）',
    local.finalState !== 'pending',
    `finalState = ${local.finalState}（'pending' ＝ 逾時，零請求是假通過）`
  );
  console.log(`   ℹ️  local_only 那一輪最後停在：${local.finalState}`);

  // 把這一輪的請求印出來（預期是空的，不是空的就是上面那條斷言會抓）
  console.log(
    `   ℹ️  這一輪的 /api/ 請求：${
      local.apiRequests.length ? local.apiRequests.join(', ') : '（無）'
    }`
  );

  /* ══════════════════════════════════════════════════════════════════════
   * ★★★ 斷網實測：把網路真的切掉，再跑一次離線引擎
   * ══════════════════════════════════════════════════════════════════════
   * 【為什麼這一條比前面所有斷言都重要】
   *   「零請求」只證明**沒有發出去**；它不證明「斷網時還算得出來」。
   *   這兩件事不一樣 —— 例如把整個分析功能刪掉，也是零請求。
   *
   *   而「只在本機」真正的承諾是：**在沒有訊號的地下超市也能用**。
   *   所以這裡用 CDP 把網路設成 offline，然後直接呼叫那條路徑。
   *
   * ⚠️ 先驗「網路真的斷了」（對照組）—— 否則如果 offline 沒生效，
   *    這條測試會在「其實有網路」的情況下通過，變成假通過。
   */
  console.log('\n── ★★★ 斷網實測（CDP 把網路設成 offline）──');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  });
  try {
    const netState = await cdp.eval(`
      (async () => {
        try {
          await fetch(${JSON.stringify(BASE)} + '/api/health', { cache: 'no-store' });
          return 'still-online';
        } catch { return 'offline'; }
      })()
    `);
    check('★ 對照組：網路確實已斷（offline 有生效）', netState === 'offline', `實際 ${netState}`);

    /**
     * 直接呼叫「只在本機」走的那一支函式 —— 與 APK 裡完全同一條路徑。
     * ⚠️ 用高鈉標籤（2350mg）＋高血壓，期望**紅燈**：
     *    這是「斷網下還能不能給出正確結論」的最小可證偽命題。
     */
    const raw = await cdp.eval(`
      (async () => {
        const mod = await import('/server/localAnalysis.ts');
        const r = mod.analyzeLabelLocally({
          ocrText: ${JSON.stringify(
            '營養標示\n每一份量 100 公克\n本包裝含 1 份\n熱量 450 大卡\n蛋白質 9 公克\n' +
              '脂肪 18 公克\n飽和脂肪 9 公克\n反式脂肪 0 公克\n碳水化合物 62 公克\n糖 28 公克\n鈉 2350 毫克'
          )},
          conditions: ['高血壓'],
          profileId: 'senior',
          language: 'zh-TW',
        });
        return JSON.stringify({
          risk: r.risk_level,
          mode: r.analysis_mode,
          handling: r.data_handling,
          reminders: (r.condition_reminders || []).length,
          facts: (r.nutrient_facts || []).length,
        });
      })()
    `);
    const r = JSON.parse(raw);
    check(
      '★★★ 斷網下仍算出正確結論（高鈉 2350mg ＋ 高血壓 → 紅燈）',
      r.risk === 'red',
      `實際 risk_level = ${r.risk}`
    );
    check('★ 斷網下的結果標記為 local_fallback', r.mode === 'local_fallback', `實際 ${r.mode}`);
    check('★ 斷網下的隱私標記為 local_only', r.handling === 'local_only', `實際 ${r.handling}`);
    check('★ 斷網下慢性病提醒仍產生（1 條）', r.reminders === 1, `實際 ${r.reminders}`);
    check('★ 斷網下百分比資料仍產生（長條圖用）', r.facts > 0, `實際 ${r.facts} 筆`);
  } finally {
    // 一定要還原，否則後面的檢查全部會因為「沒網路」而失敗
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
  }

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
