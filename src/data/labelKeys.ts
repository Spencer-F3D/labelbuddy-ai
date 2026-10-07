/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 標籤營養素的封閉值域（Label keys）
 * ============================================================================
 * 【這個檔案解決什麼問題】
 *   「學一個小知識」要把**這一張標籤**和**知識卡／測驗題**接起來。
 *   接的方式是比對「標籤上有哪些營養素」——那就需要一份**兩邊都認得的清單**。
 *
 * 【⚠️ 為什麼一定要封閉值域，不能用自由字串】
 *   本專案已經踩過 **4 次**同一型的 bug：
 *     拿「一句中文」當鍵 → 有人改了那句話 → 鍵對不上 → **靜默退回**，
 *     不報錯、不當機，只是功能少了一半。
 *   所以這裡用三層把關：
 *     - 型別層：`LabelKey` 是 union，打錯字編譯失敗
 *     - 執行層：`isLabelKey()` 過濾掉不認得的值
 *     - 驗證層：`scripts/check-quiz-bank.ts` 斷言題庫的 labelKeys 全在值域內、
 *              且值域與各身分的 `numericLimits` 鍵一致
 *
 * 【值域的來源（不是憑感覺列的）】
 *   1. 所有身分 `numericLimits` 鍵的聯集 → 實測正好 6 個
 *   2. 也正好等於 `NUTRIENT_NAME_EN` 的 6 個鍵
 *   3. `normalizeNutrientFacts()` 會把查不到 `numericLimits` 的項目**濾掉**，
 *      所以 `nutrient_facts` 只可能出現這 6 個名稱
 *
 * ⚠️ 若日後某個身分新增了 `numericLimits` 鍵，**這裡必須同步加**，
 *    否則那個營養素永遠挑不到知識卡（而且不會報錯）。
 */

import type { LabelKey, KnowledgeTopic } from '../types';
import { canonicalNutrientName } from './bilingual';

/**
 * 封閉值域。
 *
 * ⚠️ 順序有意義：這是「標籤上多個營養素都命中時」的**優先序**參考
 *    （越前面＝越常見、越該優先教學）。改順序請先想清楚。
 */
export const LABEL_KEYS: readonly LabelKey[] = [
  '鈉',
  '添加糖',
  '飽和脂肪',
  '膳食纖維',
  '蛋白質',
  '鈣',
  /**
   * ⚠️ 只有**孕婦**身分的 `numericLimits` 有這一項，所以它很少見 ——
   *    但「很少見」不等於「不會出現」，漏掉就是孕婦永遠挑不到咖啡因的教學。
   *    `scripts/check-quiz-bank.ts` 的第 7 項會守住「值域 = numericLimits 鍵的聯集」。
   */
  '咖啡因',
] as const;

/** runtime 檢查：這個值是不是合法的 LabelKey */
export function isLabelKey(value: unknown): value is LabelKey {
  return typeof value === 'string' && (LABEL_KEYS as readonly string[]).includes(value);
}

/**
 * 把任意名稱正規化成 `LabelKey`（認不出來就回 `null`）。
 *
 * ⚠️ 一定要先走 `canonicalNutrientName()` —— 因為英文模式下
 *    `nutrient_facts[].name` 會是 `'Sodium'` 而不是 `'鈉'`，
 *    直接比對會**全部落空而且不會報錯**。
 *    （這正是 2026-10-07 修掉的那個 bug，見 `bilingual.ts` 的 `EN_TO_CANONICAL`。）
 */
export function toLabelKey(rawName: unknown): LabelKey | null {
  if (typeof rawName !== 'string' || !rawName) return null;
  const canonical = canonicalNutrientName(rawName);
  return isLabelKey(canonical) ? canonical : null;
}

/**
 * AI 回的 `topic` 不合法時，依營養素給一個合理的後備主題。
 *
 * ⚠️ 這裡只影響「題目歸類到學堂的哪個主題」，
 *    **不影響**「挑哪張知識卡」（那是 `learnFromScan.ts` 用明確 cardId 決定的）。
 *    所以即使對應得不完美，也不會教錯東西。
 */
export const LABEL_TO_TOPIC: Record<LabelKey, KnowledgeTopic> = {
  鈉: 'sodium_sugar',
  添加糖: 'sodium_sugar',
  飽和脂肪: 'dangers',
  膳食纖維: 'dangers',
  蛋白質: 'profiles',
  鈣: 'basics',
  咖啡因: 'dangers',
};
