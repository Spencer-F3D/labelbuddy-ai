/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 長者字級版面稽核（Senior-density layout audit）
 * ============================================================================
 *
 * 【為什麼要有這支】
 *   2026-10-02 使用者回報（原話）：
 *     「選擇長者大字體時有很多地方會字體穿出框框或只有一個字在下一行。」
 *
 *   長者模式把 16/18/19/20px 放大成 19/22/23/24px（×1.2）——
 *   **字大了 20%，框沒有**。任何「原本剛好塞得下」的排版都會壞掉。
 *   這一類問題的兩個特徵：
 *     ① 不會報錯 —— tsc、build、既有檢查全部照過
 *     ② 只有把畫面渲染出來量才看得到
 *
 * 【★ 這支腳本自己踩過「假通過」，值得記下來】
 *   第一版用「元素高度 ÷ line-height」估行數。結果回報
 *   「0 筆穿出框框、0 筆孤行」—— 但使用者明明看到了。
 *   原因有兩個，都很典型：
 *     ① **量錯對象**：量的是**元素框**，不是**文字本身**。
 *        文字冒出框外時，元素框還是乖乖的 —— 當然量不到。
 *     ② **估行數**：高度 ÷ 行高只是近似。emoji、leading、
 *        行內元素都會讓它失準（第一版就誤報了 5 個 emoji「折成 2 行」）。
 *
 *   → 改用 **Range API**：`range.getClientRects()` 直接回傳「每一個行框」，
 *     那是瀏覽器真正排出來的結果，不是估計值。
 *     行數 = rects.length；文字實際邊界 = rects 的聯集；
 *     「末行有幾個字」= 從尾端取 k 個字做 Range，看幾個字開始跨到上一行。
 *
 * 用法：
 *   node scripts/check-layout-senior.mjs http://127.0.0.1:3100
 *   node scripts/check-layout-senior.mjs http://127.0.0.1:3100 --verbose
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const BASE = process.argv[2] ?? 'http://127.0.0.1:3100';
const PORT = 9555;
const VERBOSE = process.argv.includes('--verbose');
/**
 * 介面語言。預設 zh-TW，可用 `--lang=en` 切英文。
 *
 * 【為什麼一定要能驗英文】
 *   英文的平均字寬與中文完全不同（一個詞 5～6 個字元，中文是一字一方塊），
 *   同一段文案的換行位置會完全不一樣 —— 中文不溢出**不代表**英文不溢出。
 *   而本專案的競賽章程寫明「未用英文可不予評審」，
 *   所以英文版面的正確性是**門檻**，不是加分項。
 */
const LANG = (process.argv.find((a) => a.startsWith('--lang=')) || '--lang=zh-TW').split('=')[1];
/**
 * 引導頁要選哪一個身分。預設用預設值（senior）。
 *
 * 【為什麼需要這個參數】
 *   「健身專區」只在身分＝健身人士時出現。用預設身分跑，那三個分頁
 *   **根本不會被渲染**，也就完全沒有被驗證到 —— 那正是本專案最怕的
 *   「假通過」：報告全綠，但那塊從來沒被看過。
 *   用法：`--profile=fitness`（值會用來比對身分卡上的文字）。
 */
const PROFILE = (process.argv.find((a) => a.startsWith('--profile=')) || '').split('=')[1] || '';
/** 各語言下「健身人士」卡片上的文字（找不到就換一種寫法再找一次） */
const PROFILE_TEXT = { 'zh-TW': '健身人士', en: 'Fitness' };

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));

if (!CHROME) {
  console.error('❌ 找不到 Chrome / Edge');
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
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { __error: r.exceptionDetails.text };
  return r.result.value;
}

/* ---------------------------------------------------------------------------
 * 頁面內執行的稽核程式
 *
 * ⚠️ 整段會被當成字串送進瀏覽器，所以：
 *    - 不能用外部的變數或函式
 *    - 註解與程式碼都不能出現反引號或錢字號加左大括號（會截斷樣板字串）
 * ------------------------------------------------------------------------- */
const AUDIT_FN = `
(() => {
  const out = { outside: [], clipped: [], orphan: [], tagWrap: [] };
  const seen = new Set();

  /** 只處理「真的看得到」的元素 */
  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };

  /** 被推離畫面外的元素（收起時的側邊選單）不算問題 */
  const onScreen = (el) => {
    const r = el.getBoundingClientRect();
    return r.right > 2 && r.left < window.innerWidth - 2;
  };

  /** 往上找最近的「框」—— 有背景或邊框的祖先。 */
  const nearestFrame = (el) => {
    let p = el.parentElement;
    while (p && p !== document.body && p !== document.documentElement) {
      const cs = getComputedStyle(p);
      const bg = cs.backgroundColor;
      const hasBg = bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)';
      const hasImg = cs.backgroundImage && cs.backgroundImage !== 'none';
      const bw =
        parseFloat(cs.borderTopWidth || 0) + parseFloat(cs.borderRightWidth || 0) +
        parseFloat(cs.borderBottomWidth || 0) + parseFloat(cs.borderLeftWidth || 0);
      if (hasBg || hasImg || bw > 0) return p;
      p = p.parentElement;
    }
    return null;
  };

  /**
   * ★★ 核心：只取「文字節點」的 rect，再依 top 值分行。
   *
   * 【為什麼不能直接對元素 selectNodeContents】
   *   第一版就是這樣寫的，結果 getClientRects() 回傳的是
   *   **每一個子元素的框**（圖示、兩個 span、…），不是「每一行的框」。
   *   於是「高血壓」這種一行標籤被報成 3 行、「📸 前往拍照」被報成 4 行
   *   —— 整份報告變成幾百筆假警報，等於沒有報告。
   *
   * ★ 正確做法：逐一走訪 Text 節點、各自取 client rects，
   *   這些才是真正的「行框」；再依 top 值分組 → 行數。
   */
  const textInfo = (el) => {
    const rects = [];
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walk.nextNode())) {
      if (!(n.nodeValue || '').trim()) continue;
      const r = document.createRange();
      r.selectNodeContents(n);
      for (const x of r.getClientRects()) {
        if (x.width > 0.5 && x.height > 0.5) rects.push(x);
      }
    }
    if (!rects.length) return null;
    // 同一行的 rect top 會相同（浮點誤差用 2px 分桶收斂）
    const tops = new Set(rects.map((x) => Math.round(x.top / 2) * 2));
    return { rects, lines: tops.size, union: unionOf(rects) };
  };

  /**
   * 這個元素是「文字區塊」嗎？
   * 若它含有 block / flex / grid 的子元素，它就是**容器**，
   * 不是一段文字 —— 量它只會得到一句廢話。
   */
  const isTextBlock = (el) => {
    for (const c of el.children) {
      const d = getComputedStyle(c).display;
      if (d === 'block' || d === 'flex' || d === 'grid' || d === 'list-item' || d === 'table') return false;
    }
    return true;
  };

  const unionOf = (rects) => {
    let l = Infinity, t = Infinity, rr = -Infinity, b = -Infinity;
    for (const x of rects) {
      if (x.left < l) l = x.left;
      if (x.top < t) t = x.top;
      if (x.right > rr) rr = x.right;
      if (x.bottom > b) b = x.bottom;
    }
    return { left: l, top: t, right: rr, bottom: b, width: rr - l, height: b - t };
  };

  /** 這個元素裡最後一個非空白的純文字節點（用來判斷末行剩幾個字） */
  const lastTextNode = (el) => {
    let last = null;
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      if ((n.nodeValue || '').trim()) last = n;
    }
    return last;
  };

  /**
   * ★ 末行到底有幾個字：從尾端取 k 個字做 Range，
   *   一旦這 k 個字跨到 2 個行框，表示末行只有 k-1 個字。
   *   這是「孤行」最可靠、也最不會誤報的量法。
   */
  const lastLineCharCount = (node) => {
    const s = node.nodeValue || '';
    let end = s.length;
    while (end > 0 && /\\s/.test(s.charAt(end - 1))) end--;
    if (end === 0) return 0;
    for (let k = 1; k <= 12; k++) {
      if (k > end) return end;
      const r = document.createRange();
      r.setStart(node, end - k);
      r.setEnd(node, end);
      const rects = [...r.getClientRects()].filter((x) => x.width > 0.5 && x.height > 0.5);
      if (rects.length > 1) return k - 1;
    }
    return 12;
  };

  /** 這串字「排成一行」需要多寬（用隱藏的 nowrap 探針量，比用字數估算準） */
  const singleLineWidth = (el) => {
    const cs = getComputedStyle(el);
    const probe = document.createElement('span');
    probe.style.cssText =
      'position:absolute;left:-99999px;top:0;visibility:hidden;white-space:nowrap;' +
      'font-family:' + cs.fontFamily + ';font-size:' + cs.fontSize + ';font-weight:' + cs.fontWeight +
      ';letter-spacing:' + cs.letterSpacing + ';font-style:' + cs.fontStyle;
    probe.textContent = el.textContent;
    document.body.appendChild(probe);
    const w = probe.getBoundingClientRect().width;
    probe.remove();
    return w;
  };

  /** 有沒有「真的字」——純 emoji／符號不算，避免誤報 */
  const hasRealText = (s) => /[A-Za-z0-9\\u3040-\\u30ff\\u4e00-\\u9fff\\uff21-\\uff5a]/.test(s);

  const describe = (el) => {
    const t = (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 30);
    let cls = '';
    try {
      const raw = typeof el.className === 'string' ? el.className : el.getAttribute('class') || '';
      cls = raw.split(/\\s+/).filter((c) => /text-|w-|h-|flex|grid|min-|max-|nowrap|leading/.test(c)).slice(0, 5).join(' ');
    } catch (e) {}
    return { text: t, tag: el.tagName.toLowerCase(), cls };
  };

  const keyOf = (el, kind) => {
    const r = el.getBoundingClientRect();
    return kind + '|' + el.tagName + '|' + Math.round(r.left) + ',' + Math.round(r.top) + ',' + Math.round(r.width);
  };

  /* ── 掃描所有「真的含文字」的元素 ────────────────────────────── */
  const all = [...document.querySelectorAll('p, span, li, h1, h2, h3, h4, button, label, div, td, th, summary, a')];

  for (const el of all) {
    if (!visible(el) || !onScreen(el)) continue;

    // 只看「直接含文字」的元素，避免同一段字被祖先重複計算
    // 只看「一段文字」的元素：含 block/flex/grid 子元素的容器不算
    if (!isTextBlock(el)) continue;

    const txt = (el.textContent || '').trim();
    if (!txt || !hasRealText(txt)) continue;

    const cs = getComputedStyle(el);
    const info = textInfo(el);
    if (!info) continue;
    const { rects, union: tb, lines } = info;
    const box = el.getBoundingClientRect();

    /* ── 1. 文字穿出「自己所屬的框」────────────────────────────
     * ⚠️ 這裡量的是**文字的行框**（tb），不是元素框（box）。
     *    第一版量元素框 → 文字冒出框外時元素框仍然正常 → 完全量不到。
     */
    const ownOver = Math.max(tb.right - box.right, box.left - tb.left, tb.bottom - box.bottom);
    if (ownOver > 1.5) {
      const k = keyOf(el, 'own');
      if (!seen.has(k)) {
        seen.add(k);
        out.outside.push({
          ...describe(el),
          over: Math.round(ownOver),
          dir: tb.right - box.right === ownOver ? 'right' : box.left - tb.left === ownOver ? 'left' : 'bottom',
          where: '自身框',
          boxW: Math.round(box.width),
          textW: Math.round(tb.width),
          fs: Math.round(parseFloat(cs.fontSize)),
        });
      }
    }

    /* ── 2. 文字穿出「外層卡片」──────────────────────────────── */
    const frame = nearestFrame(el);
    if (frame && visible(frame) && onScreen(frame)) {
      const fcs = getComputedStyle(frame);
      const horizontallyScrollable = fcs.overflowX === 'auto' || fcs.overflowX === 'scroll';
      if (!horizontallyScrollable) {
        const fr = frame.getBoundingClientRect();
        const over = Math.max(tb.right - fr.right, fr.left - tb.left, tb.bottom - fr.bottom);
        if (over > 1.5) {
          const k = keyOf(el, 'frame');
          if (!seen.has(k)) {
            seen.add(k);
            out.outside.push({
              ...describe(el),
              over: Math.round(over),
              dir: tb.right - fr.right === over ? 'right' : fr.left - tb.left === over ? 'left' : 'bottom',
              where: '外層卡片',
              boxW: Math.round(fr.width),
              textW: Math.round(tb.width),
              fs: Math.round(parseFloat(cs.fontSize)),
            });
          }
        }
      }
    }

    /* ── 3. 被 overflow 裁切（看不到的溢出）───────────────────── */
    let p = el;
    for (let depth = 0; p && depth < 4; depth++, p = p.parentElement) {
      const pcs = getComputedStyle(p);
      if (pcs.overflow === 'visible' && pcs.overflowX === 'visible' && pcs.overflowY === 'visible') continue;
      if (pcs.overflowY === 'auto' || pcs.overflowY === 'scroll') continue;
      /**
       * ⚠️ 排除「收合中的手風琴」。
       *    SettingsSection 用 grid-template-rows: 0fr 收起，內容仍在 DOM 裡，
       *    所以 overflow:hidden 的祖先高度是 0 —— 這**不是**版面壞掉，
       *    是刻意的收合狀態。第一版沒排除，就報了一筆「被裁掉 854px」的假警報。
       */
      if (p.clientHeight <= 2) break;
      const pr = p.getBoundingClientRect();
      const cut = Math.max(tb.bottom - pr.bottom, tb.right - pr.right, pr.left - tb.left, pr.top - tb.top);
      if (cut > 1.5) {
        const k = keyOf(el, 'clip');
        if (!seen.has(k)) {
          seen.add(k);
          out.clipped.push({ ...describe(el), cut: Math.round(cut), by: p.tagName.toLowerCase() });
        }
      }
      break;
    }

    /* ── 4. 孤行：末行只剩 1～2 個字 ─────────────────────────── */
    if (lines >= 2 && txt.length >= 8) {
      if (cs.whiteSpace !== 'nowrap' && cs.whiteSpace !== 'pre') {
        const node = lastTextNode(el);
        if (node) {
          const lastFull = (node.nodeValue || '').trim();
          const n = lastLineCharCount(node);
          const endsWithPunct = /[。！？，、；：）」』】…!?.,;:)%\\]"']$/.test(lastFull);
          if (n >= 1 && n <= 2 && !endsWithPunct && lastFull.length >= 4) {
            const k = keyOf(el, 'orphan');
            if (!seen.has(k)) {
              seen.add(k);
              out.orphan.push({
                ...describe(el),
                lines: rects.length,
                last: n,
                fs: Math.round(parseFloat(cs.fontSize)),
                boxW: Math.round(box.width),
              });
            }
          }
        }
      }
    }
  }

  /* ── 5. 標籤被擠壓折行（按鈕／徽章才是問題，段落折行是正常的）──── */
  for (const el of document.querySelectorAll('button, summary, label')) {
    if (!visible(el) || !onScreen(el)) continue;
    if (el.querySelector('p')) continue;              // 卡片型按鈕不算標籤

    /**
     * ⚠️ **只檢查「就是一段純文字」的按鈕**（沒有子元素）。
     *
     * 有子元素的按鈕（圖示 ＋ 文字、標籤 ＋ 數字）是 flex 排版，
     * 文字本來就只分到一部分寬度 —— 用整個按鈕的寬度去算「應該幾行」
     * 會得到大量假警報（第一版就是這樣：整份報告幾百筆，等於沒有報告）。
     */
    if (el.children.length > 0) continue;

    const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!txt || !hasRealText(txt)) continue;

    const cs = getComputedStyle(el);
    if (cs.whiteSpace === 'nowrap') continue;

    const info = textInfo(el);
    if (!info) continue;
    const lines = info.lines;
    if (lines <= 1) continue;

    // 用「一行需要多寬 ÷ 實際可用寬」回推「最少需要幾行」
    const padX =
      parseFloat(cs.paddingLeft || 0) + parseFloat(cs.paddingRight || 0) +
      parseFloat(cs.borderLeftWidth || 0) + parseFloat(cs.borderRightWidth || 0);
    const avail = Math.max(1, el.clientWidth - padX);
    const oneLine = singleLineWidth(el);
    const needed = Math.max(1, Math.ceil(oneLine / avail));
    if (lines > needed) {
      const k = keyOf(el, 'tag');
      if (!seen.has(k)) {
        seen.add(k);
        out.tagWrap.push({
          ...describe(el),
          lines,
          needed,
          avail: Math.round(avail),
          oneLine: Math.round(oneLine),
          fs: Math.round(parseFloat(cs.fontSize)),
        });
      }
    }
  }

  return {
    ...out,
    density: document.documentElement.getAttribute('data-density') || '(無)',
    font16: (() => {
      const probe = document.querySelector('[class~="text-[16px]"]');
      return probe ? Math.round(parseFloat(getComputedStyle(probe).fontSize)) : 0;
    })(),
  };
})()
`;

const audit = () => evalJs(AUDIT_FN);

/**
 * 目前畫面的標題（只取「真的在畫面上」的主標題）。
 *
 * ⚠️ 不能看 `[aria-current="page"]` —— 側邊選單收起時只是被 translate 推走，
 *    它的 DOM 還在、`aria-current` 也還在，會讓每一個畫面都被標成
 *    「健康設定設定慢性病與 / 先選您的身分」這種鬼東西（第一版就是這樣）。
 *    只看 <main> 裡的標題最可靠。
 */
const currentView = () =>
  evalJs(`
    (() => {
      if (document.getElementById('onboarding-language-gate')) return '(語言閘門)';
      const flow = document.getElementById('onboarding-flow');
      if (flow) {
        const h = flow.querySelector('h1, h2');
        return (h ? (h.textContent || '').trim().slice(0, 22) : '(引導頁)');
      }
      const m = document.querySelector('main h1, main h2');
      return m ? (m.textContent || '').trim().slice(0, 24) : '(無標題)';
    })()
  `);

/* ---------------------------------------------------------------------------
 * 收集與輸出
 * ------------------------------------------------------------------------- */
const findings = [];
const cleanViews = [];
const densitySamples = new Set();

async function sweep(label) {
  const heading = (await currentView()) || '';
  const view = label + (heading ? '（' + heading + '）' : '');
  const r = await audit();
  if (!r || r.__error) {
    console.log('  ⚠️  稽核失敗：' + (r && r.__error));
    return;
  }
  densitySamples.add('data-density=' + r.density + '，16px→' + r.font16 + 'px');
  const total = r.outside.length + r.clipped.length + r.orphan.length + r.tagWrap.length;
  if (total === 0) {
    console.log('  ✅ ' + view);
    cleanViews.push(view);
    return;
  }
  console.log(
    '  ❌ ' + view +
    '　穿出 ' + r.outside.length + '／裁切 ' + r.clipped.length +
    '／孤行 ' + r.orphan.length + '／擠壓 ' + r.tagWrap.length
  );
  findings.push({ view, ...r });
}

try {
  const dir = mkdtempSync(path.join(tmpdir(), 'lb-layout-'));
  chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--remote-debugging-port=' + PORT,
      '--user-data-dir=' + dir,
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
      const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
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

  console.log('\n開啟 ' + BASE + '（360×640，使用者手機尺寸）…');

  let ready = false;
  for (let attempt = 1; attempt <= 8; attempt++) {
    await send('Page.navigate', { url: BASE });
    await sleep(2500);
    const ok = await evalJs(
      '(() => { try { const r = document.getElementById("root"); return !!(r && r.children.length > 0); } catch (e) { return false; } })()'
    );
    if (ok) {
      ready = true;
      break;
    }
    await sleep(2000);
  }
  if (!ready) throw new Error('App 載入失敗');

  console.log('\n── 引導頁（預設身分就是 senior ＝最大字級）────────');
  console.log('   介面語言：' + LANG);
  const gateId = 'onboarding-language-' + LANG;
  const hasGate = await evalJs('(() => !!document.getElementById("' + gateId + '"))()');
  if (hasGate) {
    await evalJs('(() => { const b = document.getElementById("' + gateId + '"); if (b) b.click(); })()');
    await sleep(800);
    await evalJs('(() => { const b = document.getElementById("onboarding-language-confirm"); if (b) b.click(); })()');
    await sleep(1200);
  }

  for (let step = 0; step < 12; step++) {
    await sleep(900);
    const stillFlow = await evalJs('(() => !!document.getElementById("onboarding-flow"))()');
    if (!stillFlow) break;
    await sweep('引導頁第 ' + (step + 1) + ' 頁');

    // 身分頁（第 2 頁）：若指定了 --profile，先選那個身分再往下
    if (PROFILE && step === 1) {
      const want = PROFILE_TEXT[LANG] || PROFILE;
      const picked = await evalJs(`
        (() => {
          const b = [...document.querySelectorAll('button')].find((e) =>
            (e.textContent || '').includes(${JSON.stringify(want)}));
          if (!b) return false;
          b.click();
          return true;
        })()
      `);
      console.log('   ' + (picked ? '✅ 已選身分：' : '⚠️  找不到身分卡片：') + want);
      await sleep(600);
    }

    const next = await evalJs(
      '(() => { const b = [...document.querySelectorAll("button")].find(e => /下一步|Next/.test((e.textContent || "").trim())); if (!b) return false; b.click(); return true; })()'
    );
    if (!next) break;
  }

  await sleep(900);
  await evalJs('(() => { const cb = document.querySelector("input[type=checkbox]"); if (cb && !cb.checked) cb.click(); })()');
  await sleep(400);
  await evalJs(
    '(() => { const b = [...document.querySelectorAll("button")].find(e => /開始使用|Get started/.test((e.textContent || "").trim())); if (b) b.click(); })()'
  );
  await sleep(3000);

  const left = await evalJs('(() => !(document.getElementById("onboarding-language-gate") || document.getElementById("onboarding-flow")))()');
  if (!left) throw new Error('仍卡在引導頁，後續畫面全部會誤判 —— 中止');

  console.log('\n── 主介面 ──────────────────────────');
  const TABS = [
    ['home', '首頁'],
    ['scan', '掃描'],
    ['history', '飲食紀錄'],
    ['classroom', '食育學堂'],
    ['qa', '健康問答'],
    // ⚠️ 設定頁的 tab 識別碼是 'conditions'，不是 'settings'
    ['conditions', '健康設定'],
    // 健身專區只在身分＝健身人士時存在。其他身分下找不到按鈕（會印警告，屬預期）。
    ['fitness', '健身專區'],
  ];

  const openTab = async (tab) => {
    await evalJs('(() => { const b = document.getElementById("btn-open-menu"); if (b) b.click(); })()');
    await sleep(500);
    await evalJs('(() => { const b = document.getElementById("menu-item-' + tab + '"); if (b) b.click(); })()');
    await sleep(1600);
  };

  for (const [tab, name] of TABS) {
    await openTab(tab);
    await sweep(name);
    // 捲到底再掃一次：固定列（header/footer）與捲動後的版面都要看
    await evalJs('(() => { const m = document.querySelector("main"); if (m) m.scrollTop = m.scrollHeight; })()');
    await sleep(700);
    await sweep(name + '（捲到底）');
  }

  console.log('\n── 結果頁（示範標籤 ＋ 只在本機）──────');
  await openTab('scan');
  await evalJs('(() => { document.querySelectorAll("details").forEach((d) => { d.open = true; }); })()');
  await sleep(600);
  await sweep('掃描（展開示範）');
  const started = await evalJs('(() => { const b = document.getElementById("btn-sample-ramen"); if (b) { b.click(); return true; } return false; })()');
  if (started) {
    let ok = false;
    for (let i = 0; i < 40; i++) {
      await sleep(1200);
      if (await evalJs('(() => !!document.getElementById("btn-retake-photo"))()')) {
        ok = true;
        break;
      }
    }
    if (!ok) console.log('  ⚠️  等不到結果頁（可能分析失敗）');
    await sleep(1500);
    await sweep('結果頁');
    await evalJs('(() => { const d = document.getElementById("details-more-info"); if (d) d.open = true; })()');
    await sleep(700);
    await evalJs('(() => { const m = document.querySelector("main"); if (m) m.scrollTop = m.scrollHeight; })()');
    await sleep(800);
    await sweep('結果頁（展開＋捲到底）');
  } else {
    console.log('  ⚠️  找不到示範標籤按鈕，跳過結果頁');
  }

  /* ── 總結 ─────────────────────────────────────────────────── */
  // 完整報告另外寫成 JSON —— 終端機輸出會被截斷，而且比對前後差異要看結構化資料
  try {
    const outDir = path.resolve(import.meta.dirname, '..', 'shots-layout');
    if (!existsSync(outDir)) (await import('node:fs')).mkdirSync(outDir, { recursive: true });
    (await import('node:fs')).writeFileSync(
      path.join(outDir, 'report.json'),
      JSON.stringify({ findings, cleanViews, density: [...densitySamples] }, null, 2),
      'utf8'
    );
  } catch (e) {
    console.log('  ⚠️  報告寫檔失敗：' + e.message);
  }

  console.log('\n' + '='.repeat(70));
  const n = findings.reduce(
    (s, f) => s + f.outside.length + f.clipped.length + f.orphan.length + f.tagWrap.length,
    0
  );
  console.log('  共 ' + n + ' 筆問題，分布在 ' + findings.length + ' 個畫面（另 ' + cleanViews.length + ' 個畫面乾淨）');
  console.log('='.repeat(70));

  if (n === 0) {
    console.log('\n✅ 沒有任何文字穿出框框、被裁切，也沒有孤行。');
  } else {
    const dump = (title, pick, fmt) => {
      const rows = findings.flatMap((f) => pick(f).map((x) => ({ view: f.view, ...x })));
      if (!rows.length) return;
      console.log('\n【' + title + '】共 ' + rows.length + ' 筆');
      for (const r of rows) console.log('  • [' + r.view + '] ' + fmt(r));
    };

    dump('① 文字穿出框框', (f) => f.outside, (r) =>
      r.dir + ' 超出 ' + r.over + 'px（' + r.where + '，文字 ' + r.textW + 'px / 框 ' + r.boxW + 'px，' + r.fs + 'px 字）「' + r.text + '」　' + r.cls);
    dump('② 文字被裁切', (f) => f.clipped, (r) =>
      '裁掉 ' + r.cut + 'px（被 <' + r.by + '> 裁）「' + r.text + '」　' + r.cls);
    dump('③ 孤行（末行只剩 1～2 字）', (f) => f.orphan, (r) =>
      r.lines + ' 行、末行 ' + r.last + ' 字（' + r.fs + 'px、框寬 ' + r.boxW + 'px）「' + r.text + '」　' + r.cls);
    dump('④ 標籤被擠壓折行', (f) => f.tagWrap, (r) =>
      r.lines + ' 行（一行需 ' + r.oneLine + 'px、可用 ' + r.avail + 'px → 應 ' + r.needed + ' 行）「' + r.text + '」');
  }

  const ds = [...densitySamples];
  console.log('\n📏 實際量到的字級：' + (ds.length ? ds.join('｜') : '(未知)'));
  if (ds.some((d) => d.includes('comfortable'))) {
    console.log('   ✅ 這是長者（最大字級）＝最壞情況，數字可直接當驗收標準。');
  } else {
    console.log('   ⚠️ 這次量到的**不是**長者字級 —— 請確認身分是不是被改掉了。');
    process.exitCode = 1;
  }

  if (n > 0) process.exitCode = 1;
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
  await sleep(500);
  process.exit(process.exitCode ?? 0);
}
