/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 線上題庫（Quiz bank）—— KV 儲存層
 * ============================================================================
 * 【這個檔案解決什麼問題】
 *   第一階段：AI 生成的題目只存在**那一台手機**的 localStorage
 *   → 換一台裝置就要重新生成，同樣的題再花一次免費額度。
 *
 *   第二階段：把生成過的題目存到 Cloudflare KV，
 *   其他裝置開啟時同步下來 —— 生成一次，所有裝置都能用。
 *
 * 【儲存格式】
 *   `q:<id>`      單題 JSON（`QuizQuestion` ＋ `createdAt`）
 *   `bank:index`  `{ version, updatedAt, items: [{ id, createdAt }] }`
 *
 *   ⚠️ `createdAt` 是**題目層級**的，不是整個題庫的。
 *      因為同步用的是 `GET /api/quiz-bank?since=<ms>` ——
 *      要能只回「上次同步之後新增的題」，就必須知道每一題各自的時間。
 *
 * 【★ 為什麼寫入要用 `list()` 而不是 read-modify-write】
 *   兩個使用者同時生成題目時：
 *     讀索引 → 各自加自己的 id → 各自寫回 → **後寫的把先寫的蓋掉**，
 *     先寫的那一題就永遠消失在索引裡（題目本體還在，但沒人找得到它）。
 *
 *   改成「先寫題目本體 → `list('q:')` 問 KV 現在到底有哪些 → 用那個寫索引」，
 *   兩個併發寫入各寫自己的 key，**id 不會永久遺失**。
 *   （最後寫索引的那一方會贏，但它寫的內容是 list 出來的完整清單。）
 *
 * 【★ 為什麼要能降級】
 *   `env.QUIZ_BANK` 不存在時（本機 `node server.ts`、或 binding 被拿掉），
 *   就不注入 `deps.quizBank` → handler 走「無題庫」分支：
 *   **仍然能用 AI 生成題目，只是不查也不寫**。
 *   功能不會壞，只失去線上題庫。這是刻意的設計。
 */

import type { QuizQuestion } from '../src/types';

/** KV 免費層：1000 writes/日；每次生成 = 3 writes。超過這個題數就不再寫入。 */
export const MAX_BANK_SIZE = 500;

export interface QuizBankItem {
  id: string;
  createdAt: number;
  /**
   * ★ 這一題對應的標籤（**複製**一份進索引，不是查題目本體）。
   *
   * 【為什麼要多存這一份】
   *   挑題時要問「題庫裡有沒有跟這次標籤對得上的題」。
   *   如果只能靠讀題目本體來判斷，每次請求就要讀**整個題庫**
   *   （上限 500 題 → 500 次 KV read）——
   *   KV 免費層一天 100,000 reads，這樣一天只能撐 200 次請求。
   *
   *   放進索引之後：**1 次 read 就能篩出候選**，再讀命中的那一題就好。
   *
   * ⚠️ 代價是「同一份資料存兩處」—— 索引與本體可能不一致。
   *    但 `labelKeys` 是**出題當下就固定**的內容（題目不會被改），
   *    所以不會有「改了本體忘了改索引」的問題。
   */
  labelKeys: string[];
}

export interface QuizBankIndex {
  version: number;
  updatedAt: number;
  items: QuizBankItem[];
}

/**
 * Cloudflare KV 的最小介面。
 *
 * ⚠️ 刻意用**結構型別**而不是 `import type { KVNamespace } from '@cloudflare/workers-types'`
 *    —— 引入那個套件會讓整個專案的型別環境跟著換一套，
 *    而我們只用到三個方法。少一個相依，少一個會壞的地方。
 */
export interface KvLike {
  get(key: string, type?: 'text'): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  list(options?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ keys: Array<{ name: string }>; list_complete: boolean; cursor?: string }>;
}

/** 題庫儲存介面。handler 只認這個，不認 KV。 */
export interface QuizBankStore {
  getQuestion(id: string): Promise<QuizQuestion | null>;
  putQuestion(question: QuizQuestion, createdAt: number): Promise<void>;
  /** 以 `list('q:')` 為權威來源列出所有題目 id */
  listQuestionIds(): Promise<string[]>;
  getIndex(): Promise<QuizBankIndex | null>;
  putIndex(index: QuizBankIndex): Promise<void>;
}

const QUESTION_PREFIX = 'q:';
const INDEX_KEY = 'bank:index';

/** 記憶體版（本機 `node server.ts` 用）—— 重啟即清，不影響功能 */
export function makeMemoryQuizBankStore(): QuizBankStore {
  const questions = new Map<string, string>();
  let index: QuizBankIndex | null = null;
  return {
    async getQuestion(id) {
      const raw = questions.get(QUESTION_PREFIX + id);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as QuizQuestion;
      } catch {
        return null;
      }
    },
    async putQuestion(question, createdAt) {
      questions.set(QUESTION_PREFIX + question.id, JSON.stringify({ ...question, createdAt }));
    },
    async listQuestionIds() {
      return [...questions.keys()]
        .filter((k) => k.startsWith(QUESTION_PREFIX))
        .map((k) => k.slice(QUESTION_PREFIX.length));
    },
    async getIndex() {
      return index;
    },
    async putIndex(next) {
      index = next;
    },
  };
}

/** KV 版（正式環境） */
export function makeQuizBankStore(kv: KvLike): QuizBankStore {
  return {
    async getQuestion(id) {
      try {
        const raw = await kv.get(QUESTION_PREFIX + id, 'text');
        if (!raw) return null;
        return JSON.parse(raw) as QuizQuestion;
      } catch (e) {
        console.warn('[quizBank] 讀取題目失敗:', e);
        return null;
      }
    },

    async putQuestion(question, createdAt) {
      // ⚠️ createdAt 只存在這裡，不進 `QuizQuestion` 型別 ——
      //    那是「這個題庫」的後設資料，不是題目本身的內容。
      await kv.put(QUESTION_PREFIX + question.id, JSON.stringify({ ...question, createdAt }));
    },

    /**
     * 列出所有題目 id。
     *
     * ⚠️ KV 的 `list()` 一次最多回 1000 個 key 且可能分頁。
     *    我們的題庫上限是 500（見 `MAX_BANK_SIZE`），所以理論上一次就夠；
     *    但仍然照分頁寫 —— 若日後把上限調高，這裡不會**靜默漏掉**後面的題。
     */
    async listQuestionIds() {
      const ids: string[] = [];
      let cursor: string | undefined;
      for (let guard = 0; guard < 20; guard++) {
        const page = await kv.list({ prefix: QUESTION_PREFIX, limit: 1000, cursor });
        for (const k of page.keys) ids.push(k.name.slice(QUESTION_PREFIX.length));
        if (page.list_complete || !page.cursor) break;
        cursor = page.cursor;
      }
      return ids;
    },

    async getIndex() {
      try {
        const raw = await kv.get(INDEX_KEY, 'text');
        if (!raw) return null;
        const parsed = JSON.parse(raw) as QuizBankIndex;
        if (!parsed || !Array.isArray(parsed.items)) return null;
        return parsed;
      } catch (e) {
        console.warn('[quizBank] 讀取索引失敗:', e);
        return null;
      }
    },

    async putIndex(index) {
      await kv.put(INDEX_KEY, JSON.stringify(index));
    },
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 * 以下是給 handler 用的高階操作（不碰 KV 細節）
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * 寫入一批題目，並重建索引。
 *
 * 步驟（順序不能換）：
 *   ① 逐題寫 `q:<id>`
 *   ② **`list('q:')` 問 KV 現在真的有哪些** ← 權威來源
 *   ③ 用 ② 的結果 ＋ 舊索引的 createdAt 重建索引
 *
 * ⚠️ 回傳「實際寫入幾題」。達到 `MAX_BANK_SIZE` 之後**只回傳不寫入** ——
 *    保護 KV 免費層的 1000 writes/日（每次生成 3 writes）。
 *    呼叫端仍然會把題目 inline 回給本次使用者，所以他的體驗不受影響。
 */
export async function writeQuestionsToBank(
  store: QuizBankStore,
  questions: QuizQuestion[],
  now: number = Date.now()
): Promise<{ written: number; skipped: boolean }> {
  if (questions.length === 0) return { written: 0, skipped: false };

  const previous = await store.getIndex();
  const createdAtOf = new Map<string, number>(
    (previous?.items ?? []).map((i) => [i.id, i.createdAt])
  );
  const labelKeysOf = new Map<string, string[]>(
    (previous?.items ?? []).map((i) => [i.id, Array.isArray(i.labelKeys) ? i.labelKeys : []])
  );
  for (const q of questions) {
    labelKeysOf.set(q.id, Array.isArray(q.labelKeys) ? q.labelKeys : []);
  }

  let existingIds = await store.listQuestionIds();
  if (existingIds.length >= MAX_BANK_SIZE) {
    console.log(
      `[quizBank] 題庫已達上限 ${MAX_BANK_SIZE} 題，不再寫入（保護 KV 免費額度）`
    );
    return { written: 0, skipped: true };
  }

  let written = 0;
  for (const q of questions) {
    if (existingIds.length + written >= MAX_BANK_SIZE) break;
    try {
      await store.putQuestion(q, now);
      createdAtOf.set(q.id, now);
      written++;
    } catch (e) {
      // 單題失敗不該讓整批失敗 —— 其他題還是能存下來
      console.warn(`[quizBank] 寫入題目 ${q.id} 失敗:`, e);
    }
  }
  if (written === 0) return { written: 0, skipped: false };

  // ② 權威來源：KV 現在真的有哪些 id
  existingIds = await store.listQuestionIds();

  const index: QuizBankIndex = {
    version: (previous?.version ?? 0) + 1,
    updatedAt: now,
    items: existingIds
      // ⚠️ 舊索引沒有的 id（別台裝置寫進來的）給 `now` ——
      //    最壞情況是它會被多同步一次，比「永遠同步不到」好。
      .map((id) => ({
        id,
        createdAt: createdAtOf.get(id) ?? now,
        labelKeys: labelKeysOf.get(id) ?? [],
      }))
      .sort((a, b) => a.createdAt - b.createdAt),
  };
  await store.putIndex(index);

  return { written, skipped: false };
}

/**
 * 讀出「比 `since` 新的」題目。
 *
 * ⚠️ `since` 是**用戶端上次成功合併的時間**。
 *    用戶端必須在**成功合併之後**才推進它 ——
 *    先推進再合併的話，中途失敗就會永久漏掉那一段題目（而且不會報錯）。
 */
export async function listQuestionsSince(
  store: QuizBankStore,
  since: number,
  limit = 20
): Promise<{ questions: QuizQuestion[]; version: number; updatedAt: number }> {
  const index = await store.getIndex();
  if (!index) return { questions: [], version: 0, updatedAt: 0 };

  const newer = index.items.filter((i) => i.createdAt > since).slice(0, limit);

  const questions: QuizQuestion[] = [];
  for (const item of newer) {
    const q = await store.getQuestion(item.id);
    // 索引有、本體讀不到（被清掉或還在最終一致性的傳播中）→ 跳過，
    // 不要讓一題壞掉就整個同步失敗
    if (q) questions.push(q);
  }

  return { questions, version: index.version, updatedAt: index.updatedAt };
}

/**
 * 依標籤從題庫挑一題（**只讀索引 ＋ 命中的那一題**，挑不到回 null）。
 *
 * 【為什麼只讀索引】
 *   索引裡已經有每題的 `labelKeys`（見 `QuizBankItem`），
 *   所以「有沒有對得上的題」用 1 次 read 就能判斷，
 *   之後只讀命中的那一題本體 —— 總共 2 次 KV read。
 *
 *   對照組：把整個題庫讀出來再篩，是 500 次 read。
 *   KV 免費層一天 100,000 reads，前者能撐 50,000 次請求，後者只有 200 次。
 *
 * 【★ 只有「labelKeys 有交集」才算命中】
 *   通用題（`labelKeys: []`）**不算**。
 *   若把通用題也算命中，AI 生成就永遠不會被觸發 ——
 *   功能會退化成「固定題庫輪播」，而且**不會有任何錯誤訊息**。
 *   （這正是第一階段 `pickQuizQuestion` 用 `requireMatch` 處理的同一件事。）
 */
export async function findBankMatch(
  store: QuizBankStore,
  labelKeys: string[],
  excludeIds: string[]
): Promise<QuizQuestion | null> {
  const index = await store.getIndex();
  if (!index) return null;

  const excluded = new Set(excludeIds);
  const wanted = new Set(labelKeys);

  const candidates = index.items.filter(
    (item) =>
      !excluded.has(item.id) &&
      Array.isArray(item.labelKeys) &&
      item.labelKeys.some((k) => wanted.has(k))
  );
  if (candidates.length === 0) return null;

  // 從最新的往回挑：新題通常涵蓋比較近期的內容
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  const question = await store.getQuestion(pick.id);
  if (!question) return null;

  // 保險：索引與本體不一致時，以**本體**為準再確認一次
  const realKeys = Array.isArray(question.labelKeys) ? question.labelKeys : [];
  if (!realKeys.some((k) => wanted.has(k))) return null;

  return question;
}
