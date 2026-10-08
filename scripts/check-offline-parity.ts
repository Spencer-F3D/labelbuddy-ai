/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 離線分析「三方差異」檢查（Offline analysis parity check）
 * ============================================================================
 *
 * 【為什麼一定要有這支】
 *   2026-10-07 把「只在本機」的規則引擎抽成一支共用純函式
 *   （`server/localAnalysis.ts` 的 `analyzeLabelLocally`），
 *   由前端與後端**同時匯入**。抽出來是為了讓那個模式真的零網路請求，
 *   但同時引進了一個新的失敗模式：
 *
 *     ★ **同一張標籤，線上算和離線算得到不同結論。**
 *
 *   而且它**不會報錯** —— 使用者只會覺得「怎麼兩個地方講的不一樣」。
 *   這正是本專案反覆踩到的那一類 bug。
 *
 * 【這一支怎麼驗（三方比對）】
 *   同一組輸入餵給**三條**路徑，逐欄位比對：
 *     ① 後端 API   —— 真的啟動伺服器，打 `POST /api/analyze-label`（`localOnly:true`）
 *     ② 前端純函式 —— 直接 `import { analyzeLabelLocally }` 呼叫
 *     ③ golden     —— 重構**之前**的後端輸出（`scripts/fixtures/`）
 *
 *   ①vs② 釘住「前後端同一份邏輯」。
 *   ①vs③ 釘住「這次重構沒有改變任何行為」。
 *
 *   ⚠️ 只驗 ①vs② 是不夠的：兩邊現在呼叫同一支函式，**在構造上就相等**，
 *      就算那支函式本身寫錯了也照樣通過。③ 才是真正在驗行為的那一條。
 *
 * 【假通過防護】
 *   · golden 檔不存在時**判失敗**（不是跳過）—— 否則刪掉 fixture 就能讓這支全綠。
 *   · 每一組都比對「欄位集合」而不只是值，避免「漏了一個欄位」被當成相等。
 *
 * 用法：npm run check:parity
 * 退出碼 0 = 全部通過
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { analyzeLabelLocally, type LocalAnalysisInput } from '../server/localAnalysis';

const PORT = 3137;
const BASE = `http://127.0.0.1:${PORT}`;
const GOLDEN_PATH = 'scripts/fixtures/offline-analysis-golden.json';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    pass++;
    console.log(`✅ ${name}`);
  } else {
    fail++;
    console.log(`❌ ${name}${detail ? `\n     ${detail}` : ''}`);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 * 測試矩陣
 * ⚠️ 這份矩陣必須與 `capture-golden` 用的完全一致（key 要對得上 golden）。
 *    改這裡就要重新擷取 golden，否則會出現「key 對不上」的假失敗。
 * ══════════════════════════════════════════════════════════════════════════ */

/** 高鈉示範標籤（鈉 2350mg → 對 senior 是紅燈） */
const LABEL_HIGH_SODIUM = `營養標示
每一份量 100 公克
本包裝含 1 份
熱量 450 大卡
蛋白質 9 公克
脂肪 18 公克
飽和脂肪 9 公克
反式脂肪 0 公克
碳水化合物 62 公克
糖 28 公克
鈉 2350 毫克`;

/** 一般標籤（各項都在上限內） */
const LABEL_TYPICAL = `營養標示
每一份量 30 公克
本包裝含 2 份
熱量 140 大卡
蛋白質 3 公克
脂肪 5 公克
飽和脂肪 2 公克
反式脂肪 0 公克
碳水化合物 20 公克
糖 6 公克
鈉 320 毫克`;

/** 有文字但沒有營養數字 → 應走「請重拍」 */
const LABEL_JUNK = `成分：麵粉、水、食鹽`;
/** 完全沒讀到字 → 也應走「請重拍」 */
const LABEL_EMPTY = '';

interface Case {
  key: string;
  input: LocalAnalysisInput;
}

/** 病症組合：不勾／勾兩項（用來驗提醒數量與紅燈門檻） */
const CONDITION_SETS: Array<[string, string[]]> = [
  ['none', []],
  ['hypertension+diabetes', ['高血壓', '糖尿病']],
];

const CASES: Case[] = [];
for (const language of ['zh-TW', 'en'] as const) {
  for (const [name, text] of [
    ['high-sodium', LABEL_HIGH_SODIUM],
    ['typical', LABEL_TYPICAL],
    ['junk', LABEL_JUNK],
    ['empty', LABEL_EMPTY],
  ] as const) {
    for (const profileId of ['senior', 'fitness']) {
      // ⚠️ 不能用 `as const` —— 會讓內層陣列變成 readonly，無法傳給 `conditions: string[]`
      for (const [condName, conditions] of CONDITION_SETS) {
        CASES.push({
          key: `${language}|${name}|${profileId}|${condName}`,
          input: { ocrText: text, conditions, profileId, language },
        });
      }
    }
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 * 比對工具
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * 穩定序列化：**遞迴排序物件鍵**。
 *
 * ⚠️ 不能直接用 `JSON.stringify` —— 鍵的順序取決於插入順序，
 *    而「前端函式」與「後端 JSON 解析」的插入順序不一定相同。
 *    那不叫不一致，卻會讓檢查誤報。
 */
function canonical(value: unknown): string {
  const walk = (v: any): any => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out: Record<string, any> = {};
      for (const k of Object.keys(v).sort()) out[k] = walk(v[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

/**
 * 找出兩個物件「**值**不同」的欄位（含路徑）。
 *
 * ★ 2026-10-08 新增。原本 golden 比對失敗時只印「行為變了：<key>」——
 *   要判斷「這是刻意的修正，還是真的改壞了」，得自己打開 fixture 一行一行比。
 *   **失敗訊息不夠用，就等於每次都要重做一次診斷。**
 *   （上面那個 `keyDiff` 只比**鍵集合**，值不同它看不到。）
 */
function valueDiff(a: any, b: any, prefix = ''): string[] {
  const out: string[] = [];
  const ka = a && typeof a === 'object' ? Object.keys(a) : [];
  const kb = b && typeof b === 'object' ? Object.keys(b) : [];
  for (const k of new Set([...ka, ...kb])) {
    const at = prefix ? `${prefix}.${k}` : k;
    const va = a?.[k];
    const vb = b?.[k];
    if (va && vb && typeof va === 'object' && typeof vb === 'object') {
      out.push(...valueDiff(va, vb, at));
    } else if (JSON.stringify(va) !== JSON.stringify(vb)) {
      const fmt = (x: unknown) => {
        const s = typeof x === 'string' ? x : JSON.stringify(x);
        return s && s.length > 72 ? `${s.slice(0, 72)}…` : String(s);
      };
      out.push(`${at}: golden「${fmt(vb)}」→ 現在「${fmt(va)}」`);
    }
  }
  return out;
}

/** 找出兩個物件「鍵集合」的差異（漏欄位比值不同更難發現） */
function keyDiff(a: any, b: any, prefix = ''): string[] {
  const out: string[] = [];
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return out;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  for (const k of ka) if (!kb.includes(k)) out.push(`少了 ${prefix}${k}`);
  for (const k of kb) if (!ka.includes(k)) out.push(`多了 ${prefix}${k}`);
  for (const k of ka) {
    if (kb.includes(k)) out.push(...keyDiff(a[k], b[k], `${prefix}${k}.`));
  }
  return out;
}

/** 只比對「資料」欄位；`status`／`success` 另外驗 */
const DATA_FIELDS = [
  'risk_level',
  'warning_title',
  'plain_summary',
  'alternative_advice',
  'knowledge_point',
  'label_reading_tip',
  'daily_limit_context',
  'ingredients_detected',
  'nutrition_concerns',
  'matched_conditions',
  'nutrient_facts',
  'analysis_mode',
  'ocr_used',
  'ocr_matched_fields',
  'data_handling',
  'learner_profile_id',
  'learner_profile_name',
  'condition_reminders',
];

(async () => {
  console.log('='.repeat(74));
  console.log('離線分析三方差異檢查（後端 API ／ 前端純函式 ／ 重構前 golden）');
  console.log('='.repeat(74));

  /* ── 0. golden 必須存在（不存在＝失敗，不是跳過）────────────────── */
  console.log('\n── 0. 前置：golden fixture ──');
  if (!existsSync(GOLDEN_PATH)) {
    console.log(`❌ 找不到 ${GOLDEN_PATH}`);
    console.log('   → 這不是「跳過」，是失敗。少了它，這支檢查就只剩下');
    console.log('     「兩邊呼叫同一支函式所以相等」這種構造上的空斷言。');
    console.log('   → 重新擷取方式：還原到重構前的 commit，啟動伺服器後跑');
    console.log('     capture-golden（見本檔頭說明）。');
    process.exit(1);
  }
  const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as Record<
    string,
    { status: number; success: boolean; data: any }
  >;
  check(`golden fixture 存在（${Object.keys(golden).length} 組）`, Object.keys(golden).length > 0);

  const goldenKeys = new Set(Object.keys(golden));
  const caseKeys = new Set(CASES.map((c) => c.key));
  const missingInGolden = [...caseKeys].filter((k) => !goldenKeys.has(k));
  const extraInGolden = [...goldenKeys].filter((k) => !caseKeys.has(k));
  check(
    '測試矩陣與 golden 的鍵完全對得上',
    missingInGolden.length === 0 && extraInGolden.length === 0,
    missingInGolden.length ? `golden 缺：${missingInGolden.slice(0, 3).join(', ')}` : `golden 多：${extraInGolden.slice(0, 3).join(', ')}`
  );

  /* ── 啟動伺服器 ─────────────────────────────────────────────────── */
  let server: ChildProcess | undefined;
  try {
    console.log('\n啟動伺服器 …');
    server = spawn(
      process.execPath,
      [path.resolve('node_modules/tsx/dist/cli.mjs'), 'server.ts'],
      { env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production' }, stdio: 'ignore' }
    );
    let ready = false;
    for (let i = 0; i < 60; i++) {
      await sleep(500);
      try {
        if ((await fetch(`${BASE}/api/privacy`)).ok) {
          ready = true;
          break;
        }
      } catch {
        /* 還沒起來 */
      }
    }
    if (!ready) throw new Error('伺服器沒有在時限內啟動');
    console.log('伺服器就緒\n');

    /* ── 1. 逐組比對 ───────────────────────────────────────────────── */
    console.log('── 1. 逐組比對（後端 API vs 前端純函式 vs golden）──');
    const apiVsLocal: string[] = [];
    const apiVsGolden: string[] = [];
    const goldenFieldDiff: string[] = [];
    const fieldProblems: string[] = [];

    for (const c of CASES) {
      const res = await fetch(`${BASE}/api/analyze-label`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...c.input, localOnly: true }),
      });
      const payload: any = await res.json();
      const apiData = payload?.data;
      const localData = analyzeLabelLocally(c.input);
      const goldenData = golden[c.key]?.data;

      if (canonical(apiData) !== canonical(localData)) {
        apiVsLocal.push(c.key);
      }
      if (canonical(apiData) !== canonical(goldenData)) {
        apiVsGolden.push(c.key);
        goldenFieldDiff.push(`${c.key}\n       ${valueDiff(apiData, goldenData).join('\n       ')}`);
      }
      const kd = keyDiff(apiData, localData);
      if (kd.length) fieldProblems.push(`${c.key}: ${kd.slice(0, 3).join(' / ')}`);
    }

    check(
      `① 後端 API ＝ 前端純函式（${CASES.length} 組）`,
      apiVsLocal.length === 0,
      apiVsLocal.length ? `不一致：${apiVsLocal.slice(0, 3).join(', ')}` : ''
    );
    check(
      `② 後端 API ＝ 重構前 golden（${CASES.length} 組）★ 這條才是真的在驗行為`,
      apiVsGolden.length === 0,
      apiVsGolden.length
        ? `行為變了：${apiVsGolden.slice(0, 3).join(', ')}\n     ${goldenFieldDiff.slice(0, 3).join('\n     ')}`
        : ''
    );
    check('③ 欄位集合完全相同（沒有漏欄位或多欄位）', fieldProblems.length === 0, fieldProblems.slice(0, 3).join('; '));

    /* ── 2. 欄位齊全（不是空的）───────────────────────────────────── */
    console.log('\n── 2. 回傳欄位齊全 ──');
    const sample = analyzeLabelLocally({
      ocrText: LABEL_HIGH_SODIUM,
      conditions: ['高血壓'],
      profileId: 'senior',
      language: 'zh-TW',
    }) as any;
    const missingFields = DATA_FIELDS.filter((f) => !(f in sample));
    check(
      `回傳包含全部 ${DATA_FIELDS.length} 個欄位`,
      missingFields.length === 0,
      missingFields.length ? `缺：${missingFields.join(', ')}` : ''
    );

    /* ── 3. 語意斷言（避免兩邊一起錯）─────────────────────────────── */
    console.log('\n── 3. 語意斷言 ──');

    check('★ 本機路徑標記為 local_fallback', sample.analysis_mode === 'local_fallback', `實際 ${sample.analysis_mode}`);
    check('★ 隱私標記為 local_only', sample.data_handling === 'local_only', `實際 ${sample.data_handling}`);

    // 高鈉 + 高血壓 → 必須至少黃燈，實際應為紅燈
    check(
      '★★ 高鈉（2350mg）＋高血壓 → 紅燈（不是黃、不是綠）',
      sample.risk_level === 'red',
      `實際 ${sample.risk_level}`
    );

    // 一般標籤不該被誤判成紅燈
    const typical = analyzeLabelLocally({
      ocrText: LABEL_TYPICAL,
      conditions: [],
      profileId: 'senior',
      language: 'zh-TW',
    }) as any;
    check('一般標籤不會被誤判成紅燈', typical.risk_level !== 'red', `實際 ${typical.risk_level}`);

    // 提醒數量要對得上勾選的病症數
    check(
      '★ 慢性病提醒數 ＝ 勾選數（1 項 → 1 條）',
      Array.isArray(sample.condition_reminders) && sample.condition_reminders.length === 1,
      `實際 ${sample.condition_reminders?.length}`
    );

    // 讀不到字 → 請重拍，而且**絕對不能**捏造結論
    const emptyResult = analyzeLabelLocally({ ocrText: '', conditions: [], profileId: 'senior', language: 'zh-TW' }) as any;
    check('★ 沒讀到字 → ocr_failed（請重拍）', emptyResult.ocr_failed === true);
    check('★ 沒讀到字 → 不得捏造營養素資料', Array.isArray(emptyResult.nutrient_facts) && emptyResult.nutrient_facts.length === 0);
    check('★ 沒讀到字 → 不得是綠燈（綠燈＝「安心吃」）', emptyResult.risk_level !== 'green', `實際 ${emptyResult.risk_level}`);

    // 英文模式不得殘留中文
    const enResult = analyzeLabelLocally({
      ocrText: LABEL_HIGH_SODIUM,
      conditions: ['高血壓'],
      profileId: 'senior',
      language: 'en',
    }) as any;
    const enBlob = JSON.stringify(enResult);
    const cjk = enBlob.match(/[\u4e00-\u9fff]/g) ?? [];
    check(
      '★ 英文模式零中文殘留（含提醒與身分名稱）',
      cjk.length === 0,
      cjk.length ? `找到 ${cjk.length} 個中文字元，例如「${cjk.slice(0, 6).join('')}」` : ''
    );

    /* ── 4. 純函式：不可有 Node 依賴 ──────────────────────────────── */
    console.log('\n── 4. 純函式性質（能被前端打包）──');
    const src = readFileSync('server/localAnalysis.ts', 'utf8');
    const codeOnly = src
      .split('\n')
      .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
      .join('\n');
    check(
      '★ 模組原始碼不含 node: / dotenv / process.env（註解除外）',
      !/from\s+'node:/.test(codeOnly) && !/require\(/.test(codeOnly) && !/process\.env/.test(codeOnly) && !/dotenv/.test(codeOnly),
      '這個檔案會被打包進瀏覽器，一旦引入 Node 模組就會建置失敗'
    );
    check('★ 同一支函式同時被前後端匯入（不是各寫一份）', (() => {
      const h = readFileSync('server/handlers.ts', 'utf8');
      const a = readFileSync('src/App.tsx', 'utf8');
      return /from '\.\/localAnalysis'/.test(h) && /from '\.\.\/server\/localAnalysis'/.test(a);
    })(), '前端或後端沒有匯入 server/localAnalysis');
  } catch (error: any) {
    console.error('\n❌ 檢查過程發生例外:', error?.message ?? error);
    fail++;
  } finally {
    server?.kill();
  }

  console.log('\n' + '='.repeat(74));
  console.log(`結果：${pass} 項通過 / ${fail} 項有問題`);
  if (fail > 0) console.log('\n❌ 驗證失敗。上面每一項都是「不會報錯」的失敗模式。');
  process.exit(fail > 0 ? 1 : 0);
})();
