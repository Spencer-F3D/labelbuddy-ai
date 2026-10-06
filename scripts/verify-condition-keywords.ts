/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 慢性病關鍵字驗證（Condition Keyword Guard）
 * ============================================================================
 * 【為什麼需要這支腳本】
 *   本專案的後端一貫用「中文子字串 includes()」比對慢性病名稱，不是比對 id
 *   （見 docs/專案交接文件.md §3.4）。
 *
 *   這代表：把 `src/data/conditions.ts` 的某個 name 改成不含關鍵字的說法，
 *   離線引擎會**靜默地不產生任何警示** —— 不當機、不報錯，
 *   只是使用者勾了卻沒有把關。對一個健康判斷 App，這是最糟的失敗模式。
 *
 * 本腳本用「行為」而非「關鍵字字串」驗證：
 *   對每一項慢性病，餵一個刻意做壞的營養輪廓，檢查是否真的產生警示。
 *   這樣即使規則改寫成別種比對方式，驗證依然有效。
 *
 * 用法：npm run verify:conditions
 * 退出碼 0 = 全部通過；1 = 有項目失效
 */

import { PHYSICAL_INDICATORS } from '../src/data/conditions';
import {
  analyzeNutritionWithIndicators,
  type NutritionProfile,
} from '../server/smartNutritionAnalyzer';
import { buildConditionReminders } from '../server/conditionAdvice';

/**
 * 刻意做壞的產品：把每一條規則的觸發條件全部拉到最滿。
 * 只要某項慢性病的關鍵字斷了，該項就不會出現在 matched_conditions 裡。
 *
 * ⚠️ 新增慢性病規則時，這裡也要補上能觸發它的成分／數值 ——
 *    否則新項目會「驗證失敗」，但原因不是規則壞了，而是測試資料不夠壞。
 */
const WORST_CASE_PROFILE: NutritionProfile = {
  foodName: '測試用最壞情境食品',
  sodiumMg: 2000, // >=1200 高血壓紅燈、>=1000 心血管/骨質疏鬆/心臟衰竭、>=800 腎臟
  sugarG: 20, // >=15 糖尿病/脂肪肝紅燈、痛風（糖漿促尿酸）
  carbsG: 70,
  saturatedFatG: 10, // >=8 高血脂、脂肪肝
  transFatG: 0.5, // >0.3 高血脂、>0 心血管
  calories: 500,
  purineLevel: 'high', // 痛風
  hasPhosphates: true, // 腎臟、骨質疏鬆
  hasHighPotassium: true, // 腎臟（鉀）
  allergens: ['花生', '堅果', '甲殼類', '魚類', '牛奶製品', '小麥麩質'],
  // 胃食道逆流（辣椒）／便秘（油炸麵條）／缺鐵性貧血與失眠（咖啡）／偏頭痛（咖啡、熟成起司）
  ingredients: ['辣椒', '油炸麵條', '咖啡', '熟成起司'],
};

/** 這個身分的每日上限（借用長者三高的，足以產生 nutrient_facts） */
const LIMITS = {
  鈉: { value: 2000, unit: '毫克' },
  添加糖: { value: 50, unit: '公克' },
  飽和脂肪: { value: 20, unit: '公克' },
};

function main(): void {
  console.log('='.repeat(72));
  console.log('慢性病關鍵字驗證');
  console.log('='.repeat(72));

  let failed = 0;

  for (const condition of PHYSICAL_INDICATORS) {
    const result = analyzeNutritionWithIndicators(
      WORST_CASE_PROFILE,
      [condition.name],
      LIMITS
    );

    /**
     * ★ 2026-10-06：「其他（自行填寫）」是本機引擎**不可能**有規則的項目
     *   （內容是使用者自己打的字），所以跳過「規則引擎要有反應」那一項檢查。
     *
     * ⚠️ 但**提醒**仍然要驗 —— 它必須有專屬的誠實文案，
     *    不可以落到 GENERIC_REMINDER（那會讓每次請求都在日誌留下警告，
     *    而且文案講不到重點：這一項本機判不了）。
     *    所以這裡不是「整項跳過」，只跳過一半。
     */
    const needsLocalRule = condition.localRule !== false;

    const detected = (result.matched_conditions || []).length > 0;
    const reminders = buildConditionReminders([condition.name]);
    const hasSpecificReminder = reminders.length === 1 && reminders[0].icon !== '📋';

    const marks = [
      needsLocalRule ? (detected ? '✅' : '❌') : '➖',
      hasSpecificReminder ? '✅' : '❌',
    ].join(' ');

    console.log(
      `${marks}  ${condition.name.padEnd(8, '　')} ` +
        (needsLocalRule
          ? `規則引擎：${detected ? (result.matched_conditions || []).join('、') : '未產生任何警示'}`
          : '規則引擎：不適用（使用者自行填寫）')
    );

    const failedHere = (needsLocalRule && !detected) || !hasSpecificReminder;

    if (failedHere) {
      failed += 1;
      if (!hasSpecificReminder) {
        console.log('        └─ conditionAdvice 沒有對應的專屬提醒（用了通用提醒）');
      }
      if (needsLocalRule && !detected) {
        console.log(
          '        └─ 規則引擎沒有反應 → 名稱可能已失去關鍵字，請檢查 ' +
            'server/smartNutritionAnalyzer.ts 的 includes() 條件'
        );
      }
    }
  }

  console.log('='.repeat(72));
  console.log(`共 ${PHYSICAL_INDICATORS.length} 項，失敗 ${failed} 項`);

  if (failed > 0) {
    console.log('\n❌ 驗證失敗：請修正後再繼續。');
    process.exitCode = 1;
  } else {
    console.log('\n✅ 全部通過：每一項慢性病都能觸發規則引擎與專屬提醒。');
  }
}

main();
