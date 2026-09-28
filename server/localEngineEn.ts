/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 本機規則引擎的英文對照
 * ============================================================================
 * 【為什麼需要這個檔案】
 *   本機引擎（smartNutritionAnalyzer）是**預設路徑** ——
 *   cloudConsent 預設 false，使用者沒有明確同意上傳時全部由它判斷。
 *   所以英文介面要真的可用，這裡必須跟著雙語，不能只做雲端提示詞。
 *
 * 【為什麼用「對照表 + 事後轉換」而不是在引擎裡逐字改】
 *   引擎裡有 112 條中文字串，但其中大半是**比對用的關鍵字**
 *   （例如「乳糖」「油炸」——用來比對標籤原文的），那些**不能翻譯**，
 *   翻了會讓比對失效。
 *
 *   這裡改成只轉換「輸出欄位」（警告標題、白話摘要、建議…），
 *   比對邏輯完全不動。好處是：
 *     1. 不可能誤傷比對邏輯
 *     2. 對照表可以獨立驗證完整性
 *     3. 引擎的邏輯一行都不用改
 *
 * 【找不到對照時的行為】
 *   安全退回中文原文（`?? s`），而不是留空或丟錯。
 *   寧可讓使用者看到一句中文，也不要看到空白。
 */

import type { LabelAnalysisResult } from '../src/types';
import { nutrientName, unitName } from '../src/data/bilingual';

/**
 * 中文 → 英文對照。
 *
 * ⚠️ 鍵必須與 smartNutritionAnalyzer.ts 裡的**輸出字串完全一致**（含 emoji 與標點）。
 *    改動引擎的文案時，這裡也要跟著改 ——
 *    有一個 `npm run check:i18n` 可以自動檢查漏掉哪些（見 scripts/）。
 */
export const LOCAL_TEXT_EN: Record<string, string> = {
  // ── 結論標題 ──────────────────────────────────────────────
  '⚠️ 紅燈警報！這包對身體負擔很大，不要買！':
    '⚠️ Red alert! This product is a heavy burden for you — do not buy it.',
  '✅ 綠燈安心！沒有太鹹太甜，很適合您':
    '✅ All clear! Not too salty or sweet — a good choice for you.',
  '✅ 成分很清淡，可以放心吃':
    '✅ The ingredients are gentle — safe to eat.',
  '🟡 黃燈提醒：嚐一兩口就好，不要吃太多':
    '🟡 Caution: a taste or two is fine — do not eat much.',

  // ── 白話摘要 ──────────────────────────────────────────────
  '各項營養指標未發現嚴重超標情況，成分相對單純健康。':
    'No nutrient is seriously over the limit. The ingredients are relatively simple and healthy.',
  '吃的時候記得配一杯溫開水，也可以分給家人一起吃，不要一次吃太多。':
    'Have a glass of warm water with it, and share it with family — do not eat it all at once.',
  '平時早餐或點心時間吃剛剛好，清淡好消化，祝您天天健康活力好！':
    'Perfect for breakfast or a snack — light and easy to digest. Wishing you good health every day!',
  '建議在超市改買：新鮮豆腐、綠色蔬菜、清蒸魚、燕麥片或無糖豆漿，清淡又顧健康！':
    'Better choices at the supermarket: fresh tofu, green vegetables, steamed fish, oatmeal or unsweetened soy milk — light and good for you!',

  // ── 慢性病提醒 ────────────────────────────────────────────
  心血管: 'Cardiovascular (heavy load on the heart)',
  '心血管 (心臟負擔大)': 'Cardiovascular (heavy load on the heart)',
  '高血壓 (太鹹危險)': 'Hypertension (too salty — risky)',
  '高血壓 (鹽分稍多)': 'Hypertension (a little too much salt)',
  '糖尿病 (高糖危險)': 'Diabetes (high sugar — risky)',
  '糖尿病 (含糖注意)': 'Diabetes (watch the sugar)',
  '高血脂 (油太重警告)': 'High cholesterol (too much fat — warning)',
  '高血脂 (油脂注意)': 'High cholesterol (watch the fats)',
  '痛風 (腳趾腫痛警報)': 'Gout (risk of swollen, painful toes)',
  '痛風 (甜食促尿酸)': 'Gout (sweet food raises uric acid)',
  '慢性腎臟病 (傷腎化學粉警告)': 'Chronic kidney disease (harmful phosphate additives)',
  '慢性腎臟病 (留心鉀分)': 'Chronic kidney disease (watch your potassium)',
  '海鮮過敏 (吃了會起疹)': 'Seafood allergy (can cause a rash)',
  '牛奶乳糖 (容易拉肚子)': 'Milk and lactose (can cause diarrhea)',
  '胃食道逆流 (容易火燒心)': 'Acid reflux (can cause heartburn)',
  '花生堅果過敏 (絕對不能吃)': 'Peanut and tree nut allergy (must avoid completely)',
  '骨質疏鬆 (骨頭鈣流失)': 'Osteoporosis (calcium loss from bones)',
  '麵粉麩質 (肚子易脹氣)': 'Wheat gluten (can cause bloating)',

  // ── 過敏原警告 ────────────────────────────────────────────
  '⛔ 【危險過敏】包裝清楚寫著有加花生或堅果，吃了喉嚨會腫、呼吸困難，千萬不能碰！':
    '⛔ [DANGEROUS ALLERGY] The packaging clearly lists peanuts or tree nuts. This can swell your throat and make breathing hard — you must not touch it.',
  '⛔ 【海鮮過敏】這款有蝦蟹或海鮮成分，會引發全身起紅疹發癢，不要吃喔！':
    '⛔ [SEAFOOD ALLERGY] This contains shrimp, crab or other seafood. It can cause an itchy rash all over — do not eat it.',

  // ── 慢性病相關顧慮 ────────────────────────────────────────
  '🔴 含有辣椒、辣油或油炸物：吃進肚子容易火燒心，胃酸會衝到喉嚨很不舒服！':
    '🔴 Contains chilli, chilli oil or fried food: this easily causes heartburn, with acid rising to your throat.',
  '🔴 太鹹又含有反式劣質油：心臟打血負擔會變很大，容易覺得胸口悶！':
    '🔴 Too salty and contains trans fats: this puts a heavy load on your heart and can make your chest feel tight.',
  '🔴 有加傷腎的化學膨脹粉（磷酸鹽）而且太鹹：老人家的腰子很難排泄出去，非常傷腎臟！':
    '🔴 Contains phosphate additives that harm the kidneys, and is too salty: older kidneys struggle to clear these out.',
  '🟡 含有天然黃豆鉀離子：如果醫生有交代要少吃高鉀食物，請跟醫生確認。':
    '🟡 Contains natural potassium from soybeans: if your doctor told you to limit high-potassium foods, please check with them.',
  '🟡 含有小麥麵粉成分：如果吃麵粉容易肚子脹氣或消化不良，請少吃一點。':
    '🟡 Contains wheat flour: if wheat gives you bloating or indigestion, eat only a little.',
  '🟡 含有牛奶奶粉成分：長輩如果喝牛奶容易拉肚子、肚子脹氣，請避開這包！':
    '🟡 Contains milk powder: if milk gives you diarrhea or bloating, avoid this pack.',
  '🟡 鹽巴多又含化學粉：會把身體裡的鈣質偷偷帶走，骨頭容易變脆、怕跌倒骨折！':
    '🟡 High in salt and contains phosphate additives: these quietly drain calcium from your body and make bones brittle.',

  // ── 食育教學：每個營養項目的「為什麼」────────────────────
  鈉: 'The "sodium" on the label is salt. One pack of instant noodles often equals a whole day\'s limit, so it should not be a daily meal.',
  添加糖:
    'The "sugar" in the ingredient list is added refined sugar, not the natural sweetness of food. One sugary drink often equals several sugar cubes.',
  飽和脂肪:
    'Saturated fat mostly comes from animal fat and palm oil. Too much makes your blood thicker and your heart work harder.',
  熱量: 'Look at the calories for the WHOLE pack, not per serving. Many packages list per serving, but the pack actually holds several.',
  蛋白質:
    'Look at the ratio of protein to calories — do not just trust the big claim on the front of the package.',
  膳食纖維:
    'You need at least 25 g of fibre a day. The shorter the ingredient list and the closer to whole food, the more fibre it usually has.',
  鈣: 'Calcium is about bones. It is a completely different word from the sodium in salt — do not mix them up when reading a label.',
  '先找「鈉」那一列看是幾毫克，再找「糖」那一列看是幾公克。這兩列就能判斷一大半。':
    'First find the "sodium" row and read the milligrams, then find the "sugar" row and read the grams. Those two rows tell you most of what you need.',
  '標籤上的「營養標示」表格，每一列都是一個數字。只要讀得出「鈉」和「糖」這兩列，就能判斷一大半。':
    'Every row in the nutrition table is one number. If you can read just the "sodium" and "sugar" rows, you can judge most products.',
};

/**
 * 含變數的樣板字串。
 *
 * 【為什麼不能放進上面的對照表】
 *   這些字串含有商品名稱或慢性病清單，每次內容都不同，無法精確比對。
 *
 * 【⚠️ 踩過的坑：白話摘要是「拼接」出來的】
 *   引擎先寫「阿公、阿婆您好！這款【X】油鹽糖放得太多了。」
 *   再依情況 += 「特別是您注意的【Y】，…」或「對老人家心血管…」。
 *   所以要比對的是**拼接後的完整句子**，不是單一句型。
 *   一開始只寫單一句型，結果完全對不上（畫面仍顯示中文）。
 */
const TEMPLATE_PATTERNS: Array<{ re: RegExp; build: (m: RegExpMatchArray) => string }> = [
  {
    // 紅燈 + 有勾選慢性病（拼接兩段）
    re: /^阿公、阿婆您好！這款【(.+?)】油鹽糖放得太多了。特別是您注意的【(.+?)】，這包吃下去對身體不好，容易讓血壓飆高或血糖亂跳。孫子建議您放回架上，不要買回家喔！$/,
    build: (m) =>
      `Hello! This ${m[1]} has far too much oil, salt and sugar. Especially for the conditions you selected — ${m[2]} — it is not good for you: it can spike your blood pressure or blood sugar. Best to put it back on the shelf and not take it home.`,
  },
  {
    // 紅燈 + 沒有勾選慢性病
    re: /^阿公、阿婆您好！這款【(.+?)】油鹽糖放得太多了。對老人家心血管跟血壓負擔比較大，建議換成天然清淡的食物比較健康喔！$/,
    build: (m) =>
      `Hello! This ${m[1]} has far too much oil, salt and sugar. It is a heavy load on an older person's heart and blood pressure — a plain, natural food would be healthier.`,
  },
  {
    // 黃燈
    re: /^長輩您好！這款【(.+?)】味道雖然香，但對您的身體（(.+?)）還是稍微有點油鹽糖，嚐一點點味道可以，千萬不要整包吃光喔！$/,
    build: (m) =>
      `Hello! This ${m[1]} smells good, but it still has a fair amount of oil, salt and sugar for your conditions (${m[2]}). A small taste is fine — do not finish the whole pack.`,
  },
  {
    // 綠燈
    re: /^阿公、阿婆請放一百個心！這款【(.+?)】沒有亂加太多鹽巴、糖和壞油脂，很符合您勾選的健康指標，可以安心放進購物車買回家享用！$/,
    build: (m) =>
      `Rest easy! This ${m[1]} does not add too much salt, sugar or bad fats, and it matches the health conditions you selected. You can safely put it in your basket and enjoy it at home.`,
  },
  {
    // 每日上限說明（有商品名稱）：「這包X的鈉是 2350 毫克，等於您一天上限的 118%。」
    re: /^這包(.+?)的(.+?)是 (.+?) (\S+)，等於您一天上限的 (\d+)%。$/,
    build: (m) =>
      `This ${m[1]} has ${m[3]} ${unitName(m[4], 'en')} of ${nutrientName(m[2], 'en')} — that is ${m[5]}% of your daily limit.`,
  },
  {
    // 每日上限說明（沒有商品名稱）
    re: /^這包的(.+?)是 (.+?) (\S+)，等於您一天上限的 (\d+)%。$/,
    build: (m) =>
      `This pack has ${m[2]} ${unitName(m[3], 'en')} of ${nutrientName(m[1], 'en')} — that is ${m[4]}% of your daily limit.`,
  },
  {
    // 沒有任何超標項目時
    re: /^這包的營養數字都還在您每日上限的三成以內，正常份量吃沒有問題。$/,
    build: () =>
      'Every nutrient in this pack is still within 30% of your daily limit — fine to eat in a normal portion.',
  },
];

/** 轉換單一字串：先查對照表，再試樣板規則，都不中就退回原文。 */
function translateOne(text: string): string {
  const direct = LOCAL_TEXT_EN[text];
  if (direct) return direct;
  for (const { re, build } of TEMPLATE_PATTERNS) {
    const m = text.match(re);
    if (m) return build(m);
  }
  return text;
}

/** 把字串陣列逐項轉換，並過濾掉 undefined。 */
function translateList(list: string[] | undefined): string[] | undefined {
  if (!Array.isArray(list)) return list;
  return list.map((s) => (typeof s === 'string' ? translateOne(s) : s));
}

/**
 * 把本機引擎的結果轉成指定語言。
 *
 * ⚠️ 只轉換**輸出欄位**。引擎內部的比對關鍵字（「乳糖」「油炸」…）完全不動 ——
 *    那些是拿來比對標籤原文的，翻譯了會讓比對失效。
 */
export function translateLocalResult(
  result: LabelAnalysisResult,
  language: 'zh-TW' | 'en'
): LabelAnalysisResult {
  if (language !== 'en') return result;

  return {
    ...result,
    warning_title: translateOne(result.warning_title ?? ''),
    plain_summary: translateOne(result.plain_summary ?? ''),
    alternative_advice: result.alternative_advice
      ? translateOne(result.alternative_advice)
      : result.alternative_advice,
    knowledge_point: result.knowledge_point ? translateOne(result.knowledge_point) : result.knowledge_point,
    label_reading_tip: result.label_reading_tip
      ? translateOne(result.label_reading_tip)
      : result.label_reading_tip,
    daily_limit_context: result.daily_limit_context
      ? translateOne(result.daily_limit_context)
      : result.daily_limit_context,
    nutrition_concerns: translateList(result.nutrition_concerns),
    matched_conditions: translateList(result.matched_conditions),
    ingredients_detected: translateList(result.ingredients_detected),
    // 營養素名稱與單位：本機引擎產生的 name/unit 是中文（「鈉」「毫克」），
    // 前端百分比長條圖會直接顯示，所以也要換。
    nutrient_facts: Array.isArray(result.nutrient_facts)
      ? result.nutrient_facts.map((f) => ({
          ...f,
          name: nutrientName(f.name, 'en'),
          unit: unitName(f.unit, 'en'),
        }))
      : result.nutrient_facts,
  };
}
