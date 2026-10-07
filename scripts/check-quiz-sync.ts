/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 線上題庫「同步層」檢查（2026-10-07 第二階段）
 * ============================================================================
 * ⚠️ 與 `check-quiz-bank.ts` 不同：那一支驗的是**題目資料本身的完整性**
 *    （60 題的選項數、正解範圍、英文對照…），這一支驗的是
 *    **KV 同步層的行為**（寫入、索引、分頁、命中判斷、since 過濾）。
 *
 * 【這支要抓的 bug —— 全都是「不會報錯」的那一種】
 *
 *   ① **併發寫入遺失 id**
 *      兩台裝置同時生成題目，若用「讀索引 → 加自己的 id → 寫回」，
 *      後寫的會把先寫的蓋掉 → 那一題永遠消失在索引裡
 *      （題目本體還在 KV，但沒有任何東西指向它）。
 *      → 正確做法是「寫本體 → `list()` 問 KV 現在有什麼 → 用它寫索引」。
 *
 *   ② **KV `list()` 分頁被忽略**
 *      真 KV 一次只回 1000 個 key。忽略分頁的話，第 1001 題之後**靜默消失**。
 *      我們上限是 500，所以現在碰不到 —— 但那是「還沒碰到」，不是「不會碰到」。
 *
 *   ③ **通用題被當成命中**
 *      `labelKeys: []` 的通用題若算命中，AI 生成就永遠不會被觸發，
 *      功能退化成「固定題庫輪播」，而且沒有任何錯誤訊息。
 *
 *   ④ **`since` 語意錯**
 *      用 `>=` 而不是 `>` 會讓同一題被反覆同步。
 *
 * 用法：npm run check:bank
 * 退出碼 0 = 全部通過
 */

import {
  MAX_BANK_SIZE,
  findBankMatch,
  listQuestionsSince,
  makeMemoryQuizBankStore,
  makeQuizBankStore,
  writeQuestionsToBank,
  type KvLike,
  type QuizBankStore,
} from '../server/quizBank';
import type { QuizQuestion } from '../src/types';

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

/** 造一題（id 由呼叫端指定，方便斷言） */
function q(id: string, labelKeys: string[]): QuizQuestion {
  return {
    id,
    topic: 'basics',
    question: `題目 ${id}`,
    options: ['A', 'B', 'C'],
    correctIndex: 0,
    explanation: '因為',
    labelKeys: labelKeys as QuizQuestion['labelKeys'],
    source: 'ai',
    en: { question: `Q ${id}`, options: ['A', 'B', 'C'], explanation: 'because' },
  };
}

/**
 * 假的 KV —— **刻意實作分頁**（每頁只回 `pageSize` 個 key）。
 *
 * ⚠️ 這是這支檢查最重要的設計。不分頁的假 KV 會讓「忽略分頁」這個 bug
 *    永遠測不出來（假通過）。真 KV 一次給 1000 個、我們上限 500 ——
 *    也就是說**真實環境永遠碰不到分頁**，只有把假 KV 設得很小才驗得到。
 */
function makeFakeKv(pageSize: number): KvLike {
  const store = new Map<string, string>();
  return {
    async get(key) {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    async put(key, value) {
      store.set(key, value);
    },
    async list(options) {
      const prefix = options?.prefix ?? '';
      const all = [...store.keys()].filter((k) => k.startsWith(prefix)).sort();
      const start = options?.cursor ? Number(options.cursor) : 0;
      const slice = all.slice(start, start + Math.min(options?.limit ?? 1000, pageSize));
      const next = start + slice.length;
      const complete = next >= all.length;
      return {
        keys: slice.map((name) => ({ name })),
        list_complete: complete,
        cursor: complete ? undefined : String(next),
      };
    },
  };
}

/** 用真 KV 版實作 ＋ 假 KV → 驗到真正的生產程式碼，不是另一份複本 */
function makeFakeStore(pageSize: number): QuizBankStore {
  return makeQuizBankStore(makeFakeKv(pageSize));
}

(async () => {
  console.log('='.repeat(72));
  console.log('線上題庫同步層檢查（第二階段）');
  console.log('='.repeat(72));

  /* ── 1. 寫入 ＋ 索引 ───────────────────────────────────────────── */
  console.log('\n── 1. 寫入與索引 ──');
  {
    const store = makeFakeStore(100);
    const r = await writeQuestionsToBank(store, [q('a1', ['鈉']), q('a2', ['添加糖'])], 1000);
    check('寫入 2 題成功', r.written === 2, `實際 ${r.written}`);

    const index = await store.getIndex();
    check('索引有 2 筆', index?.items.length === 2, `實際 ${index?.items.length}`);
    check(
      '索引帶著 labelKeys（挑題時不必讀本體）',
      index?.items[0].labelKeys.length === 1,
      JSON.stringify(index?.items[0].labelKeys)
    );
    check('索引帶著 createdAt', index?.items[0].createdAt === 1000, `實際 ${index?.items[0].createdAt}`);
    check('version 從 1 起算', index?.version === 1, `實際 ${index?.version}`);
  }

  /* ── 2. ★ KV list() 分頁不能被忽略 ────────────────────────────── */
  console.log('\n── 2. ★ KV list() 分頁 ──');
  {
    const store = makeFakeStore(2); // 每頁只回 2 個
    const many = Array.from({ length: 7 }, (_, i) => q(`p${i}`, ['鈉']));
    await writeQuestionsToBank(store, many, 1000);

    const ids = await store.listQuestionIds();
    check(
      '7 題跨 4 頁仍全部列出（分頁沒被忽略）',
      ids.length === 7,
      `實際 ${ids.length}：${ids.join(',')}`
    );
    const index = await store.getIndex();
    check('索引也包含全部 7 題', index?.items.length === 7, `實際 ${index?.items.length}`);
  }

  /* ── 3. ★★ 併發寫入不會遺失 id ────────────────────────────────── */
  console.log('\n── 3. ★★ 併發寫入（這個模組存在的理由）──');
  {
    const store = makeFakeStore(100);
    // 模擬兩台裝置各自寫了題目本體（還沒重建索引）
    await store.putQuestion(q('c1', ['鈉']), 1000);
    await store.putQuestion(q('c2', ['鈉']), 1000);
    // 然後第三方重建索引 —— 它必須從 list() 看到 c1／c2，不能只看舊索引
    await writeQuestionsToBank(store, [q('c3', ['鈉'])], 2000);

    const index = await store.getIndex();
    const ids = (index?.items ?? []).map((i) => i.id).sort();
    check(
      '★★ 三方寫入後 c1／c2／c3 全部還在索引裡（沒有被互相蓋掉）',
      ids.join(',') === 'c1,c2,c3',
      `實際 ${ids.join(',')}`
    );
  }

  /* ── 4. ★ 通用題不算命中 ──────────────────────────────────────── */
  console.log('\n── 4. ★ 通用題（labelKeys: []）不算命中 ──');
  {
    const store = makeFakeStore(100);
    await writeQuestionsToBank(store, [q('g1', [])], 1000);

    const genericHit = await findBankMatch(store, ['鈉'], []);
    check(
      '★★ 題庫裡只有通用題時回 null（否則 AI 生成永遠不會被觸發）',
      genericHit === null,
      `實際 ${genericHit?.id}`
    );

    await writeQuestionsToBank(store, [q('m1', ['鈉'])], 2000);
    check('★ 有標籤交集的題才會命中', (await findBankMatch(store, ['鈉'], []))?.id === 'm1');

    const noOverlap = await findBankMatch(store, ['咖啡因'], []);
    check('沒有交集的標籤不會命中', noOverlap === null, `實際 ${noOverlap?.id}`);

    const excluded = await findBankMatch(store, ['鈉'], ['m1']);
    check('排除清單生效（不回已經看過的題）', excluded === null, `實際 ${excluded?.id}`);
  }

  /* ── 5. since 過濾 ─────────────────────────────────────────────── */
  console.log('\n── 5. since 過濾 ──');
  {
    const store = makeFakeStore(100);
    await writeQuestionsToBank(store, [q('s1', ['鈉'])], 1000);
    await writeQuestionsToBank(store, [q('s2', ['鈉'])], 2000);

    const all = await listQuestionsSince(store, 0);
    check('since=0 回全部', all.questions.length === 2, `實際 ${all.questions.length}`);

    const newer = await listQuestionsSince(store, 1000);
    check(
      '★ since=1000 只回「嚴格大於」的那一題（用 >= 會重複同步）',
      newer.questions.length === 1 && newer.questions[0].id === 's2',
      `實際 ${newer.questions.map((x) => x.id).join(',')}`
    );

    const none = await listQuestionsSince(store, 2000);
    check('since=最新 → 0 題', none.questions.length === 0, `實際 ${none.questions.length}`);

    const empty = await listQuestionsSince(makeFakeStore(100), 0);
    check('空題庫回 0 題而不是爆掉', empty.questions.length === 0 && empty.version === 0);
  }

  /* ── 6. 上限保護（KV 免費額度）────────────────────────────────── */
  console.log('\n── 6. 上限保護 ──');
  {
    const store = makeFakeStore(MAX_BANK_SIZE + 10);
    const fill = Array.from({ length: MAX_BANK_SIZE }, (_, i) => q(`f${i}`, ['鈉']));
    await writeQuestionsToBank(store, fill, 1000);

    const over = await writeQuestionsToBank(store, [q('over1', ['鈉'])], 2000);
    check(
      `★ 達到上限 ${MAX_BANK_SIZE} 後不再寫入（保護 KV 1000 writes/日）`,
      over.written === 0 && over.skipped === true,
      `written=${over.written} skipped=${over.skipped}`
    );

    const index = await store.getIndex();
    check(
      `題庫停在 ${MAX_BANK_SIZE} 題`,
      index?.items.length === MAX_BANK_SIZE,
      `實際 ${index?.items.length}`
    );
  }

  /* ── 7. 邊界 ─────────────────────────────────────────────────── */
  console.log('\n── 7. 邊界：沒有索引／空輸入 ──');
  {
    const store = makeMemoryQuizBankStore();
    check('全新題庫（無索引）回空、不丟例外', (await listQuestionsSince(store, 0)).questions.length === 0);

    const noop = await writeQuestionsToBank(store, [], 1000);
    check('空陣列寫入是 no-op', noop.written === 0 && noop.skipped === false);

    check('空題庫挑題回 null', (await findBankMatch(store, ['鈉'], [])) === null);
  }

  console.log('\n' + '='.repeat(72));
  console.log(`結果：${pass} 項通過 / ${fail} 項有問題`);
  if (fail > 0) {
    console.log('\n❌ 驗證失敗。上面每一項都是「不會報錯」的失敗模式。');
  }
  process.exit(fail > 0 ? 1 : 0);
})();
