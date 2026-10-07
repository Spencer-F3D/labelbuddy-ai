/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 「學一個小知識」知識卡映射檢查（Learn-from-scan mapping guard）
 * ============================================================================
 * 【這支要抓的 bug —— 它真的發生過】
 *   桌面上的 `LabelBuddyAI_P1_spec.typ`（另一個 AI 寫的規格）§4 把
 *   「鈉／鹽分風險」與「添加糖風險」都映射到知識**主題** `sodium_sugar`。
 *
 *   但 `KNOWLEDGE_CARDS` 實際只有 4 個主題（basics／dangers／profiles／shopping），
 *   **`sodium_sugar` 與 `reading` 一張卡都沒有**（只有題目）。
 *
 *   → 後果：**鈉超標（最常見的情況）什麼都不會顯示**，
 *     而在飽和脂肪與過敏原那兩條路徑上卻看起來完全正常。
 *     不報錯、不當機、TypeScript 也檢查不到 —— 教科書級的靜默失敗。
 *
 * 【這支怎麼驗】
 *   ① 靜態：`LEARN_CARD_MAP` 的每個 cardId 都真的存在於 `KNOWLEDGE_CARDS`
 *      （驗的是**執行期真正在用的那一份表**，不是複本）
 *   ② 行為：對「8 種身分 × 4 種情境」實際呼叫 `pickLearningCard()`，
 *      斷言**永遠不會回 null**、且回傳的 cardId 一定存在
 *   ③ 對照：`KNOWLEDGE_CARDS` 每一張卡都要有英文對照
 *      （缺了 → `localizeCard()` 安全退回中文 → 英文介面漏中文，而且不會報錯）
 *
 * 用法：npm run check:learn
 * 退出碼 0 = 全部通過；1 = 有問題
 */

import { KNOWLEDGE_CARDS } from '../src/data/educationContent';
import { KNOWLEDGE_CARDS_EN } from '../src/data/educationContentEn';
import { LEARN_CARD_MAP, pickLearningCard } from '../src/utils/learnFromScan';
import { PROFILE_AGE_ORDER } from '../src/data/learnerProfiles';
import type { LabelAnalysisResult, LearnerProfileId, NutrientFact } from '../src/types';

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    pass++;
    console.log(`✅ ${name}`);
  } else {
    fail++;
    console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const CARD_IDS = new Set(KNOWLEDGE_CARDS.map((c) => c.id));

/** 造一個最小可用的分析結果（只填這支函式真的會讀的欄位） */
function makeResult(
  facts: Array<Partial<NutrientFact> & { name: string }>,
  matched: string[] = [],
  risk: LabelAnalysisResult['risk_level'] = 'yellow'
): LabelAnalysisResult {
  return {
    risk_level: risk,
    warning_title: 't',
    plain_summary: 's',
    alternative_advice: 'a',
    nutrient_facts: facts.map((f) => ({
      name: f.name,
      value: f.value ?? 100,
      unit: f.unit ?? '毫克',
      dailyLimit: f.dailyLimit ?? 2000,
      percent: f.percent ?? 50,
      direction: f.direction ?? 'limit',
    })) as NutrientFact[],
    matched_conditions: matched,
  };
}

console.log('='.repeat(72));
console.log('「學一個小知識」知識卡映射檢查');
console.log('='.repeat(72));

/* ── 0. 資料來源不為空（防假通過）──────────────────────────────────── */
console.log('\n── 0. 資料來源不為空 ──');
check(`KNOWLEDGE_CARDS 有卡片（實際 ${KNOWLEDGE_CARDS.length} 張）`, KNOWLEDGE_CARDS.length > 0);
check(
  `LEARN_CARD_MAP 有映射（實際 ${Object.keys(LEARN_CARD_MAP).length} 項）`,
  Object.keys(LEARN_CARD_MAP).length > 0
);

/* ── 1. ★ 每個映射目標都真的存在（這就是 P1 的 bug 類型）──────────── */
console.log('\n── 1. ★ 映射目標必須真的存在於 KNOWLEDGE_CARDS ──');
{
  const bad = Object.entries(LEARN_CARD_MAP)
    .filter(([, cardId]) => !CARD_IDS.has(cardId))
    .map(([reason, cardId]) => `${reason} → ${cardId}`);
  check('所有映射目標都是真實的卡片 id', bad.length === 0, bad.join(' / '));

  for (const [reason, cardId] of Object.entries(LEARN_CARD_MAP)) {
    const card = KNOWLEDGE_CARDS.find((c) => c.id === cardId);
    console.log(`   ℹ️  ${reason.padEnd(9)} → ${cardId.padEnd(16)}「${card?.title ?? '（不存在）'}」`);
  }
}

/* ── 2. 順帶記錄：哪些主題沒有卡片（解釋為什麼不能用「主題」映射）── */
console.log('\n── 2. 主題的卡片分佈（說明為何不能用主題映射）──');
{
  const byTopic = new Map<string, number>();
  for (const c of KNOWLEDGE_CARDS) byTopic.set(c.topic, (byTopic.get(c.topic) ?? 0) + 1);
  const emptyTopics = ['basics', 'reading', 'dangers', 'sodium_sugar', 'profiles', 'shopping'].filter(
    (t) => !byTopic.has(t)
  );
  console.log(
    '   ℹ️  ' +
      [...byTopic.entries()].map(([t, n]) => `${t}:${n}`).join('、') +
      `　｜　**沒有卡片的主題**：${emptyTopics.join('、') || '（無）'}`
  );
  check(
    '已記錄「沒有卡片的主題」（提醒後人不要用主題做映射）',
    emptyTopics.length > 0 || byTopic.size === 6
  );
}

/* ── 3. ★ 行為驗證：8 身分 × 5 情境，永遠不得回 null ───────────────── */
console.log('\n── 3. ★ 8 身分 × 5 情境：永遠挑得到卡、且卡片存在 ──');
{
  const FIXTURES: Array<{ label: string; result: LabelAnalysisResult; conditions: string[] }> = [
    {
      label: '鈉超標',
      result: makeResult([{ name: '鈉', percent: 118 }], [], 'red'),
      conditions: [],
    },
    {
      label: '糖超標',
      result: makeResult([{ name: '添加糖', percent: 90 }], [], 'yellow'),
      conditions: [],
    },
    {
      label: '勾了花生過敏 ＋ 標籤命中',
      result: makeResult([{ name: '鈉', percent: 40 }], ['花生堅果過敏 (絕對不能吃)'], 'red'),
      conditions: ['peanut_allergy'],
    },
    {
      /**
       * ★★ 這一格是**回歸斷言**（2026-10-07 實測抓到的 bug）。
       *
       * 雲端 AI 會**自願**回報產品含有的過敏原，即使使用者沒勾任何過敏：
       *   實測示範拉麵（高血壓＋糖尿病）回的是
       *   ["高血壓（鈉超標）", "糖尿病（糖與精製碳水）",
       *    "心血管風險（高鈉與高油）", "過敏原：小麥、大豆、花生、牛肉"]
       * 舊寫法（看 matched_conditions 含不含「過敏」）會被這一行劫持，
       * 把**鈉 118%** 這個真正的紅燈原因擠掉 → 教錯優先序。
       */
      label: '★ AI 自願回報過敏原（使用者沒勾過敏）',
      result: makeResult(
        [{ name: '鈉', percent: 118 }],
        ['高血壓（鈉超標）', '糖尿病（糖與精製碳水）', '過敏原：小麥、大豆、花生、牛肉'],
        'red'
      ),
      conditions: ['hypertension', 'diabetes'],
    },
    {
      label: '綠燈（沒事）',
      result: makeResult([], [], 'green'),
      conditions: [],
    },
  ];

  const problems: string[] = [];
  let combos = 0;
  for (const profileId of PROFILE_AGE_ORDER) {
    for (const fx of FIXTURES) {
      combos++;
      const got = pickLearningCard(fx.result, profileId, fx.conditions);
      if (!got) {
        problems.push(`${profileId} × ${fx.label} → null`);
        continue;
      }
      if (!CARD_IDS.has(got.cardId)) {
        problems.push(`${profileId} × ${fx.label} → 不存在的 id ${got.cardId}`);
      }
    }
  }
  check(`${combos} 種組合都挑到真實存在的卡片`, problems.length === 0, problems.slice(0, 6).join(' / '));
  console.log(`   ℹ️  身分 ${PROFILE_AGE_ORDER.length} 種 × 情境 ${FIXTURES.length} 種 = ${combos} 組合`);
}

/* ── 4. ★ 關鍵觸發必須對到正確的卡（不是「隨便挑一張」）──────────── */
console.log('\n── 4. ★ 關鍵觸發的對應正確性 ──');
{
  const sodium = pickLearningCard(makeResult([{ name: '鈉', percent: 118 }], [], 'red'), 'senior');
  check(
    '鈉超標 → card-dangers-1（鈉：藏在湯裡的隱形殺手）',
    sodium?.cardId === 'card-dangers-1' && sodium?.reason === 'sodium',
    `實際 ${sodium?.cardId} / ${sodium?.reason}`
  );

  const allergen = pickLearningCard(
    makeResult([{ name: '鈉', percent: 40 }], ['海鮮過敏 (吃了會起疹)'], 'red'),
    'senior',
    ['seafood_allergy']
  );
  check(
    '勾了海鮮過敏 ＋ 標籤命中 → 過敏原優先於鈉（card-shopping-5）',
    allergen?.cardId === 'card-shopping-5' && allergen?.reason === 'allergen',
    `實際 ${allergen?.cardId} / ${allergen?.reason}`
  );

  // 乳糖不耐的條件名稱是「乳糖不耐」、本機訊息是「牛奶乳糖 (容易拉肚子)」，
  // 兩者不是彼此的子字串 —— 這正是不能靠字串猜、要看使用者勾了什麼的原因。
  const lactose = pickLearningCard(
    makeResult([], ['牛奶乳糖 (容易拉肚子)'], 'yellow'),
    'senior',
    ['lactose_intolerance']
  );
  check('勾了乳糖不耐 → card-shopping-5', lactose?.cardId === 'card-shopping-5', `實際 ${lactose?.cardId}`);

  /**
   * ★★ 回歸斷言：使用者**沒勾**過敏時，AI 自願回報的過敏原不得劫持卡片。
   *    這是 2026-10-07 端到端檢查抓到的真實 bug（見第 3 節的 fixture 說明）。
   */
  const volunteered = pickLearningCard(
    makeResult(
      [{ name: '鈉', percent: 118 }],
      ['高血壓（鈉超標）', '糖尿病（糖與精製碳水）', '過敏原：小麥、大豆、花生、牛肉'],
      'red'
    ),
    'senior',
    ['hypertension', 'diabetes']
  );
  check(
    '★★ 沒勾過敏時，AI 自願回報的「過敏原：…」不得劫持卡片（應為鈉）',
    volunteered?.cardId === 'card-dangers-1',
    `實際 ${volunteered?.cardId}（若是 card-shopping-5 就是回歸了）`
  );

  // 英文模式：nutrient_facts 的名稱會是 'Sodium'（translateLocalResult 造成的）
  const englishName = pickLearningCard(makeResult([{ name: 'Sodium', percent: 118 }], [], 'red'), 'senior');
  check(
    '英文名 "Sodium" 也能對到（靠 canonicalNutrientName 還原）',
    englishName?.cardId === 'card-dangers-1',
    `實際 ${englishName?.cardId}`
  );

  const fitness = pickLearningCard(makeResult([{ name: '蛋白質', percent: 60 }], [], 'green'), 'fitness');
  check('健身身分 → card-profiles-3', fitness?.cardId === 'card-profiles-3', `實際 ${fitness?.cardId}`);
}

/* ── 5. ★ 每張知識卡都有英文對照 ─────────────────────────────────── */
console.log('\n── 5. ★ 每張知識卡都有英文對照 ──');
{
  const missing = KNOWLEDGE_CARDS.filter((c) => !KNOWLEDGE_CARDS_EN[c.id]).map((c) => c.id);
  check('沒有缺英文對照的卡片', missing.length === 0, missing.slice(0, 8).join(', '));

  const ids = new Set(KNOWLEDGE_CARDS.map((c) => c.id));
  const orphans = Object.keys(KNOWLEDGE_CARDS_EN).filter((id) => !ids.has(id));
  check('KNOWLEDGE_CARDS_EN 沒有孤兒鍵', orphans.length === 0, orphans.slice(0, 8).join(', '));
}

/* ── 總結 ───────────────────────────────────────────────────────────── */
console.log('\n' + '='.repeat(72));
console.log(`結果：${pass} 項通過 / ${fail} 項有問題`);
if (fail > 0) {
  console.log('\n❌ 驗證失敗。上面每一項都會導致「不報錯但卡片不出現」，請修正後再繼續。');
}
process.exit(fail > 0 ? 1 : 0);
