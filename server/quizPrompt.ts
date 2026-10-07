/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 出題提示詞（Quiz prompt）
 * ============================================================================
 * 【★ 這個功能的真正難點不是「怎麼生成」，而是「怎麼讓它不可能教錯」】
 *   標籤讀錯，使用者還有包裝可以對照。
 *   但測驗題以「正確答案」的形式呈現 —— **它教錯的東西會被直接記住**，
 *   而且事後很難發現（使用者不會去查證一道 App 出的題目）。
 *
 *   所以提示詞的第一條不是格式要求，而是**限制題型**：
 *   正確答案必須能**只根據這張標籤上你自己的數字**推導出來。
 *
 * 【四道防線（這是第一道）】
 *   ① 提示詞限制題型（本檔）
 *   ② `normalizeQuizQuestion()` 嚴格驗證，不合格就整題丟棄（`server/quizValidate.ts`）
 *   ③ 生成失敗／不合格 → 退回內建題，卡片永遠有內容
 *   ④ 題目帶 `source: 'ai'`，畫面上與內建題區分得出來
 *
 * 【⚠️ 為什麼要求「一次輸出中英兩版」】
 *   `localizeQuestion()` 原本靠一張**以 id 查表**的英文對照
 *   （`QUIZ_QUESTIONS_EN`）。AI 生成的新題沒有 id 在表裡
 *   → 英文介面會**靜默顯示中文題目**。
 *   所以新題必須自帶英文版，而且**兩版都齊才准入庫**。
 */

/**
 * 出題用的系統提示詞。
 *
 * ⚠️ **刻意不套用 `core.ts` 的 `ADDRESS_RULE`**（2026-10-07 的決定）。
 *
 * 【為什麼】
 *   `ADDRESS_RULE` 的內容是「請用中性的『您好』，不要加任何稱謂」——
 *   那是給**對使用者說話的段落**用的（摘要、建議、問答）。
 *   但出題是「出一道題目」，正確的題目**根本不會提到使用者**：
 *     ✅「這包泡麵的鈉 1980 毫克，大約等於幾公克鹽？」
 *     ❌「您好，請問這包泡麵的鈉…」
 *   套用 ADDRESS_RULE 反而會把「您好」引進題目裡。
 *
 * 【安全規則仍然保留】
 *   禁用長輩稱謂那一條是**安全與禮貌規則**（見 `ADDRESS_RULE` 的說明），
 *   所以直接寫進下面的第 3 條 —— 少了它，模型可能寫出「阿公，這題…」。
 */
export const SYSTEM_INSTRUCTION_QUIZ = `你是食育學堂的出題老師，對象是一般消費者（可能包含長者）。你要針對「這張食品標籤上的其中一個營養素」出一題單選題。

【最重要的限制 —— 違反就直接丟棄】
1. 正確答案必須能**只根據這張標籤上你自己的數字**推導出來。
   可以考的類型例如：單位換算（毫克↔公克、鈉↔鹽）、佔每日上限的百分比、
   與參考值比較、整包 vs 每一份的換算。
   **絕對不可以**出需要外部知識才能回答、或需要捏造標籤上沒有的數字才能回答的題目。
2. 不可以出醫療建議、疾病診斷、藥物、療效相關的題目。
3. 題目**不要對使用者說話**：不要寫「您好」、不要稱呼任何稱謂
   （絕對不可以出現先生、小姐、阿公、阿伯、爺爺、奶奶、阿婆、阿姨）。
4. options 必須恰好 3 個、互不重複、都是短句（建議 20 字以內）。
   correctIndex 只能是 0、1、2。
5. topic 只能是這六個之一：basics、reading、dangers、sodium_sugar、profiles、shopping。
6. explanation 要說明「為什麼」，用白話，不要只重述答案。

【輸出格式】只輸出一個 JSON 物件，不要有任何其他文字或 markdown 圍欄：
{"topic":"sodium_sugar","question":"…","options":["…","…","…"],"correctIndex":1,"explanation":"…","en":{"question":"…","options":["…","…","…"],"explanation":"…"}}

⚠️ en 是對應的英文版，內容必須與中文一致（不是逐字直譯，但要表達同一件事）。
⚠️ en 一定要有 —— 沒有英文版的話這題會被整題丟棄。`;

/** 組出這次的使用者提示詞 */
export function buildQuizPrompt(args: {
  labelKeys: string[];
  context: {
    name: string;
    value: number;
    unit: string;
    dailyLimit?: number;
    percent?: number;
  };
  excludeIds: string[];
}): string {
  const c = args.context;
  const lines = [
    `標籤上的營養素（canonical 名稱）：${args.labelKeys.join('、')}`,
    `這一項在標籤上的數字：${c.name} ${c.value} ${c.unit}` +
      (typeof c.dailyLimit === 'number' && c.dailyLimit > 0
        ? `，每日參考值 ${c.dailyLimit} ${c.unit}`
        : '') +
      (typeof c.percent === 'number' ? `，約佔每日上限的 ${c.percent}%` : ''),
    '',
    '請針對上面這個營養素出一題單選題，答案要能從這些數字推導出來。',
  ];
  if (args.excludeIds.length > 0) {
    lines.push(
      '',
      `⚠️ 請避免與這些已出過的題目重複（只列 id，僅供去重參考）：${args.excludeIds.join(', ')}`
    );
  }
  return lines.join('\n');
}
