/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 學習進度（Learning progress）
 * ============================================================================
 * 【為什麼要從 FoodEdClassroom.tsx 抽出來（2026-10-07）】
 *   結果頁的「學一個小知識」也要：
 *     · 讀「已答過哪些題」→ 不要重複出同一題
 *     · 寫「答了這一題」  → 食育學堂的進度統計要跟著更新
 *   兩邊必須共用**同一把儲存鍵**，否則「在結果頁答過的題」在學堂不算數。
 *
 *   放在元件檔裡的話，結果頁就得 import 整個 `FoodEdClassroom`（連帶 React
 *   與整個學堂元件），而且會變成兩份讀寫邏輯 —— 兩份遲早漂移。
 *
 * 【⚠️ 儲存鍵以 `labelbuddy` 開頭】
 *   「清除所有資料」是**前綴掃描**（`k.startsWith('labelbuddy')`），
 *   不是寫死清單（見 `ClearAllDataSection`）。所以這個鍵會被自動清掉。
 */

import type { LearningProgress, QuizAttempt } from '../types';

export const LEARNING_PROGRESS_KEY = 'labelbuddy_learning_progress_v1';

const EMPTY: LearningProgress = { readCardIds: [], attempts: [], lastVisitedAt: 0 };

/**
 * 讀取進度。
 *
 * ⚠️ 逐欄驗證，不是直接 `JSON.parse` 後就信任 ——
 *    舊版資料、被手動改壞的 localStorage、別的分支寫進去的格式都要能安全度過。
 *    任何一欄不對就用預設值，而不是讓整個學習功能掛掉。
 */
export function loadProgress(): LearningProgress {
  try {
    const raw = localStorage.getItem(LEARNING_PROGRESS_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<LearningProgress>;
    return {
      readCardIds: Array.isArray(parsed.readCardIds) ? parsed.readCardIds : [],
      attempts: Array.isArray(parsed.attempts) ? parsed.attempts : [],
      lastVisitedAt: typeof parsed.lastVisitedAt === 'number' ? parsed.lastVisitedAt : 0,
    };
  } catch {
    return { ...EMPTY };
  }
}

/** 寫入進度。無痕模式或儲存空間不足時靜默失敗，不影響學習功能。 */
export function saveProgress(progress: LearningProgress): void {
  try {
    localStorage.setItem(LEARNING_PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    /* 靜默失敗 */
  }
}

/** 已答過的題目 id（給「不要重複出題」用） */
export function getAnsweredQuestionIds(): string[] {
  return loadProgress().attempts.map((a) => a.questionId);
}

/**
 * 記錄一次作答，回傳新的進度物件（**不寫入**，由呼叫端決定何時存）。
 *
 * ⚠️ 抽成純函式是刻意的：`FoodEdClassroom` 與「學一個小知識」都要用它，
 *    而兩邊的 state 管理方式不同（一個是 useState、一個是即時讀寫）。
 *    回傳新物件讓兩種用法都成立。
 */
export function withAttempt(
  progress: LearningProgress,
  questionId: string,
  selectedIndex: number,
  isCorrect: boolean,
  now: number = Date.now()
): LearningProgress {
  const attempt: QuizAttempt = { questionId, selectedIndex, isCorrect, timestamp: now };
  return { ...progress, attempts: [...progress.attempts, attempt] };
}

/**
 * 標記「這張知識卡讀過了」。
 *
 * ⚠️ 用 `Set` 去重 —— 同一張卡讀兩次不該在進度裡算兩次
 *    （學堂的「已讀 N 張」是以 id 去重計算的）。
 */
export function withCardRead(progress: LearningProgress, cardId: string): LearningProgress {
  if (progress.readCardIds.includes(cardId)) return progress;
  return { ...progress, readCardIds: [...progress.readCardIds, cardId] };
}
