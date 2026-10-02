/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 量測引導頁每一頁的實際高度（2026-10-02）
 * ============================================================================
 *
 * 【為什麼要有這支】
 *   使用者要求「引導頁不用滾動就看完整頁」。
 *   但各頁內容量差很多（介紹頁有 7 個區塊、性別頁只有 2 個），
 *   憑感覺壓版面會把「本來就塞得下的頁」也一起壓壞。
 *
 *   這支腳本走完整個引導頁，在**每一頁**量：
 *     scrollHeight（內容實際高度）
 *     innerHeight （螢幕可視高度）
 *     overflow    （超出多少 px）
 *   只列出**真正溢出**的頁面，以及超出多少 —— 那才是要處理的對象。
 *
 * 【為什麼要量「真實瀏覽器」而不是算字數】
 *   高度取決於換行、字型、內距、flex 間距 —— 算不出來，只能量。
 *
 * 用法：node scripts/measure-onboarding.mjs http://127.0.0.1:3300
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const BASE = process.argv[2] ?? 'http://127.0.0.1:3300';
const PORT = 9444;
const OUT_DIR = path.resolve(import.meta.dirname, '..', 'shots-onboarding');

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p));

if (!CHROME) {
  console.error('❌ 找不到 Chrome');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let chrome;
let ws;
let id = 0;
const pending = new Map();

function send(method, params = {}) {
  const n = ++id;
  return new Promise((resolve, reject) => {
    pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
    setTimeout(() => {
      if (pending.has(n)) {
        pending.delete(n);
        reject(new Error('timeout ' + method));
      }
    }, 60000);
  });
}

async function evalJs(expression) {
  const r = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) return { __error: r.exceptionDetails.text };
  return r.result.value;
}

/** 量測目前這一頁的高度 */
async function measure() {
  return evalJs(`
    (() => {
      const de = document.documentElement;
      const body = document.body;
      const scrollH = Math.max(de.scrollHeight, body.scrollHeight);
      const innerH = window.innerHeight;

      // 抓一個可辨識的標題，用來在報告裡認出這是哪一頁
      const h = document.querySelector('h1, h2, [data-onboarding-title]');
      const title = h ? (h.textContent || '').trim().slice(0, 40) : '(無標題)';

      // 引導頁的根容器（用來分辨「還停在引導頁」）
      // ⚠️ 語言閘門是**另一個 id**（onboarding-language-gate）——
      //    只認 onboarding-flow 的話，會在第一頁（閘門）就誤判成「已離開引導頁」。
      //    ⚠️ 這段在樣板字串裡面，註解不能出現反引號，否則會把字串截斷。
      const flowEl = document.getElementById('onboarding-flow');
      const gateEl = document.getElementById('onboarding-language-gate');
      const flow = !!(flowEl || gateEl);

      /**
       * ★ 真正要量的東西（2026-10-02 修正）
       *
       * 【踩到的坑】
       *   一開始量 documentElement.scrollHeight，結果**九頁全部回報 936px**，
       *   每一頁都「超出 296px」。但截圖一看，性別頁明明有大片空白 ——
       *   936px 是**外層容器**的高度（它被撐成固定高度），不是內容高度。
       *
       * ★ 教訓：**「所有樣本回報同一個數字」就是量錯對象的徵兆。**
       *   不同內容不可能剛好一樣高。看到這種結果要先懷疑量測方法，
       *   而不是開始「修」那個其實沒壞的東西。
       *
       * 【正確做法】
       *   量內容區塊（卡片）的實際高度，再加上容器的上下內距 ——
       *   也就是「這一頁的內容到底佔多少 px」。
       */
      const root = flowEl || gateEl;
      let contentBottom = 0;
      if (root) {
        /**
         * ★ 最可靠的做法：找「內容的最下緣」。
         *
         * 逐一檢查 root 底下所有元素的可視下緣（getBoundingClientRect().bottom），
         * 取最大值 —— 那就是「這一頁的內容延伸到哪裡」。
         *
         * ⚠️ 要排除 position:fixed 的元素（例如固定在底部的按鈕列）——
         *    它們永遠貼在畫面底部，下緣會等於畫面高度，會讓每一頁都誤判成剛好滿版。
         *    ⚠️ 這段在樣板字串裡面，註解一律不能出現反引號，否則會把字串截斷。
         */
        const all = [root, ...root.querySelectorAll('*')];
        for (const e of all) {
          const cs = getComputedStyle(e);
          if (cs.position === 'fixed') continue;
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          const r = e.getBoundingClientRect();
          if (r.height <= 0 || r.width <= 0) continue;
          /**
           * ⚠️ 排除「滿版容器」（高度 >= 畫面高度）。
           *
           * 引導頁外層是一個撐滿畫面的 flex 容器 —— 它的下緣永遠剛好等於
           * 畫面高度，會讓「塞得下」的頁面全部回報成 640/640（剩 0px），
           * 看起來像「剛好滿版」，實際上還有很多空白。
           *
           * ★ 排除它之後，剩下的才是**真正的內容元素**，
           *   量到的下緣才有意義（可以算出「還剩多少空間」）。
           */
          if (r.height >= window.innerHeight) continue;
          if (r.bottom > contentBottom) contentBottom = r.bottom;
        }
      }

      return {
        scrollH,
        innerH,
        overflow: scrollH - innerH,
        title,
        flow,
        // 內容最下緣（相對於畫面頂端）—— 這才是「這一頁需要多少高度」
        contentBottom: Math.round(contentBottom),
        // 目前套用的字級模式（compact = 非長者、comfortable = 長者）
        // ⚠️ 由腳本自己回報，不要用「我以為」的假設 ——
        //    這個腳本先前就因為假設錯字級，在輸出裡寫了相反的警語。
        density: document.documentElement.getAttribute('data-density') || '(無)',
        // 實際套用在 16px 上的字級（驗證縮放規則真的生效）
        bodyFontPx: (() => {
          const probe = document.querySelector('[class~="text-[16px]"]');
          return probe ? Math.round(parseFloat(getComputedStyle(probe).fontSize)) : 0;
        })(),
      };
    })()
  `);
}

async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(OUT_DIR, name + '.png'), Buffer.from(r.data, 'base64'));
}

const dir = mkdtempSync(path.join(tmpdir(), 'lb-measure-'));
const rows = [];
/** 向下提示的行為驗證若有任何一頁失敗，最後以非零結束碼回報 */
let exitHintFail = false;

try {
  chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${dir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--hide-scrollbars',
      '--window-size=360,640',
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
    } catch {}
  }
  if (!target) throw new Error('Chrome 沒起來');

  ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
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
  await send('Emulation.setDeviceMetricsOverride', {
    width: 360,
    height: 640,
    deviceScaleFactor: 2,
    mobile: true,
  });

  console.log(`\n開啟 ${BASE}（模擬 360×640 手機）…`);

  // 等 App 真的載入（沙箱的代理偶爾會回 502，要重試）
  let ready = false;
  for (let attempt = 1; attempt <= 8; attempt++) {
    await send('Page.navigate', { url: BASE });
    await sleep(2500);
    const ok = await evalJs(`
      (() => { try { const r = document.getElementById('root');
        return !!(r && r.children.length > 0); } catch { return false; } })()
    `);
    if (ok) {
      ready = true;
      break;
    }
    console.log(`  … 第 ${attempt} 次載入未成功，重試`);
    await sleep(2500);
  }
  if (!ready) throw new Error('App 載入失敗');

  /**
   * 語言閘門（全流程第一頁，2026-09-30 新增）。
   *
   * ⚠️ 它**不屬於編號流程**，所以要單獨處理：
   *    ① 用 id `onboarding-language-zh-TW` 選語言
   *    ② 再按 `onboarding-language-confirm` 確定
   *    （2026-09-30 起是「先選再確定」，點一下不會生效）
   */
  const gateLang = await evalJs(`
    (() => {
      const b = document.getElementById('onboarding-language-zh-TW');
      if (!b) return false;
      b.click();
      return true;
    })()
  `);
  if (gateLang) {
    await sleep(800);
    const confirmed = await evalJs(`
      (() => {
        const b = document.getElementById('onboarding-language-confirm');
        if (!b) return false;
        b.click();
        return true;
      })()
    `);
    console.log(`  語言閘門：選中文${confirmed ? '並確定' : '（找不到確定鈕！）'}`);
    await sleep(1000);
  } else {
    console.log('  ⚠️ 沒看到語言閘門（可能已走過引導頁）');
  }

  // ── 逐頁量測 ────────────────────────────────────────────────
  for (let step = 0; step < 14; step++) {
    await sleep(900);
    const m = await measure();
    if (!m || m.__error) {
      console.log(`  ⚠️ 第 ${step} 頁量測失敗：${m?.__error}`);
      break;
    }
    if (!m.flow) {
      console.log(`\n（第 ${step} 頁已離開引導頁，量測結束）`);
      break;
    }

    // ⚠️ 用 contentBottom（內容最下緣）判斷，不是 scrollHeight ——
    //    後者量到的是外層容器，會讓每一頁回報同一個數字（見 measure 的說明）。
    const over = m.contentBottom - m.innerH;
    rows.push({ step, ...m, over });

    const flag = over > 0 ? '❌ 溢出' : '✅ 塞得下';
    console.log(
      `  第 ${String(step + 1).padStart(2)} 頁 ${flag}  內容到 ${m.contentBottom}px / 畫面 ${m.innerH}px` +
        (over > 0 ? `  → 超出 ${over}px` : `  （剩 ${-over}px）`) +
        `   「${m.title}」`
    );
    await shot(`page-${String(step + 1).padStart(2, '0')}`);

    /* ── 驗證向下提示的行為 ──────────────────────────────────
     * ⚠️ 這是**斷言**不是觀察：只拍截圖看不出「捲到底有沒有收起」。
     *    引導頁的「下一步」按鈕在捲動容器裡面 ——
     *    提示若不收起，會一直蓋住按鈕，使用者反而按不到。
     *    所以「下面還有內容時出現、捲到底就收起」兩件事都要驗。
     */
    const hintTop = await evalJs(
      `(() => !!document.getElementById('onboarding-scroll-hint'))()`
    );
    const scrolled = await evalJs(`
      (() => {
        const el = document.getElementById('onboarding-flow');
        if (!el) return null;
        const canScroll = el.scrollHeight - el.clientHeight > 24;
        el.scrollTop = el.scrollHeight;   // 捲到最底
        return canScroll;
      })()
    `);
    await sleep(400);
    const hintBottom = await evalJs(
      `(() => !!document.getElementById('onboarding-scroll-hint'))()`
    );

    // 判定：可捲動的頁面 → 頂端應出現、底部應消失；不可捲動 → 兩者皆無
    let verdict;
    if (scrolled) {
      verdict = hintTop && !hintBottom ? '✅' : '❌';
    } else {
      verdict = !hintTop && !hintBottom ? '✅' : '❌';
    }
    const detail = scrolled
      ? `可捲動：頂端${hintTop ? '有' : '無'}提示、底部${hintBottom ? '有' : '無'}提示`
      : `不需捲動：${hintTop ? '竟出現' : '未出現'}提示`;
    if (verdict === '❌') exitHintFail = true;
    console.log(`        ${verdict} 向下提示 ${detail}`);

    // 捲回頂端，讓下一頁從乾淨狀態開始
    await evalJs(`(() => { const el = document.getElementById('onboarding-flow'); if (el) el.scrollTop = 0; })()`);
    await sleep(300);

    // 按「下一步」；按不到就代表已經是最後一頁
    const clicked = await evalJs(`
      (() => {
        const b = [...document.querySelectorAll('button')].find(e =>
          /下一步|Next/.test((e.textContent || '').trim()));
        if (!b) return false;
        b.click();
        return true;
      })()
    `);
    if (!clicked) break;
  }

  // ── 總結 ────────────────────────────────────────────────────
  const bad = rows.filter((r) => r.over > 0);
  console.log('\n' + '='.repeat(64));
  console.log(`  共量測 ${rows.length} 頁｜溢出 ${bad.length} 頁`);
  console.log('='.repeat(64));
  if (bad.length > 0) {
    console.log('\n需要處理的頁面（依超出量排序）：');
    for (const r of bad.sort((a, b) => b.over - a.over)) {
      console.log(`  第 ${r.step + 1} 頁：超出 ${r.over}px（內容到 ${r.contentBottom}px）「${r.title}」`);
    }
  } else {
    console.log('\n✅ 所有頁面都塞得下，不需要壓縮。');
  }
  console.log(`\n截圖：${OUT_DIR}`);

  if (exitHintFail) {
    console.log('\n❌ 向下捲動提示的行為驗證失敗（見上方 ❌ 的頁面）。');
    console.log('   正確行為：可捲動的頁面「頂端出現、捲到底收起」；不可捲動的頁面不出現。');
    process.exitCode = 1;
  } else {
    console.log('\n✅ 向下捲動提示行為正確（每一頁都驗過）。');
  }

  /**
   * ⚠️ 回報實際量到的字級模式，不要用假設。
   *
   * 這個腳本先前在輸出裡寫「這裡量的是非長者字級」——
   * 那是**錯的**：引導頁的預設身分是 `DEFAULT_PROFILE_ID = 'senior'`，
   * 所以量到的其實是**長者（最大字級）**，也就是最壞情況。
   * 錯誤的警語會讓人以為「還有更壞的情況沒量到」而多做白工。
   */
  const d = rows[0]?.density ?? '(未知)';
  const f = rows[0]?.bodyFontPx ?? 0;
  const modeName =
    d === 'comfortable' ? '長者（最大字級）' : d === 'compact' ? '非長者（縮小字級）' : '未知';
  console.log(`\n📏 實際量到的字級：data-density="${d}" → ${modeName}`);
  console.log(`   16px 那一級實際渲染成 ${f}px`);
  if (d === 'comfortable') {
    console.log('   ✅ 這是最壞情況（字最大）—— 數字可以直接當作驗收標準。');
  } else {
    console.log('   ⚠️ 這不是最壞情況。長者字級更大，請把身分切成 senior 再量一次。');
  }
} catch (e) {
  console.error('\n❌ 失敗：', e.message);
  process.exitCode = 1;
} finally {
  try {
    ws?.close();
  } catch {}
  try {
    chrome?.kill();
  } catch {}
  await sleep(600);
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
  process.exit(process.exitCode ?? 0);
}
