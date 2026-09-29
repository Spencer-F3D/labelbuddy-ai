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
import { analyzeSeniorPhysicalIndicators } from '../server/smartIndicatorAnalyzer';
import { answerSeniorHealthQuestion } from '../server/smartHealthQA';
import { getLearnerProfile } from '../src/data/learnerProfiles';
import type { LabelAnalysisResult, SeniorPhysicalIndicators } from '../src/types';

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

/* ── 生理指標引擎（斷網後備）───────────────────────────────────
 * 這個端點的英文輸出有兩層：
 *   1. 雲端 AI（提示詞的 ENGLISH_OUTPUT_OVERRIDE_INDICATORS）
 *   2. 本機規則引擎（analyzeSeniorPhysicalIndicators 的 STATIC_EN 對照）
 * 雲端那層要靠實際呼叫才知道，這裡測的是**本機那層** ——
 * 斷網時它就是唯一輸出，漏中文等於英文介面在離線時破功。
 *
 * ★ 實測抓到的兩個 bug 都在這一層：
 *   ① 對照表的鍵寫「嚴防」、程式推的是「嚴控」→ 一字之差查不到，且不報錯
 *   ② sugarDisplay 裡的「度」是中文，被插進 explanation 與 voice_summary
 */
console.log('\n── 生理指標引擎（斷網後備）──');
{
  const cases: Array<[string, SeniorPhysicalIndicators]> = [
    [
      '紅燈（血壓＋血糖＋腎臟）',
      {
        systolicBp: 158, diastolicBp: 96, heartRate: 92,
        bloodSugar: 8.4, bloodSugarUnit: 'mmol/L', bloodSugarTiming: 'fasting',
        uricAcidStatus: 'high', cholesterolStatus: 'high', kidneyStatus: 'ckd',
        symptoms: ['頭暈', '口渴'], ageGroup: '70-79歲',
      },
    ],
    [
      '黃燈（血壓略高）',
      {
        systolicBp: 138, diastolicBp: 87, heartRate: 76,
        bloodSugar: 5.6, bloodSugarUnit: 'mmol/L', bloodSugarTiming: 'fasting',
        uricAcidStatus: 'normal', cholesterolStatus: 'normal', kidneyStatus: 'normal',
        symptoms: [], ageGroup: '60-69歲',
      },
    ],
    [
      '綠燈（全部正常）',
      {
        systolicBp: 118, diastolicBp: 76, heartRate: 70,
        bloodSugar: 5.2, bloodSugarUnit: 'mmol/L', bloodSugarTiming: 'fasting',
        uricAcidStatus: 'normal', cholesterolStatus: 'normal', kidneyStatus: 'normal',
        symptoms: [], ageGroup: '60-69歲',
      },
    ],
  ];

  let bad = 0;
  for (const [name, ind] of cases) {
    // 中英文的 status_level 必須一致 —— 顏色是中英文共用的安全訊號，
    // 若因為翻譯而改變，等於兩種語言給出不同建議。
    const zh = analyzeSeniorPhysicalIndicators(ind, 'zh-TW');
    const en = analyzeSeniorPhysicalIndicators(ind, 'en');
    checks += 2;

    if (zh.status_level !== en.status_level) {
      bad++;
      leaks++;
      console.log(`  ❌ ${name}：中英顏色不一致（${zh.status_level} vs ${en.status_level}）`);
    }
    const hits = findCJK(en);
    if (hits.length) {
      bad += hits.length;
      leaks += hits.length;
      console.log(`  ❌ ${name} / en → ${hits.length} 處中文`);
      hits.slice(0, 4).forEach((h) => console.log(`     ${h.slice(0, 110)}`));
    }
  }
  if (bad === 0) {
    console.log(`  ✅ ${cases.length} 種情境：中英顏色一致、英文零中文殘留`);
  }
}

/* ── 健康問答引擎（斷網後備）───────────────────────────────────
 * ⚠️ 這個引擎比指標更麻煩：它的分支靠**中文關鍵字**比對
 *    （`q.includes('咖啡')`），英文提問一個字都對不上，
 *    只翻譯輸出會讓英文版永遠回同一句通用解答。
 *    → 所以英文另寫一份 `answerInEnglish()`，關鍵字也一起換。
 *    這裡就是驗證那條路真的接得上、而且沒有中文殘留。
 */
console.log('\n── 健康問答引擎（斷網後備）──');
{
  const cases: Array<[string, string]> = [
    ['咖啡', 'I have high blood pressure. Can I drink coffee?'],
    ['水果血糖', 'Can I eat bananas with high blood sugar?'],
    ['豆腐痛風', 'Can I eat tofu if I have gout?'],
    ['柚子藥物', 'Can I eat grapefruit while taking blood pressure medicine?'],
    ['酒精', 'Is red wine good for my heart?'],
    ['水腫喝水', 'My ankles are swollen, should I stop drinking water?'],
    ['通用（無關鍵字）', 'Tell me something about staying healthy'],
  ];
  const ind = {
    systolicBp: 152, diastolicBp: 94, heartRate: 80,
    bloodSugar: 8.2, bloodSugarUnit: 'mmol/L' as const, bloodSugarTiming: 'fasting' as const,
    uricAcidStatus: 'high' as const, cholesterolStatus: 'normal' as const,
    kidneyStatus: 'normal' as const, symptoms: [], ageGroup: '70-79歲',
  };

  // 每個主題都必須命中「自己的」答案，而不是全部掉到通用解答
  const takeaways = new Set<string>();
  let bad = 0;
  for (const [name, q] of cases) {
    const a = answerSeniorHealthQuestion(q, ind, 'en');
    checks++;
    const hits = findCJK(a);
    if (hits.length) {
      bad += hits.length;
      leaks += hits.length;
      console.log(`  ❌ ${name} / en → ${hits.length} 處中文`);
      hits.slice(0, 3).forEach((h) => console.log(`     ${h.slice(0, 100)}`));
    }
    if (a.source !== 'smart_health_qa') {
      bad++;
      leaks++;
      console.log(`  ❌ ${name}：source 應為 smart_health_qa，實際 ${a.source}`);
    }
    takeaways.add(a.key_takeaway);
  }
  // 7 個問題若只有 1 種答案，代表關鍵字完全沒生效（最陰險的失敗模式）
  if (takeaways.size < 6) {
    bad++;
    leaks++;
    console.log(`  ❌ 只有 ${takeaways.size} 種不同答案 —— 英文關鍵字沒有生效`);
  }
  if (bad === 0) {
    console.log(`  ✅ ${cases.length} 個主題：各自命中、英文零中文、source 正確`);
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
