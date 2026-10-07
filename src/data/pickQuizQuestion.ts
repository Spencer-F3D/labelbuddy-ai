/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 挑一題測驗題（Pick a quiz question）
 * ============================================================================
 * 【這個檔案負責回答一個問題】
 *   「這張標籤、這個使用者，現在該出哪一題？」
 *
 * 【★ 最關鍵的一條規則：通用題不算「題庫有對應的題」】
 *   內建 60 題裡有 19 題是**通用題**（`labelKeys: []`，任何標籤都能出）。
 *   如果把通用題也算成「有題」，那麼：
 *     → AI 生成**永遠不會被觸發**（因為永遠挑得到通用題）
 *     → 整個功能退化成「固定 60 題輪播」，與「針對這張標籤出題」的初衷相反
 *   所以呼叫端要先用 `requireMatch: true` 問一次「有沒有真正相關的題」，
 *   沒有才去請 AI；AI 失敗時才用 `requireMatch: false` 取通用題當後備。
 *
 * 【為什麼「內建題優先於 AI 題」】
 *   內建題是人工寫的，品質有保證；AI 題是即時生成的，只能靠驗證把關。
 *   同分時先給內建題 —— 品質優先。
 *
 * 【純函式】
 *   不碰網路、不碰 localStorage、不依賴呼叫順序。所以可以單獨驗證。
 */

import type { QuizQuestion, LabelKey } from '../types';

export interface PickInput {
  /** 題目池（內建題 ＋ 手機題庫的合併結果） */
  pool: QuizQuestion[];
  /** 這張標籤上的營養素，**依 `nutrient_facts` 的順序**（越前面越重要） */
  facts: LabelKey[];
  /** 已答過／已顯示過的 id，不得重複出題 */
  excludeIds: string[];
  /**
   * `true` ＝只接受「`labelKeys` 與 `facts` 有交集」的題。
   * 呼叫端用這個參數區分「題庫真的沒有相關的題」（要去請 AI）
   * 與「連通用題都可以」（AI 失敗時的後備）。
   */
  requireMatch?: boolean;
}

/**
 * 排序權重（越小越優先）。
 *   0 = 命中標籤的內建題　1 = 命中標籤的 AI 題
 *   2 = 通用內建題　　　　3 = 通用 AI 題
 *   99 = 不採用
 */
function rank(q: QuizQuestion, facts: LabelKey[], requireMatch: boolean): number {
  const matched = q.labelKeys.some((k) => facts.includes(k));
  if (matched) return q.source === 'builtin' ? 0 : 1;
  if (requireMatch) return 99;
  // 只有 labelKeys 為空的才算通用題（有 labelKeys 但沒命中 → 不相關，不用）
  if (q.labelKeys.length === 0) return q.source === 'builtin' ? 2 : 3;
  return 99;
}

/** 命中標籤中最早出現的那個營養素的索引（越小＝越重要）；沒命中回一個大數 */
function earliestFactIndex(q: QuizQuestion, facts: LabelKey[]): number {
  let best = 999;
  for (const k of q.labelKeys) {
    const i = facts.indexOf(k);
    if (i !== -1 && i < best) best = i;
  }
  return best;
}

/**
 * 挑一題。
 *
 * @returns `null` ＝挑不到（呼叫端據此決定「請 AI 生成」或「只顯示知識卡」）
 */
export function pickQuizQuestion({
  pool,
  facts,
  excludeIds,
  requireMatch = false,
}: PickInput): QuizQuestion | null {
  const excluded = new Set(excludeIds);
  let best: QuizQuestion | null = null;
  let bestRank = 99;
  let bestFactIdx = 999;

  for (const q of pool) {
    if (excluded.has(q.id)) continue;
    const r = rank(q, facts, requireMatch);
    if (r === 99) continue;
    const fi = earliestFactIndex(q, facts);
    if (r < bestRank || (r === bestRank && fi < bestFactIdx)) {
      best = q;
      bestRank = r;
      bestFactIdx = fi;
    }
  }

  return best;
}
