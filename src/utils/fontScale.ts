/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 字體大小設定（Font scale）
 * ============================================================================
 * 【★ 為什麼要獨立成一個檔，而不是寫在 App.tsx 裡】
 *   推導邏輯（手動值 ?? 身分預設值）如果寫在元件裡，
 *   就沒辦法單獨驗證 —— 而這正是本專案最常出錯的地方：
 *   「改了映射函式沒改呼叫端」不會報錯，只會靜默地套錯字級。
 *   抽成純函式之後，`App.tsx` 只負責呼叫它。
 *
 * 【⚠️ 與 index.css 的分工】
 *   本檔只決定「用哪一級」＝ `data-density` 的字串值。
 *   實際的 px 對應寫在 `src/index.css`（見該檔開頭的三級對照表）。
 *   兩邊的級別名稱必須一致：`compact` / `normal` / `comfortable`。
 *
 * 【⚠️ 為什麼沒有「跟隨身分」這個選項】
 *   使用者 2026-10-06 指定只要三顆按鈕（小／中／大）。
 *   所以「跟隨身分」是**沒有值時的行為**，不是一個可選項：
 *     - 從沒調過 → 依身分自動（長者＝大、其他＝小）
 *     - 調過之後 → 就固定在使用者選的那一級，不再跟著身分跑
 *   這樣「我明明選過大字，換個身分怎麼變小了」不會發生。
 */

import type { LearnerProfileId } from '../types';

/** 使用者可選的三級 */
export type FontScale = 'small' | 'normal' | 'large';

/** 對應到 `index.css` 的 `html[data-density]` 值 */
export type Density = 'compact' | 'normal' | 'comfortable';

/**
 * 儲存鍵。
 *
 * ⚠️ 必須以 `labelbuddy` 開頭 —— 「清除所有資料」是用**前綴掃描**
 *    （`k.startsWith('labelbuddy')`），不是寫死清單（見 ClearAllDataSection）。
 */
export const FONT_SCALE_STORAGE_KEY = 'labelbuddy_font_scale_v1';

const VALID_SCALES: readonly FontScale[] = ['small', 'normal', 'large'];

/** 級別 → `data-density` 值。 */
export const FONT_SCALE_TO_DENSITY: Record<FontScale, Density> = {
  small: 'compact',
  normal: 'normal',
  large: 'comfortable',
};

/**
 * 沒手動選過時的預設級別。
 *
 * ★ 這個對應**必須與改動前完全一致**（長者＝大字、其他＝小字），
 *   否則這次改動會讓既有使用者的畫面突然變大或變小。
 *   `npm run check:layout` 也會因為量到的不是 `comfortable` 而失敗。
 */
export function defaultFontScale(profileId: LearnerProfileId): FontScale {
  return profileId === 'senior' ? 'large' : 'small';
}

/**
 * 讀取使用者手動選的級別。
 *
 * 【回傳 `null` 代表「沒選過」】
 *   ⚠️ 刻意不回傳預設值 —— 呼叫端需要區分「沒選過（要跟身分）」
 *      與「選過小」這兩種情況。若這裡就填上預設值，
 *      長者一進設定頁就會被當成「已手動選過」，之後換身分字級不會跟著變。
 */
export function loadFontScale(): FontScale | null {
  try {
    const raw = localStorage.getItem(FONT_SCALE_STORAGE_KEY);
    return VALID_SCALES.includes(raw as FontScale) ? (raw as FontScale) : null;
  } catch {
    return null;
  }
}

/** 寫入使用者手動選的級別。 */
export function saveFontScale(scale: FontScale): void {
  try {
    localStorage.setItem(FONT_SCALE_STORAGE_KEY, scale);
  } catch {
    /* localStorage 不可用時就只套用當下這次，不讓 App 掛掉 */
  }
}

/**
 * 算出**實際要套用的** `data-density`。
 *
 * 這是唯一決定字級的入口 —— 手動值優先，沒有才依身分。
 */
export function resolveDensity(
  profileId: LearnerProfileId,
  manual: FontScale | null
): Density {
  return FONT_SCALE_TO_DENSITY[manual ?? defaultFontScale(profileId)];
}
