/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 送給 AI 的中性成分約束（Neutral ingredient constraints for the AI prompt）
 * ============================================================================
 * 【這個檔案為什麼要獨立出來】
 *   它做的事只有一行字串，但那行字串是**本 App 對第三方揭露最多的一筆資訊**。
 *   抽成獨立函式是為了讓 `scripts/check-prompt-privacy.ts` 能斷言：
 *
 *     ★ 「這一行不含任何病名」——而且驗的是**執行期真正在用的那一份**，
 *       不是檢查腳本裡另外寫的一份複本（複本遲早會漂移）。
 *
 * 【改動前後的差別】
 *   改動前：`【使用者的慢性病史】高血壓、糖尿病`
 *   改動後：`【要盯緊的成分】鈉、添加糖、飽和脂肪…`
 *
 *   AI 仍然知道要盯哪些成分，但不知道使用者有什麼病。
 *   使用者看到的提醒（`condition_reminders`）仍由後端規則產生、**含真病名**，
 *   與這一行完全無關。
 */

import type { Language } from '../src/i18n/translations';
import { expandConditionsToNutrients } from '../src/data/conditionNutrients';

/**
 * 組出「要盯緊的成分」這一行。
 *
 * @param conditions 條件 id 或中文病名（前端送來的是病名）
 * @param language   介面語言 —— 決定成分名要中文還是英文
 *
 * @returns 可直接放進提示詞的一行（不含標題）
 *
 * 【⚠️ 自填病症的處理】
 *   查不到 `targetNutrients` 的條件（＝使用者自填）會**原樣附在後面**，
 *   並註明「使用者自填、沒有內建規則」。
 *
 *   為什麼不丟掉：使用者填了卻完全沒被考慮，而畫面上看不出來 ——
 *   那是本專案最恨的靜默失敗。
 *   為什麼可以原樣送：那是**使用者自己打的字**，
 *   他本來就知道 App 會用它來判斷（引導頁與設定頁都寫明了）。
 *   → 這一項是**已知的殘留揭露**，不是遺漏。
 */
export function buildUserConstraintLine(
  conditions: string[],
  language: Language = 'zh-TW'
): string {
  const isEnglish = language === 'en';
  const { nutrients, unmapped } = expandConditionsToNutrients(conditions, language);

  const main =
    nutrients.length > 0
      ? nutrients.join(isEnglish ? ', ' : '、')
      : isEnglish
        ? 'No specific ingredients to avoid'
        : '無特別需要避開的成分';

  if (unmapped.length === 0) return main;

  const extra = unmapped.join(isEnglish ? ', ' : '、');
  return isEnglish
    ? `${main}\n(Also, a condition the user typed in themselves — no built-in rule to match it against: ${extra})`
    : `${main}\n（另外，使用者自行填寫了一項，沒有內建規則可比對：${extra}）`;
}
