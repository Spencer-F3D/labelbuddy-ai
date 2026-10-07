/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 食育題庫完整性檢查（Quiz bank integrity）
 * ============================================================================
 * 【為什麼需要這支腳本】
 *   「學一個小知識」會拿題目的 `labelKeys` 去比對「這張標籤上有哪些營養素」。
 *   這個比對有三種**不會報錯**的失敗方式：
 *
 *     ① `labelKeys` 填了不在封閉值域裡的值
 *        → 永遠比對不到 → 該題形同不存在（而且沒有任何訊息）
 *     ② 內建題在 `QUIZ_QUESTIONS_EN` 沒有對應
 *        → `localizeQuestion()` 安全退回中文 → **英文介面靜默顯示中文題目**
 *        （競賽章程明訂「未使用英文可不予評審」）
 *     ③ `LABEL_KEYS` 與各身分 `numericLimits` 的鍵不一致
 *        → 某個營養素永遠挑不到知識卡與題目
 *
 *   這三種都不會當機、不會拋錯、TypeScript 也檢查不到（兩邊都只是字串）。
 *   所以用這支腳本把它們變成**機械保證**。
 *
 * 【⚠️ 這支不是「掃原始碼找線索」，是「載入真正的資料後斷言」】
 *   資料來源是 `QUIZ_QUESTIONS`、`QUIZ_QUESTIONS_EN`、`LABEL_KEYS`、
 *   各身分的 `numericLimits` —— 全部是執行期真實物件，不是字串比對。
 *
 * 用法：npm run check:quiz
 * 退出碼 0 = 全部通過；1 = 有問題
 */

import { QUIZ_QUESTIONS } from '../src/data/educationContent';
import { QUIZ_QUESTIONS_EN } from '../src/data/educationContentEn';
import { LABEL_KEYS, isLabelKey } from '../src/data/labelKeys';
import { getAllLearnerProfiles } from '../src/data/learnerProfiles';
import type { KnowledgeTopic } from '../src/types';

const TOPICS: KnowledgeTopic[] = [
  'basics',
  'reading',
  'dangers',
  'sodium_sugar',
  'profiles',
  'shopping',
];

let pass = 0;
let fail = 0;
const problems: string[] = [];

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    pass++;
    console.log(`✅ ${name}`);
  } else {
    fail++;
    console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`);
    problems.push(`${name}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('='.repeat(70));
console.log('食育題庫完整性檢查');
console.log('='.repeat(70));

/* ── 0. 基本數量（防「假通過」：資料來源空了也要看得出來）────────────── */
console.log('\n── 0. 資料來源不為空 ──');
check(`QUIZ_QUESTIONS 有題目（實際 ${QUIZ_QUESTIONS.length} 題）`, QUIZ_QUESTIONS.length > 0);
check(
  `QUIZ_QUESTIONS_EN 有對照（實際 ${Object.keys(QUIZ_QUESTIONS_EN).length} 筆）`,
  Object.keys(QUIZ_QUESTIONS_EN).length > 0
);
check(`LABEL_KEYS 有值（實際 ${LABEL_KEYS.length} 個）`, LABEL_KEYS.length > 0);

/* ── 1. 每題的結構 ──────────────────────────────────────────────────── */
console.log('\n── 1. 每題結構（3 選項／correctIndex／非空）──');
{
  const bad: string[] = [];
  for (const q of QUIZ_QUESTIONS) {
    const why: string[] = [];
    if (!Array.isArray(q.options) || q.options.length !== 3) why.push(`選項 ${q.options?.length} 個（應 3）`);
    if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 2)
      why.push(`correctIndex=${q.correctIndex}（應 0-2）`);
    if (Array.isArray(q.options)) {
      const nonEmpty = q.options.filter((o) => typeof o === 'string' && o.trim().length > 0);
      if (nonEmpty.length !== q.options.length) why.push('有空白選項');
      if (new Set(q.options.map((o) => (o ?? '').trim())).size !== q.options.length)
        why.push('選項有重複');
    }
    if (typeof q.question !== 'string' || q.question.trim().length < 4) why.push('題目太短或非字串');
    if (typeof q.explanation !== 'string' || q.explanation.trim().length < 4) why.push('詳解太短或非字串');
    if (why.length) bad.push(`${q.id}: ${why.join('；')}`);
  }
  check(`${QUIZ_QUESTIONS.length} 題結構合法`, bad.length === 0, bad.slice(0, 6).join(' / '));
}

/* ── 2. id 不重複 ───────────────────────────────────────────────────── */
console.log('\n── 2. id 不重複 ──');
{
  const ids = QUIZ_QUESTIONS.map((q) => q.id);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  check('沒有重複 id', dup.length === 0, dup.join(', '));
}

/* ── 3. topic 合法 ──────────────────────────────────────────────────── */
console.log('\n── 3. topic 在六個值之內 ──');
{
  const bad = QUIZ_QUESTIONS.filter((q) => !TOPICS.includes(q.topic)).map((q) => `${q.id}:${q.topic}`);
  check('所有 topic 合法', bad.length === 0, bad.slice(0, 6).join(', '));
}

/* ── 4. source 合法 ─────────────────────────────────────────────────── */
console.log('\n── 4. source 合法（內建題一律 builtin）──');
{
  const bad = QUIZ_QUESTIONS.filter((q) => q.source !== 'builtin').map((q) => `${q.id}:${q.source}`);
  check('所有內建題 source 都是 builtin', bad.length === 0, bad.slice(0, 6).join(', '));
}

/* ── 5. ★ labelKeys 全在封閉值域內 ─────────────────────────────────── */
console.log('\n── 5. ★ labelKeys 全在封閉值域內 ──');
{
  const bad: string[] = [];
  for (const q of QUIZ_QUESTIONS) {
    if (!Array.isArray(q.labelKeys)) {
      bad.push(`${q.id}: labelKeys 不是陣列`);
      continue;
    }
    const illegal = q.labelKeys.filter((k) => !isLabelKey(k));
    if (illegal.length) bad.push(`${q.id}: ${illegal.join('/')}`);
  }
  check('沒有非法 labelKey', bad.length === 0, bad.slice(0, 6).join(' / '));
  const withKeys = QUIZ_QUESTIONS.filter((q) => q.labelKeys?.length > 0).length;
  console.log(
    `   ℹ️  ${withKeys} 題有標籤對應、${QUIZ_QUESTIONS.length - withKeys} 題為通用題（labelKeys: []）`
  );
}

/* ── 6. ★ 中英兩版齊全（含反向孤兒）───────────────────────────────── */
console.log('\n── 6. ★ 中英兩版齊全 ──');
{
  const missing = QUIZ_QUESTIONS.filter((q) => !QUIZ_QUESTIONS_EN[q.id]).map((q) => q.id);
  check('每個內建題都有英文對照', missing.length === 0, missing.slice(0, 8).join(', '));

  const mismatched: string[] = [];
  for (const q of QUIZ_QUESTIONS) {
    const en = QUIZ_QUESTIONS_EN[q.id];
    if (!en) continue;
    if (!Array.isArray(en.options) || en.options.length !== q.options.length)
      mismatched.push(`${q.id}: 中文 ${q.options.length} 選項 / 英文 ${en.options?.length}`);
    if (typeof en.question !== 'string' || !en.question.trim()) mismatched.push(`${q.id}: 英文題目為空`);
    if (typeof en.explanation !== 'string' || !en.explanation.trim())
      mismatched.push(`${q.id}: 英文詳解為空`);
  }
  check('英文對照的選項數與內容都對得上', mismatched.length === 0, mismatched.slice(0, 6).join(' / '));

  // 反向：對照表不得有孤兒鍵（內建題刪了但英文沒刪）
  const ids = new Set(QUIZ_QUESTIONS.map((q) => q.id));
  const orphans = Object.keys(QUIZ_QUESTIONS_EN).filter((id) => !ids.has(id));
  check('QUIZ_QUESTIONS_EN 沒有孤兒鍵', orphans.length === 0, orphans.slice(0, 8).join(', '));
}

/* ── 7. ★ LABEL_KEYS 與各身分 numericLimits 的鍵一致 ──────────────── */
console.log('\n── 7. ★ LABEL_KEYS 與 numericLimits 一致 ──');
{
  /**
   * 為什麼要驗這一條：
   *   `nutrient_facts` 只會出現「查得到 numericLimits」的名稱
   *   （`normalizeNutrientFacts()` 會把查不到的整項濾掉）。
   *   所以若某個身分新增了 numericLimits 鍵而沒加進 LABEL_KEYS，
   *   那個營養素就永遠挑不到知識卡與題目 —— 而且不會報錯。
   */
  const union = new Set<string>();
  for (const p of getAllLearnerProfiles()) {
    for (const k of Object.keys(p.numericLimits ?? {})) union.add(k);
  }
  const missingInLabelKeys = [...union].filter((k) => !isLabelKey(k));
  const extraInLabelKeys = LABEL_KEYS.filter((k) => !union.has(k));

  check(
    'numericLimits 的每個鍵都在 LABEL_KEYS 內',
    missingInLabelKeys.length === 0,
    missingInLabelKeys.join(', ')
  );
  check(
    'LABEL_KEYS 沒有多餘的值（numericLimits 查不到）',
    extraInLabelKeys.length === 0,
    extraInLabelKeys.join(', ')
  );
  console.log(`   ℹ️  numericLimits 鍵的聯集：${[...union].join('、')}`);
}

/* ── 總結 ───────────────────────────────────────────────────────────── */
console.log('\n' + '='.repeat(70));
console.log(`結果：${pass} 項通過 / ${fail} 項有問題`);
if (fail > 0) {
  console.log('\n❌ 驗證失敗。上面每一項都會導致「不報錯但功能少一半」，請修正後再繼續。');
}
process.exit(fail > 0 ? 1 : 0);
