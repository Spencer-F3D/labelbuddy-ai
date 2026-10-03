/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 語音設定（開關 ＋ 音量）— 2026-10-03 新增
 * ============================================================================
 * 儲存鍵：`labelbuddy_tts_v1`
 *
 * 【為什麼預設值依身分不同（使用者指定）】
 *   長者：**預設開啟**
 *     —— 這是本 App 存在的理由之一。視力不好的人靠聽的，
 *        如果預設關掉，他們不會知道要去哪裡打開，只會覺得「這 App 沒聲音」。
 *   其他身分：**預設關閉**
 *     —— 年輕人在公共場合被手機突然念出「您買的泡麵鈉含量過高」會很尷尬，
 *        而且會直接關掉整個 App。要聽的人自己去設定打開只要兩步。
 *
 *   ★ 這個「預設值依身分」的邏輯**只能有一份**：
 *     如果散在元件裡，改身分時就不會跟著重算（本專案已經踩過很多次
 *     「改了 A 沒改 B，而且不會報錯」）。
 *
 * 【為什麼音量要存在這裡，不是直接用系統音量】
 *   系統音量同時影響來電、通知、音樂。使用者要的是
 *   「這個 App 的語音小聲一點」，不是「整支手機小聲一點」。
 * ============================================================================
 */

import type { LearnerProfileId } from '../types';

const STORAGE_KEY = 'labelbuddy_tts_v1';

/** 首次使用時的預設音量（不是 100% —— 突然的全音量會嚇到人） */
export const DEFAULT_TTS_VOLUME = 0.8;

export interface TtsSettings {
  /** 是否朗讀 */
  enabled: boolean;
  /** 音量 0～1 */
  volume: number;
  /**
   * 使用者是否**手動**改過開關。
   *
   * 【為什麼需要這個旗標】
   *   預設值依身分決定，但身分是可以改的。
   *   沒有這個旗標的話：使用者手動把語音關掉 → 之後去設定頁改了身分 →
   *   語音又被「依新身分的預設值」打開，**使用者會覺得設定自己跑掉了**。
   *   → 一旦手動改過，就永遠以使用者的選擇為準。
   */
  touched: boolean;
}

/**
 * 依身分決定預設值。
 *
 * ⚠️ 只有 `senior` 預設開啟。其他六種身分（兒童、青少年、健身人士、
 *    青年、中年、學生）都預設關閉 —— 他們能自己找到設定。
 */
export function defaultTtsSettings(profileId: LearnerProfileId): TtsSettings {
  return {
    enabled: profileId === 'senior',
    volume: DEFAULT_TTS_VOLUME,
    touched: false,
  };
}

let cache: TtsSettings | null = null;
/** 目前套用的身分，用來判斷要不要跟著換預設值 */
let currentProfile: LearnerProfileId | null = null;

function readStorage(): TtsSettings | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.enabled !== 'boolean') return null;
    return {
      enabled: parsed.enabled,
      volume: typeof parsed.volume === 'number' ? Math.min(1, Math.max(0, parsed.volume)) : DEFAULT_TTS_VOLUME,
      touched: parsed.touched === true,
    };
  } catch {
    return null;
  }
}

function writeStorage(s: TtsSettings): void {
  cache = s;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* 無痕模式或配額不足：這次仍然生效，只是下次不會記得 */
  }
}

/**
 * 取得目前設定。
 *
 * @param profileId 目前身分（未提供時用上次的值）
 */
export function getTtsSettings(profileId?: LearnerProfileId): TtsSettings {
  if (profileId) currentProfile = profileId;
  const stored = cache ?? readStorage();
  const pid = currentProfile;

  if (stored) {
    cache = stored;
    /**
     * 已經手動改過 → 永遠以使用者的選擇為準，不隨身分變動。
     * 沒改過 → 身分變了就重新套用該身分的預設值
     *          （例如從「青年」改成「長者」，語音應該自動打開）。
     *
     * ⚠️ 2026-10-03 修正一個真實 bug：這裡原本在 `pid` 為 null 時直接
     *    `return stored`（或更早的版本退回 'senior'）——
     *    但**首次載入時 `currentProfile` 永遠是 null**（還沒有任何呼叫帶入身分），
     *    於是所有身分都拿到「長者」的預設值 → **非長者也預設有聲**。
     *    使用者實際回報了這個現象。
     *    → 沒有身分可判斷時，採取**保守**的預設：關閉。
     *      寧可長者少聽到一次（他按一下就能開），也不要年輕人被突來的語音嚇到。
     */
    if (stored.touched) return stored;
    if (!pid) return { ...stored, enabled: false };
    return { ...stored, enabled: defaultTtsSettings(pid).enabled };
  }

  // 沒有存檔：同樣只在知道身分時才給「開啟」的預設值
  const fresh = pid
    ? defaultTtsSettings(pid)
    : { enabled: false, volume: DEFAULT_TTS_VOLUME, touched: false };
  cache = fresh;
  return fresh;
}

export function setTtsEnabled(enabled: boolean): TtsSettings {
  const next = { ...getTtsSettings(), enabled, touched: true };
  writeStorage(next);
  return next;
}

export function setTtsVolume(volume: number): TtsSettings {
  const next = { ...getTtsSettings(), volume: Math.min(1, Math.max(0, volume)) };
  writeStorage(next);
  return next;
}

/** 供 `speakText` 使用的輕量查詢（不觸發身分邏輯） */
export function isTtsEnabled(): boolean {
  return getTtsSettings().enabled;
}

export function getTtsVolume(): number {
  return getTtsSettings().volume;
}

/** 清除設定（跟著「清除所有資料」一起走） */
export function clearTtsSettings(): void {
  cache = null;
  currentProfile = null;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 忽略 */
  }
}
