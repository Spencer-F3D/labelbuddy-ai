/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 學習者身分定義（Learner Profiles）
 * ============================================================================
 *
 * 本檔案定義四種學習者身分，每種身分都有自己的：
 *   1. 每日參考值（targets）      —— 判斷食品是否適合這位學習者
 *   2. 學習目標（learningObjectives） —— 教學內容要對齊的方向
 *   3. AI 角色語氣（aiPersona）    —— 雲端辨識時提示詞要採用的口吻
 *
 * 這個檔案同時被前端（學堂、身分選擇器）與後端（server.ts 組裝提示詞）使用，
 * 因此不得引入任何瀏覽器或 Node 專屬 API，必須保持為純資料模組。
 */

import type {
  LearnerProfile,
  LearnerProfileId,
  NutritionTarget,
  KnowledgeTopic,
} from '../types';

/* ---------------------------------------------------------------------------
 * 共用參考值片段
 * 不同身分會重用部分標準，抽出來避免各處數字不一致（來源：衛福部每日建議量）
 * ------------------------------------------------------------------------- */

/** 一般成人鈉上限：2000 毫克（約等於 5 公克食鹽） */
const SODIUM_STANDARD: NutritionTarget = {
  nutrient: '鈉',
  target: '2000 毫克',
  direction: 'limit',
  note: '約等於 5 公克食鹽，也就是一天一小匙的量',
};

/** 添加糖上限：不超過每日熱量的 10%，以 2000 大卡計約 50 公克 */
const SUGAR_STANDARD: NutritionTarget = {
  nutrient: '添加糖',
  target: '50 公克',
  direction: 'limit',
  note: '約等於 10 顆方糖，一杯全糖手搖飲就可能超標',
};

/** 飽和脂肪上限：不超過每日熱量的 10%，約 20 公克 */
const SAT_FAT_STANDARD: NutritionTarget = {
  nutrient: '飽和脂肪',
  target: '20 公克',
  direction: 'limit',
  note: '吃太多會讓血管裡的壞膽固醇變多',
};

/* ---------------------------------------------------------------------------
 * 兒童與青少年專用的參考值
 *
 * ⚠️ 這兩個身分的鈉與糖上限明顯低於成人，不能沿用 SODIUM_STANDARD。
 *    來源：衛福部國健署「國人膳食營養素參考攝取量」與兒科醫學會建議。
 *    以體重與熱量需求等比推算（兒童約成人 60%、青少年約成人 80%）。
 * ------------------------------------------------------------------------- */

/** 兒童（6～12 歲）鈉上限：約 1200 毫克 */
const CHILD_SODIUM: NutritionTarget = {
  nutrient: '鈉',
  target: '1200 毫克',
  direction: 'limit',
  note: '約等於 3 公克食鹽，只有大人的六成。小孩腎臟還在發育，吃太鹹負擔更大',
};

/** 兒童（6～12 歲）添加糖上限：約 25 公克 */
const CHILD_SUGAR: NutritionTarget = {
  nutrient: '添加糖',
  target: '25 公克',
  direction: 'limit',
  note: '約等於 5 顆方糖，一瓶含糖飲料就可能超過一半',
};

/** 青少年（13～18 歲）鈉上限：約 1600 毫克 */
const TEEN_SODIUM: NutritionTarget = {
  nutrient: '鈉',
  target: '1600 毫克',
  direction: 'limit',
  note: '約等於 4 公克食鹽。愛吃泡麵、鹽酥雞的年紀特別容易超標',
};

/** 青少年（13～18 歲）添加糖上限：約 40 公克 */
const TEEN_SUGAR: NutritionTarget = {
  nutrient: '添加糖',
  target: '40 公克',
  direction: 'limit',
  note: '約等於 8 顆方糖。一杯全糖手搖飲就直接超標',
};

/* ---------------------------------------------------------------------------
 * 六種身分
 * ------------------------------------------------------------------------- */

const PROFILES: LearnerProfile[] = [
  /* ======================= 1. 長者 ======================= */
  {
    id: 'senior',
    name: '長者',
    emoji: '👴',
    accent: 'blue',
    focusSummary: '吃得安心、不要讓血壓血糖飆高，也不希望被複雜的數字搞混',
    aiPersona: '像一位有耐心的家庭醫師助理，用最白話的方式說明，語氣溫暖不嚇人',
    aiFocus: '鈉含量、添加糖、飽和脂肪、膳食纖維',
    targets: [
      SODIUM_STANDARD,
      SUGAR_STANDARD,
      SAT_FAT_STANDARD,
      {
        nutrient: '膳食纖維',
        target: '25 公克',
        direction: 'target',
        note: '幫助腸胃蠕動，也能讓血糖上升得慢一點',
      },
    ],
    numericLimits: {
      鈉: { value: 2000, unit: '毫克' },
      添加糖: { value: 50, unit: '公克' },
      飽和脂肪: { value: 20, unit: '公克' },
      膳食纖維: { value: 25, unit: '公克' },
    },
    learningObjectives: [
      '看得懂包裝背後的「每 100 公克」與「每份」有什麼差別',
      '知道一天能吃多少鹽，並且能對照手上的食品',
      '認識鉀與磷這兩個和腎臟有關的礦物質',
      '學會在超市挑選成分表比較短的食品',
    ],
    recommendKeywords: ['低鈉', '無添加糖', '原味', '天然食材', '高纖'],
    preferredTopics: ['basics', 'dangers', 'profiles', 'shopping'],
  },

  /* ======================= 2. 兒童（6～12 歲） ======================= */
  {
    id: 'child',
    name: '兒童',
    emoji: '🧒',
    accent: 'sky',
    focusSummary: '想知道這個零食會不會影響發育，糖和添加物多不多，能不能常吃',
    aiPersona:
      '像一位親切的小兒科護理師在跟家長說明，用生活化的例子（方糖、飲料瓶）解釋，語氣溫柔不說教，避免恐嚇',
    aiFocus: '添加糖、鈉、食品添加物種類、鈣質、蛋白質',
    targets: [
      CHILD_SODIUM,
      CHILD_SUGAR,
      {
        nutrient: '鈣',
        target: '800 毫克',
        direction: 'target',
        note: '長骨頭的關鍵期，一杯牛奶約 240 毫克，一天兩杯就接近目標',
      },
      {
        nutrient: '蛋白質',
        target: '50 公克',
        direction: 'target',
        note: '發育需要，一顆蛋約 6 公克、一片雞胸約 20 公克',
      },
    ],
    numericLimits: {
      鈉: { value: 1200, unit: '毫克' },
      添加糖: { value: 25, unit: '公克' },
      鈣: { value: 800, unit: '毫克' },
      蛋白質: { value: 50, unit: '公克' },
    },
    learningObjectives: [
      '把「有幾公克糖」換算成「幾顆方糖」，建立具體的數量感',
      '認識成分表越短、看不懂的名字越少，通常越接近原型食物',
      '知道哪些零食是「偶爾吃」、哪些是「每天都可以」',
      '認識鈣質與長高的關係，知道牛奶、小魚乾、豆腐能補鈣',
    ],
    recommendKeywords: ['無添加糖', '低鈉', '高鈣', '原味', '成分單純'],
    preferredTopics: ['basics', 'dangers', 'shopping', 'profiles'],
  },

  /* ======================= 3. 青少年（13～18 歲） ======================= */
  {
    id: 'teen',
    name: '青少年',
    emoji: '🧑‍🎓',
    accent: 'violet',
    focusSummary: '想知道手搖飲、泡麵、宵夜怎麼選負擔比較小，會不會影響精神與發育',
    aiPersona:
      '像一位好聊的營養系大學生，用同儕語氣、明確講重點，不說教也不責備，給可執行的替代方案',
    aiFocus: '添加糖、咖啡因、鈉、鈣質、蛋白質、膳食纖維',
    targets: [
      TEEN_SODIUM,
      TEEN_SUGAR,
      {
        nutrient: '鈣',
        target: '1200 毫克',
        direction: 'target',
        note: '青春期是骨本存量的黃金期，這時補鈣的效果一輩子受用',
      },
      {
        nutrient: '蛋白質',
        target: '70 公克',
        direction: 'target',
        note: '發育與運動需求都高，一顆蛋約 6 公克',
      },
    ],
    numericLimits: {
      鈉: { value: 1600, unit: '毫克' },
      添加糖: { value: 40, unit: '公克' },
      鈣: { value: 1200, unit: '毫克' },
      蛋白質: { value: 70, unit: '公克' },
    },
    learningObjectives: [
      '看穿手搖飲的糖量：全糖、半糖、微糖各是幾顆方糖',
      '認識咖啡因對睡眠與隔天專注力的影響',
      '分辨「油炸」與「烘烤」零食的油脂差距',
      '在便利商店與速食店裡組出相對均衡的一餐',
    ],
    recommendKeywords: ['減糖', '無糖', '低鈉', '高鈣', '非油炸'],
    preferredTopics: ['basics', 'dangers', 'shopping', 'profiles'],
  },

  /* ======================= 4. 健身增肌 ======================= */
  {
    id: 'fitness',
    name: '健身增肌',
    emoji: '💪',
    accent: 'orange',
    focusSummary: '想知道這個產品蛋白質夠不夠、糖和熱量會不會拖累體態',
    aiPersona: '像一位務實的健身教練，用數據說話但避免艱澀術語，語氣直接有行動力',
    aiFocus: '蛋白質含量與熱量比、添加糖、麥芽糊精等隱藏碳水、鈉',
    targets: [
      {
        nutrient: '蛋白質',
        target: '100 公克',
        direction: 'target',
        note: '以 60 公斤成人、每公斤 1.6 公克估算，實際需求依訓練量調整',
      },
      SODIUM_STANDARD,
      SUGAR_STANDARD,
      {
        nutrient: '熱量',
        target: '依個人目標',
        direction: 'limit',
        note: '增肌期可拉高，減脂期需控制，重點是蛋白質與熱量的比例',
      },
    ],
    numericLimits: {
      蛋白質: { value: 100, unit: '公克' },
      鈉: { value: 2000, unit: '毫克' },
      添加糖: { value: 50, unit: '公克' },
    },
    learningObjectives: [
      '學會看「蛋白質 ÷ 熱量」的比例，不被正面的大字文案誤導',
      '認出麥芽糊精、玉米糖漿等隱藏的精緻碳水',
      '知道鈉在運動飲料與即食雞胸裡的實際含量',
      '辨別「高蛋白」宣稱與實際營養標示的落差',
    ],
    recommendKeywords: ['高蛋白', '低糖', '無糖', '原型食物', '低脂'],
    preferredTopics: ['basics', 'profiles', 'dangers', 'shopping'],
  },

  /* ======================= 5. 年輕人 ======================= */
  {
    id: 'takeout',
    name: '年輕人',
    emoji: '🍱',
    accent: 'emerald',
    focusSummary: '想知道便利商店與外送餐點裡，哪一個負擔比較小、怎麼搭配才均衡',
    aiPersona: '像一位懂外食眉角的朋友，務實不說教，用便利商店的實際情境舉例',
    aiFocus: '鈉、油脂品質、膳食纖維、蔬菜份量',
    targets: [
      SODIUM_STANDARD,
      SAT_FAT_STANDARD,
      {
        nutrient: '膳食纖維',
        target: '25 公克',
        direction: 'target',
        note: '外食最容易不足的一項，建議每餐至少一份蔬菜',
      },
      {
        nutrient: '蔬菜份量',
        target: '每餐 1 份',
        direction: 'target',
        note: '一份約等於一個拳頭大的熟菜',
      },
    ],
    numericLimits: {
      鈉: { value: 2000, unit: '毫克' },
      飽和脂肪: { value: 20, unit: '公克' },
      膳食纖維: { value: 25, unit: '公克' },
    },
    learningObjectives: [
      '在便利商店快速挑出負擔較小的組合',
      '看懂微波食品與湯品裡被忽略的鈉',
      '學會用「加一份蔬菜」的方式補足纖維',
      '分辨油炸、醬料與加工肉品帶來的隱藏油脂',
    ],
    recommendKeywords: ['少油', '高纖', '蒸煮', '原味', '減鈉'],
    preferredTopics: ['basics', 'shopping', 'dangers', 'profiles'],
  },

  /* ======================= 6. 學生 ======================= */
  {
    id: 'student',
    name: '學生',
    emoji: '🎓',
    accent: 'purple',
    focusSummary: '想知道零食飲料怎麼選、會不會影響發育與上課精神，而且要在預算內',
    aiPersona: '像一位親切的學長姊，用有趣好懂的方式講解，不說教也不責備',
    aiFocus: '添加糖、熱量、鈣質、蛋白質、咖啡因',
    targets: [
      SUGAR_STANDARD,
      {
        nutrient: '鈣',
        target: '1000 毫克',
        direction: 'target',
        note: '青春期骨骼發育的關鍵，一杯牛奶約 240 毫克',
      },
      {
        nutrient: '蛋白質',
        target: '60 公克',
        direction: 'target',
        note: '發育期建議量，一顆蛋約 6 公克',
      },
      SODIUM_STANDARD,
    ],
    numericLimits: {
      添加糖: { value: 50, unit: '公克' },
      鈣: { value: 1000, unit: '毫克' },
      蛋白質: { value: 60, unit: '公克' },
      鈉: { value: 2000, unit: '毫克' },
    },
    learningObjectives: [
      '算出飲料裡有幾顆方糖，建立具體的糖分概念',
      '認識鈣質與骨骼發育的關係，知道哪些食物能補鈣',
      '看懂咖啡因含量，避免影響睡眠與上課專注力',
      '在有限預算下做出比較好的零食選擇',
    ],
    recommendKeywords: ['無糖', '低糖', '高鈣', '原味', '天然'],
    preferredTopics: ['basics', 'dangers', 'shopping', 'profiles'],
  },
];

/* ---------------------------------------------------------------------------
 * 查詢工具
 * ------------------------------------------------------------------------- */

const PROFILE_MAP: Record<LearnerProfileId, LearnerProfile> = PROFILES.reduce(
  (acc, p) => {
    acc[p.id] = p;
    return acc;
  },
  {} as Record<LearnerProfileId, LearnerProfile>
);

/** 預設身分：未選擇時一律採長者（與舊版行為一致） */
export const DEFAULT_PROFILE_ID: LearnerProfileId = 'senior';

/** 取得指定身分的完整定義；傳入無效值時安全退回預設身分 */
export function getLearnerProfile(id?: string | null): LearnerProfile {
  if (id && Object.prototype.hasOwnProperty.call(PROFILE_MAP, id)) {
    return PROFILE_MAP[id as LearnerProfileId];
  }
  return PROFILE_MAP[DEFAULT_PROFILE_ID];
}

/** 取得全部身分（依固定順序，供選擇器渲染） */
/**
 * 取某個身分的「營養素方向」對照表（鈉 → limit、膳食纖維 → target）。
 *
 * 【為什麼需要這支，以及它修掉什麼 bug（2026-09-30）】
 *   `numericLimits` 只是一個 `名稱 → {value, unit}` 的表，**沒有方向資訊**。
 *   而後端的 `normalizeNutrientFacts()` 原本把**所有**項目都寫成
 *   `direction: 'limit'`（越低越好）—— 於是：
 *     膳食纖維 8 公克 → 顯示「每天上限 25 公克」（其實是「建議至少」）
 *     蛋白質 80 公克   → 顯示「每天上限 100 公克」＋警示色
 *   對健身族來說，那等於把「你該吃到的量」講成「你超標了」。
 *
 *   方向其實**已經存在**於 `targets`（`NutritionTarget.direction`），
 *   只是沒被攤平成查表用的物件。這支就是那個攤平 ——
 *   **單一真相來源仍然是 `targets`**，不要另外在 `numericLimits` 裡再寫一份。
 */
export function getNutrientDirections(
  id?: string | null
): Record<string, 'limit' | 'target'> {
  const out: Record<string, 'limit' | 'target'> = {};
  for (const t of getLearnerProfile(id).targets) {
    out[t.nutrient] = t.direction;
  }
  return out;
}

export function getAllLearnerProfiles(): LearnerProfile[] {  return PROFILES;
}

/** 判斷字串是否為有效的身分 ID */
export function isValidProfileId(id: unknown): id is LearnerProfileId {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(PROFILE_MAP, id);
}

/** 取得指定主題對應的身分名稱清單（用於知識卡標示） */
export function describeProfiles(ids: LearnerProfileId[]): string {
  if (ids.length === 0) return '所有身分';
  return ids.map((id) => PROFILE_MAP[id]?.name ?? id).join('、');
}

/** 主題的顯示名稱 */
export const TOPIC_LABELS: Record<KnowledgeTopic, string> = {
  basics: '讀標基本功',
  dangers: '三大危險成分',
  profiles: '我的專屬眉角',
  shopping: '聰明採買術',
};

/** 主題的固定顯示順序 */
export const TOPIC_ORDER: KnowledgeTopic[] = [
  'basics',
  'dangers',
  'profiles',
  'shopping',
];
