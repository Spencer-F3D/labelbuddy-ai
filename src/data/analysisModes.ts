/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 三種分析模式的共用定義（2026-09-30）
 * ============================================================================
 *
 * 【為什麼要抽成獨立檔案】
 *   引導頁、設定頁、結果頁都要用同一組文字與順序。
 *   寫在 `App.tsx` 裡的話，`OnboardingFlow.tsx` 就得反過來 import App
 *   —— App 已經 import 了 OnboardingFlow，會變成循環引用。
 *   而且散著寫遲早會出現「引導頁說 A、設定頁說 B」的矛盾（而且不會報錯）。
 *
 * ⚠️ 型別是 `Record<AnalysisMode, TranslationKey>` ——
 *    日後新增模式時，少一個鍵就會**編譯失敗**，不會靜默漏掉。
 */

import type { AnalysisMode } from '../types';
import type { TranslationKey } from '../i18n/translations';

/** 顯示順序：由「最準但傳得最多」到「最私密但最簡單」 */
export const ANALYSIS_MODES: AnalysisMode[] = ['cloud_image', 'cloud_text', 'local_only'];

/** 模式名稱 */
export const MODE_LABEL_KEY: Record<AnalysisMode, TranslationKey> = {
  cloud_image: 'mode.cloudImage',
  cloud_text: 'mode.cloudText',
  local_only: 'mode.localOnly',
};

/**
 * 右上角窄標籤用的**短**文案（2026-10-04 新增）。
 *
 * 【為什麼不重用 MODE_LABEL_KEY】
 *   標題列的可用寬度很緊（長者字級下標題要 159px，標籤只剩約 9 個全形字的餘裕），
 *   而 `MODE_LABEL_KEY.cloudText` 是「本機圖像識別」7 個字 ——
 *   加上內距與圓點就會把標題列撐爆（本專案已經因為這個標籤溢出修過一次）。
 *   → 另外定義一組**四個字以內**的短標籤，語意維持一致。
 *
 * ★ 選字刻意對齊「隱私行為」而不是「技術名稱」：
 *   `只送文字` 直接說明照片留在本機；`只在本機` 說明**不會送到 AI 供應商**。
 *
 * ★ 2026-10-07 的演進（值得記一筆）：
 *   ① 原本 `只在本機` 寫「完全不連網」——**那是錯的**。它仍會發兩個請求到
 *      我們自己的伺服器（`/api/ai-status` 與 `/api/analyze-label`），
 *      只是不轉送到 AI 供應商。文案先改成「不會送到 AI 供應商」。
 *   ② 同一天稍後，規則引擎被抽成前後端共用的純函式，
 *      前端直接呼叫它 → 這個模式**真的零網路請求**了。
 *      所以「只在本機」現在是**字面事實**，而不只是一句比較保守的話。
 *   ⚠️ 教訓：**先把話改準，再把事做對。** 反過來做會留下可被實測推翻的文案。
 *   使用者看這個標籤是在確認「我的照片有沒有被傳出去」。
 */
export const MODE_CHIP_KEY: Record<AnalysisMode, TranslationKey> = {
  cloud_image: 'mode.chip.cloudImage',
  cloud_text: 'mode.chip.cloudText',
  local_only: 'mode.chip.localOnly',
};

/** 一句話說明這個模式怎麼運作 */
export const MODE_NOTE_KEY: Record<AnalysisMode, TranslationKey> = {
  cloud_image: 'mode.cloudImageNote',
  cloud_text: 'mode.cloudTextNote',
  local_only: 'mode.localOnlyNote',
};

/**
 * 「這個模式會傳出什麼」—— 三模式的核心差別。
 *
 * ⚠️ 這一行是使用者做選擇的**唯一依據**，必須與後端實際行為一致。
 *    改動任何一個模式的資料流向時，這裡與 `server/handlers.ts` 的
 *    `localOnly` 判斷必須一起改。
 */
export const MODE_DATA_KEY: Record<AnalysisMode, TranslationKey> = {
  cloud_image: 'mode.cloudImageData',
  cloud_text: 'mode.cloudTextData',
  local_only: 'mode.localOnlyData',
};

/** 這個模式會不會把照片本身送出去 */
export function uploadsPhoto(mode: AnalysisMode): boolean {
  return mode === 'cloud_image';
}
