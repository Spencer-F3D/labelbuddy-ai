/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 離線分析路徑（「只在本機」模式的引擎）
 * ============================================================================
 * 【這個檔案解決什麼問題】
 *   2026-10-07 之前，「只在本機」**不是字面事實**：
 *   判斷紅黃綠的規則引擎住在伺服器（`server/smartNutritionAnalyzer.ts`），
 *   所以那個模式仍然要 POST `/api/analyze-label` 才拿得到結論 ——
 *   **完全斷網時它根本不能用**，只會顯示「請重拍」。
 *
 *   現在把整條本機路徑抽成一個**純函式** `analyzeLabelLocally()`，
 *   由前端與後端**同時匯入同一份**：
 *     · 前端：`local_only` 時直接呼叫 → **零網路請求**、斷網可用
 *     · 後端：`/api/analyze-label` 的 `localOnly` 分支呼叫 → 行為不變
 *
 *   ★ 關鍵是「同一份」：如果前端自己再寫一份，就會變成兩份規則，
 *     而它們遲早會分岔（改了一邊忘了另一邊），且**不會報錯**。
 *
 * 【⚠️⚠️ 這個檔案絕對不可以 import 這些】
 *   `node:*`（特別是 `node:crypto`）、`dotenv`、任何讀 `process.env` 的東西。
 *   理由：它會被**打包進瀏覽器**。`server/core.ts` 正是因為開頭有
 *   `import { createHash } from 'node:crypto'` 才不能進前端 ——
 *   這就是 `buildOcrFailedResult` 與 `NUTRIENT_WORDING_FIELDS` 要搬過來的原因。
 *
 *   ★ 有一條檢查在守這件事：見 `scripts/check-offline-parity.ts`。
 */

import { buildRecognitionResult, type OcrRecognitionResult } from './labelParser';
import { analyzeNutritionWithIndicators } from './smartNutritionAnalyzer';
import { translateLocalResult } from './localEngineEn';
import { buildConditionReminders } from './conditionAdvice';
import { answerSeniorHealthQuestion } from './smartHealthQA';
import { getLearnerProfile } from '../src/data/learnerProfiles';
import { profileName, simplifyNutrientWordingInFields } from '../src/data/bilingual';
// ⚠️ `Language` 的定義在 i18n，不在 src/types（跟 `bilingual.ts` 用同一個來源）。
//    用 `import type` —— 編譯後會完全消失，不會把整份翻譯字串表拉進來。
import type { Language } from '../src/i18n/translations';
import type {
  DataHandling,
  HealthQuestionAnswer,
  LabelAnalysisResult,
  LearnerProfile,
  SeniorPhysicalIndicators,
} from '../src/types';

/**
 * 難字簡化要處理的欄位（2026-09-30）。
 *
 * ⚠️ **刻意不含 `ingredients_detected`** —— 那是「標籤上的原文」，
 *    使用者要拿去和包裝對照，改了就不是原文了。
 *    而且它還被用來判斷標籤語言與取出食品品名，改動會連帶影響紀錄。
 *
 * （2026-10-07 由 `server/core.ts` 原樣搬來，沒有改動內容。）
 */
export const NUTRIENT_WORDING_FIELDS = [
  'warning_title',
  'plain_summary',
  'alternative_advice',
  'knowledge_point',
  'label_reading_tip',
  'daily_limit_context',
  'nutrition_concerns',
] as const;

/**
 * OCR 讀不到數字時的結果（「請重拍」）。
 *
 * 【為什麼不是回一個錯誤】
 *   使用者拿到的應該是一句**可以照著做**的指示（拿近一點、避開反光），
 *   而不是「分析失敗」。所以這是一個**正常的結果**，只是它的
 *   `ocr_failed: true`、`nutrient_facts: []`、顏色是黃燈。
 *
 * ⚠️ **絕對不可以**在讀不到數字時用預設值湊出一份結論 ——
 *    那會變成「捏造一個看起來很肯定的紅黃綠」，是本專案最想避免的失敗模式。
 *
 * （2026-10-07 由 `server/core.ts` 原樣搬來，沒有改動內容。）
 */
export function buildOcrFailedResult(
  learnerProfile: LearnerProfile,
  ocr: Pick<OcrRecognitionResult, 'matchedFields'>,
  /**
   * 輸出語言。⚠️ 這條路徑**兩條模式都會走到**（雲端／本機），
   * 而且它不經過 AI，是後端直接寫死的字串 ——
   * 漏帶語言的話，英文介面會整段中文（這是實測抓到的洩漏）。
   */
  language: Language = 'zh-TW'
): LabelAnalysisResult {
  const en = language === 'en';
  return {
    risk_level: 'yellow',
    warning_title: en ? '🔍 Cannot read the label numbers' : '🔍 看不清楚標籤數字',
    plain_summary: en
      ? 'Sorry, this photo is too blurry to read the nutrition numbers on the label, so I cannot make a judgement. Could you hold the phone closer, fill the frame with the "Nutrition Facts" table, and take another photo in better light?'
      : '不好意思，這張照片看不清楚標籤上的營養數字，我沒有辦法判斷。請把手機拿近一點，讓「營養標示」的表格填滿畫面，光線充足一點，再拍一次好嗎？',
    alternative_advice: en
      ? 'Photo tips: ① flatten the packaging ② hold the phone about 15 cm away ③ avoid glare from overhead lights.'
      : '拍照小技巧：① 把包裝拉平 ② 手機距離約 15 公分 ③ 避開頭頂燈光的反光。',
    ingredients_detected: [],
    nutrition_concerns: [],
    matched_conditions: [],
    // 空陣列而不是省略：讓前端明確知道「沒有百分比資料」，不會誤畫長條圖
    nutrient_facts: [],
    ocr_failed: true,
    ocr_matched_fields: ocr.matchedFields,
    analysis_mode: 'local_fallback',
    learner_profile_id: learnerProfile.id,
    // ⚠️ 後端也要輸出對應語言的身分名稱。
    //    前端目前用自己的 state 顯示（已本地化），但 API 回應本身
    //    不該在中英文模式下都回中文 —— 那等於埋一顆地雷給下一個接手的人。
    learner_profile_name: profileName(learnerProfile.id, learnerProfile.name, language),
  };
}

export interface LocalAnalysisInput {
  /** 前端 OCR 讀出來的文字。空字串代表沒讀到 → 回「請重拍」。 */
  ocrText: string;
  /** 慢性病／過敏清單（後端算好的中文名，含 `其他：<自填>`）。 */
  conditions: string[];
  /** 身分 id；不合法時 `getLearnerProfile` 會安全退回預設。 */
  profileId?: string | null;
  language?: Language;
  /**
   * 回應裡的 `data_handling`。
   *
   * ⚠️ 前端**不要傳**（預設 `'local_only'` 就是它該有的值）；
   *    後端要傳自己算好的值（`handlers.ts:173`），否則回應的
   *    隱私標記會與閘門的實際判斷不一致。
   */
  dataHandling?: DataHandling;
}

/**
 * 完整重現後端 `handleAnalyzeLabel` 的本機離線路徑。
 *
 * 【⚠️ 逐欄位對齊 `server/handlers.ts`】
 *   這支函式是「同一段邏輯的第二個入口」，所以**必須與後端一模一樣**。
 *   三條分支對應：
 *     ① 空文字        → `handlers.ts:239-247`（**不**做難字簡化）
 *     ② 文字不足      → `handlers.ts:489-499`（**要**做難字簡化）
 *     ③ 解析成功      → `handlers.ts:504-527`
 *
 *   ★ ①② 的「要不要簡化」不一致是**原始行為**，這裡刻意原樣保留 ——
 *     因為 `buildOcrFailedResult` 的文案裡沒有任何營養素名稱，
 *     簡化對它是 no-op，改成一致不會有差別，但會讓對齊檢查失去意義。
 *     （有一條 parity 檢查在逐欄位比對兩條路徑的輸出。）
 */
export function analyzeLabelLocally(input: LocalAnalysisInput): LabelAnalysisResult {
  const language: Language = input.language === 'en' ? 'en' : 'zh-TW';
  const conditions = Array.isArray(input.conditions) ? input.conditions : [];
  const learnerProfile = getLearnerProfile(input.profileId);
  const dataHandling: DataHandling = input.dataHandling ?? 'local_only';

  /**
   * ⚠️ 提醒**必須帶語言**：它是規則產生的、不經過 AI，
   *    兩條路徑（雲端／本機）都會用到。漏帶的話英文介面會夾著中文病名。
   *    （對應後端 `handlers.ts:224-227` 的 `attachReminders`。）
   */
  const attachReminders = (data: LabelAnalysisResult): LabelAnalysisResult => ({
    ...data,
    condition_reminders: buildConditionReminders(conditions, language),
  });

  const ocrText = typeof input.ocrText === 'string' ? input.ocrText : '';

  // ── ① 文字模式但一個字都沒讀到 → 直接請使用者重拍 ──────────────
  if (ocrText.trim().length === 0) {
    return attachReminders({
      ...buildOcrFailedResult(learnerProfile, { matchedFields: 0 }, language),
      data_handling: dataHandling,
    });
  }

  // ── ② 解析（文字 → 營養欄位）─────────────────────────────────
  const ocr = buildRecognitionResult(ocrText);
  if (!ocr.ok || !ocr.profile) {
    const failed = buildOcrFailedResult(learnerProfile, ocr, language);
    simplifyNutrientWordingInFields(failed, NUTRIENT_WORDING_FIELDS);
    return attachReminders({ ...failed, data_handling: dataHandling });
  }

  // ── ③ 規則引擎 ────────────────────────────────────────────────
  // 帶入該身分的每日上限，讓引擎產生 nutrient_facts（前端百分比長條圖用）。
  // 語言也要傳：本機引擎是預設路徑，不傳的話切到英文仍會拿到中文結論。
  const smartResult = analyzeNutritionWithIndicators(
    ocr.profile,
    conditions,
    learnerProfile.numericLimits,
    language,
    // ⚠️ 一定要傳身分 —— 孕婦的危險成分把關靠這個參數決定要不要執行
    learnerProfile.id
  );
  // 引擎內部的比對關鍵字維持中文，這裡只把**輸出欄位**轉成英文。
  const localizedResult = translateLocalResult(smartResult, language);
  simplifyNutrientWordingInFields(localizedResult, NUTRIENT_WORDING_FIELDS);

  return attachReminders({
    ...localizedResult,
    ocr_used: true,
    ocr_matched_fields: ocr.matchedFields,
    analysis_mode: 'local_fallback',
    data_handling: dataHandling,
    learner_profile_id: learnerProfile.id,
    learner_profile_name: profileName(learnerProfile.id, learnerProfile.name, language),
  });
}

/* ══════════════════════════════════════════════════════════════════════════
 * 健康問答的離線路徑（2026-10-07）
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * 健康問答要做難字簡化的欄位。
 *
 * （2026-10-07 由 `server/core.ts` 原樣搬來 —— 與 `NUTRIENT_WORDING_FIELDS`
 *   同一個原因：這個模組要能被前端打包。）
 */
export const QA_TEXT_FIELDS = ['key_takeaway', 'answer', 'safe_tips', 'voice_script'] as const;

export interface LocalHealthQAInput {
  question: string;
  indicators?: Partial<SeniorPhysicalIndicators>;
  language?: Language;
  /**
   * 為什麼走到本機路徑。
   *
   * ⚠️ 前端**一律**傳 `'user_choice'`（或省略，預設就是它）：
   *    使用者選了「只在本機」，他是有連線的、是**主動選擇**不送給 AI。
   *    回覆寫「連不上 AI」是假的，而且會讓他以為「網路好一點就會有 AI 回答」。
   *    後端只有在**雲端真的失敗**時才傳 `'unreachable'`。
   */
  reason?: 'user_choice' | 'unreachable';
}

/**
 * 完全在裝置上回答健康問題（零網路）。
 *
 * 【為什麼這條比標籤那條更需要離線】
 *   使用者打的健康問題往往比標籤文字更私密 ——
 *   例如「我這樣是不是快中風了」（見 `handlers.ts` 的同名註解）。
 *   把這種句子送出去，比送一張營養標示嚴重得多。
 *
 * 【⚠️ 這條路徑原本就存在，只是跑在伺服器上】
 *   後端在 `localOnly` 時**已經**跳過 AI 走這支引擎（`handlers.ts` 的
 *   `aiResult = localOnly ? null : ...`）。所以這次不是新增功能，
 *   而是把「同一支引擎」搬一份入口給前端 —— 邏輯與輸出完全不變。
 *
 * @returns 與後端 `/api/ask-health-question` 在 `localOnly` 時**完全相同**的物件
 *          （含 `source: 'smart_health_qa'`）。
 */
export function answerHealthQuestionLocally(input: LocalHealthQAInput): HealthQuestionAnswer {
  const language: Language = input.language === 'en' ? 'en' : 'zh-TW';
  const question = typeof input.question === 'string' ? input.question : '';
  const answer = answerSeniorHealthQuestion(
    question,
    input.indicators,
    language,
    input.reason ?? 'user_choice'
  );
  simplifyNutrientWordingInFields(answer as unknown as Record<string, any>, QA_TEXT_FIELDS);
  return answer;
}
