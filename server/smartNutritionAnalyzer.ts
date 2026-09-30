/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ============================================================================
 * 智慧食品營養與身體指標分析引擎 (Smart Nutrition & Physical Indicator Engine)
 * ============================================================================
 * 當無法連線至外部 AI 或未設定 API 金鑰時，本引擎能即時分析食品成分、營養標籤
 * 並針對長者勾選的各項身體指標進行精確的健康風險評估與白話文朗讀生成。
 */

import { LabelAnalysisResult, RiskLevel, NutrientFact } from '../src/types';
// 難字簡化（2026-09-30）：查教學點前先把名稱還原成 canonical，
// 避免日後有人把簡化名稱直接餵進來時靜默查不到（本專案踩過三次同型 bug）。
import { canonicalNutrientName, nutrientName } from '../src/data/bilingual';

/**
 * 本機引擎使用的營養輪廓。
 *
 * 【誰會產生這個結構】
 *   1. `server/ocrLabel.ts` —— 離線 OCR 從真實標籤讀出（首選）
 *   2. `extractNutritionProfile()` —— 舊的固定樣本，僅在沒有可用圖片時作為最後手段
 * 兩者都必須回傳同一個形狀，規則引擎才能共用。
 */
export interface NutritionProfile {
  sodiumMg: number;       // 鈉 (毫克)
  sugarG: number;         // 糖 (公克)
  carbsG: number;         // 碳水 (公克)
  saturatedFatG: number;  // 飽和脂肪 (公克)
  transFatG: number;      // 反式脂肪 (公克)
  calories: number;       // 熱量 (大卡)
  purineLevel: 'high' | 'medium' | 'low'; // 普林等級
  hasPhosphates: boolean; // 是否含有磷酸鹽添加物
  hasHighPotassium: boolean;
  allergens: string[];    // 偵測到的過敏原
  ingredients: string[];  // 主要成分列表
  foodName: string;
}

/**
 * 示範用的固定樣本。
 *
 * ⚠️ 這個函式**不再依圖片內容猜測**。
 *    舊版寫成 `extractNutritionProfile(cleanBase64)`，用
 *    `cleanBase64.length % 3` 在三組寫死的資料之間輪替 ——
 *    與照片實際內容完全無關，等於對任何一張圖回傳隨機結論。
 *    對一個健康判斷 App 這是最糟的失敗模式：錯了不會報錯。
 *    已於 2026-09-26 改為只接受**明確的樣本代號**。
 *
 * 真實的離線辨識請用 `server/ocrLabel.ts` 的 `recognizeNutritionFromImage()`。
 *
 * @param sampleId 明確的樣本代號；不認識就回傳 null（由呼叫端決定如何處理）
 */
export function getSampleNutritionProfile(sampleId: string): NutritionProfile | null {
  // 提供真實長者超市高頻檢測的食品基準值
  if (sampleId === 'instant_noodles') {
    return {
      foodName: '風味調味速食麵 / 醬料泡麵',
      sodiumMg: 1980,
      sugarG: 4.5,
      carbsG: 64,
      saturatedFatG: 9.8,
      transFatG: 0.2,
      calories: 485,
      purineLevel: 'high', // 油炸、高湯精、肉粉
      hasPhosphates: true, // 碳酸鈉、多磷酸鈉品質改良劑
      hasHighPotassium: false,
      allergens: ['小麥', '大豆', '甲殼類產線交叉污染'],
      ingredients: [
        '油炸麵條 (小麥粉、精煉棕櫚油、食用鹽、碳酸鈉、多磷酸鈉)',
        '調味湯粉包 (味精/L-麩酸鈉、精鹽、麥芽糊精、牛肉精粉、酵母抽出物、香辛料)',
        '調味油包 (精製牛油、棕櫚油、辣椒油、維生素E抗氧化劑)',
        '脫水蔬菜 (脫水青蔥、胡蘿蔔、高麗菜)',
      ],
    };
  }

  if (sampleId === 'peanut_wafer') {
    return {
      foodName: '香酥花生夾心餅乾 / 甜點酥餅',
      sodiumMg: 280,
      sugarG: 26.5,
      carbsG: 52,
      saturatedFatG: 11.2,
      transFatG: 0.1,
      calories: 435,
      purineLevel: 'low',
      hasPhosphates: true, // 膨脹劑含酸性焦磷酸鈉
      hasHighPotassium: false,
      allergens: ['花生', '牛奶製品', '小麥麩質'],
      ingredients: [
        '麵粉 (小麥粉)',
        '特級花生醬 (烘焙花生、植物油、食用鹽)',
        '精緻白砂糖、蔗糖、高果糖玉米糖漿',
        '精煉棕櫚油、人造酥油',
        '全脂奶粉、乳清粉',
        '膨脹劑 (碳酸氫鈉、酸性焦磷酸鈉)',
      ],
    };
  }

  if (sampleId === 'soy_milk') {
    return {
      foodName: '無加糖高纖高鈣豆奶 / 燕麥黑豆漿',
      sodiumMg: 65,
      sugarG: 0.0,
      carbsG: 8.5,
      saturatedFatG: 0.6,
      transFatG: 0.0,
      calories: 135,
      purineLevel: 'medium', // 豆類含中等普林
      hasPhosphates: false,
      hasHighPotassium: true, // 豆類天然含鉀
      allergens: ['大豆', '燕麥麩質'],
      ingredients: ['水', '特選非基因改造黃豆、黑豆', '澳洲燕麥纖維', '碳酸鈣 (天然補鈣)'],
    };
  }

  return null;
}

/* ---------------------------------------------------------------------------
 * 成分對照表（nutrient_facts）— 本機引擎版本
 *
 * 【為什麼本機引擎也要做這件事】
 *   前端的「佔每日上限幾 %」長條圖完全依賴 nutrient_facts。
 *   若只有雲端 AI 會產生，一旦斷網或沒金鑰而降級到本機引擎，
 *   長者看到的就會是「有結果但沒有百分比」的半殘畫面。
 *   因此本機引擎必須用同一組 numericLimits 算出相同結構。
 *
 * 【規則與雲端一致】
 *   - 最多 3 項（避免長者資訊過載）
 *   - 只收錄「已達每日上限 30% 以上」的項目（未達門檻的不值得佔版面）
 *   - 依嚴重度（percent 由高到低）排序
 *   - percent = 實際含量 ÷ 每日上限 × 100
 * ------------------------------------------------------------------------- */

/** 本機營養輪廓 → 對照表項目的名稱映射（key 需與 numericLimits 的名稱一致） */
const LOCAL_FACT_SOURCES: Array<{
  /** numericLimits 裡的鍵，同時也是顯示名稱 */
  name: string;
  /** 從營養輪廓取值的函式 */
  pick: (p: NutritionProfile) => number;
}> = [
  { name: '鈉', pick: (p) => p.sodiumMg },
  { name: '添加糖', pick: (p) => p.sugarG },
  { name: '飽和脂肪', pick: (p) => p.saturatedFatG },
  { name: '熱量', pick: (p) => p.calories },
];

/**
 * 用學習者身分的每日上限，算出「佔每日上限幾 %」的成分對照表。
 *
 * @param profile        本機引擎解析出的營養輪廓
 * @param numericLimits  該身分的每日上限（來自 learnerProfiles.ts，單位需與 profile 相同）
 * @returns 最多 3 項、依嚴重度排序的對照表；未達 50% 門檻時回傳空陣列
 */
export function buildLocalNutrientFacts(
  profile: NutritionProfile,
  numericLimits?: Record<string, { value: number; unit: string }>
): NutrientFact[] {
  if (!numericLimits) return [];

  const facts: NutrientFact[] = [];

  for (const source of LOCAL_FACT_SOURCES) {
    const limit = numericLimits[source.name];
    if (!limit || !Number.isFinite(limit.value) || limit.value <= 0) continue;

    const value = source.pick(profile);
    if (!Number.isFinite(value) || value <= 0) continue;

    const percent = Math.min(999, Math.round((value / limit.value) * 100));
    // 未達三成上限的項目不值得佔用長者的注意力（門檻與雲端提示詞、後端正規化一致）
    if (percent < 30) continue;

    facts.push({
      name: source.name,
      value: Math.round(value * 10) / 10,
      unit: limit.unit,
      dailyLimit: limit.value,
      percent,
      direction: 'limit',
    });
  }

  // 嚴重度高的排前面，長者第一眼就看到最該注意的那一項
  return facts.sort((a, b) => b.percent - a.percent).slice(0, 3);
}

/* ---------------------------------------------------------------------------
 * 食育教學欄位 — 本機引擎版本
 *
 * 【為什麼本機也要產生這三個欄位】
 *   雲端與本機必須回傳同一個形狀。若只有雲端會產生教學內容，
 *   一旦降級到本機引擎，長者看到的就會是「有結論、但教學整段不見」的畫面。
 *   三條路徑（雲端成功 / 快取命中 / 本機備援）都必須齊備。
 * ------------------------------------------------------------------------- */

/**
 * 每個營養項目對應的一句「為什麼」，依實際超標項目挑選。
 *
 * ⚠️ 鍵是**內部 canonical 名稱**（鈉／膳食纖維…），不是顯示用的簡化名稱。
 *    提示詞給模型看的是簡化名稱，但 `normalizeNutrientFacts` 會還原成
 *    canonical 才輸出，所以這裡用 canonical 查表是對的。
 * ⚠️ 文案本身要用**簡單的字**，並在必要時說出「標籤上寫的是什麼」——
 *    長者要拿包裝對照，兩邊的字必須接得起來。
 */
const LOCAL_KNOWLEDGE_POINTS: Record<string, string> = {
  鈉: '包裝上寫的「鈉」，就是我們平常說的鹽分。一包泡麵的鹽分常常就等於一整天的上限，所以不能天天當正餐。',
  添加糖: '成分表上的「糖」是外加的精緻糖，不是食物天生的甜。一杯含糖飲料常等於好幾顆方糖。',
  飽和脂肪: '動物油（標籤上叫「飽和脂肪」）吃多了血液會變黏稠，心臟比較吃力。',
  熱量: '熱量要看「整包」不是「每份」。很多包裝寫的是每份，整包其實是好幾份。',
  蛋白質: '蛋白質要看「蛋白質對熱量」的比例，不要只看正面的大字宣稱。',
  膳食纖維: '纖維（標籤上叫「膳食纖維」）一天要 25 公克以上。成分表越短、越接近天然食物，纖維通常越多。',
  鈣: '鈣和骨頭有關；它和鹽分是兩回事，看標籤時不要看錯。',
};

/** 通用的讀標籤動作，任何產品都適用 */
const LOCAL_LABEL_TIP =
  '先找標籤上寫「鈉」的那一列，看是幾毫克；再找「糖」那一列，看是幾公克。這兩列就能判斷一大半。';

/** 把最嚴重的那一項換算成「佔您一天上限幾 %」的白話句 */
function buildLocalDailyLimitContext(facts: NutrientFact[], foodName?: string): string {
  if (facts.length === 0) {
    return '這包的營養數字都還在您每日上限的三成以內，正常份量吃沒有問題。';
  }
  const top = facts[0];
  const subject = foodName ? `這包${foodName}的` : '這包的';
  /**
   * ⚠️ 顯示用**簡化名稱**（鹽分／纖維…），但 `fact.name` 是 canonical（鈉…）。
   *
   * 【為什麼這裡改動是安全的】
   *   `localEngineEn.ts` 有兩條樣板規則在比對這個句子：
   *     /^這包(.+?)的(.+?)是 (.+?) (\S+)，等於您一天上限的 (\d+)%。$/
   *   它把捕獲到的名稱交給 `nutrientName(name, 'en')`，
   *   而那個函式會**先還原成 canonical 再查英文表** ——
   *   所以「鹽分」照樣會翻成 "Sodium"，不會漏翻。
   * ⚠️ 但**日後改這個句子時，一定要同步檢查那兩條 regex**（本專案踩過三次同型 bug）。
   */
  const displayName = nutrientName(top.name, 'zh-TW');
  return `${subject}${displayName}是 ${top.value} ${top.unit}，等於您一天上限的 ${top.percent}%。`;
}

/** 依超標項目挑一句教學；都沒有超標時，談「怎麼看標籤」這個更基本的觀念 */
function pickLocalKnowledgePoint(facts: NutrientFact[]): string {
  for (const fact of facts) {
    // ⚠️ 先還原成 canonical 再查表：快取裡可能存著簡化後的舊名稱（鹽分），
    //    不還原就會查不到而落到下面的通用句。
    const point = LOCAL_KNOWLEDGE_POINTS[canonicalNutrientName(fact.name)];
    if (point) return point;
  }
  return '標籤上的「營養標示」表格，每一列都是一個數字。只要讀得出「鈉」和「糖」這兩列，就能判斷一大半。';
}

/**
 * 產生食育教學三欄位（確定性版本）。
 *
 * 供兩處使用：
 *   1. 本機引擎自己產生教學內容
 *   2. 雲端模型漏給欄位時，由 server.ts 用同一份內容補齊
 *      （補的內容是從實際 nutrient_facts 推導的，不是憑空編造）
 */
export function buildEducationFields(
  facts: NutrientFact[],
  foodName?: string
): { knowledge_point: string; label_reading_tip: string; daily_limit_context: string } {
  return {
    knowledge_point: pickLocalKnowledgePoint(facts),
    label_reading_tip: LOCAL_LABEL_TIP,
    daily_limit_context: buildLocalDailyLimitContext(facts, foodName),
  };
}

/**
 * 針對 12 項身體指標綜合評估風險，生成溫馨的白話摘要與營養建議
 *
 * @param numericLimits 選填。帶入後會一併產生 nutrient_facts（供前端畫百分比長條圖）
 */
export function analyzeNutritionWithIndicators(
  profile: NutritionProfile,
  selectedConditions: string[],
  numericLimits?: Record<string, { value: number; unit: string }>,
  /**
   * 輸出語言（2026-09-28 新增）。
   *
   * ⚠️ 這個引擎是**預設路徑**：cloudConsent 預設 false，
   *    也就是使用者沒有明確同意上傳時，全部由這裡判斷。
   *    所以英文介面要真的可用，這裡必須跟著雙語 —— 不能只做雲端提示詞。
   */
  language: 'zh-TW' | 'en' = 'zh-TW'
): LabelAnalysisResult {
  /** 依語言挑字串。中文是預設，英文只在 language === 'en' 時使用。 */
  const L = (zh: string, en: string) => (language === 'en' ? en : zh);

  const concerns: string[] = [];
  const matchedConditions: string[] = [];
  let riskScore = 0; // 0 = 綠, 1-2 = 黃, 3+ = 紅

  // 1. 高血壓把關 (大白話：太鹹、鹽巴多、血壓容易飆高頭暈)
  const hasHypertension = selectedConditions.some((c) => c.includes('高血壓'));
  if (hasHypertension) {
    if (profile.sodiumMg >= 1200) {
      concerns.push(`🔴 鹽巴放太多了（太鹹！）：吃這一份就超過整天上限，吃了血壓會一下子飆高、頭會暈！`);
      matchedConditions.push('高血壓 (太鹹危險)');
      riskScore += 3;
    } else if (profile.sodiumMg >= 400) {
      concerns.push(`🟡 口味稍微偏鹹：鹽分有一點多，建議少喝裡面的湯汁，多喝兩杯溫開水排鹽。`);
      matchedConditions.push('高血壓 (鹽分稍多)');
      riskScore += 1;
    }
  }

  // 2. 糖尿病 / 高血糖把關 (大白話：太甜、白糖多、血糖衝上去)
  const hasDiabetes = selectedConditions.some((c) => c.includes('糖尿病') || c.includes('血糖'));
  if (hasDiabetes) {
    if (profile.sugarG >= 15) {
      concerns.push(`🔴 白糖放得很多（太甜！）：吃了血糖會急速衝上去，容易口渴想喝水、人會疲倦！`);
      matchedConditions.push('糖尿病 (高糖危險)');
      riskScore += 3;
    } else if (profile.sugarG >= 5) {
      concerns.push(`🟡 有加糖分：吃起來有甜味，如果想嚐味道吃一小口就好，不要整包吃光。`);
      matchedConditions.push('糖尿病 (含糖注意)');
      riskScore += 1;
    }
  }

  // 3. 高血脂 / 高膽固醇把關 (大白話：油太重、劣質油脂塞血管)
  const hasLipids = selectedConditions.some((c) => c.includes('高血脂') || c.includes('膽固醇'));
  if (hasLipids) {
    if (profile.saturatedFatG >= 8 || profile.transFatG > 0.3) {
      concerns.push(`🔴 油脂放太重（含有不好的油）：容易黏在心血管壁上、讓血液變黏稠，心臟很吃力！`);
      matchedConditions.push('高血脂 (油太重警告)');
      riskScore += 3;
    } else if (profile.saturatedFatG >= 4) {
      concerns.push(`🟡 油脂稍多：稍微偏油膩，平時要少吃動物油跟酥油，保護心臟血管。`);
      matchedConditions.push('高血脂 (油脂注意)');
      riskScore += 1;
    }
  }

  // 4. 痛風 / 高尿酸把關 (大白話：濃湯肉精容易讓腳趾頭痛風腫起來)
  const hasGout = selectedConditions.some((c) => c.includes('痛風') || c.includes('尿酸'));
  if (hasGout) {
    if (profile.purineLevel === 'high') {
      concerns.push('🔴 湯頭太濃或肉精粉多：喝了腳趾頭跟關節容易發紅、腫痛發作！');
      matchedConditions.push('痛風 (腳趾腫痛警報)');
      riskScore += 3;
    } else if (profile.sugarG >= 15) {
      concerns.push('🟡 甜糖漿放得多：身體代謝太甜的糖漿會讓尿酸排不出去，要少碰甜食。');
      matchedConditions.push('痛風 (甜食促尿酸)');
      riskScore += 1;
    }
  }

  // 5. 慢性腎臟病把關 (大白話：傷腎化學粉、重鹽水腫)
  const hasKidney = selectedConditions.some((c) => c.includes('腎臟'));
  if (hasKidney) {
    if (profile.hasPhosphates || profile.sodiumMg >= 800) {
      concerns.push('🔴 有加傷腎的化學膨脹粉（磷酸鹽）而且太鹹：腎臟很難排泄出去，非常傷腎！');
      matchedConditions.push('慢性腎臟病 (傷腎化學粉警告)');
      riskScore += 3;
    } else if (profile.hasHighPotassium) {
      concerns.push('🟡 含有天然黃豆鉀離子：如果醫生有交代要少吃高鉀食物，請跟醫生確認。');
      matchedConditions.push('慢性腎臟病 (留心鉀分)');
      riskScore += 1;
    }
  }

  // 6. 心血管疾病把關 (大白話：胸口悶、心臟負擔)
  const hasCardio = selectedConditions.some((c) => c.includes('心血管'));
  if (hasCardio) {
    if (profile.transFatG > 0 || profile.sodiumMg >= 1000) {
      concerns.push('🔴 太鹹又含有反式劣質油：心臟打血負擔會變很大，容易覺得胸口悶！');
      matchedConditions.push('心血管 (心臟負擔大)');
      riskScore += 2;
    }
  }

  // 7. 胃食道逆流 / 胃潰瘍把關 (大白話：太辣太油、火燒心、胃酸衝上來)
  const hasGerd = selectedConditions.some((c) => c.includes('胃食道') || c.includes('胃潰瘍'));
  if (hasGerd) {
    const hasSpicy = profile.ingredients.some((i) => i.includes('辣椒') || i.includes('胡椒') || i.includes('油炸'));
    if (hasSpicy) {
      concerns.push('🔴 含有辣椒、辣油或油炸物：吃進肚子容易火燒心，胃酸會衝到喉嚨很不舒服！');
      matchedConditions.push('胃食道逆流 (容易火燒心)');
      riskScore += 2;
    }
  }

  // 8. 骨質疏鬆症把關 (大白話：太鹹會把骨頭裡的鈣質偷走，骨頭容易脆)
  const hasOsteo = selectedConditions.some((c) => c.includes('骨質疏鬆'));
  if (hasOsteo) {
    if (profile.hasPhosphates || profile.sodiumMg >= 1000) {
      concerns.push('🟡 鹽巴多又含化學粉：會把身體裡的鈣質偷偷帶走，骨頭容易變脆、怕跌倒骨折！');
      matchedConditions.push('骨質疏鬆 (骨頭鈣流失)');
      riskScore += 1;
    }
  }

  // 9. 花生堅果過敏原把關 (大白話：喉嚨腫、皮膚癢)
  const hasPeanutAllergy = selectedConditions.some((c) => c.includes('花生') || c.includes('堅果'));
  if (hasPeanutAllergy) {
    const foundNut = profile.allergens.some((a) => a.includes('花生') || a.includes('堅果'));
    if (foundNut) {
      concerns.push('⛔ 【危險過敏】包裝清楚寫著有加花生或堅果，吃了喉嚨會腫、呼吸困難，千萬不能碰！');
      matchedConditions.push('花生堅果過敏 (絕對不能吃)');
      riskScore += 5; // 絕對紅燈
    }
  }

  // 10. 海鮮甲殼類過敏把關 (大白話：蝦蟹過敏發癢)
  const hasSeafoodAllergy = selectedConditions.some((c) => c.includes('海鮮') || c.includes('甲殼'));
  if (hasSeafoodAllergy) {
    const foundSeafood = profile.allergens.some((a) => a.includes('甲殼') || a.includes('蝦') || a.includes('魚'));
    if (foundSeafood) {
      concerns.push('⛔ 【海鮮過敏】這款有蝦蟹或海鮮成分，會引發全身起紅疹發癢，不要吃喔！');
      matchedConditions.push('海鮮過敏 (吃了會起疹)');
      riskScore += 5;
    }
  }

  // 11. 乳糖不耐症 / 牛奶過敏把關 (大白話：肚子絞痛拉肚子)
  const hasLactose = selectedConditions.some((c) => c.includes('乳糖') || c.includes('牛奶'));
  if (hasLactose) {
    const foundMilk = profile.allergens.some((a) => a.includes('牛奶') || a.includes('乳'));
    if (foundMilk) {
      concerns.push('🟡 含有牛奶奶粉成分：喝牛奶容易拉肚子、肚子脹氣的人請避開這包！');
      matchedConditions.push('牛奶乳糖 (容易拉肚子)');
      riskScore += 2;
    }
  }

  // 12. 麩質過敏 / 乳糜瀉把關 (大白話：吃麵粉肚子脹氣)
  const hasGluten = selectedConditions.some((c) => c.includes('麩質') || c.includes('小麥'));
  if (hasGluten) {
    const foundGluten = profile.allergens.some((a) => a.includes('小麥') || a.includes('麩質'));
    if (foundGluten) {
      concerns.push('🟡 含有小麥麵粉成分：如果吃麵粉容易肚子脹氣或消化不良，請少吃一點。');
      matchedConditions.push('麵粉麩質 (肚子易脹氣)');
      riskScore += 2;
    }
  }

  // 決定總體風險等級
  let riskLevel: RiskLevel = 'green';
  let warningTitle = '✅ 成分很清淡，可以放心吃';
  let plainSummary = '';
  let alternativeAdvice = '';

  if (riskScore >= 3) {
    riskLevel = 'red';
    warningTitle = '⚠️ 紅燈警報！這包對身體負擔很大，不要買！';
    plainSummary = `您好！這款【${profile.foodName}】油鹽糖放得太多了。`;

    if (matchedConditions.length > 0) {
      plainSummary += `特別是您注意的【${matchedConditions.slice(0, 3).join('、')}】，這包吃下去對身體不好，容易讓血壓飆高或血糖亂跳。建議您放回架上，不要買回家喔！`;
    } else {
      plainSummary += `對心血管跟血壓負擔比較大，建議換成天然清淡的食物比較健康喔！`;
    }

    alternativeAdvice = '建議在超市改買：新鮮豆腐、綠色蔬菜、清蒸魚、燕麥片或無糖豆漿，清淡又顧健康！';
  } else if (riskScore >= 1) {
    riskLevel = 'yellow';
    warningTitle = '🟡 黃燈提醒：嚐一兩口就好，不要吃太多';
    plainSummary = `您好！這款【${profile.foodName}】味道雖然香，但對您的身體（${matchedConditions.slice(0, 2).join('、')}）還是稍微有點油鹽糖，嚐一點點味道可以，千萬不要整包吃光喔！`;
    alternativeAdvice = '吃的時候記得配一杯溫開水，也可以分給家人一起吃，不要一次吃太多。';
  } else {
    riskLevel = 'green';
    warningTitle = '✅ 綠燈安心！沒有太鹹太甜，很適合您';
    plainSummary = `請放心！這款【${profile.foodName}】沒有亂加太多鹽巴、糖和壞油脂，很符合您勾選的健康指標，可以安心放進購物車買回家享用！`;
    alternativeAdvice = '平時早餐或點心時間吃剛剛好，清淡好消化，祝您天天健康活力好！';
  }

  // 成分對照表（前端百分比長條圖用），同時用來挑選教學內容
  const nutrientFacts = buildLocalNutrientFacts(profile, numericLimits);

  return {
    risk_level: riskLevel,
    warning_title: warningTitle,
    plain_summary: plainSummary,
    alternative_advice: alternativeAdvice,
    // 食育教學三欄位：與雲端路徑同一個形狀，降級時教學內容不會消失
    ...buildEducationFields(nutrientFacts, profile.foodName),
    ingredients_detected: profile.ingredients,
    nutrition_concerns: concerns.length > 0 ? concerns : ['各項營養指標未發現嚴重超標情況，成分相對單純健康。'],
    matched_conditions: matchedConditions,
    // 與雲端 AI 同一個結構，前端才能用同一套程式畫長條圖
    nutrient_facts: nutrientFacts,
    analysis_mode: 'smart_nutrition_engine',
  };
}
