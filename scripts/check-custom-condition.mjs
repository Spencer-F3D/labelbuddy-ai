/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 自填病症對話框 ＋ 本機模式限制說明 端到端檢查
 * ============================================================================
 * 【為什麼要有這支】
 *   這兩件事都有「不會報錯」的失敗方式，只有把畫面渲染出來才看得到：
 *
 *     ① 按「其他」**沒有彈出對話框**（或彈了但輸入框沒拿到焦點）
 *        → 使用者以為按了，其實什麼都沒發生
 *     ② **空白也能按確定** → 勾了一個「什麼都不會送出」的項目，
 *        而畫面上完全看不出來（本專案最恨的靜默失效）
 *     ③ 按「取消」卻把項目勾起來了 → 使用者以為自己取消了
 *     ④ 本機模式的限制說明**沒出現** → 使用者對回答有錯誤期待
 *
 * 用法：
 *   node scripts/check-custom-condition.mjs [http://127.0.0.1:3100]
 * 退出碼 0 = 全部通過
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const BASE = process.argv[2] ?? 'http://127.0.0.1:3100';
const PORT = 9466;
const OUT = path.resolve('shots-conditions');

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
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) {
      // ⚠️ `text` 常常只是「Uncaught」，真正的訊息在 exception.description ——
      //    只報 text 的話，除錯時等於什麼都沒說。
      const desc =
        r.exceptionDetails.exception?.description ||
        r.exceptionDetails.exception?.value ||
        '';
      throw new Error(
        `頁面執行錯誤: ${r.exceptionDetails.text}${desc ? ` — ${String(desc).slice(0, 300)}` : ''}`
      );
    }
    return r.result.value;
  }
}

let chrome;
let cdp;
let exitCode = 0;

/** 等待某個條件成立（用元素真的出現當判準，不要猜秒數） */
async function waitFor(expr, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      if (await cdp.eval(expr)) return true;
    } catch {
      /* 頁面還在換 */
    }
    await sleep(400);
  }
  return false;
}

/** React 受控輸入：一定要走 native setter ＋ dispatch input，否則值不會進 state */
const TYPE_INTO = (id, text) => `
  (() => {
    const el = document.getElementById(${JSON.stringify(id)});
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, ${JSON.stringify(text)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()
`;

const clickId = (id) => `(() => { const e = document.getElementById(${JSON.stringify(id)}); if (!e) return false; e.click(); return true; })()`;
const dialogOpen = `!!document.querySelector('[role="dialog"]')`;
const dialogText = `(document.querySelector('[role="dialog"]')?.innerText || '')`;
const conditionsInStorage = `(JSON.parse(localStorage.getItem('labelbuddy_selected_conditions') || '[]'))`;

async function shot(name) {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(r.data, 'base64'));
}

/**
 * 導覽到 App，並且**確認真的在我們的 origin 上**。
 *
 * ⚠️⚠️ 這不是多餘的檢查（2026-10-07 實測踩到）：
 *   沙箱環境有一個代理，第一個請求偶爾會回 `502 upstream connect failed`。
 *   這時候頁面是**代理的錯誤頁**（不是本機 origin），
 *   於是 `localStorage` 直接丟
 *   `SecurityError: Access is denied for this document` → 整支腳本掛掉，
 *   而錯誤訊息完全指不到真正的原因（看起來像程式的 bug）。
 *
 *   作法與 `check-ui-cjk.mjs` 一致：重試導覽直到 `#root` 真的有內容
 *   **且** `location.origin` 正確。
 */
async function navigateUntilReady() {
  for (let attempt = 1; attempt <= 8; attempt++) {
    await cdp.send('Page.navigate', { url: BASE });
    await sleep(2500);
    const ok = await cdp.eval(`
      (() => {
        try {
          const root = document.getElementById('root');
          return (
            !!(root && root.children.length > 0) &&
            location.origin === new URL(${JSON.stringify(BASE)}).origin
          );
        } catch { return false; }
      })()
    `);
    if (ok) return true;
    console.log(`  … 第 ${attempt} 次載入還沒成功，重試`);
    await sleep(2000);
  }
  throw new Error(`重試 8 次仍無法載入 App（請確認 ${BASE} 仍在執行）`);
}

/** 設好 localStorage 並重新載入 */
async function boot(mode, lang = 'zh-TW') {
  await navigateUntilReady();
  await cdp.eval(`
    (() => {
      localStorage.setItem('labelbuddy-language', ${JSON.stringify(lang)});
      localStorage.setItem('labelbuddy_onboarded_v1', 'true');
      localStorage.setItem('labelbuddy_learner_profile_v1', 'senior');
      localStorage.setItem('labelbuddy_analysis_mode_v1', ${JSON.stringify(mode)});
      localStorage.setItem('labelbuddy_selected_conditions', '[]');
      localStorage.removeItem('labelbuddy_custom_condition_v1');
      return 'ok';
    })()
  `);
  await navigateUntilReady();
  await sleep(1200);

  // 開選單 → 健康設定
  await cdp.eval(`
    (() => {
      const b = [...document.querySelectorAll('button')].find(e =>
        /open menu|開啟選單/i.test(e.getAttribute('aria-label') || ''));
      if (b) b.click();
      return !!b;
    })()
  `);
  await waitFor(`!!document.getElementById('menu-item-conditions')`);
  await cdp.eval(clickId('menu-item-conditions'));

  // 等「其他」那一列出現（它在主清單裡，因為一開始沒勾）
  const ready = await waitFor(`!!document.getElementById('checkbox-other')`);
  if (!ready) throw new Error('健康設定頁找不到 #checkbox-other');
  await sleep(600);
}

(async () => {
  try {
  const chromePath = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!chromePath) throw new Error('找不到 Chrome 或 Edge');

  mkdirSync(OUT, { recursive: true });
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'lb-cond-'));
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

  console.log(`\n開啟 ${BASE} …`);

  /* ══════════════════════════════════════════════════════════════════
   * 第一輪：雲端模式 —— 對話框的行為
   * ══════════════════════════════════════════════════════════════════ */
  console.log('\n── 第一輪：自填病症對話框（cloud_image）──');
  await boot('cloud_image');

  check('一開始沒有對話框', (await cdp.eval(dialogOpen)) === false);

  // A. 按「其他」→ 應該立刻彈出對話框
  await cdp.eval(clickId('checkbox-other'));
  const opened = await waitFor(dialogOpen, 5000);
  check('★ 按「其他」立即彈出對話框', opened === true);
  await shot('01-dialog-open');

  if (opened) {
    check(
      '輸入框自動取得焦點（不用再點一次才能打字）',
      (await cdp.eval(`document.activeElement?.id === 'custom-condition-input'`)) === true,
      `→ ${await cdp.eval(`document.activeElement?.id || document.activeElement?.tagName`)}`
    );
    check(
      '對話框沒有出現「只在本機」警告（目前是雲端模式）',
      !/只在本機.*無法/.test(await cdp.eval(dialogText))
    );

    // B. 取消 → 不應該勾選
    await cdp.eval(clickId('btn-custom-condition-cancel'));
    await sleep(600);
    check('按取消後對話框關閉', (await cdp.eval(dialogOpen)) === false);
    check(
      '★ 按取消**不會**把「其他」勾起來',
      !(await cdp.eval(conditionsInStorage)).includes('other'),
      JSON.stringify(await cdp.eval(conditionsInStorage))
    );

    // C. 再開一次 → 空白按確定 → 應該被擋住
    await cdp.eval(clickId('checkbox-other'));
    await waitFor(dialogOpen, 5000);
    await cdp.eval(clickId('btn-custom-condition-confirm'));
    await sleep(600);
    check('★★ 空白按確定時對話框**不會關閉**（擋住「勾了卻沒填」）', (await cdp.eval(dialogOpen)) === true);
    check(
      '空白按確定時有顯示提示文字',
      /請先填寫病症名稱/.test(await cdp.eval(dialogText)),
      (await cdp.eval(dialogText)).slice(0, 60)
    );
    check(
      '★★ 空白時也沒有把「其他」勾起來',
      !(await cdp.eval(conditionsInStorage)).includes('other')
    );
    await shot('02-dialog-empty-blocked');

    // D. 填字 → 確定 → 應該勾選並顯示精簡列
    await cdp.eval(TYPE_INTO('custom-condition-input', '甲狀腺機能低下'));
    await sleep(300);
    await cdp.eval(clickId('btn-custom-condition-confirm'));
    await sleep(800);
    check('填字後按確定 → 對話框關閉', (await cdp.eval(dialogOpen)) === false);
    check(
      '★ 確定後「其他」被勾選',
      (await cdp.eval(conditionsInStorage)).includes('other'),
      JSON.stringify(await cdp.eval(conditionsInStorage))
    );
    check(
      '★ 內容寫進 labelbuddy_custom_condition_v1',
      (await cdp.eval(`localStorage.getItem('labelbuddy_custom_condition_v1')`)) === '甲狀腺機能低下'
    );
    const bodyText = await cdp.eval(`document.body.innerText || ''`);
    check('★ 畫面上看得到自己填了什麼（精簡列）', bodyText.includes('甲狀腺機能低下'), '');
    check('有「修改」按鈕可以重開對話框', (await cdp.eval(`!!document.getElementById('btn-edit-custom-condition')`)) === true);
    await shot('03-compact-row');

    // E. 修改 → 應該帶入原值
    await cdp.eval(clickId('btn-edit-custom-condition'));
    await waitFor(dialogOpen, 5000);
    check(
      '按「修改」重開時帶入原本填的內容',
      (await cdp.eval(`document.getElementById('custom-condition-input')?.value`)) === '甲狀腺機能低下'
    );
    // F. 取消 → 原值不變
    await cdp.eval(clickId('btn-custom-condition-cancel'));
    await sleep(600);
    check(
      '取消修改後原值不變',
      (await cdp.eval(`localStorage.getItem('labelbuddy_custom_condition_v1')`)) === '甲狀腺機能低下'
    );
  }

  /* ══════════════════════════════════════════════════════════════════
   * 第二輪：只在本機 —— 對話框警告 ＋ 問答區限制說明
   * ══════════════════════════════════════════════════════════════════ */
  console.log('\n── 第二輪：local_only（對話框警告 ＋ 問答限制說明）──');
  await boot('local_only');

  await cdp.eval(clickId('checkbox-other'));
  const opened2 = await waitFor(dialogOpen, 5000);
  check('local_only 時對話框也會開', opened2 === true);
  if (opened2) {
    const txt = await cdp.eval(dialogText);
    check(
      '★ local_only 時對話框顯示「本機無法把關」警告',
      /只在本機/.test(txt),
      txt.slice(0, 80)
    );
    await shot('04-dialog-local-only');
    await cdp.eval(clickId('btn-custom-condition-cancel'));
    await sleep(500);
  }

  // 問答區：限制說明應該**常駐**（不必先問一題）
  await cdp.eval(`
    (() => {
      const b = [...document.querySelectorAll('button')].find(e =>
        /open menu|開啟選單/i.test(e.getAttribute('aria-label') || ''));
      if (b) b.click();
      return !!b;
    })()
  `);
  await waitFor(`!!document.getElementById('menu-item-qa')`);
  await cdp.eval(clickId('menu-item-qa'));
  await sleep(2000);

  const qaText = await cdp.eval(`document.body.innerText || ''`);
  check(
    '★ local_only 的問答區**常駐**顯示限制說明（不必先問一題）',
    /只在本機模式的限制/.test(qaText),
    qaText.includes('只在本機模式的限制') ? '' : '找不到限制說明'
  );
  check(
    '限制說明有講到「不是 AI 生成」',
    /不是 AI 生成/.test(qaText)
  );
  await shot('05-qa-local-limitation');

  /* ══════════════════════════════════════════════════════════════════
   * 第三輪：英文 —— 對話框與限制說明的**長文案**最容易溢出
   * ══════════════════════════════════════════════════════════════════
   * 【為什麼要單獨跑一輪】
   *   `check:layout` 會掃健康設定頁，但它**不會打開這個對話框** ——
   *   而對話框裡的英文比中文長得多（那句「已勾選但沒填」的警告英文 90+ 字元）。
   *   沒有這一輪的話，英文溢出不會有任何檢查看到。
   */
  console.log('\n── 第三輪：英文（長文案溢出）──');
  await boot('local_only', 'en');
  await cdp.eval(clickId('checkbox-other'));
  const opened3 = await waitFor(dialogOpen, 5000);
  check('英文模式對話框也會開', opened3 === true);
  if (opened3) {
    await cdp.eval(TYPE_INTO('custom-condition-input', 'Hypothyroidism'));
    await sleep(300);
    await cdp.eval(clickId('btn-custom-condition-confirm'));
    await sleep(800);

    /**
     * 水平溢出：只看**這個新元件**（`#custom-condition-summary`）。
     *
     * ⚠️ 第一次寫的時候掃整個 `body`，結果抓到的是頁面上**既有的**
     *    身分選擇晶片（`Medium`、🧒、🍱…）—— 那些是橫向捲動的設計，不是 bug。
     *    把範圍縮到自己的元素，斷言才有意義（否則會訓練出「忽略這個紅燈」）。
     */
    const overflow = await cdp.eval(`
      (() => {
        const root = document.getElementById('custom-condition-summary');
        if (!root) return ['no-summary-row'];
        const bad = [];
        for (const el of [root, ...root.querySelectorAll('*')]) {
          if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
            const txt = (el.innerText || '').replace(/\\s+/g, ' ').slice(0, 40);
            bad.push(txt || el.tagName);
          }
        }
        return bad.slice(0, 5);
      })()
    `);
    check('★ 英文精簡列沒有水平溢出', Array.isArray(overflow) && overflow.length === 0, JSON.stringify(overflow));

    await cdp.eval(clickId('btn-edit-custom-condition'));
    await waitFor(dialogOpen, 5000);
    const overflowDialog = await cdp.eval(`
      (() => {
        const d = document.querySelector('[role="dialog"]');
        if (!d) return ['no-dialog'];
        const bad = [];
        for (const el of d.querySelectorAll('*')) {
          if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
            const txt = (el.innerText || '').replace(/\\s+/g, ' ').slice(0, 40);
            if (txt) bad.push(txt);
          }
        }
        return bad.slice(0, 5);
      })()
    `);
    check('★ 英文對話框沒有水平溢出', Array.isArray(overflowDialog) && overflowDialog.length === 0, JSON.stringify(overflowDialog));
    check('英文對話框零中文殘留', !/[\u4e00-\u9fff]/.test(await cdp.eval(dialogText)));
    await shot('06-dialog-en');
    await cdp.eval(clickId('btn-custom-condition-cancel'));
    await sleep(400);
  }

  /* ══════════════════════════════════════════════════════════════════
   * 第四輪：**引導頁**（2026-10-07 使用者指定「引導頁也要有」）
   * ══════════════════════════════════════════════════════════════════
   * 【為什麼一定要單獨跑一輪】
   *   引導頁的慢性病步驟與設定頁是**兩個不同的元件**（`OnboardingFlow` vs `App`），
   *   自填的 state 也是各一份。設定頁測過不代表引導頁會動 ——
   *   尤其引導頁那條路徑要「回傳給 App 並寫進儲存」，中間任何一段漏接都不會報錯。
   */
  console.log('\n── 第四輪：引導頁的自填病症 ──');
  await cdp.eval(`
    (() => {
      localStorage.clear();
      return 'ok';
    })()
  `);
  await navigateUntilReady();
  await sleep(1200);

  // 語言閘門
  const gate = await waitFor(`!!document.getElementById('onboarding-language-zh-TW')`, 10000);
  if (gate) {
    await cdp.eval(clickId('onboarding-language-zh-TW'));
    await sleep(400);
    await cdp.eval(clickId('onboarding-language-confirm'));
    await sleep(1500);
  }
  check('走過語言閘門', gate === true);

  /**
   * 逐步走引導頁，**在慢性病那一頁停下來操作**。
   *
   * ⚠️ 不能像 `check-ui-cjk.mjs` 那樣「一直按下一步到沒有為止」——
   *    那樣會直接跳過要驗的那一頁。所以每一輪先看 `#onboard-custom-condition`
   *    在不在，在就操作，然後才按下一步。
   */
  let interacted = false;
  for (let i = 0; i < 14; i++) {
    const onConditions = await cdp.eval(`!!document.getElementById('onboard-custom-condition')`);
    if (onConditions && !interacted) {
      interacted = true;
      check('★ 引導頁有「其他（自行填寫）」那一列', true);
      await cdp.eval(clickId('onboard-custom-condition'));
      const dlg = await waitFor(dialogOpen, 5000);
      check('★ 引導頁按「其他」也會彈出對話框', dlg === true);
      await shot('07-onboard-dialog');
      if (dlg) {
        await cdp.eval(TYPE_INTO('custom-condition-input', '甲狀腺機能低下'));
        await sleep(300);
        await cdp.eval(clickId('btn-custom-condition-confirm'));
        await sleep(700);
        check(
          '★ 引導頁確定後顯示精簡列（看得到自己填了什麼）',
          (await cdp.eval(`!!document.getElementById('onboard-custom-summary')`)) === true
        );
        // ⚠️ 一定要先捲到那一列再拍 —— 引導頁很長，不捲的話截圖只有上方那 12 項，
        //    看不到新加的東西（等於沒有證據）。
        await cdp.eval(`
          (() => {
            const el = document.getElementById('onboard-custom-summary')
              || document.getElementById('onboard-custom-condition');
            if (el) el.scrollIntoView({ block: 'center' });
            return !!el;
          })()
        `);
        await sleep(600);
        await shot('08-onboard-filled');
      }
    }
    /**
     * ⚠️ 最後一頁（私隱條款）**沒勾同意就不放行** ——
     *    「開始使用」按下去不會有反應，迴圈會一直卡在同一頁。
     *    第一次跑就是卡在這裡（連續 7 輪都停在「私隱與 AI 使用方式」）。
     *
     * ⚠️ 同意框在 `LegalNotice` 裡，**沒有 id**（它是共用元件，加固定 id
     *    在同時渲染兩份時會撞號），所以用 `input[type="checkbox"]` 選。
     *    用 `.click()` 而不是設 `.checked` —— 那是 React 受控元件，
     *    直接改 property 不會觸發 onChange。
     */
    await cdp.eval(`
      (() => {
        const cb = document.querySelector('#onboarding-flow input[type="checkbox"]');
        if (cb && !cb.checked) cb.click();
        return true;
      })()
    `);
    await sleep(200);

    const clicked = await cdp.eval(`
      (() => {
        const btn = [...document.querySelectorAll('button')].map((e) => ({
          t: (e.textContent || '').trim(),
          id: e.id || '',
        }));
        const b = [...document.querySelectorAll('button')].find((e) =>
          /^(下一步|開始使用)$/.test((e.textContent || '').trim()));
        if (!b) return JSON.stringify({ ok: false, buttons: btn.slice(-6) });
        b.click();
        return JSON.stringify({ ok: true, label: (b.textContent || '').trim() });
      })()
    `);
    const info = JSON.parse(clicked);
    if (!info.ok) {
      console.log(`   ℹ️  第 ${i + 1} 輪找不到下一步，畫面上的按鈕：${JSON.stringify(info.buttons)}`);
      break;
    }
    const head = await cdp.eval(`
      (document.querySelector('#onboarding-flow h1')?.innerText || document.body.innerText || '')
        .replace(/\\s+/g, ' ').slice(0, 46)
    `);
    console.log(`   ℹ️  第 ${i + 1} 輪：按「${info.label}」｜${head}`);
    await sleep(1100);
  }
  check('★ 在引導頁的慢性病步驟真的操作到了（不是被跳過）', interacted === true);

  await sleep(1500);
  check(
    '★★ 走完引導頁後，自填內容寫進了 labelbuddy_custom_condition_v1',
    (await cdp.eval(`localStorage.getItem('labelbuddy_custom_condition_v1')`)) === '甲狀腺機能低下',
    `→ ${await cdp.eval(`localStorage.getItem('labelbuddy_custom_condition_v1')`)}`
  );
  check(
    '★★ 走完引導頁後，「其他」也在勾選清單裡',
    (await cdp.eval(conditionsInStorage)).includes('other'),
    JSON.stringify(await cdp.eval(conditionsInStorage))
  );

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
})();
