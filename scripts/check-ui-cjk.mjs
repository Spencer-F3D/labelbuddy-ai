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

  /**
   * ⚠️⚠️ **必須先等到 App 真的載入，才能碰 localStorage**（2026-10-01 修正）
   *
   * 【踩到的情況】
   *   沙箱環境有一個代理，第一個請求偶爾會回 `502 upstream connect failed`。
   *   這時候頁面是**代理的錯誤頁**（不是本機 origin），
   *   於是 `localStorage` 直接丟
   *   `SecurityError: Access is denied for this document` → 整支腳本掛掉。
   *
   * 【修法】重試導覽直到 `#root` 真的渲染出東西為止。
   *   順帶解決了「伺服器還沒準備好就開始測試」的問題。
   */
  let ready = false;
  for (let attempt = 1; attempt <= 8; attempt++) {
    await cdp.send('Page.navigate', { url: BASE });
    await sleep(2500);
    const ok = await cdp.eval(`
      (() => {
        try {
          const root = document.getElementById('root');
          return !!(root && root.children.length > 0) && location.origin === new URL(${JSON.stringify(BASE)}).origin;
        } catch { return false; }
      })()
    `);
    if (ok) { ready = true; break; }
    console.log(`  … 第 ${attempt} 次載入還沒成功，重試`);
    await sleep(2500);
  }
  if (!ready) {
    console.error('\n❌ 重試 8 次仍無法載入 App。');
    console.error(`   請確認伺服器仍在 ${BASE} 上執行（且 dist/ 已建置）。`);
    process.exit(3);
  }

  await cdp.eval(`localStorage.setItem('labelbuddy-language', 'en'); 'ok'`);
  await cdp.send('Page.navigate', { url: BASE });
  await sleep(4000);

  /**
   * ⚠️⚠️ **連線失敗防護**（2026-10-01 新增，這是本專案最危險的假通過模式）
   *
   * 【踩到的情況】
   *   開發伺服器在檢查途中死掉 → 之後每一頁都變成**瀏覽器的錯誤頁**
   *   （「無法連上這個網站 / ERR_CONNECTION_REFUSED」）。
   *   那個錯誤頁是**英文**的，所以 CJK 掃描掃不到任何中文 →
   *   **整份報告回報「0 處中文」並 EXIT 0**，但其實什麼都沒驗到。
   *
   *   更糟的是：後續每一項「找不到選單項目」「找不到區塊」都只印 ⚠️ 警告，
   *   不影響 exit code —— 所以失敗看起來像成功。
   *
   * 【防護】載入後檢查 root 有沒有真的渲染出東西；沒有就立刻中止。
   */
  const appLoaded = await cdp.eval(`
    (() => {
      const root = document.getElementById('root');
      if (!root || root.children.length === 0) return false;
      // 瀏覽器錯誤頁沒有 #root，或 body 只有錯誤訊息
      if (/ERR_CONNECTION|無法連上|拒絕連線|This site can.t be reached/i.test(document.body.innerText || '')) return false;
      return true;
    })()
  `);
  if (!appLoaded) {
    console.error('\n❌ App 沒有載入成功（連線失敗或 root 是空的）。');
    console.error('   中止檢查 —— 繼續跑下去只會得到「全部通過」的假結果。');
    console.error(`   請確認伺服器仍在 ${BASE} 上執行。`);
    process.exit(3);
  }

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
  /**
   * ⚠️⚠️ 這裡的正則**不可以寫死頁數**，也**不可以只認「第 N 步」**。
   *
   * 2026-09-30 踩過兩次：
   *   ① 引導頁從 3 頁變成 9 頁（長者）／7 頁（其他），
   *      而偵測字串寫死 `Step 1 of 3` → 偵測不到 → 整個 onboarding 被跳過
   *      → 後面 15 個「畫面」全部拍到引導頁，卻因為引導頁是英文而全部「通過」。
   *   ② 又在第一頁前面加了「語言閘門」，那一頁**刻意沒有進度指示**，
   *      所以「第 N 步」的正則再次偵測不到。
   *
   * 現在改成認**兩種**開場畫面：
   *   - 語言閘門：有 `onboarding-language-zh-TW` 這顆按鈕
   *   - 引導頁：有「第 N 步，共 M 步」
   */
  const detectOnboarding = `
    (() => !!(document.getElementById('onboarding-language-gate') || document.getElementById('onboarding-flow')))()
  `;
  const onboardVisible = await cdp.eval(detectOnboarding);
  if (onboardVisible) {
    /* ── 語言閘門（2026-09-30 新增，全流程第一頁）─────────────────
     * ⚠️ 這一頁是**刻意雙語**的（兩種語言同時寫）——
     *    因為它是唯一一個「使用者可能看不懂當前介面語言」的畫面。
     *    所以它**一定**會有中文，中文殘留掃描會誤報。
     *    這裡先截圖存證（供人工目視），但**不納入掃描**，
     *    然後選英文繼續走。 */
    const gate = await cdp.eval(`
      (() => {
        const b = document.getElementById('onboarding-language-en');
        if (!b) return false;
        b.click();
        return true;
      })()
    `);
    if (gate) {
      await sleep(900);
      // ⚠️ 2026-09-30 起要先「選」再按「確定」——不會點一下就生效
      const confirmed = await cdp.eval(`
        (() => {
          const b = document.getElementById('onboarding-language-confirm');
          if (!b) return false;
          b.click();
          return true;
        })()
      `);
      await sleep(1500);
      console.log('  ℹ️  語言閘門（雙語，刻意不納入掃描）→ 已選 English' + (confirmed ? ' 並確定' : '（找不到確定鈕！）'));
      if (!confirmed) exitCode = 1;
    } else {
      await capture('00-onboarding-step1');
    }
    await sleep(600);

    /**
     * ⚠️ 引導頁是 **9 頁（長者）／7 頁（其他身分）**，不能寫死「按兩次下一步」。
     *    改成一直按到「Next」消失（＝只剩「Get started」）為止，並設上限防呆。
     */
    for (let i = 0; i < 12; i++) {
      await sleep(700);
      const clicked = await cdp.eval(`
        (() => {
          const b = [...document.querySelectorAll('button')].find(e =>
            (e.textContent || '').trim() === 'Next');
          if (!b) return false;
          b.click();
          return true;
        })()
      `);
      if (!clicked) break;
    }
    await sleep(900);
    // ⚠️ 2026-09-29 起，引導頁最後一步有「我已閱讀並同意私隱條款與免責聲明」勾選框，
    //    沒勾就按不動「開始使用」（按下只會顯示提醒，不會前進）。
    //    所以這裡必須先勾選，否則整個引導頁會卡住、後面每個畫面都拍到引導頁。
    await capture('00-onboarding-last');
    const agreed = await cdp.eval(`
      (() => {
        const cb = document.querySelector('input[type="checkbox"]');
        if (!cb) return false;
        if (!cb.checked) cb.click();
        return cb.checked;
      })()
    `);
    if (!agreed) console.log('  ⚠️  找不到同意勾選框，引導頁可能無法完成');
    await sleep(500);
    await cdp.eval(`
      (() => {
        const b = [...document.querySelectorAll('button')].find(e =>
          (e.textContent || '').trim() === 'Get started');
        if (b) b.click();
      })()
    `);
    // 引導頁結束後 App 會整頁重繪，給它足夠時間再開始掃描，
    // 否則第一個畫面（選單尚未就緒）會間歇性抓不到
    await sleep(3000);
    console.log('  ✅ 00-onboarding（已走完引導頁）');
  }

  /**
   * ⚠️⚠️ 防護：確認真的離開引導頁了。
   *
   * 【為什麼一定要這道】
   *   引導頁本身是英文的 —— 如果它沒被正確關掉，
   *   後面每一個畫面都會拍到它，而檢查會**全部通過**。
   *   2026-09-30 就真的發生過一次：偵測字串寫死「共 3 步」，
   *   引導頁改成 9 頁後偵測不到，於是 15 個畫面全拍到引導頁卻全綠。
   *   這是**假通過**，比紅燈危險得多，所以這裡直接中止。
   */
  const leftOnboarding = await cdp.eval(`
    (() => !(document.getElementById('onboarding-language-gate') || document.getElementById('onboarding-flow')))()
  `);
  if (!leftOnboarding) {
    console.error('  ❌ 仍卡在引導頁 —— 後續畫面全部會誤判，中止檢查');
    process.exit(1);
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
  // ⚠️ 2026-09-29 起「健康問答」從設定搬到功能選單 → 這裡改成直接導覽過去，
  //    不再需要「展開設定裡的手風琴」那套。
  const NAV = [
    ['02-history', 'History'],
    ['03-classroom', 'Learn'],
    ['04c-health-qa', 'Health Q&A'],
    ['04-health-settings', 'Health settings'],
    ['05-scan', 'Photo a label'],
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

  /* ── 健康問答：已搬到功能選單，上面的 NAV 迴圈已經拍過 04c-health-qa ──
   * （2026-09-29 之前它收合在設定頁的手風琴裡，需要展開才掃得到；
   *   搬出來之後直接導覽即可，程式碼更單純。）
   */

  /* ── 設定頁最下方：私隱條款 ＋ 免責聲明（12px）＋ 清除所有資料 ──
   * 這兩塊在頁面最底，不捲到底掃不到 —— 不掃等於沒有被驗證過。
   */
  console.log('\n── 設定頁：AI 分析模式（三選一）──────────');
  await openMenu();
  await sleep(900);
  await clickByText('Health settings');
  await sleep(1800);
  // 展開「AI 分析模式」區塊（預設收合）
  const modeOpen = await cdp.eval(`
    (() => {
      const el = [...document.querySelectorAll('button, [role="button"]')].find(e =>
        /AI analysis mode|AI 分析模式/i.test(e.textContent || ''));
      if (!el) return false;
      el.click();
      return true;
    })()
  `);
  await sleep(1200);
  if (!modeOpen) console.log('  ⚠️  找不到「AI 分析模式」區塊');
  // ⚠️ 展開後一定要把區塊捲進畫面 —— 它在設定頁最上方，
  //    但頁面可能還停在上一段的捲動位置，不捲就只會拍到別的東西（實測就是這樣）。
  const modeScrolled = await cdp.eval(`
    (() => {
      const el = [...document.querySelectorAll('h2, span, div')].find(e =>
        /^(AI analysis mode|AI 分析模式)$/.test((e.textContent || '').trim()));
      if (!el) return false;
      el.scrollIntoView({ block: 'center' });
      return true;
    })()
  `);
  await sleep(1000);
  if (!modeScrolled) console.log('  ⚠️  無法捲到「AI 分析模式」標題');
  await capture('04g-analysis-mode');

  console.log('\n── 設定頁底部（條款與清除資料）──────────');
  await openMenu();
  await sleep(900);
  await clickByText('Health settings');
  await sleep(1800);
  const scrolledToLegal = await cdp.eval(`
    (() => {
      const el = [...document.querySelectorAll('h2')].find(e =>
        /Privacy notice|私隱條款/i.test(e.textContent || ''));
      if (!el) return false;
      el.scrollIntoView({ block: 'start' });
      return true;
    })()
  `);
  await sleep(1200);
  if (!scrolledToLegal) console.log('  ⚠️  找不到「私隱條款」區塊 —— 可能沒有渲染出來');
  await capture('04d-legal-and-clear');

  // 開啟「清除所有資料」的第一級警告，確認彈窗本身也是英文
  const clearOpened = await cdp.eval(`
    (() => {
      const b = document.getElementById('btn-clear-all-data');
      if (!b) return false;
      b.click();
      return true;
    })()
  `);
  await sleep(1200);
  if (!clearOpened) console.log('  ⚠️  找不到「清除所有資料」按鈕');
  await capture('04e-clear-warning-1');
  // 進入第二級警告（不要真的按下刪除）
  await cdp.eval(`
    (() => {
      const b = document.getElementById('btn-clear-stage1-continue');
      if (b) b.click();
    })()
  `);
  await sleep(1000);
  await capture('04f-clear-warning-2');
  // 關掉彈窗，避免殘留遮罩影響後面的示範標籤流程
  await cdp.eval(`
    (() => {
      const b = document.getElementById('btn-clear-cancel');
      if (b) b.click();
    })()
  `);
  await sleep(800);

  // ── 示範標籤（會走完整的「前端 OCR → 後端分析 → 結果頁」流程）────
  console.log('\n── 示範標籤（完整分析流程）──────────────');
  // 示範按鈕在「拍照辨識」分頁上
  await openMenu();
  await sleep(900);
  await clickByText('Photo a label');
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

  /* ══════════════════════════════════════════════════════════════════
   * 追加一輪「只在本機」的分析（2026-09-30）
   * ══════════════════════════════════════════════════════════════════
   *
   * 【為什麼一定要有這一輪】
   *   上面那一輪走的是「直接雲端」—— 而雲端模型**不一定每次都會回傳
   *   `nutrient_facts`**。沒有那個欄位，成分長條圖就不會渲染，
   *   而文字掃描掃不到「不存在的東西」→ **檢查會通過，但實際上什麼都沒驗到**。
   *
   *   實測就真的發生過一次：單位沒翻譯的 bug（英文介面顯示「2350 毫克」）
   *   因為那一輪模型沒回傳 nutrient_facts 而躲過檢查。
   *
   *   「只在本機」走的是確定性的規則引擎，一定會產生 nutrient_facts，
   *   所以長條圖一定會渲染 —— 這樣這一塊才是真的被驗證過。
   */
  console.log('\n── 只在本機（確定性，專門驗成分長條圖）──────');
  // ⚠️ 這一輪也會重新看到語言閘門（因為重新載入），要先選英文
  await sleep(1200);
  await cdp.eval(`
    (() => {
      const b = document.getElementById('onboarding-language-en');
      if (b) b.click();
    })()
  `);
  await sleep(900);
  await cdp.eval(`
    (() => {
      const b = document.getElementById('onboarding-language-confirm');
      if (b) b.click();
    })()
  `);
  await sleep(1500);
  // 走完引導頁（此時預設就是 cloud_image）
  for (let i = 0; i < 12; i++) {
    await sleep(600);
    const ok = await cdp.eval(`
      (() => {
        const b = [...document.querySelectorAll('button')].find(e => (e.textContent||'').trim() === 'Next');
        if (!b) return false;
        b.click();
        return true;
      })()
    `);
    if (!ok) break;
  }
  await sleep(700);
  await cdp.eval(`
    (() => {
      const cb = document.querySelector('input[type="checkbox"]');
      if (cb && !cb.checked) cb.click();
    })()
  `);
  await sleep(400);
  await clickByText('Get started');
  await sleep(3500);

  /**
   * ⚠️ 模式一定要在**引導頁之後**才設定。
   *    引導頁的 `useState` 預設值是 `cloud_image`，走完引導會把
   *    localStorage 的模式覆寫回預設 —— 先設再走引導等於白設。
   *    （實測踩過：以為在驗本機模式，其實跑的是雲端。）
   */
  await cdp.eval(`
    (() => {
      localStorage.setItem('labelbuddy_analysis_mode_v1', 'local_only');
      return 'ok';
    })()
  `);
  await cdp.send('Page.navigate', { url: BASE });
  await sleep(4000);

  await openMenu();
  await sleep(900);
  await clickByText('Photo a label');
  await sleep(1500);
  await cdp.eval(`
    (() => {
      const det = [...document.querySelectorAll('details')].find(d =>
        /sample label|示範標籤/i.test(d.innerText || ''));
      if (det) det.open = true;
    })()
  `);
  await sleep(700);
  const localClicked = await cdp.eval(`
    (() => {
      const b = document.getElementById('btn-sample-ramen');
      if (!b) return false;
      b.click();
      return true;
    })()
  `);
  if (!localClicked) {
    console.log('  ⚠️  找不到示範標籤按鈕');
  } else {
    for (let i = 0; i < 15; i++) {
      await sleep(1500);
      const done = await cdp.eval(`
        (() => /daily limit|每天上限|Why this result/i.test(document.body.innerText))()
      `);
      if (done) break;
    }
    await sleep(1200);
    await capture('09-local-result');
    await cdp.eval(`window.scrollTo(0, document.body.scrollHeight); 'ok'`);
    await sleep(1500);
    await capture('10-local-result-bottom');

    /**
     * ⚠️⚠️ 關鍵防護：**長條圖必須真的出現**。
     *
     * 【為什麼要這道】
     *   如果 `nutrient_facts` 是空的，`NutrientFactBars` 會回傳 null，
     *   文字掃描就掃不到它 —— 檢查會「通過」，但那一塊其實**完全沒被驗到**。
     *   實測就發生過：單位沒翻譯（英文介面顯示「2350 毫克」）因此躲過檢查。
     *
     *   本機模式走的是確定性引擎，一定會產生 `nutrient_facts`。
     *   所以「長條圖沒出現」本身就是一個必須回報的異常。
     */
    const barsRendered = await cdp.eval(`
      (() => {
        const txt = document.body.innerText || '';
        // 長條圖一定會帶這幾個字之一（英文介面）
        return /daily limit|% of limit|of daily target/.test(txt);
      })()
    `);
    if (!barsRendered) {
      console.log('  ❌ 成分長條圖沒有渲染 —— 這一塊等於沒驗到（nutrient_facts 是空的？）');
      exitCode = 1;
    } else {
      console.log('  ✅ 成分長條圖已渲染（確定性驗證生效）');
    }
  }

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
