/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 英文介面中文殘留檢查（UI CJK leak check）
 * ============================================================================
 * 目的：用**真實瀏覽器**把 App 切成英文，走過每個畫面，
 *       掃描畫面上所有可見文字，確認沒有中文殘留。
 *
 * 【為什麼不能只靠靜態掃描】
 *   靜態掃描（grep 原始碼）分不出「條件分支」：
 *     `language === 'en' ? 'English' : '中文'`
 *   這種寫法在原始碼裡有中文，但英文模式根本不會執行到。
 *   反過來，也有「執行時才組出來」的字串（模板、後端回傳）靜態看不到。
 *   只有真的把畫面渲染出來掃一次，才是有意義的驗證。
 *
 * 【為什麼不裝 agent-browser】
 *   它要額外下載 ~500MB 的 Chromium。系統已經有 Chrome，
 *   直接走 CDP（Chrome DevTools Protocol）就夠了。
 *
 * 用法：
 *   node scripts/check-ui-cjk.mjs                  # 預設 http://127.0.0.1:3000
 *   node scripts/check-ui-cjk.mjs http://host:port
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const BASE = process.argv[2] ?? 'http://127.0.0.1:3000';
const PORT = 9333;
const OUT = path.resolve('shots-cjk');

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];

/**
 * 這些中文是「預期會出現」的，不算洩漏 —— 每一條都要有理由。
 */
const ALLOWED = [
  // 語言選擇器裡的語言名稱一律用「母語名稱」顯示：
  // 中文使用者找「中文」、英文使用者找「English」。
  // 若把「中文」翻成 "Chinese"，反而讓只看得懂中文的人找不到自己的語言。
  // 這是刻意的 UX 決定（見 LanguagePicker.tsx 的註解），不是漏翻。
  '中文',
  // 語言選項的圓形徽章用單字「中」／「EN」當視覺線索，
  // 讓不識字的人也能分辨兩個選項（與上面的理由同源）。
  '中',
];

const CJK = /[\u4e00-\u9fff]/;

function findChrome() {
  const hit = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!hit) throw new Error('找不到 Chrome 或 Edge');
  return hit;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── 極簡 CDP 客戶端 ───────────────────────────────────────────── */
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
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
      }, 60000);
    });
  }
  /** 在頁面裡執行 JS 並取回值 */
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) {
      throw new Error(`頁面執行錯誤: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`);
    }
    return r.result.value;
  }
}

/** 掃描一組字串，回報含中文者 */
function scanTexts(label, texts) {
  const hits = [];
  for (const raw of texts) {
    const text = (raw ?? '').toString().trim();
    if (!text || !CJK.test(text)) continue;
    if (ALLOWED.some((a) => text.includes(a))) continue;
    hits.push(text.replace(/\s+/g, ' ').slice(0, 130));
  }
  return { label, hits };
}

/* ── 主流程 ────────────────────────────────────────────────────── */
const userDataDir = mkdtempSync(path.join(tmpdir(), 'lb-cdp-'));
let chrome;
let cdp;
let exitCode = 0;

try {
  chrome = spawn(
    findChrome(),
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

  // 等 CDP 埠起來
  let target = null;
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (target) break;
    } catch {
      /* 還沒起來，繼續等 */
    }
  }
  if (!target) throw new Error('CDP 埠沒有回應（Chrome 可能啟動失敗）');

  const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  await new Promise((res, rej) => {
    ws.on('open', res);
    ws.on('error', rej);
  });
  cdp = new CDP(ws);

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  // 手機直向視窗 —— 這個 App 是為 16:9 手機框設計的
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });

  // ── 先到 origin 設 localStorage，再重新載入 ──────────────────
  console.log(`\n開啟 ${BASE} …`);
  await cdp.send('Page.navigate', { url: BASE });
  await sleep(3000);

  await cdp.eval(`localStorage.setItem('labelbuddy-language', 'en'); 'ok'`);
  await cdp.send('Page.navigate', { url: BASE });
  await sleep(4000);

  const lang = await cdp.eval(`document.documentElement.lang`);
  console.log(`介面語言（<html lang>）: ${lang}`);

  /** index.html 裡寫死的中文標題。用來偵測「標題還沒被 JS 更新」的空窗。 */
  const HTML_DEFAULT_TITLE = 'LabelBuddy AI - 您的超市健康小幫手';

  /** 收集畫面上所有「使用者看得到或讀得到」的文字 */
  const COLLECT = `
    (() => {
      const out = {
        innerText: document.body.innerText,
        title: document.title,
        aria: [...document.querySelectorAll('[aria-label]')].map(e => e.getAttribute('aria-label')),
        placeholder: [...document.querySelectorAll('[placeholder]')].map(e => e.placeholder),
        titleAttr: [...document.querySelectorAll('[title]')].map(e => e.getAttribute('title')),
        alt: [...document.querySelectorAll('img[alt]')].map(e => e.getAttribute('alt')),
      };
      return out;
    })()
  `;

  const results = [];

  async function capture(name) {
    /* ⚠️ `document.title` 偶發性會讀到 index.html 的中文預設值。
     * 原因：切換頁面／導引頁結束的瞬間，eval 可能落在「新文件已載入、
     * 但 main.tsx 還沒跑」的空窗（實測 3 次中出現過 1 次）。
     * 這不是程式的 bug —— main.tsx 與 I18nContext 都會設標題，
     * 只是抓得太早。所以在這裡給它一次重讀的機會，避免假警報。
     */
    let data = await cdp.eval(COLLECT);
    if (data.title === HTML_DEFAULT_TITLE) {
      await sleep(1200);
      data = await cdp.eval(COLLECT);
    }
    const all = [
      ...data.innerText.split('\n'),
      data.title,
      ...data.aria,
      ...data.placeholder,
      ...data.titleAttr,
      ...data.alt,
    ];
    const r = scanTexts(name, all);
    results.push(r);

    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const fs = await import('node:fs');
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(shot.data, 'base64'));

    console.log(
      r.hits.length === 0
        ? `  ✅ ${name}`
        : `  ❌ ${name} → ${r.hits.length} 處中文`
    );
    return r;
  }

  /* ── 首次啟動引導頁 ────────────────────────────────────────────
   * 新的 profile 第一次打開會先看到引導頁，不按完就看不到主介面。
   * 這裡先掃描它（它本身也要是英文的），再按到最後一步。
   *
   * ⚠️ 順序很重要：一定要在 capture('01-home') 之前處理掉，
   *    否則後面每一個畫面都會拍到引導頁，全部誤判。
   */
  const onboardVisible = await cdp.eval(`
    (() => !!document.body.textContent.match(/Step 1 of 3|第 1 步，共 3 步/))()
  `);
  if (onboardVisible) {
    await capture('00-onboarding-step1');
    // 逐步按到底：下一步 ×2 → 開始使用
    for (const label of ['Next', 'Next', 'Get started']) {
      await sleep(700);
      await cdp.eval(`
        (() => {
          const b = [...document.querySelectorAll('button')].find(e =>
            (e.textContent || '').trim() === ${JSON.stringify(label)});
          if (b) b.click();
        })()
      `);
    }
    // 引導頁結束後 App 會整頁重繪，給它足夠時間再開始掃描，
    // 否則第一個畫面（選單尚未就緒）會間歇性抓不到
    await sleep(3000);
    console.log('  ✅ 00-onboarding（已走完引導頁）');
  }

  console.log('\n── 逐頁掃描 ──────────────────────────────');
  await capture('01-home');

  /** 開啟側邊選單（漢堡鈕的 aria-label 隨語言改變，所以用兩種都試） */
  async function openMenu() {
    return cdp.eval(`
      (() => {
        const b = [...document.querySelectorAll('button')].find(e => {
          const l = (e.getAttribute('aria-label') || '');
          return /open menu|開啟選單/i.test(l);
        });
        if (!b) return false;
        b.click();
        return true;
      })()
    `);
  }

  /** 依可見文字點擊（exact=精確比對整行，false=包含即可） */
  async function clickByText(text, exact = true) {
    return cdp.eval(`
      (() => {
        const el = [...document.querySelectorAll('button,a,[role="button"]')]
          .find(e => {
            const t = (e.innerText || '').trim();
            return ${exact ? `t.split('\\n')[0] === ${JSON.stringify(text)}` : `t.includes(${JSON.stringify(text)})`};
          });
        if (!el) return false;
        el.click();
        return true;
      })()
    `);
  }

  // 側邊選單的英文標籤（來自 translations.ts 的 menu.* 鍵）
  const NAV = [
    ['02-history', 'History'],
    ['03-classroom', 'Learn'],
    ['04-health-settings', 'Health settings'],
    ['05-scan', 'Scan a label'],
  ];

  for (const [name, label] of NAV) {
    await openMenu();
    await sleep(900);
    const clicked = await clickByText(label);
    await sleep(1800);
    if (!clicked) console.log(`  ⚠️  ${name}: 找不到選單項目「${label}」`);
    await capture(name);
    // 關閉選單，避免殘留遮罩影響下一頁
    await cdp.eval(`
      (() => {
        const b = [...document.querySelectorAll('button')].find(e =>
          /close menu|關閉選單/i.test(e.getAttribute('aria-label') || ''));
        if (b) b.click();
      })()
    `);
    await sleep(600);
  }

  /* ── 生理指標的 AI 分析區塊 ────────────────────────────────────
   * 它收合在「日常生理指標」手風琴裡，預設看不到 ——
   * 不展開就掃不到，等於整塊沒有被驗證過。
   * 這裡展開後截圖，讓「有沒有正確渲染」有憑據。
   */
  console.log('\n── 生理指標 AI 分析區塊 ──────────────');
  await openMenu();
  await sleep(900);
  await clickByText('Health settings');
  await sleep(1500);
  const vitalsOpen = await cdp.eval(`
    (() => {
      const el = [...document.querySelectorAll('button, summary, [role="button"]')].find(e =>
        /Daily health measurements|日常生理指標/i.test(e.textContent || ''));
      if (!el) return false;
      el.click();
      return true;
    })()
  `);
  await sleep(1500);
  if (!vitalsOpen) console.log('  ⚠️  找不到「Daily health measurements」區塊');
  // 捲到 AI 分析區塊（它在四張指標卡下方，不捲看不到）
  // ⚠️ 一定要挑「最內層」的元素：用 'div' 會先命中包住整個區塊的大容器，
  //    scrollIntoView 之後畫面只會停在中間，看不到標題（實測就是這樣）。
  const scrolled = await cdp.eval(`
    (() => {
      const title = [...document.querySelectorAll('span')].find(e =>
        /Let the AI take a closer look|讓 AI 幫您深入看一次/i.test(e.textContent || ''));
      if (!title) return false;
      title.scrollIntoView({ block: 'start' });
      return true;
    })()
  `);
  await sleep(1200);
  if (!scrolled) console.log('  ⚠️  找不到「AI 深入分析」區塊 —— 可能沒有渲染出來');
  await capture('04b-vitals-ai');

  /* ── 健康問答區塊 ──────────────────────────────────────────────
   * 同樣收合在健康設定頁裡，不展開就掃不到。
   */
  const qaOpen = await cdp.eval(`
    (() => {
      const el = [...document.querySelectorAll('button, [role="button"]')].find(e =>
        /Ask a health question|問健康問題/i.test(e.textContent || ''));
      if (!el) return false;
      el.click();
      return true;
    })()
  `);
  await sleep(1500);
  if (!qaOpen) console.log('  ⚠️  找不到「Ask a health question」區塊');
  const qaScrolled = await cdp.eval(`
    (() => {
      const el = [...document.querySelectorAll('span')].find(e =>
        /Questions people often ask|大家常問的問題/i.test(e.textContent || ''));
      if (!el) return false;
      el.scrollIntoView({ block: 'start' });
      return true;
    })()
  `);
  await sleep(1000);
  if (!qaScrolled) console.log('  ⚠️  找不到健康問答的常見問題區塊');
  await capture('04c-health-qa');

  // ── 示範標籤（會走完整的「前端 OCR → 後端分析 → 結果頁」流程）────
  console.log('\n── 示範標籤（完整分析流程）──────────────');
  // 示範按鈕在「拍照辨識」分頁上
  await openMenu();
  await sleep(900);
  await clickByText('Scan a label');
  await sleep(1500);
  await capture('06-scan-tab');

  const hit = await cdp.eval(`
    (() => {
      // 示範區塊包在收合的 <details> 裡，要先展開才點得到按鈕
      const det = [...document.querySelectorAll('details')].find(d =>
        /sample label|示範標籤/i.test(d.innerText || ''));
      if (det) det.open = true;
      return !!det;
    })()
  `);
  await sleep(700);
  const clicked = await cdp.eval(`
    (() => {
      const b = document.getElementById('btn-sample-ramen');
      if (!b) return false;
      b.click();
      return true;
    })()
  `);

  if (!clicked) {
    console.log(`  ⚠️  找不到示範標籤按鈕（details 展開=${hit}）`);
  } else {
    // ⚠️ 示範標籤會被「畫成圖片」。文字掃描掃不到圖片內容，
    //    所以這裡要立刻截圖，讓人能目視確認標籤本身也是英文。
    await sleep(1200);
    await capture('06b-demo-label');

    console.log('  已點擊示範標籤，等待 OCR 與分析…');
    // 等分析完成：結果頁會出現「判斷依據」等區塊
    for (let i = 0; i < 25; i++) {
      await sleep(2000);
      const done = await cdp.eval(`
        (() => {
          const txt = document.body.innerText;
          return /Why this result|Judgement|Verdict|Red alert|All clear|Caution|daily limit/i.test(txt);
        })()
      `);
      if (done) break;
    }
    await sleep(1500);
    await capture('07-result');
  }

  // 結果頁往下捲，掃描「需要滑動才看得到」的區塊
  await cdp.eval(`window.scrollTo(0, document.body.scrollHeight); 'ok'`);
  await sleep(1500);
  await capture('08-result-bottom');
  await cdp.eval(`window.scrollTo(0, 0); 'ok'`);

  /* ── 總結 ─────────────────────────────────────────────────── */
  const total = results.reduce((s, r) => s + r.hits.length, 0);
  console.log(`\n${'='.repeat(66)}`);
  console.log(`掃描 ${results.length} 個畫面，共 ${total} 處中文`);
  if (total > 0) {
    exitCode = 1;
    for (const r of results) {
      if (!r.hits.length) continue;
      console.log(`\n### ${r.label}`);
      [...new Set(r.hits)].forEach((h) => console.log(`   • ${h}`));
    }
  } else {
    console.log('✅ 英文介面零中文殘留');
  }
  console.log(`\n截圖存於：${OUT}`);
} catch (err) {
  console.error('\n❌ 測試失敗：', err.message);
  exitCode = 2;
} finally {
  try {
    cdp?.ws?.close();
  } catch {}
  try {
    chrome?.kill();
  } catch {}
  await sleep(800);
  try {
    rmSync(userDataDir, { recursive: true, force: true });
  } catch {}
  process.exit(exitCode);
}
