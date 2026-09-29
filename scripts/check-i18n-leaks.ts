/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 雙語洩漏檢查（i18n leak check）
 * ============================================================================
 * 目的：驗證「英文模式」下，本機引擎的輸出不會殘留任何中文。
 *
 * 【為什麼要用「實際執行」而不是「靜態掃描」】
 *   本機引擎的輸出路徑有兩套機制並存：
 *     ① 引擎內嵌的 L(zh, en)  —— 依 language 直接挑字串
 *     ② translateLocalResult  —— 事後用對照表轉換
 *   靜態掃描看不出哪一條字串最後會走到使用者眼前，
 *   只有真的跑一遍、把結果抓出來掃 CJK，才是有意義的驗證。
 *
 * 用法：npx tsx scripts/check-i18n-leaks.ts
 */

import {
  getSampleNutritionProfile,
  analyzeNutritionWithIndicators,
  buildEducationFields,
  buildLocalNutrientFacts,
} from '../server/smartNutritionAnalyzer';
import { translateLocalResult } from '../server/localEngineEn';
import { buildConditionReminders } from '../server/conditionAdvice';
import { buildOcrFailedResult } from '../server/core';
import { parseNutritionLabel } from '../server/labelParser';
import { getLearnerProfile } from '../src/data/learnerProfiles';
import type { LabelAnalysisResult } from '../src/types';

const CJK = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/;

/**
 * 已知且**刻意接受**的例外。每一條都要有理由，不能只是為了讓檢查變綠。
 *
 * ⚠️ 這裡是「例外清單」而不是「忽略清單」——
 *    新增項目時請一併寫清楚為什麼可以接受、以及什麼情況下要重新處理。
 */
const ACCEPTED: Array<{ path: string; reason: string }> = [
  {
    path: 'ingredients_detected',
    reason:
      '成分清單是「包裝上的原文」，由 OCR 讀出。真實澳門商品包裝本來就是中文，' +
      '要翻譯得靠翻譯服務（不是對照表能解決的）。' +
      '2026-09-29 死檔清理後，**已經沒有任何元件會顯示這個欄位**' +
      '（唯一用到它的 ResultDisplay.tsx 已刪除），畫面上完全看不到。' +
      '示範標籤已英文化，所以示範路徑的 OCR 會讀到英文成分。' +
      '→ 若日後新增任何顯示 ingredients_detected 的畫面，必須先處理這一項。',
  },
];

/** 掃描物件裡所有字串欄位，回報含中文的路徑 */
function findCJK(obj: unknown, path = '', out: string[] = []): string[] {
  if (typeof obj === 'string') {
    if (CJK.test(obj) && !ACCEPTED.some((a) => path.startsWith(a.path))) out.push(`${path} = ${obj}`);
  } else if (Array.isArray(obj)) {
    obj.forEach((v, i) => findCJK(v, `${path}[${i}]`, out));
  } else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) findCJK(v, path ? `${path}.${k}` : k, out);
  }
  return out;
}

const SAMPLES = ['instant_noodles', 'peanut_wafer', 'soy_milk'];
const CONDITION_SETS: Record<string, string[]> = {
  '無勾選': [],
  '高血壓': ['高血壓'],
  '糖尿病': ['糖尿病'],
  '高血壓+糖尿病': ['高血壓', '糖尿病'],
  '全勾': [
    '高血壓', '糖尿病', '高血脂', '痛風', '腎臟病', '心血管疾病',
    '胃食道逆流', '骨質疏鬆', '花生過敏', '海鮮過敏', '乳糖不耐', '麩質敏感',
  ],
};

let leaks = 0;
let checks = 0;
const seen = new Set<string>();

for (const sampleId of SAMPLES) {
  const profile = getSampleNutritionProfile(sampleId);
  if (!profile) {
    console.log(`⚠️  找不到示範資料：${sampleId}`);
    continue;
  }

  for (const [label, conditions] of Object.entries(CONDITION_SETS)) {
    checks++;
    const raw = analyzeNutritionWithIndicators(profile, conditions, undefined, 'en');

    // 模擬 handler 的完整流程：補上 nutrient_facts 與教育欄位，再套用對照表
    const facts = buildLocalNutrientFacts(profile, undefined);
    const edu = buildEducationFields(facts, profile.foodName);
    const withEdu = { ...raw, ...edu, nutrient_facts: facts };
    const out = translateLocalResult(withEdu as unknown as LabelAnalysisResult, 'en');

    // ⚠️ condition_reminders 是後端規則產生的，不經過 AI，
    //    所以雲端與本機兩條路徑都會用到 —— 一定要一起檢查。
    const withReminders = {
      ...out,
      condition_reminders: buildConditionReminders(conditions, 'en'),
    };

    const hits = findCJK(withReminders);
    if (hits.length) {
      leaks += hits.length;
      console.log(`\n❌ ${sampleId} / ${label}  → ${hits.length} 處殘留中文`);
      hits.slice(0, 10).forEach((h) => {
        const short = h.length > 115 ? h.slice(0, 115) + '…' : h;
        console.log(`     ${short}`);
        seen.add(h.split(' = ')[1]?.slice(0, 60) ?? h);
      });
      if (hits.length > 10) console.log(`     …另有 ${hits.length - 10} 處`);
    }
  }
}

console.log(`\n${'='.repeat(66)}`);
console.log(`檢查 ${checks} 組（${SAMPLES.length} 個樣本 × ${Object.keys(CONDITION_SETS).length} 種勾選）`);

/* ── 另外兩條「不經過 AI」的路徑，也一定要檢查 ───────────────────
 * 這兩條都是後端直接寫死的中文，雲端與本機模式都會走到：
 *   ① OCR 讀不到字時的回應
 *   ② 模型漏給食育欄位時的備援
 * 它們原本都不帶語言，是實測才抓到的洩漏。
 */
const extra: Array<[string, unknown]> = [];

const profile = getLearnerProfile('senior');
extra.push([
  'OCR 失敗回應',
  buildOcrFailedResult(profile, { matchedFields: 0 }, 'en'),
]);

const eduProbe: Record<string, unknown> = {
  // 刻意留空 → 觸發 ensureEducationFields 的備援路徑
  knowledge_point: '',
  label_reading_tip: '',
  daily_limit_context: '',
  nutrient_facts: [],
};
{
  const { ensureEducationFields } = await import('../server/core');
  const { buildLocalNutrientFacts } = await import('../server/smartNutritionAnalyzer');
  const facts = buildLocalNutrientFacts(getSampleNutritionProfile('instant_noodles')!, undefined);
  ensureEducationFields(eduProbe, facts, 'en');
  extra.push(['食育欄位備援', eduProbe]);
}

console.log('\n── 不經 AI 的後端路徑 ──');
for (const [label, obj] of extra) {
  const hits = findCJK(obj);
  checks++;
  if (hits.length) {
    leaks += hits.length;
    console.log(`  ❌ ${label} → ${hits.length} 處`);
    hits.slice(0, 6).forEach((h) => {
      console.log(`     ${h.slice(0, 115)}`);
      seen.add(h.split(' = ')[1]?.slice(0, 60) ?? h);
    });
  } else {
    console.log(`  ✅ ${label}`);
  }
}

/* ── 英文標籤能不能解析 ─────────────────────────────────────────
 * 「零中文殘留」不等於「英文模式可用」。
 * 解析器原本只認中文欄位名，英文標籤會讀到 0 個欄位 →
 * 永遠顯示「看不清楚標籤數字」，示範反而變成展示失敗。
 * 這條測試確保中英文標籤讀到**一樣多**的欄位。
 */
const ZH_LABEL = `營養標示 Nutrition Facts
每一份量 100公克
熱量 495 大卡
飽和脂肪 9.8 公克
反式脂肪 0.2 公克
碳水化合物 62.0 公克
糖 8.5 公克
鈉 2350 毫克`;

const EN_LABEL = `Nutrition Facts
Per serving: 100 g (1 serving per pack)
Calories 495 kcal
Saturated Fat 9.8 g
Trans Fat 0.2 g
Carbohydrate 62.0 g
   of which Sugars 8.5 g
Sodium 2,350 mg`;

console.log('\n── 英文標籤解析（可用性）──');
{
  const zh = parseNutritionLabel(ZH_LABEL);
  const en = parseNutritionLabel(EN_LABEL);
  checks += 2;
  const pairs: Array<[string, number | undefined, number | undefined]> = [
    ['鈉 / sodium', zh.sodiumMg, en.sodiumMg],
    ['糖 / sugar', zh.sugarG, en.sugarG],
    ['熱量 / calories', zh.calories, en.calories],
    ['碳水 / carbs', zh.carbsG, en.carbsG],
    ['飽和脂肪 / sat fat', zh.saturatedFatG, en.saturatedFatG],
    ['反式脂肪 / trans fat', zh.transFatG, en.transFatG],
  ];
  let bad = 0;
  for (const [name, a, b] of pairs) {
    const ok = a !== undefined && b !== undefined && Math.abs(a - b) < 0.001;
    if (!ok) {
      bad++;
      leaks++;
      console.log(`  ❌ ${name}: 中文=${a} 英文=${b}`);
    }
  }
  if (bad === 0) {
    console.log(`  ✅ 中英文標籤都讀到 ${en.matchedFields}/6 個欄位，且數值一致`);
  }
}

if (checks === 0) {
  // ⚠️ 這條防的是「假通過」：樣本 ID 打錯時若不擋，會印出綠色通過訊息，
  //    比不檢查更危險 —— 因為它會讓人以為驗證過了。
  console.log('❌ 沒有任何一組被實際檢查 —— 樣本 ID 可能已改名，請確認 getSampleNutritionProfile');
  process.exit(2);
}
if (leaks === 0) {
  console.log('✅ 英文模式輸出零中文殘留');
} else {
  console.log(`❌ 共 ${leaks} 處中文殘留，涉及 ${seen.size} 條不同字串`);
  console.log('\n--- 不重複的字串（前 60 條）---');
  [...seen].slice(0, 60).forEach((s, i) => console.log(`${String(i + 1).padStart(3)}. ${s}`));
}
process.exit(leaks === 0 ? 0 : 1);
