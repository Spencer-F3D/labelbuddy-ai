/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 從掃描結果挑一張最相關的知識卡（Learn from scan）
 * ============================================================================
 * 【這是什麼】
 *   結果頁的「學一個小知識」卡片，上半部要顯示一張知識卡。
 *   這支純函式負責回答「**這一包**該學哪一張卡」。
 *
 * 【★ 為什麼回傳的是 `cardId` 而不是「主題」】
 *   原本的設計（見桌面上的 `LabelBuddyAI_P1_spec.typ` §4）是回傳**主題**，
 *   再由呼叫端取該主題的第一張卡。那個做法有一個**不會報錯的致命問題**：
 *
 *     `KNOWLEDGE_CARDS` 實際只有 4 個主題（basics 5、dangers 5、profiles 7、
 *     shopping 4），**`sodium_sugar` 與 `reading` 一張卡都沒有**（只有題目）。
 *     而 P1 把「鈉／鹽分風險」與「添加糖風險」都映射到 `sodium_sugar` ——
 *     於是**最常見的情況（鈉超標）什麼都不會顯示**，
 *     卻會在飽和脂肪與過敏原那兩條路徑上看起來完全正常。極難發現。
 *
 *   → 所以這裡回傳**明確的 cardId**，並且：
 *     ① 每個目標 id 都在 `scripts/check-learn-mapping.ts` 被斷言真的存在
 *     ② 最後還有一道 runtime 防線（找不到就回 null，不留空白卡片）
 *
 * 【零網路】
 *   純函式，只讀傳入的參數與已打包的靜態資料。
 *   所以「只在本機」模式也能用 —— 這正是它比 AI 生成更安全的地方。
 */

import type {
  LabelAnalysisResult,
  LearnerProfileId,
  LabelKey,
  NutrientFact,
} from '../types';
import { KNOWLEDGE_CARDS } from '../data/educationContent';
import { toLabelKey } from '../data/labelKeys';

/**
 * 觸發原因。純粹給測試與除錯用 ——
 * `scripts/check-learn-mapping.ts` 會逐項驗證每個 reason 都有對應且存在的卡片。
 */
export type LearnReason =
  | 'allergen'
  | 'sodium'
  | 'sugar'
  | 'fat'
  | 'fiber'
  | 'protein'
  | 'profile'
  | 'generic';

export interface LearnPick {
  cardId: string;
  reason: LearnReason;
}

/**
 * ★ 觸發原因 → 卡片 id 的**單一來源**。
 *
 * 【為什麼要 export 這張表，而不是寫散在函式裡】
 *   這張表是「P1 那類 bug」唯一會發生的地方 ——
 *   映射到一個**不存在的卡片 id**（或一個沒有卡的主題）就會靜默什麼都不顯示。
 *   把它 export 出來，`scripts/check-learn-mapping.ts` 才能驗證
 *   **執行期真正在用的那一份**，而不是驗一份複本（複本遲早會漂移）。
 *
 * ⚠️ `profile` 是動態的（依身分挑 `forProfiles` 命中的卡），所以不在這張表裡；
 *    它由 `profileCardId()` 處理，並在找不到時回退到 `generic`。
 */
export const LEARN_CARD_MAP: Record<Exclude<LearnReason, 'profile'>, string> = {
  allergen: 'card-shopping-5',
  sodium: 'card-dangers-1',
  sugar: 'card-dangers-2',
  fat: 'card-dangers-3',
  fiber: 'card-dangers-5',
  protein: 'card-profiles-3',
  generic: 'card-basics-1',
};

/**
 * 「這一項超過每日上限的幾 %」才值得教學。
 *
 * 80% 是刻意的：`normalizeNutrientFacts()` 已經濾掉 < 30% 的項目
 * （不值得佔用使用者的注意力），所以到這裡的每一項都有一定份量。
 * 取 80% 代表「已經接近或超過一天的量」——那才是真正需要理解原理的時刻。
 */
const HIGH_PERCENT = 80;

/** 膳食纖維低於這個百分比就值得教（它是「目標類」，越低越該注意） */
const LOW_FIBER_PERCENT = 50;

/**
 * 過敏原的判斷線索。
 *
 * 【⚠️ 為什麼不能只找「過敏」兩個字】
 *   本機引擎推的訊息對四種過敏原長得不一樣：
 *     「花生堅果過敏 (絕對不能吃)」  ← 有「過敏」
 *     「海鮮過敏 (吃了會起疹)」      ← 有「過敏」
 *     「牛奶乳糖 (容易拉肚子)」      ← **沒有「過敏」**
 *     「麵粉麩質 (肚子易脹氣)」      ← **沒有「過敏」**
 *   只找「過敏」會讓乳糖與麩質兩項永遠挑不到這張卡。
 *
 * ⚠️ 這是**字串線索**，不是結構化訊號（`matched_conditions` 的型別是 `string[]`）。
 *    誤判的代價很小：多顯示一張「過敏原怎麼看」的卡 ——
 *    對一個有食物限制的人來說，那張卡本來就有用。
 *    反之漏判只是落到別張卡。所以放寬是安全的，收窄才是風險。
 *
 * （原本的 P1 規格寫 `matched_conditions.some((c) => c.allergen)` ——
 *   `c` 是字串，`.allergen` 永遠是 `undefined`，那條分支**永遠不會觸發**。）
 */
const ALLERGEN_HINTS = [
  '過敏',
  '乳糖',
  '麩質',
  '牛奶',
  'allergy',
  'lactose',
  'gluten',
  'milk',
];

/** 依 canonical 名稱找 nutrient_fact（用 `toLabelKey`，吃得下英文名） */
function findFact(facts: NutrientFact[], key: LabelKey): NutrientFact | undefined {
  return facts.find((f) => toLabelKey(f.name) === key);
}

/** 這個 cardId 真的存在嗎（runtime 防線，避免渲染出空白卡片） */
function cardExists(cardId: string): boolean {
  return KNOWLEDGE_CARDS.some((c) => c.id === cardId);
}

/** 依身分挑一張「我的專屬眉角」卡（`forProfiles` 命中者優先） */
function profileCardId(profileId: LearnerProfileId): string | null {
  const hit = KNOWLEDGE_CARDS.find(
    (c) => c.topic === 'profiles' && c.forProfiles.includes(profileId)
  );
  return hit ? hit.id : null;
}

/**
 * 挑一張最相關的知識卡。
 *
 * @returns `null` ＝挑不到（呼叫端就不要渲染卡片，**不要留空白區塊**）
 *
 * 【判斷順序（由上往下，第一個命中就回）】
 *   1. 過敏原   —— 最安全關鍵，優先於一切
 *   2. 鈉       —— 最常見
 *   3. 添加糖
 *   4. 飽和脂肪
 *   5. 膳食纖維（目標類，不足時教）
 *   6. 蛋白質   —— 只有健身身分
 *   7. 依身分的專屬卡
 *   8. 通用卡（`card-basics-1`）
 *
 * ⚠️ **綠燈也會走到這裡**（使用者指定：綠燈也要顯示學習卡片）——
 *    綠燈時 1–6 通常都不會命中，所以會落在 7 或 8，
 *    教的是「你這個身分該注意什麼」或「怎麼看標籤」，語意仍然通順。
 *
 * ⚠️ 咖啡因（只有孕婦身分有）**刻意沒有專屬卡**，見下方第 6 段的說明。
 */
export function pickLearningCard(
  result: LabelAnalysisResult,
  profileId: LearnerProfileId
): LearnPick | null {
  const facts = Array.isArray(result.nutrient_facts) ? result.nutrient_facts : [];
  const matched = Array.isArray(result.matched_conditions) ? result.matched_conditions : [];

  const pick = (cardId: string, reason: LearnReason): LearnPick | null =>
    cardExists(cardId) ? { cardId, reason } : null;

  /* ── 1. 過敏原 ─────────────────────────────────────────────────────── */
  const allergenHit = matched.some((c) => {
    const s = String(c ?? '').toLowerCase();
    return ALLERGEN_HINTS.some((h) => s.includes(h.toLowerCase()));
  });
  if (allergenHit) {
    const p = pick(LEARN_CARD_MAP.allergen, 'allergen');
    if (p) return p;
  }

  /* ── 2. 鈉 ─────────────────────────────────────────────────────────── */
  const sodium = findFact(facts, '鈉');
  if (sodium && sodium.percent >= HIGH_PERCENT) {
    const p = pick(LEARN_CARD_MAP.sodium, 'sodium');
    if (p) return p;
  }

  /* ── 3. 添加糖 ─────────────────────────────────────────────────────── */
  const sugar = findFact(facts, '添加糖');
  if (sugar && sugar.percent >= HIGH_PERCENT) {
    const p = pick(LEARN_CARD_MAP.sugar, 'sugar');
    if (p) return p;
  }

  /* ── 4. 飽和脂肪 ───────────────────────────────────────────────────── */
  const satFat = findFact(facts, '飽和脂肪');
  if (satFat && satFat.percent >= HIGH_PERCENT) {
    const p = pick(LEARN_CARD_MAP.fat, 'fat');
    if (p) return p;
  }

  /* ── 5. 膳食纖維（目標類：不足才教）──────────────────────────────── */
  const fiber = findFact(facts, '膳食纖維');
  if (fiber && fiber.percent < LOW_FIBER_PERCENT) {
    const p = pick(LEARN_CARD_MAP.fiber, 'fiber');
    if (p) return p;
  }

  /**
   * ── 6. 咖啡因：**刻意不特別處理** ─────────────────────────────────
   *
   * 【為什麼不給它一張卡】
   *   咖啡因只出現在孕婦身分的 `numericLimits`，所以它真的會進 `nutrient_facts`。
   *   但 22 張知識卡裡**沒有任何一張在講咖啡因** ——
   *   硬套一張（例如「鈉：藏在湯裡的隱形殺手」）比不顯示更糟：
   *   使用者會以為那就是咖啡因的教學。
   *
   *   所以這裡讓它自然落到「依身分的專屬卡 → 通用卡」。
   *   ⚠️ 這是一個**已知的內容缺口**：建議日後補一張「咖啡因：不只藏在咖啡裡」
   *      （`topic: 'dangers'`、`forProfiles: ['pregnant', 'teen']`），
   *      補完之後把這一段改成回傳那張卡的 id 即可。
   *      `scripts/check-learn-mapping.ts` 會驗證新加的 id 真的存在。
   */

  /* ── 7. 蛋白質（健身身分）────────────────────────────────────────── */
  if (profileId === 'fitness') {
    const protein = findFact(facts, '蛋白質');
    if (protein) {
      const p = pick(LEARN_CARD_MAP.protein, 'protein');
      if (p) return p;
    }
  }

  /* ── 8. 依身分的專屬卡 ─────────────────────────────────────────────── */
  const byProfile = profileCardId(profileId);
  if (byProfile) {
    const p = pick(byProfile, 'profile');
    if (p) return p;
  }

  /* ── 9. 通用卡 ─────────────────────────────────────────────────────── */
  return pick(LEARN_CARD_MAP.generic, 'generic');
}
