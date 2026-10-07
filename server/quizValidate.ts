/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * AI 生成題目的嚴格驗證（Quiz validation）
 * ============================================================================
 * 【這是四道防線的第二道】
 *   提示詞（第一道）只能「要求」模型照規矩來，不能「保證」。
 *   免費模型不一定聽話，而**一道教錯的題目會被使用者直接記住**。
 *   所以在這裡把關：任何一項不合就**整題丟棄**，退回內建題。
 *
 * 【⚠️ 為什麼 `en` 是必填，不是「有就好」】
 *   `localizeQuestion()` 原本靠一張以 id 查表的英文對照表。
 *   AI 生成的新題沒有 id 在表裡 → 查不到 → **安全退回中文原文**
 *   → 英文介面出現中文題目，而且**不會報錯**。
 *   而競賽章程明訂「未使用英文可不予評審」。
 *   → 所以「沒有 en」＝不合格，直接丟棄。這不是嚴格，是必要。
 *
 * 【⚠️ 這個檔案不能 import `node:crypto`】
 *   它會在 Cloudflare Worker 裡執行，Worker 沒有 Node 的 crypto 模組。
 *   所以 id 用自己實作的 djb2 雜湊（見下）。
 */

import type { QuizQuestion, QuizQuestionText, LabelKey, KnowledgeTopic } from '../src/types';
import { LABEL_TO_TOPIC } from '../src/data/labelKeys';
import { QUIZ_QUESTIONS } from '../src/data/educationContent';
import { pickQuizQuestion } from '../src/data/pickQuizQuestion';

const TOPICS: KnowledgeTopic[] = [
  'basics',
  'reading',
  'dangers',
  'sodium_sugar',
  'profiles',
  'shopping',
];

/** 題目／選項／詳解的最短長度。太短幾乎一定是模型輸出被截斷。 */
const MIN_TEXT = 4;

/** 選項的長度上限。太長會在卡片上折行、把版面撐開。 */
const MAX_OPTION = 40;
/** 題目與詳解的長度上限（防止模型長篇大論）。 */
const MAX_QUESTION = 120;
const MAX_EXPLANATION = 260;

function cleanText(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length >= MIN_TEXT ? s : null;
}

/** 驗一組「題目／3 選項／詳解」，通過回傳正規化後的字串，不通過回 null */
function normalizeText(raw: any): QuizQuestionText | null {
  const question = cleanText(raw?.question);
  const explanation = cleanText(raw?.explanation);
  if (!question || !explanation) return null;
  if (question.length > MAX_QUESTION || explanation.length > MAX_EXPLANATION) return null;

  if (!Array.isArray(raw?.options) || raw.options.length !== 3) return null;
  const options: string[] = [];
  for (const o of raw.options) {
    const s = cleanText(o);
    if (!s) return null;
    if (s.length > MAX_OPTION) return null;
    options.push(s);
  }
  // 選項必須互不重複 —— 重複的選項會讓「正確答案」變成兩個
  if (new Set(options).size !== options.length) return null;

  return { question, options, explanation };
}

/**
 * 穩定短雜湊（djb2）。
 *
 * 【為什麼用「題目內容」當 id 而不是隨機字串】
 *   同一題被重複生成時（不同裝置、不同次），內容雜湊會得到**同一個 id**
 *   → 題庫不會累積重複題，`excludeIds` 也才擋得住。
 *   隨機 id 會讓題庫無聲地長出一堆一樣的題目。
 *
 * ⚠️ 不用 `node:crypto` —— Worker 沒有那個模組（見檔頭說明）。
 */
function shortHash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

/**
 * 把 AI 回的原始物件正規化成 `QuizQuestion`。
 *
 * @returns 通過驗證的題目；**任何一項不合格就回 `null`**（呼叫端必須退回內建題）
 */
export function normalizeQuizQuestion(
  data: any,
  labelKeys: LabelKey[]
): QuizQuestion | null {
  if (!data || typeof data !== 'object') return null;

  // ① 中文版
  const zh = normalizeText(data);
  if (!zh) return null;

  // ② correctIndex 必須是 0/1/2 的整數
  if (!Number.isInteger(data.correctIndex) || data.correctIndex < 0 || data.correctIndex > 2) {
    return null;
  }

  // ③ ★ 英文版必須存在且同樣合格（見檔頭說明）
  const en = normalizeText(data.en);
  if (!en) return null;

  // ④ topic：不合法就用營養素推一個後備（不因此丟棄整題 —— 那只是分類問題）
  const topic: KnowledgeTopic = TOPICS.includes(data.topic)
    ? data.topic
    : (LABEL_TO_TOPIC[labelKeys[0]] ?? 'basics');

  const id = `ai-${shortHash(`${zh.question}|${zh.options.join('|')}`)}`;

  return {
    id,
    topic,
    question: zh.question,
    options: zh.options,
    correctIndex: data.correctIndex,
    explanation: zh.explanation,
    labelKeys,
    source: 'ai',
    en,
  };
}

/**
 * 降級用：從**內建 60 題**裡挑一題。
 *
 * 先要求「有 labelKeys 交集」，真的沒有才放寬到通用題 ——
 * 這樣既不會出不相關的題，也保證卡片一定有內容。
 *
 * @returns `null` ＝連通用題都沒有（理論上不會，但呼叫端要處理）
 */
export function pickBuiltinFallback(
  labelKeys: LabelKey[],
  excludeIds: string[]
): QuizQuestion | null {
  const strict = pickQuizQuestion({
    pool: QUIZ_QUESTIONS,
    facts: labelKeys,
    excludeIds,
    requireMatch: true,
  });
  if (strict) return strict;

  // 放寬：允許通用題（labelKeys: []）。此時標籤已排除，避免又挑到同一題。
  return pickQuizQuestion({
    pool: QUIZ_QUESTIONS,
    facts: labelKeys,
    excludeIds,
    requireMatch: false,
  });
}
