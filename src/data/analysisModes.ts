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
