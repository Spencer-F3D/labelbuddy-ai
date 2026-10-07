/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 手機端題庫（Local quiz bank）
 * ============================================================================
 * 【這是什麼】
 *   AI 生成的題目會存在手機裡，下次遇到同一類標籤就不用再花 AI 額度生成。
 *   內建 60 題是「隨 App 版本走」的，這裡存的是**後來長出來的那些**。
 *
 * 【★ 第一階段的範圍（使用者決定的兩階段交付）】
 *   第一階段：只有**本機**題庫（這個檔案）。
 *   第二階段：加上「線上題庫（Cloudflare KV）＋ 跨裝置同步」——
 *            屆時這裡會多一個 `syncQuizBank()`，其餘不變。
 *
 *   → 所以現在 AI 生成的題**只存在這台手機**，不會跨裝置累積。
 *     這是刻意的取捨（先把卡片做出來並上線，再處理基礎設施）。
 *
 * 【⚠️ 為什麼要有 `subscribe`】
 *   「學一個小知識」生成一題之後會寫進題庫；
 *   食育學堂的題目清單也吃同一份題庫（第二階段）。
 *   兩者要能在題庫更新時重繪 —— 用一個極簡的訂閱機制，
 *   而不是讓每個元件各自輪詢 localStorage。
 *
 * 【⚠️ 儲存鍵以 `labelbuddy` 開頭】
 *   「清除所有資料」是前綴掃描，這個鍵會被自動清掉。
 */

import type { QuizQuestion } from '../types';

export const QUIZ_BANK_KEY = 'labelbuddy_quiz_bank_v1';

export interface LocalQuizBank {
  /** 最後一次合併的版本（第二階段與線上題庫比對用；第一階段恆為 0 或本機序號） */
  version: number;
  questions: QuizQuestion[];
}

/**
 * 題庫上限。
 *
 * 【為什麼要有上限】
 *   AI 生成的題會一直被寫進 localStorage（容量有限，約 5 MB），
 *   而且沒有任何機制會刪除它們。沒有上限的話，長期使用會：
 *     ① 佔滿 localStorage → `saveQuizBank` 開始靜默失敗（使用者不會知道）
 *     ② 每次挑題都要掃過整個題庫
 *   500 題對這個 App 的使用情境來說遠超過夠用（一天掃 3 包也要半年）。
 *   超過就**不再寫入新的**，但既有的照樣可用。
 */
const MAX_BANK_QUESTIONS = 500;

/** 記憶體快取：避免每次挑題都 JSON.parse 整個題庫 */
let cache: LocalQuizBank | null = null;

const subscribers = new Set<() => void>();

/** 訂閱題庫變更（回傳取消訂閱的函式） */
export function subscribeQuizBank(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

function emit(): void {
  for (const fn of subscribers) {
    try {
      fn();
    } catch {
      /* 單一訂閱者出錯不該影響其他人 */
    }
  }
}

export function loadQuizBank(): LocalQuizBank {
  if (cache) return cache;
  const empty: LocalQuizBank = { version: 0, questions: [] };
  try {
    const raw = localStorage.getItem(QUIZ_BANK_KEY);
    if (!raw) {
      cache = empty;
      return cache;
    }
    const parsed = JSON.parse(raw) as Partial<LocalQuizBank>;
    cache = {
      version: typeof parsed.version === 'number' ? parsed.version : 0,
      questions: Array.isArray(parsed.questions) ? (parsed.questions as QuizQuestion[]) : [],
    };
  } catch {
    // 壞資料不該讓整個 App 掛掉 —— 直接當成空題庫
    cache = empty;
  }
  return cache;
}

export function saveQuizBank(bank: LocalQuizBank): void {
  cache = bank;
  try {
    localStorage.setItem(QUIZ_BANK_KEY, JSON.stringify(bank));
  } catch {
    /* 無痕模式或容量不足時靜默失敗：功能退化為「這次可用」，不影響其他部分 */
  }
}

/** 目前題庫裡的題目（給挑題用） */
export function getBankQuestions(): QuizQuestion[] {
  return loadQuizBank().questions;
}

export function getBankVersion(): number {
  return loadQuizBank().version;
}

/**
 * 把新題目併進題庫（以 id 去重）。
 *
 * ⚠️ 以 `id` 去重而不是以內容 —— AI 生成題的 id 是**題目內容的雜湊**
 *    （見 `server/quizValidate.ts`），所以同一題重複生成會得到同一個 id，
 *    不會在題庫裡長出兩份。
 *
 * @returns 實際新增了幾題（0 ＝全部都已存在）
 */
export function mergeIntoBank(incoming: QuizQuestion[], version?: number): number {
  if (!Array.isArray(incoming) || incoming.length === 0) {
    if (typeof version === 'number') {
      const bank = loadQuizBank();
      if (version > bank.version) saveQuizBank({ ...bank, version });
    }
    return 0;
  }

  const bank = loadQuizBank();
  const byId = new Map(bank.questions.map((q) => [q.id, q]));
  let added = 0;
  for (const q of incoming) {
    if (!q || typeof q.id !== 'string') continue;
    if (byId.has(q.id)) continue;
    if (byId.size >= MAX_BANK_QUESTIONS) break;
    byId.set(q.id, q);
    added++;
  }

  if (added === 0 && typeof version !== 'number') return 0;

  saveQuizBank({
    version: Math.max(bank.version, version ?? bank.version),
    questions: [...byId.values()],
  });
  if (added > 0) emit();
  return added;
}
