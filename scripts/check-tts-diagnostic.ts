/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 語音朗讀診斷回歸測試（TTS diagnostic check）
 * ============================================================================
 *
 * 【為什麼要有這支】
 *   使用者回報過至少三輪「沒有聲音」，而每一次都**重現不出來**：
 *     2026-10-04「網頁朗讀示範完全沒有聲」→ 三層查證後結論是「程式是對的」
 *     2026-10-08「線上網站有聲音（按鈕）顯示沒有，但音量已是最大」
 *
 *   根因是 Web Speech API 的失敗**全都是靜默的**：
 *     ① 音量 0       → `speakText` 直接 `return false`，呼叫端若不看回傳值就毫無異狀
 *     ② 沒有該語言語音 → `speak()` 不觸發 `onstart` 也不觸發 `onerror`
 *     ③ 送出去但沒出聲 → 同上，而且 `lastDiagnostic` 早就寫成 `'started'`
 *
 *   所以這支驗的不是「功能正常」（那取決於使用者的裝置），
 *   而是「**失敗的時候有沒有講出來**」。那是我們唯一能保證的事。
 *
 * 【這一支驗什麼】
 *   靜態（不需要瀏覽器）：
 *     1. `TtsDiagnostic.outcome` 的每個值都**有生產者**
 *        —— 本專案紅線：「UI 有 if/else 的值，都要確認每個值真有生產者」。
 *        `'no-voice'` 曾經寫在型別裡卻沒有任何地方產生它。
 *     2. 每個生產者都有對應的 **UI 分支**（除了 `'pending'`，那是初始值）
 *     3. 設定頁有獨立的「測試語音」按鈕（`#tts-test-voice`）
 *     4. 元件用到的每個 `settings.sound.*` 鍵，**中英都有翻譯**
 *        （漏了會直接顯示原始 key，而且不會報錯）
 *   瀏覽器（需要 Chrome／Edge，會自己起一台 dev server）：
 *     5. 設定頁真的渲染出 `#tts-test-voice`
 *     6. 音量 0 時按下測試鈕 → **出現「朗讀音量是 0」的說明**（不是靜默）
 *     7. 這台裝置沒有該語言語音時 → 出現「可以改用普通話／English」的指引
 *
 * 用法：npx tsx scripts/check-tts-diagnostic.ts
 *       npx tsx scripts/check-tts-diagnostic.ts --static-only   （跳過瀏覽器）
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
/**
 * ⚠️ `ws` 沒有附型別宣告（專案沒裝 `@types/ws`），而這支是診斷腳本。
 *    `check-layout-senior.mjs` 用的是同一套 CDP 手法，只是它是 .mjs 所以不被型別檢查。
 */
// @ts-ignore -- 見上方說明
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0;
let fail = 0;
let skip = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name} ${extra}`);
  }
}
function skipped(name: string, why: string) {
  skip++;
  console.log(`  ⏭️  ${name} —— 跳過：${why}`);
}

const STATIC_ONLY = process.argv.includes('--static-only');

/* ══════════════════════════════════════════════════════════════════════
 * 靜態檢查
 * ══════════════════════════════════════════════════════════════════════ */

const ttsSrc = read('src/utils/tts.ts');
const sectionSrc = read('src/components/TtsSettingsSection.tsx');

console.log('── 1. TtsDiagnostic.outcome：每個值都要有生產者 ──');

/**
 * 型別裡宣告了哪些值？
 * ⚠️ 只取 `outcome:` 那一行的型別註解，不要抓到下面用法裡的字面值。
 */
const unionLine = ttsSrc.match(/outcome:\s*([^;]+);/)?.[1] ?? '';
const outcomeValues = [...unionLine.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);

check('找得到 outcome 型別（沒找到代表 tts.ts 結構變了，請更新這支腳本）', outcomeValues.length >= 5, `→ ${outcomeValues.join(', ')}`);

for (const v of outcomeValues) {
  /**
   * 「有生產者」= 存在 `outcome:` 後面（同一行、未遇分隔符）出現這個字面值。
   * 這樣會排除掉只出現在比較式裡的寫法（`lastDiagnostic.outcome === 'x'`）——
   * 那正是 `'no-voice'` 曾經的狀態：型別有、UI 有分支、但沒有生產者。
   */
  const re = new RegExp(`outcome:\\s*[^,;{}\\n]*?'${v}'`);
  check(`★ outcome '${v}' 有生產者`, re.test(ttsSrc), '型別有這個值，卻沒有任何地方產生它');
}

console.log('\n── 2. 每個 outcome 都要有 UI 分支（pending 除外）──');
for (const v of outcomeValues) {
  if (v === 'pending') continue;
  check(
    `★ UI 有處理 outcome '${v}'`,
    sectionSrc.includes(`d.outcome === '${v}'`),
    '使用者會看到錯誤的說明（例如明明有送出卻顯示「沒有送出」）'
  );
}

console.log('\n── 3. 設定頁要有獨立的「測試語音」按鈕 ──');
check(
  '★ TtsSettingsSection 有 #tts-test-voice',
  /id="tts-test-voice"/.test(sectionSrc),
  '沒有這顆按鈕，使用者只能靠「放開滑桿」這個隱性手勢試聽'
);
check(
  '★ 音量 0 時不會靜默跳過（要有 volumeZero 提示）',
  sectionSrc.includes("t('settings.sound.volumeZero')"),
  '音量 0 時按下去完全沒反應，使用者無從診斷'
);

console.log('\n── 4. 用到的 settings.sound.* 鍵，中英都要有翻譯 ──');
const { TRANSLATIONS } = await import('../src/i18n/translations');
const usedKeys = [...new Set([...sectionSrc.matchAll(/t\('(settings\.sound\.[a-zA-Z0-9_.]+)'/g)].map((m) => m[1]))];
check('抓到元件用到的語音相關鍵', usedKeys.length > 0, `→ ${usedKeys.length} 個`);
for (const key of usedKeys) {
  const zh = (TRANSLATIONS['zh-TW'] as Record<string, string>)[key];
  const en = (TRANSLATIONS.en as Record<string, string>)[key];
  check(`★ ${key} 中英都有`, typeof zh === 'string' && typeof en === 'string', zh ? '缺英文' : '缺中文');
}

/* ══════════════════════════════════════════════════════════════════════
 * 瀏覽器檢查（需要 Chrome／Edge）
 * ══════════════════════════════════════════════════════════════════════ */

if (STATIC_ONLY) {
  console.log('\n（--static-only：跳過瀏覽器檢查）');
} else {
  const PORT = 3231;
  const DEBUG_PORT = 9677;
  const BASE = `http://127.0.0.1:${PORT}`;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const CHROME = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find((p) => existsSync(p));

  let server: ChildProcess | null = null;
  let chrome: ChildProcess | null = null;
  let ws: WebSocket | null = null;
  let profileDir: string | null = null;
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
  let nextId = 1;

  const send = (method: string, params: any = {}) => {
    const id = nextId++;
    return new Promise<any>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws!.send(JSON.stringify({ id, method, params }));
    });
  };

  const evalJs = async (expression: string) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails));
    }
    return r.result.value;
  };

  try {
    if (!CHROME) throw new Error('找不到 Chrome / Edge');

    console.log('\n── 5-7. 瀏覽器：失敗時有沒有講出來 ──');
    console.log('   啟動測試用 dev server…');
    server = spawn(process.execPath, [path.join(ROOT, 'node_modules/tsx/dist/cli.mjs'), 'server.ts'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(PORT), NODE_ENV: 'development' },
      stdio: 'ignore',
    });

    let ready = false;
    for (let i = 0; i < 80; i++) {
      await sleep(500);
      try {
        const r = await fetch(`${BASE}/api/health`);
        if (r.ok) {
          ready = true;
          break;
        }
      } catch {}
    }
    if (!ready) throw new Error('伺服器沒有在時限內啟動');

    profileDir = mkdtempSync(path.join(tmpdir(), 'lb-ttscheck-'));
    chrome = spawn(
      CHROME,
      [
        '--headless=new',
        `--remote-debugging-port=${DEBUG_PORT}`,
        `--user-data-dir=${profileDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--window-size=360,640',
        'about:blank',
      ],
      { stdio: 'ignore' }
    );

    let target: any = null;
    for (let i = 0; i < 60; i++) {
      await sleep(500);
      try {
        const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
        target = list.find((t: any) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (target) break;
      } catch {}
    }
    if (!target) throw new Error('瀏覽器沒起來');

    ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
    await new Promise<void>((res, rej) => {
      ws!.on('open', () => res());
      ws!.on('error', rej);
    });
    ws.on('message', (raw: any) => {
      const m = JSON.parse(raw.toString());
      if (m.id && pending.has(m.id)) {
        const { resolve, reject } = pending.get(m.id)!;
        pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      }
    });

    await send('Page.enable');
    await send('Runtime.enable');

    let loaded = false;
    for (let attempt = 1; attempt <= 8; attempt++) {
      await send('Page.navigate', { url: BASE });
      await sleep(2500);
      const ok = await evalJs(
        '(() => { try { const r = document.getElementById("root"); return !!(r && r.children.length > 0); } catch (e) { return false; } })()'
      );
      if (ok) {
        loaded = true;
        break;
      }
      await sleep(2000);
    }
    if (!loaded) throw new Error('App 載入失敗');

    /* ── 走完引導頁（語言閘門 → 各步 → 同意 → 開始使用）── */
    const gateId = 'onboarding-language-zh-TW';
    if (await evalJs(`(() => !!document.getElementById("${gateId}"))()`)) {
      await evalJs(`(() => document.getElementById("${gateId}")?.click())()`);
      await sleep(800);
      await evalJs('(() => document.getElementById("onboarding-language-confirm")?.click())()');
      await sleep(1200);
    }
    for (let step = 0; step < 12; step++) {
      await sleep(900);
      if (!(await evalJs('(() => !!document.getElementById("onboarding-flow"))()'))) break;
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

    if (await evalJs('(() => !!(document.getElementById("onboarding-flow") || document.getElementById("onboarding-language-gate")))()')) {
      throw new Error('仍卡在引導頁 —— 後續檢查會全部誤判，中止');
    }

    /* ── 進設定頁 ── */
    await evalJs('(() => document.getElementById("btn-open-menu")?.click())()');
    await sleep(600);
    await evalJs('(() => document.getElementById("menu-item-conditions")?.click())()');
    await sleep(2000);
    // 設定頁的「音量」是收合區塊，先全部展開
    await evalJs('(() => document.querySelectorAll("details").forEach((d) => { d.open = true; }))()');
    await sleep(600);

    /* ── 5. 測試語音按鈕存在 ── */
    check(
      '★ 設定頁渲染出 #tts-test-voice（測試語音按鈕）',
      await evalJs('(() => !!document.getElementById("tts-test-voice"))()')
    );

    /* ── 6. 音量 0 → 按下要有說明 ── */
    const zhVolumeZero = (TRANSLATIONS['zh-TW'] as Record<string, string>)['settings.sound.volumeZero'];
    await evalJs(`
      (() => {
        const s = document.getElementById('tts-volume');
        if (!s) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(s, '0');
        s.dispatchEvent(new Event('input', { bubbles: true }));
        s.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()
    `);
    await sleep(700);
    await evalJs('(() => document.getElementById("tts-test-voice")?.click())()');
    await sleep(700);
    const afterZero = await evalJs('(() => document.body.innerText)()');
    check(
      '★★ 音量 0 時按下測試語音 → 說出「朗讀音量是 0」（不是靜默）',
      typeof afterZero === 'string' && afterZero.includes(zhVolumeZero),
      '使用者按了完全沒反應，只能回報「沒有聲音」'
    );

    /* ── 7. 沒有該語言語音時的指引（條件式，不假通過）── */
    const noCantoneseVoice = await evalJs(`
      (async () => {
        try {
          const m = await import('/src/utils/tts.ts');
          return m.isNativeTts() ? null : m.findBestVoice('cantonese') === null;
        } catch (e) { return null; }
      })()
    `);
    if (noCantoneseVoice === true) {
      const zhNoVoiceWeb = (TRANSLATIONS['zh-TW'] as Record<string, string>)['settings.sound.noVoiceWeb'];
      check(
        '★ 這台裝置沒有粵語語音 → 設定頁給出「改用普通話／English」的指引',
        typeof afterZero === 'string' && afterZero.includes(zhNoVoiceWeb)
      );
    } else if (noCantoneseVoice === false) {
      skipped(
        '沒有粵語語音時的指引',
        '這台機器有粵語語音，走不到那個分支（要驗請用 scripts/probe-tts-voices.mjs 換一台裝置）'
      );
    } else {
      skipped('沒有粵語語音時的指引', '無法判斷這台裝置的語音狀態');
    }
  } catch (e: any) {
    fail++;
    console.log(`  ❌ 瀏覽器檢查失敗：${e?.message ?? e}`);
  } finally {
    try { ws?.close(); } catch {}
    try { chrome?.kill(); } catch {}
    try { server?.kill(); } catch {}
    if (profileDir) {
      try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
    }
  }
}

console.log(`\n結果：${pass} 通過 / ${fail} 失敗${skip ? ` / ${skip} 跳過` : ''}`);
if (fail > 0) process.exitCode = 1;
