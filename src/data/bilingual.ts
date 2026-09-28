/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 後端用的雙語對照資料
 * ============================================================================
 * 【為什麼需要這個檔案】
 *   分析結果（警告標題、白話摘要、營養素名稱…）是**後端產生**的。
 *   前端切成英文後，如果後端不跟著換，使用者會看到「英文介面 + 中文結論」。
 *
 * 【為什麼不直接把 learnerProfiles.ts 整個翻譯成兩份】
 *   那個檔案裡有大量敘述性欄位（audience、focusSummary、aiPersona…），
 *   整份翻成兩份會讓維護變成雙倍負擔，而且容易兩邊不同步。
 *
 *   實務上的折衷：
 *     - **封閉清單**（模型只能從中挑選的值）→ 必須提供英文，否則模型會回中文。
 *       例如 nutrient_facts.name、單位。
 *     - **開放敘述**（模型自由發揮的段落）→ 提示詞保持中文即可，
 *       只要明確指示「用英文回答」，現代模型都能正確產出英文。
 *       中文的領域描述（台灣衛福部標準）反而有助於模型理解。
 *
 * 【純資料模組】
 *   與 learnerProfiles.ts 一樣，不得引入瀏覽器或 Node 專屬 API ——
 *   前端與後端（含 Cloudflare Workers）共用同一份。
 */

import type { Language } from '../i18n/translations';

/**
 * 營養素名稱（中文 → 英文）。
 *
 * ⚠️ 這份對照必須涵蓋 learnerProfiles.ts 的 `numericLimits` 所有鍵，
 *    因為提示詞會把這份清單交給模型，並要求「只能用清單裡出現的名稱」。
 *    漏掉的話模型會不知道該用什麼名字，可能自己發明一個。
 */
export const NUTRIENT_NAME_EN: Record<string, string> = {
  鈉: 'Sodium',
  鈣: 'Calcium',
  蛋白質: 'Protein',
  飽和脂肪: 'Saturated fat',
  添加糖: 'Added sugar',
  膳食纖維: 'Dietary fiber',
};

/** 單位（中文 → 英文）。營養標示的慣用縮寫。 */
export const UNIT_EN: Record<string, string> = {
  毫克: 'mg',
  公克: 'g',
  大卡: 'kcal',
  度: 'mmol/L',
};

/**
 * 學習者身分名稱（id → 英文）。
 *
 * 用在提示詞的「本次辨識的對象身分」與使用者提示詞的「判斷是否適合…購買」。
 */
export const PROFILE_NAME_EN: Record<string, string> = {
  senior: 'Senior with hypertension, high blood sugar and high cholesterol',
  child: 'Child aged 6 to 12',
  teen: 'Teenager aged 13 to 18',
  fitness: 'Adult training for muscle gain',
  takeout: 'Office worker who mostly eats takeout and convenience-store food',
  student: 'Student on a limited budget',
};

/**
 * 慢性病與過敏原名稱（id → 英文）。
 *
 * ⚠️ 必須涵蓋 conditions.ts 的 PHYSICAL_INDICATORS 所有 id。
 *    提示詞的「使用者的慢性病史」會用到，缺漏會讓模型看到中文病名。
 */
export const CONDITION_NAME_EN: Record<string, string> = {
  hypertension: 'Hypertension',
  diabetes: 'Diabetes',
  hyperlipidemia: 'High cholesterol',
  gout: 'Gout',
  kidney_disease: 'Kidney disease',
  cardiovascular: 'Cardiovascular disease',
  gerd: 'Acid reflux (GERD)',
  osteoporosis: 'Osteoporosis',
  peanut_allergy: 'Peanut allergy',
  seafood_allergy: 'Seafood allergy',
  lactose_intolerance: 'Lactose intolerance',
  gluten_sensitivity: 'Gluten sensitivity',
};

/** 風險等級標籤（前端與後端共用） */
export const RISK_LABEL_EN: Record<string, string> = {
  red: 'Avoid',
  yellow: 'Caution',
  green: 'Safe for you',
};

/**
 * 取營養素名稱。找不到英文對照時**安全退回中文**，
 * 而不是回傳 undefined（會讓畫面出現空白或 "undefined"）。
 */
export function nutrientName(name: string, language: Language): string {
  if (language !== 'en') return name;
  return NUTRIENT_NAME_EN[name] ?? name;
}

/** 取單位名稱。同樣安全退回中文。 */
export function unitName(unit: string, language: Language): string {
  if (language !== 'en') return unit;
  return UNIT_EN[unit] ?? unit;
}

/** 取身分名稱。 */
export function profileName(profileId: string, fallback: string, language: Language): string {
  if (language !== 'en') return fallback;
  return PROFILE_NAME_EN[profileId] ?? fallback;
}

/**
 * 取慢性病名稱。fallback 是中文原名，找不到英文對照時退回它。
 *
 * ⚠️ 這個函式被前端與後端共用：
 *    前端（慢性病清單、提醒卡片）與後端（提示詞的病史段落）都要一致，
 *    否則會出現「提示詞說 Hypertension，畫面顯示高血壓」的不一致。
 */
export function conditionName(
  conditionId: string,
  fallback: string,
  language: Language
): string {
  if (language !== 'en') return fallback;
  return CONDITION_NAME_EN[conditionId] ?? fallback;
}
