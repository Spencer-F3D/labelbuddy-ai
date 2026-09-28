/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 介面用的雙語對照資料（UI bilingual content）
 * ============================================================================
 * 【與 bilingual.ts 的分工】
 *   bilingual.ts       —— 後端提示詞與分析結果用的**封閉清單**（營養素、病名、身分提示詞）
 *   bilingualContent.ts —— **畫面顯示**用的敘述性內容（身分說明、慢性病徽章與說明、
 *                          每日參考值、主題名稱）
 *
 * 【為什麼不直接把 conditions.ts / learnerProfiles.ts 翻成兩份】
 *   1. 那兩個檔案同時被**後端提示詞**使用。整份複製成兩份，日後改一邊忘了改另一邊，
 *      會出現「提示詞說中文、畫面說英文」的靜默不一致，而且很難察覺。
 *   2. 翻譯只影響**顯示**。資料本身（id、數值、方向）與語言無關。
 *   → 所以維持「單一資料來源 + 對照表 + 取值函式」的既有模式
 *     （與 `server/localEngineEn.ts` 的做法一致）。
 *
 * 【安全退回原則】
 *   每個取值函式在找不到英文對照時，一律**退回中文原文**，
 *   不回傳 undefined、不留空字串 —— 寧可顯示中文，也不要畫面出現空白或 "undefined"。
 *
 * 【純資料模組】
 *   與 learnerProfiles.ts / bilingual.ts 一樣，不得引入瀏覽器或 Node 專屬 API。
 */

import type { Language } from '../i18n/translations';
import type { KnowledgeTopic, LearnerProfileId } from '../types';

/* ===========================================================================
 * 一、學習者身分
 * ========================================================================= */

/** 身分名稱與對象說明（畫面用） */
export const PROFILE_UI_EN: Record<string, { name: string; audience: string }> = {
  senior: {
    name: 'Senior (3 highs)',
    audience:
      'Older adults with high blood pressure, blood sugar or cholesterol, and family members helping them watch sodium and sugar',
  },
  child: {
    name: 'Child',
    audience: 'Children aged 6 to 12 who are still growing, and parents choosing snacks for them',
  },
  teen: {
    name: 'Teenager',
    audience:
      'Secondary students aged 13 to 18 who eat out often, drink sweetened drinks and stay up late',
  },
  fitness: {
    name: 'Muscle building',
    audience: 'People who lift weights and want to gain muscle or keep body fat down',
  },
  takeout: {
    name: 'Frequent takeout',
    audience:
      'Office workers who mostly eat delivery and convenience-store food, with little time to cook',
  },
  student: {
    name: 'Student',
    audience: 'Students on a limited budget who often eat snacks and sugary drinks',
  },
};

/** 取身分名稱（畫面用）。找不到時退回中文原名。 */
export function profileDisplayName(
  profileId: string,
  fallback: string,
  language: Language
): string {
  if (language !== 'en') return fallback;
  return PROFILE_UI_EN[profileId]?.name ?? fallback;
}

/** 取身分的對象說明。找不到時退回中文原文。 */
export function profileAudience(
  profileId: string,
  fallback: string,
  language: Language
): string {
  if (language !== 'en') return fallback;
  return PROFILE_UI_EN[profileId]?.audience ?? fallback;
}

/* ===========================================================================
 * 二、每日參考值（targets）
 * ========================================================================= */

/**
 * 參考值的**數值字串**對照。
 *
 * ⚠️ 這些是「給人看的字串」，不是拿來做數學運算的數字
 *    （真正的數字在 `numericLimits`，那份與語言無關，不需要翻譯）。
 */
const TARGET_TEXT_EN: Record<string, string> = {
  '2000 毫克': '2000 mg',
  '1600 毫克': '1600 mg',
  '1200 毫克': '1200 mg',
  '1000 毫克': '1000 mg',
  '800 毫克': '800 mg',
  '100 公克': '100 g',
  '70 公克': '70 g',
  '60 公克': '60 g',
  '50 公克': '50 g',
  '40 公克': '40 g',
  '25 公克': '25 g',
  '20 公克': '20 g',
  依個人目標: 'Depends on your goal',
  '每餐 1 份': '1 portion per meal',
};

/**
 * 參考值的**說明文字**對照。
 *
 * 以中文原文為鍵：這些句子在資料檔中各自唯一，
 * 用原文當鍵可以保證「改了中文就會立刻發現英文沒跟上」（因為查不到 → 退回中文）。
 */
const TARGET_NOTE_EN: Record<string, string> = {
  '約等於 5 公克食鹽，也就是一天一小匙的量':
    'About 5 g of salt — roughly one small teaspoon a day',
  '約等於 10 顆方糖，一杯全糖手搖飲就可能超標':
    'About 10 sugar cubes — one full-sugar bubble tea can already exceed it',
  '吃太多會讓血管裡的壞膽固醇變多':
    'Too much raises the bad cholesterol inside your blood vessels',
  '幫助腸胃蠕動，也能讓血糖上升得慢一點':
    'Helps digestion and makes blood sugar rise more slowly',
  '約等於 3 公克食鹽，只有大人的六成。小孩腎臟還在發育，吃太鹹負擔更大':
    'About 3 g of salt — only 60% of an adult limit. Children\u2019s kidneys are still developing.',
  '約等於 5 顆方糖，一瓶含糖飲料就可能超過一半':
    'About 5 sugar cubes — one sweetened drink can cover half of it',
  '長骨頭的關鍵期，一杯牛奶約 240 毫克，一天兩杯就接近目標':
    'A key stage for bone growth. One glass of milk has about 240 mg; two glasses gets you close.',
  '發育需要，一顆蛋約 6 公克、一片雞胸約 20 公克':
    'Needed for growth. One egg has about 6 g; one chicken breast about 20 g.',
  '約等於 4 公克食鹽。愛吃泡麵、鹽酥雞的年紀特別容易超標':
    'About 4 g of salt. Instant noodles and fried snacks make it easy to go over.',
  '約等於 8 顆方糖。一杯全糖手搖飲就直接超標':
    'About 8 sugar cubes — one full-sugar bubble tea goes straight over the limit',
  '青春期是骨本存量的黃金期，這時補鈣的效果一輩子受用':
    'Puberty is the golden window for building bone mass — calcium now lasts a lifetime',
  '發育與運動需求都高，一顆蛋約 6 公克':
    'Needs are high for growth and sport. One egg has about 6 g.',
  '以 60 公斤成人、每公斤 1.6 公克估算，實際需求依訓練量調整':
    'Estimated for a 60 kg adult at 1.6 g per kg — adjust to your training load',
  '增肌期可拉高，減脂期需控制，重點是蛋白質與熱量的比例':
    'Higher when building, lower when cutting — the protein-to-calorie ratio is what counts',
  '外食最容易不足的一項，建議每餐至少一份蔬菜':
    'The nutrient most often missing when eating out — aim for one portion of vegetables per meal',
  '一份約等於一個拳頭大的熟菜':
    'One portion is roughly a fist-sized serving of cooked vegetables',
  '青春期骨骼發育的關鍵，一杯牛奶約 240 毫克':
    'Key for bone growth in the teen years. One glass of milk has about 240 mg.',
  '發育期建議量，一顆蛋約 6 公克':
    'Recommended during growth. One egg has about 6 g.',
};

/**
 * 取參考值數值字串。
 *
 * 先查對照表；查不到時用「單位替換」當第二層保險
 * （例如日後新增「250 毫克」，會自動變成 "250 mg"，不必改程式）。
 */
export function targetText(zh: string, language: Language): string {
  if (language !== 'en') return zh;
  const direct = TARGET_TEXT_EN[zh];
  if (direct) return direct;
  return zh.replace(/毫克/g, 'mg').replace(/公克/g, 'g').replace(/大卡/g, 'kcal');
}

/** 取參考值說明。找不到英文時退回中文原文。 */
export function targetNote(zh: string, language: Language): string {
  if (language !== 'en') return zh;
  return TARGET_NOTE_EN[zh] ?? zh;
}

/* ===========================================================================
 * 三、慢性病與過敏原（畫面用：徽章 + 說明）
 * ========================================================================= */

/** 徽章短標（4～5 字，必須塞得進膠囊裡） */
export const CONDITION_BADGE_EN: Record<string, string> = {
  hypertension: 'Strict sodium control',
  diabetes: 'Strict sugar control',
  hyperlipidemia: 'Watch saturated fat',
  gout: 'Avoid purines',
  kidney_disease: 'Low sodium, low potassium',
  cardiovascular: 'Heart-friendly',
  gerd: 'Mild, non-irritating',
  osteoporosis: 'Protect calcium',
  peanut_allergy: 'Allergen alert',
  seafood_allergy: 'Seafood allergen',
  lactose_intolerance: 'Avoid dairy',
  gluten_sensitivity: 'Gluten-free check',
};

/** 說明文字（卡片展開後顯示） */
export const CONDITION_DESCRIPTION_EN: Record<string, string> = {
  hypertension:
    'Checks sodium and salt to prevent blood pressure spikes and stroke risk (less salt, less MSG)',
  diabetes:
    'Checks refined sugar, maltodextrin and high-GI carbohydrates to prevent sharp rises in blood sugar after meals',
  hyperlipidemia:
    'Checks saturated fat, trans fat and cholesterol to prevent hardening of the arteries',
  gout:
    'Checks high-purine ingredients (concentrated stock, organ extracts, yeast) and fructose to prevent gout attacks',
  kidney_disease:
    'Strictly checks sodium, potassium, phosphate additives (preservatives and improvers) and excess protein load',
  cardiovascular:
    'Screens trans fats, heavy oil and salt, and nitrites in processed red meat, to protect the heart and blood vessels',
  gerd:
    'Screens spicy ingredients (chilli, black pepper), high acidity (citric acid), caffeine, mint and deep-fried food',
  osteoporosis:
    'Assesses calcium and warns that soft drinks, phosphates and heavy salt speed up calcium loss',
  peanut_allergy: 'Checks for peanuts, tree nuts and production-line cross-contamination warnings',
  seafood_allergy: 'Checks for shrimp, crab, shellfish, fish, fish sauce and shrimp paste',
  lactose_intolerance: 'Checks for milk, whey protein, casein and butter',
  gluten_sensitivity: 'Checks for wheat, barley, rye and oat ingredients',
};

/** 取慢性病徽章。找不到英文時退回中文原文。 */
export function conditionBadge(
  conditionId: string,
  fallback: string,
  language: Language
): string {
  if (language !== 'en') return fallback;
  return CONDITION_BADGE_EN[conditionId] ?? fallback;
}

/** 取慢性病說明。找不到英文時退回中文原文。 */
export function conditionDescription(
  conditionId: string,
  fallback: string,
  language: Language
): string {
  if (language !== 'en') return fallback;
  return CONDITION_DESCRIPTION_EN[conditionId] ?? fallback;
}

/** 慢性病分類膠囊名稱 */
export const CATEGORY_NAME_EN: Record<string, string> = {
  all: 'All (12)',
  cardio: 'Heart',
  metabolic: 'Metabolic',
  organ: 'Organs & bones',
  digestive: 'Digestive',
  allergen: 'Allergens',
};

/** 取分類名稱。 */
export function categoryName(categoryId: string, fallback: string, language: Language): string {
  if (language !== 'en') return fallback;
  return CATEGORY_NAME_EN[categoryId] ?? fallback;
}

/* ===========================================================================
 * 四、食育學堂主題
 * ========================================================================= */

export const TOPIC_LABEL_EN: Record<KnowledgeTopic, string> = {
  basics: 'Label basics',
  dangers: 'Three danger ingredients',
  profiles: 'Tips for your profile',
  shopping: 'Smart shopping',
};

/** 取主題名稱。 */
export function topicLabel(
  topic: KnowledgeTopic,
  fallback: string,
  language: Language
): string {
  if (language !== 'en') return fallback;
  return TOPIC_LABEL_EN[topic] ?? fallback;
}

/**
 * 把身分 id 清單轉成可讀字串（知識卡上標示「適合哪些身分」）。
 *
 * ⚠️ 與 learnerProfiles.ts 的 `describeProfiles` 必須行為一致，
 *    差別只在語言與分隔符號（中文用頓號，英文用逗號加空格）。
 */
export function describeProfilesLocalized(
  ids: LearnerProfileId[],
  names: string[],
  language: Language
): string {
  const separator = language === 'en' ? ', ' : '、';
  if (ids.length === 0) return language === 'en' ? 'All profiles' : '所有身分';
  return names.join(separator);
}
