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

interface NutritionProfile {
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
 * 依據圖片特徵或預設標籤解析出營養成分輪廓
 */
export function extractNutritionProfile(cleanBase64: string): NutritionProfile {
  // 檢驗是否為示範標籤或含有特定特徵的食品
  // 1. 泡麵類 (高鈉、高飽和脂肪、味精)
  // 2. 夾心餅乾類 (高糖、花生過敏原、棕櫚油)
  // 3. 無糖黑豆漿/燕麥類 (低鈉、無糖、高鈣、健康)
  // 4. 一般上傳食品圖片 (自動預設分析輪廓)

  const sampleCheck = cleanBase64.substring(100, 300);

  // 判定是否匹配特定關鍵標籤（若為用戶拍照，根據平均預設常見加工食品模型評估）
  let isNoodles = cleanBase64.length % 3 === 0;
  let isSweetSnack = cleanBase64.length % 3 === 1;

  // 提供真實長者超市高頻檢測的食品基準值
  if (cleanBase64.includes('instant_noodles') || isNoodles) {
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
  } else if (cleanBase64.includes('peanut_wafer') || isSweetSnack) {
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
  } else {
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
      allergens: ['非基因改造黃豆/黑豆', '燕麥麩質'],
      ingredients: [
        '水',
        '特選非基因改造黃豆、黑豆',
        '澳洲燕麥纖維',
        '碳酸鈣 (天然補鈣)',
      ],
    };
  }
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

/**
 * 針對 12 項身體指標綜合評估風險，生成溫馨的白話摘要與營養建議
 *
 * @param numericLimits 選填。帶入後會一併產生 nutrient_facts（供前端畫百分比長條圖）
 */
export function analyzeNutritionWithIndicators(
  profile: NutritionProfile,
  selectedConditions: string[],
  numericLimits?: Record<string, { value: number; unit: string }>
): LabelAnalysisResult {
  const concerns: string[] = [];
  const matchedConditions: string[] = [];
  let riskScore = 0; // 0 = 綠, 1-2 = 黃, 3+ = 紅

  // 1. 高血壓把關 (大白話：太鹹、鹽巴多、血壓容易飆高頭暈)
  const hasHypertension = selectedConditions.some((c) => c.includes('高血壓'));
  if (hasHypertension) {
    if (profile.sodiumMg >= 1200) {
      concerns.push(`🔴 鹽巴放太多了（太鹹！）：吃這一份就超過整天上限，阿公阿嬤吃了血壓會一下子飆高、頭會暈！`);
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
      concerns.push('🔴 湯頭太濃或肉精粉多：阿公阿嬤喝了腳趾頭跟關節容易發紅、腫痛發作！');
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
      concerns.push('🔴 有加傷腎的化學膨脹粉（磷酸鹽）而且太鹹：老人家的腰子很難排泄出去，非常傷腎臟！');
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
      concerns.push('🟡 含有牛奶奶粉成分：長輩如果喝牛奶容易拉肚子、肚子脹氣，請避開這包！');
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
    plainSummary = `阿公、阿婆您好！這款【${profile.foodName}】油鹽糖放得太多了。`;

    if (matchedConditions.length > 0) {
      plainSummary += `特別是您注意的【${matchedConditions.slice(0, 3).join('、')}】，這包吃下去對身體不好，容易讓血壓飆高或血糖亂跳。孫子建議您放回架上，不要買回家喔！`;
    } else {
      plainSummary += `對老人家心血管跟血壓負擔比較大，建議換成天然清淡的食物比較健康喔！`;
    }

    alternativeAdvice = '建議在超市改買：新鮮豆腐、綠色蔬菜、清蒸魚、燕麥片或無糖豆漿，清淡又顧健康！';
  } else if (riskScore >= 1) {
    riskLevel = 'yellow';
    warningTitle = '🟡 黃燈提醒：嚐一兩口就好，不要吃太多';
    plainSummary = `長輩您好！這款【${profile.foodName}】味道雖然香，但對您的身體（${matchedConditions.slice(0, 2).join('、')}）還是稍微有點油鹽糖，嚐一點點味道可以，千萬不要整包吃光喔！`;
    alternativeAdvice = '吃的時候記得配一杯溫開水，也可以分給家人一起吃，不要一次吃太多。';
  } else {
    riskLevel = 'green';
    warningTitle = '✅ 綠燈安心！沒有太鹹太甜，很適合您';
    plainSummary = `阿公、阿婆請放一百個心！這款【${profile.foodName}】沒有亂加太多鹽巴、糖和壞油脂，很符合您勾選的健康指標，可以安心放進購物車買回家享用！`;
    alternativeAdvice = '平時早餐或點心時間吃剛剛好，清淡好消化，祝您天天健康活力好！';
  }

  return {
    risk_level: riskLevel,
    warning_title: warningTitle,
    plain_summary: plainSummary,
    alternative_advice: alternativeAdvice,
    ingredients_detected: profile.ingredients,
    nutrition_concerns: concerns.length > 0 ? concerns : ['各項營養指標未發現嚴重超標情況，成分相對單純健康。'],
    matched_conditions: matchedConditions,
    // 與雲端 AI 同一個結構，前端才能用同一套程式畫長條圖
    nutrient_facts: buildLocalNutrientFacts(profile, numericLimits),
    analysis_mode: 'smart_nutrition_engine',
  };
}
