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
 * 難字 → 簡單說法（**只給中文顯示用**，2026-09-30 使用者指定）。
 *
 * 【為什麼要做這件事】
 *   「鈉」「膳食纖維」「飽和脂肪」對長者幾乎沒有意義。
 *   使用者實測後要求改用日常說法。
 *
 * 【⚠️ 只改顯示，絕對不動內部鍵】
 *   `numericLimits`、提示詞、本機引擎、`LOCAL_KNOWLEDGE_POINTS` 的鍵
 *   **一律保持 canonical 名稱**（鈉、膳食纖維…）。
 *   本專案已經踩過三次「對照表鍵對不上」的 bug ——
 *   那種錯不會報錯，只會靜默地少一個警示或回中文。
 *   所以改名一律走這個單一對照表，並在**進出邊界**轉換：
 *     進（模型/前端送來）→ `canonicalNutrientName()`
 *     出（要顯示）      → `nutrientDisplayName()`
 *
 * ⚠️ **碳水化合物刻意不改**（使用者指定）。
 */
export const NUTRIENT_NAME_SIMPLE: Record<string, string> = {
  鈉: '鹽分',
  膳食纖維: '纖維',
  飽和脂肪: '動物油',
  添加糖: '糖',
};

/** 簡單說法 → canonical 名稱（進邊界時用） */
export const SIMPLE_TO_CANONICAL: Record<string, string> = Object.fromEntries(
  Object.entries(NUTRIENT_NAME_SIMPLE).map(([canonical, simple]) => [simple, canonical])
);

/**
 * 把使用者／模型看到的說法還原成內部 canonical 名稱。
 * 查不到就原樣回傳（可能本來就是 canonical，或是新名稱）。
 */
export function canonicalNutrientName(name: string): string {
  return SIMPLE_TO_CANONICAL[name] ?? name;
}

/**
 * 難字**片語** → 簡單說法（只用在中文輸出）。
 *
 * 【為什麼是「片語」而不是把單一個「鈉」字換掉】
 *   「鈉」單獨出現時要換成「鹽分」，但它也可能是化學名稱的一部分 ——
 *   L-麩酸鈉（味精）、苯甲酸鈉、碳酸鈉、亞硝酸鈉…那些換掉就變成錯的。
 *   所以只換**明確的片語**，不碰單一個「鈉」字。
 *   寧可漏換（使用者看到一個「鈉」），也不要錯換（把味精寫成鹽分）。
 *
 * ⚠️ 這是**後處理**，補的是「模型沒照提示詞用簡化名稱」的情況。
 *    提示詞本身已經給了簡化名稱（見 `nutrientName` 的用法），
 *    但模型不一定每次都聽話 —— 實測它就寫過「鈉含量」。
 */
const NUTRIENT_PHRASE_SIMPLIFY: ReadonlyArray<readonly [RegExp, string]> = [
  [/鈉含量/g, '鹽分含量'],
  [/含鈉量/g, '含鹽量'],
  [/高鈉/g, '高鹽分'],
  [/低鈉/g, '低鹽分'],
  [/鈉攝取/g, '鹽分攝取'],
  [/膳食纖維/g, '纖維'],
  [/飽和脂肪/g, '動物油'],
  [/添加糖/g, '糖'],
];

/** 把中文說明文字裡的難字片語換成簡單說法。英文輸出不受影響。 */
export function simplifyNutrientWording(text: string): string {
  let out = text;
  for (const [re, to] of NUTRIENT_PHRASE_SIMPLIFY) out = out.replace(re, to);
  return out;
}

/**
 * 對結果物件的指定欄位套用難字簡化（支援字串與字串陣列）。
 *
 * ⚠️ 與稱謂後處理一樣，**只動我們自己產生的欄位**，不遞迴走訪整個物件 ——
 *    否則會改到使用者自己的輸入（例如他在食育學堂打的字）。
 */
export function simplifyNutrientWordingInFields(
  obj: Record<string, any> | null | undefined,
  fields: readonly string[]
): void {
  if (!obj) return;
  for (const f of fields) {
    const v = obj[f];
    if (typeof v === 'string') {
      obj[f] = simplifyNutrientWording(v);
    } else if (Array.isArray(v)) {
      obj[f] = v.map((x) => (typeof x === 'string' ? simplifyNutrientWording(x) : x));
    }
  }
}

/**
 * 取營養素名稱。找不到對照時**安全退回原名**，
 * 而不是回傳 undefined（會讓畫面出現空白或 "undefined"）。
 *
 * ⚠️ 中文會走「難字簡化」對照；英文走 NUTRIENT_NAME_EN。
 */
export function nutrientName(name: string, language: Language): string {
  // ⚠️ 先還原成 canonical 再查表：快取裡可能存著簡化前的舊名稱（或模型自己
  //    寫了簡化後的說法），不先還原就會查不到而露出中文。
  const canonical = canonicalNutrientName(name);
  if (language === 'en') return NUTRIENT_NAME_EN[canonical] ?? canonical;
  return NUTRIENT_NAME_SIMPLE[canonical] ?? canonical;
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
