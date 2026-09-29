/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 飲食紀錄語言回歸測試（Diet record language check）
 * ============================================================================
 *
 * 【為什麼一定要有這支】
 *   使用者的抱怨：「在切換中英文後拍照和記錄會有混合中和英的文字」。
 *   根因是 `DietRecord` 存的是**掃描當下語言的散文**，而
 *   `localizeDietRecord()` 只認得 6 筆內建示範資料的 id ——
 *   真實掃描紀錄（id 是 `rec-<timestamp>`）查不到對照表，就原封不動顯示，
 *   於是中文介面存的中文紀錄，在英文介面照樣顯示中文。
 *
 *   2026-09-29 定案的規則（使用者指定）：
 *     **紀錄跟隨「標籤本身的語言」**，與介面語言無關。
 *   做法：建立紀錄時偵測標籤語言；若分析結果的語言與標籤語言不同，
 *         就用本機規則引擎在標籤語言就地重新產生（純函式、離線、不花額度）。
 *
 *   這條規則很容易在重構時被無意破壞，而且**不會報錯** ——
 *   只會讓紀錄悄悄變成另一種語言。所以用測試釘住。
 *
 * 用法：npx tsx scripts/check-diet-record-lang.ts
 */

import { detectLabelLanguage } from '../src/utils/labelLanguage';
import { buildRecognitionResult } from '../server/labelParser';
import { analyzeNutritionWithIndicators } from '../server/smartNutritionAnalyzer';
import { translateLocalResult } from '../server/localEngineEn';
import { localizeDietRecord } from '../src/data/bilingualContent';
import { getLearnerProfile } from '../src/data/learnerProfiles';
import type { DietRecord } from '../src/types';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name} ${extra}`);
  }
}

const CJK = /[\u4e00-\u9fff]/;

const ZH_LABEL =
  '特濃紅燒牛肉泡麵\n營養標示\n每一份量 100公克 本包裝含 1 份\n熱量 480大卡\n蛋白質 9公克\n脂肪 20公克\n飽和脂肪 10公克\n碳水化合物 62公克\n糖 8公克\n鈉 2350毫克\n主要成分：小麥麵粉、棕櫚油、食鹽、醬油';

const EN_LABEL =
  'Rich braised beef instant noodles\nNutrition Facts\nPer serving 100g, 1 serving per pack\nCalories 480\nProtein 9g\nFat 20g\nSaturated Fat 10g\nCarbohydrate 62g\nSugars 8g\nSodium 2350mg\nIngredients: wheat flour, palm oil, salt, soy sauce';

console.log('── 1. 標籤語言偵測 ──');
check('中文標籤 → zh-TW', detectLabelLanguage(ZH_LABEL) === 'zh-TW');
check('英文標籤 → en', detectLabelLanguage(EN_LABEL) === 'en');
check('空字串 → en（安全預設）', detectLabelLanguage('') === 'en');
check(
  '只有一個漢字也算中文',
  detectLabelLanguage('Nutrition Facts 鈉 2350mg') === 'zh-TW'
);

console.log('── 2. 本機引擎可在前端重跑（純函式、離線）──');
const parsedZh = buildRecognitionResult(ZH_LABEL);
check('中文標籤解析成功', parsedZh.ok && !!parsedZh.profile);
check(
  '解析出標籤原文品名（不是關鍵字猜的）',
  !!parsedZh.profile?.foodName && CJK.test(parsedZh.profile.foodName),
  `→ ${parsedZh.profile?.foodName}`
);

const senior = getLearnerProfile('senior');
const zhOut = analyzeNutritionWithIndicators(
  parsedZh.profile!,
  ['高血壓'],
  senior.numericLimits,
  'zh-TW'
);
const enOut = translateLocalResult(
  analyzeNutritionWithIndicators(parsedZh.profile!, ['高血壓'], senior.numericLimits, 'en'),
  'en'
);

check('中文輸出是中文', CJK.test(zhOut.plain_summary));
check('★ 英文輸出零中文殘留', !CJK.test(enOut.plain_summary), `→ ${enOut.plain_summary.slice(0, 40)}`);
check('★ 顏色不受語言影響（安全鐵則）', zhOut.risk_level === enOut.risk_level);
check('高鈉泡麵判為紅燈', zhOut.risk_level === 'red');

console.log('── 3. 紀錄不會被介面語言翻掉（核心回歸）──');
const realRecord: DietRecord = {
  id: `rec-${Date.now()}`,
  timestamp: Date.now(),
  dateString: '今天 上午 10:15',
  foodName: '特濃紅燒牛肉泡麵',
  risk_level: 'red',
  warning_title: zhOut.warning_title,
  plain_summary: zhOut.plain_summary,
  alternative_advice: zhOut.alternative_advice,
  matched_conditions: ['高血壓'],
  lang: 'zh-TW',
};
const localized = localizeDietRecord(realRecord, 'en');
check('★ 中文標籤的紀錄，在英文介面下仍是中文', localized.foodName === realRecord.foodName);
check('★ 紀錄文字完全沒被改動', localized.plain_summary === realRecord.plain_summary);
check('★ 日期也沒被改動', localized.dateString === realRecord.dateString);

console.log('── 4. 內建示範資料仍會跟著介面語言（行為不變）──');
const seed: DietRecord = {
  id: 'rec-1',
  timestamp: Date.now(),
  dateString: '今天 上午 10:15',
  foodName: '純天然高纖大燕麥片',
  risk_level: 'green',
  warning_title: '✅ 適合食用：高纖無鈉，保護血管',
  plain_summary: '您好！這款燕麥片幾乎沒有添加鈉和砂糖。',
};
const seedEn = localizeDietRecord(seed, 'en');
check('示範資料（無 lang）在英文介面會被翻譯', !CJK.test(seedEn.foodName), `→ ${seedEn.foodName}`);
check('示範資料在中文介面原樣', localizeDietRecord(seed, 'zh-TW').foodName === seed.foodName);

console.log(`\n結果：${pass} 通過 / ${fail} 失敗`);
process.exit(fail > 0 ? 1 : 0);
