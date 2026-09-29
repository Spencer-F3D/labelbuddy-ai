/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 生理指標引擎的英文檢查（`npm run check:indicator`）
 * ============================================================================
 * 為什麼需要獨立一支：
 *   `check-i18n-leaks.ts` 檢查的是**標籤分析**的輸出路徑；
 *   生理指標是另一組完全不同的欄位（status_title / simple_explanation /
 *   supermarket_rules / daily_care_tips / voice_summary / linked_conditions），
 *   而且它是**斷網後備**路徑 —— 最容易在英文模式下漏出中文的地方。
 *
 * 實測抓到的兩個真實 bug：
 *   1. 對照表的鍵寫「嚴**防**加工磷酸鹽」，程式推的是「嚴**控**加工磷酸鹽」
 *      → 一字之差永遠查不到，且不報錯。
 *   2. `sugarDisplay` 裡的「度」是中文，會被插進 explanation 與 voice_summary
 *      → 一個字造成兩處洩漏。
 */
import { analyzeSeniorPhysicalIndicators } from '../server/smartIndicatorAnalyzer';
import type { SeniorPhysicalIndicators } from '../src/types';

const CJK = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/;

const CASES: Array<[string, SeniorPhysicalIndicators]> = [
  [
    '紅燈（血壓＋血糖＋尿酸＋血脂＋腎臟）',
    {
      systolicBp: 158,
      diastolicBp: 96,
      heartRate: 92,
      bloodSugar: 8.4,
      bloodSugarUnit: 'mmol/L',
      bloodSugarTiming: 'fasting',
      uricAcidStatus: 'high',
      cholesterolStatus: 'high',
      kidneyStatus: 'ckd',
      symptoms: ['頭暈', '口渴', '水腫', '關節', '胃酸'],
      ageGroup: '70-79歲',
    },
  ],
  [
    '黃燈（僅血壓略高）',
    {
      systolicBp: 138,
      diastolicBp: 87,
      heartRate: 76,
      bloodSugar: 5.6,
      bloodSugarUnit: 'mmol/L',
      bloodSugarTiming: 'fasting',
      uricAcidStatus: 'normal',
      cholesterolStatus: 'normal',
      kidneyStatus: 'normal',
      symptoms: [],
      ageGroup: '60-69歲',
    },
  ],
  [
    '綠燈（全部正常）',
    {
      systolicBp: 118,
      diastolicBp: 76,
      heartRate: 70,
      bloodSugar: 5.2,
      bloodSugarUnit: 'mmol/L',
      bloodSugarTiming: 'fasting',
      uricAcidStatus: 'normal',
      cholesterolStatus: 'normal',
      kidneyStatus: 'normal',
      symptoms: [],
      ageGroup: '60-69歲',
    },
  ],
  [
    'mg/dL 單位 + 飯後血糖（另一條分支）',
    {
      systolicBp: 128,
      diastolicBp: 80,
      heartRate: 80,
      bloodSugar: 160,
      bloodSugarUnit: 'mg/dL',
      bloodSugarTiming: 'post_meal',
      uricAcidStatus: 'gout_history',
      cholesterolStatus: 'borderline',
      kidneyStatus: 'mild_edema',
      symptoms: ['口渴'],
      ageGroup: '70-79歲',
    },
  ],
];

let checks = 0;
let leaks = 0;

console.log('='.repeat(66));
console.log('生理指標引擎 — 英文輸出檢查');
console.log('='.repeat(66));

for (const [name, ind] of CASES) {
  for (const lang of ['zh-TW', 'en'] as const) {
    const result = analyzeSeniorPhysicalIndicators(ind, lang);
    checks++;

    if (lang === 'zh-TW') {
      // 中文路徑只確認「有內容」，不檢查 CJK（那本來就該是中文）
      const ok = result.status_title.length > 0 && result.simple_explanation.length > 0;
      console.log(`  ${ok ? '✅' : '❌'} ${name} / zh-TW（產出正常）`);
      if (!ok) leaks++;
      continue;
    }

    const hits: string[] = [];
    const walk = (o: unknown, p = '') => {
      if (typeof o === 'string') {
        if (CJK.test(o)) hits.push(`${p} = ${o.slice(0, 70)}`);
      } else if (Array.isArray(o)) {
        o.forEach((v, i) => walk(v, `${p}[${i}]`));
      } else if (o && typeof o === 'object') {
        Object.entries(o).forEach(([k, v]) => walk(v, p ? `${p}.${k}` : k));
      }
    };
    walk(result);

    if (hits.length) {
      leaks += hits.length;
      console.log(`  ❌ ${name} / en → ${hits.length} 處中文`);
      hits.slice(0, 5).forEach((h) => console.log(`       ${h}`));
    } else {
      console.log(`  ✅ ${name} / en（零中文殘留）`);
    }
  }
}

console.log();
if (checks === 0) {
  // 與 check-i18n-leaks.ts 同樣的「假通過防護」：沒有真的檢查到東西就失敗
  console.error('❌ 沒有執行任何檢查（案例清單是空的？）');
  process.exit(2);
}
if (leaks > 0) {
  console.error(`❌ 共 ${leaks} 處問題`);
  process.exit(1);
}
console.log(`✅ 全部通過（${checks} 組）`);
