/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 語音設定（音量）— 2026-10-03 改版：**只留音量**
 * ============================================================================
 * 儲存鍵：`labelbuddy_tts_v1`
 *
 * 【為什麼拿掉「開啟／關閉」開關與「試聽」按鈕】
 *   使用者指定：「移除『開始/試聽』，改由音量條直接控制」。
 *   原本是一個開關 ＋ 一條音量 ＋ 一顆按鈕 ——
 *   三個控制項做的事其實只有一件（要不要出聲、多大聲）。
 *   → 合併成一條音量：
 *       音量 0     = 關閉
 *       音量 > 0   = 開啟，數字就是大小
 *   這也符合手機上大家都熟悉的行為（媒體音量拉到 0 就是靜音）。
 *
 * 【預設值（使用者指定，維持不變）】
 *   長者      → 音量 80%（= 預設有聲）
 *   其他身分  → 音量 0% （= 預設沒聲音）
 *
 * ★ `touched` 旗標：一旦使用者自己動過音量，就永遠以他的選擇為準。
 *   沒有的話「手動調成 0 → 之後改了身分 → 又被自動打開」，
 *   使用者會覺得設定自己跑掉。
 * ============================================================================
 */

import type { LearnerProfileId } from '../types';

const STORAGE_KEY = 'labelbuddy_tts_v1';

/** 長者的預設音量（不是 100% —— 突然的全音量會嚇到人） */
export const DEFAULT_TTS_VOLUME = 0.8;

export interface TtsSettings {
  /** 音量 0～1。**0 就代表關閉**（見檔頭說明）。 */
  volume: number;
  /** 使用者是否手動調過（決定要不要跟著身分重算預設值） */
  touched: boolean;
}

/**
 * 依身分決定預設音量。
 *
 * ⚠️ 只有 `senior` 預設有聲。其他六種身分（兒童、青少年、健身人士、
 *    青年、中年、學生）都預設 **0（靜音）** —— 年輕人在公共場所被手機
 *    突然念出健康資訊會很尷尬；要聽的人自己去設定拉音量只要兩步。
 */
export function defaultTtsSettings(profileId: LearnerProfileId): TtsSettings {
  return {
    volume: profileId === 'senior' ? DEFAULT_TTS_VOLUME : 0,
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

    /**
     * 舊格式遷移（2026-10-03 之前是 { enabled, volume, touched }）。
     *
     * ⚠️ 必須處理舊資料 —— 使用者的手機裡已經有舊的設定。
     *    不處理的話他調過音量的結果會被當成「沒設定過」而套用預設值，
     *    他的選擇就白做了（而且不會有任何提示）。
     *   舊的 enabled:false 等同於新版的 volume 0。
     */
    if (typeof parsed?.enabled === 'boolean') {
      return {
        volume: parsed.enabled
          ? typeof parsed.volume === 'number'
            ? Math.min(1, Math.max(0, parsed.volume))
            : DEFAULT_TTS_VOLUME
          : 0,
        touched: parsed.touched === true,
      };
    }

    if (typeof parsed?.volume !== 'number') return null;
    return {
      volume: Math.min(1, Math.max(0, parsed.volume)),
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
    // 已手動調過 → 永遠以使用者的選擇為準，不隨身分變動
    if (stored.touched) return stored;
    // 沒調過 → 身分變了就套用該身分的預設值
    //   （例如從「青年」改成「長者」，語音應該自動打開）
    if (!pid) return { ...stored, volume: 0 };
    return { ...stored, volume: defaultTtsSettings(pid).volume };
  }

  const fresh = pid ? defaultTtsSettings(pid) : { volume: 0, touched: false };
  cache = fresh;
  return fresh;
}

/** 設定音量（0 = 關閉）。呼叫這個就視為「使用者手動調過」。 */
export function setTtsVolume(volume: number): TtsSettings {
  const next: TtsSettings = {
    volume: Math.min(1, Math.max(0, volume)),
    // ⚠️ 即使調到 0 也算「手動調過」—— 使用者就是要它安靜，
    //    不能因為之後換了身分又被自動打開。
    touched: true,
  };
  writeStorage(next);
  return next;
}

/** 供 `speakText` 使用的輕量查詢 */
export function isTtsEnabled(): boolean {
  return getTtsSettings().volume > 0;
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
