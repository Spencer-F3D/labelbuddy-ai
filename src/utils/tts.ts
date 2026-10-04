/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 語音朗讀（TTS）— 2026-10-03 大改：**改走原生管道**
 * ============================================================================
 *
 * ★★【為什麼要改：這是一個「完全沒聲音、卻不會報錯」的 bug】
 *
 *   原本只用瀏覽器原生的 Web Speech API
 *   （`window.speechSynthesis` / `SpeechSynthesisUtterance`）。
 *
 *   但本 App 的 APK 是 **Capacitor 打包的 Android WebView**，
 *   而 **Android WebView 不實作 Web Speech 合成 API**（那是 Chrome 瀏覽器才有）。
 *   於是 `speakText()` 每次都走進第一個檢查：
 *     `if (!('speechSynthesis' in window)) return false;`
 *   —— **安靜地回傳 false，不拋錯、不記錄、畫面上也沒有任何異狀。**
 *
 *   使用者的說法完全符合這個症狀：
 *     「語音功能用不到，完成識別後沒有聲音，按按鈕也沒有聲音」
 *   因為那不是音量太小，是**根本沒有發聲的管道**。
 *
 *   → 修法：原生環境用 `@capacitor-community/text-to-speech`
 *     （直接呼叫 Android 的 TextToSpeech 引擎）；
 *     瀏覽器環境仍用 Web Speech API。
 *
 * 【為什麼不乾脆只留原生外掛】
 *   本 App 同時要能在「電腦瀏覽器」與「手機 APK」上跑：
 *     - 開發／展示時在電腦瀏覽器（外掛不存在，要用 Web Speech）
 *     - 決賽現場用手機 APK（Web Speech 不存在，要用外掛）
 *   兩邊都必須有聲音，所以兩條路都要留，由 `Capacitor.isNativePlatform()` 分流。
 *
 * 【音量】
 *   使用者的音量設定存在 `labelbuddy_tts_v1`（見 ttsSettings.ts）。
 *   ★ 「關閉語音」是**在 speakText 最前面就擋掉**，不是把 volume 設 0 ——
 *     設 0 仍然會佔用 TTS 引擎、仍然有延遲，而且 Android 上部分引擎
 *     會把 volume 0 當成「無效參數」而改用預設音量（反而變大聲）。
 * ============================================================================
 */

import { Capacitor } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { getTtsVolume, isTtsEnabled, resolveVoiceLang } from './ttsSettings';

export interface TTSOptions {
  rate?: number;       // 語速，預設 0.88 (慢速清晰)
  pitch?: number;      // 音調，預設 1.0
  /** 音量覆寫（0～1）。不給就用使用者在設定裡選的音量。 */
  volume?: number;
  preferLanguage?: TTSLanguage; // 偏好語言
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: any) => void;
}

/**
 * 朗讀偏好語言。
 *
 * 2026-09-28（第三階段雙語）新增 `'english'`：
 * 英文介面若仍挑中文語音，會用中文腔去念英文字，決賽的英文 Demo 影片會很糟。
 * 注意：這只影響「挑哪個語音」，不會改變朗讀的文字內容。
 */
/**
 * ★ 2026-10-04 使用者指定：**在設定中加入粵語／普通話／英文的語言選擇**。
 *
 * （先前（10-03）曾要求「鎖定粵語、移除普通話」，所以這裡拿掉過；
 *   現在改為三選一，把選擇權交回使用者。）
 *
 * ⚠️ 'english' 一定要有：英文介面若用中文語音念英文，
 *    決賽的英文 Demo 影片會很難聽（比賽要求英文材料）。
 */
export type TTSLanguage = 'cantonese' | 'mandarin' | 'english';

/**
 * 依「介面語言」決定該挑哪個語音 —— **全站唯一來源**。
 *
 * 【為什麼要有這個函式】
 *   2026-10-01 使用者要求「語音改廣東話」。當時只在 `App.tsx` 改了 4 處，
 *   另外三個元件（食育學堂／健康問答／身體指標 AI 朗讀）**仍寫死 `'mandarin'`**
 *   —— 而且不會報錯，只有實際聽才會發現講的是國語。
 *   這是本專案第五次「改了 A 沒改 B」。
 *
 *   → 把判斷集中在這裡之後，任何新元件只能呼叫這個函式，
 *     「某一處忘記改」在結構上就不可能發生（而不是靠記得）。
 *
 * ⚠️ 使用者的情境是中國澳門 → 中文一律粵語，不是國語。
 * ⚠️ 英文模式必須換英文語音，否則會用中文腔念英文（決賽 Demo 影片會很難聽）。
 */
export function ttsLanguageFor(language: 'zh-TW' | 'en'): TTSLanguage {
  /**
   * ★ 2026-10-04：改為「使用者選過的優先，沒選過才依介面語言推導」。
   *
   * 【為什麼改這裡就夠了】
   *   全站 12 個朗讀呼叫點都經過這個函式 —— 改它就能一次套用到全部，
   *   不需要（也不可能記得）一個一個改。
   *   本專案已經踩過「改了 A 沒改 B」五次以上，這正是當初把它集中的理由。
   */
  return resolveVoiceLang(language);
}

/** 是否為原生（APK）環境 —— 決定走哪一條發聲管道 */
export function isNativeTts(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * 轉成 BCP-47 語言標籤（原生引擎與 Web Speech 都吃這個）。
 *
 * ⚠️ 粵語是 `zh-HK`、普通話是 `zh-TW` —— **這兩個一定要分開**：
 *    對澳門使用者而言，選「普通話」卻送 zh-HK 會唸成粵語，
 *    而兩者聽起來差很多，使用者會以為設定壞了。
 */
function bcp47(preferLang: TTSLanguage): string {
  if (preferLang === 'english') return 'en-US';
  if (preferLang === 'mandarin') return 'zh-TW';
  return 'zh-HK';
}

/**
 * 取得裝置支援的語音列表，優先選取指定的語言（**僅瀏覽器路徑使用**）
 */
export function findBestVoice(preferLang: TTSLanguage = 'cantonese'): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    return null;
  }

  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) {
    return null;
  }

  if (preferLang === 'english') {
    // 優先英文語音；找不到就直接回 null，讓 speakText 用 en 當 lang 標籤
    const englishVoice = voices.find(
      (v) => v.lang === 'en-US' || v.lang === 'en-GB' || v.lang.startsWith('en')
    );
    return englishVoice ?? null;
  }

  if (preferLang === 'cantonese') {
    // 優先尋找粵語 (zh-HK, yue, 或名稱包含 Cantonese/廣東話/粵語)
    const cantoneseVoice = voices.find(
      (v) =>
        v.lang === 'zh-HK' ||
        v.lang.toLowerCase().includes('yue') ||
        v.name.toLowerCase().includes('cantonese') ||
        v.name.includes('粵') ||
        v.name.includes('廣東')
    );
    if (cantoneseVoice) return cantoneseVoice;
    // 找不到粵語時若直接回 null，裝置會自行挑一個 —— 但可能挑到國語。
    // 使用者明確選了粵語，所以這裡刻意**不做任何降級**（見下方說明）。
    return null;
  }

  if (preferLang === 'mandarin') {
    // 普通話：優先台灣／通用中文，其次任何 zh（但**排除**粵語）
    const mandarinVoice = voices.find(
      (v) =>
        (v.lang === 'zh-TW' || v.lang === 'zh-CN' || v.lang === 'zh-Hans') &&
        !v.lang.toLowerCase().includes('yue')
    );
    if (mandarinVoice) return mandarinVoice;
    const anyNonYue = voices.find(
      (v) => v.lang.startsWith('zh') && !v.lang.toLowerCase().includes('yue')
    );
    return anyNonYue ?? null;
  }

  /**
   * ⚠️ 2026-10-03：這裡原本會「次選 zh-TW、再次選任意 zh 語音」——
   *    那等於在使用者要粵語時**偷偷用國語朗讀**（聽起來像另一個人）。
   *    使用者明確要求移除普通話，所以拿掉這些降級。
   *
   *    ★ 但也不是直接回 null 就放生：`utterance.lang` 仍會設成 zh-HK，
   *      瀏覽器會自己挑最接近的語音。真的完全沒有中文語音時，
   *      唸出來會很怪，但那是裝置限制 —— 我們至少不會主動選國語。
   */
  return null;
}

/* ── 瀏覽器路徑的狀態 ───────────────────────────────────────────── */
let activeUtterance: SpeechSynthesisUtterance | null = null;
let speakTimeoutId: any = null;

/**
 * 語音清單是非同步載入的 —— 這是一個很容易漏掉的坑。
 *
 * 【為什麼要處理】
 *   `getVoices()` 在**第一次呼叫時常常回空陣列**（語音包還沒載入完），
 *   要等 `voiceschanged` 事件之後才拿得到。
 *   舊版直接呼叫 `findBestVoice()`，於是第一次朗讀永遠挑不到語音 ——
 *   在部分瀏覽器上就變成「第一次沒聲音、第二次才有」這種難以重現的症狀。
 *   → 這裡在模組載入時就先觸發一次取得，並在事件來了之後再取一次。
 */
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  try {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', () => {
      window.speechSynthesis.getVoices();
    });
  } catch {
    /* 不支援就算了，朗讀時還會再試一次 */
  }
}

/* ── 原生路徑 ───────────────────────────────────────────────────── */

/**
 * 朗讀中旗標。
 *
 * 【為什麼需要】
 *   原生外掛的 `speak()` 是一個 promise，但它**在朗讀開始時就 resolve**
 *   （不是唸完才 resolve）。所以不能拿它來當「唸完了」的訊號，
 *   否則呼叫端會在聲音還沒出來時就以為結束了。
 *   → 用這個旗標讓 `isSpeaking()` 有合理的行為。
 */
let nativeSpeaking = false;

async function speakNative(
  text: string,
  preferLanguage: TTSLanguage,
  rate: number,
  pitch: number,
  volume: number
): Promise<void> {
  nativeSpeaking = true;
  try {
    await TextToSpeech.stop().catch(() => undefined);
    await TextToSpeech.speak({
      text,
      lang: bcp47(preferLanguage),
      rate,
      pitch,
      volume,
      // Flush：新的朗讀進來就停掉前一段（與瀏覽器路徑的 cancel() 行為一致）
      queueStrategy: 0,
    });
  } finally {
    // 外掛沒有「唸完」的回呼，用文字長度粗估朗讀時間來收尾
    // （中文約每秒 4～5 字；速率 0.88 再打個折）
    const estimatedMs = Math.max(1200, (text.length / 4.2 / Math.max(rate, 0.3)) * 1000);
    setTimeout(() => {
      nativeSpeaking = false;
    }, estimatedMs);
  }
}

/* ── 對外 API ───────────────────────────────────────────────────── */

/**
 * 執行語音朗讀
 *
 * @returns 是否真的送出了朗讀請求（`false` 代表語音被關閉或環境不支援）
 */
export function speakText(text: string, options: TTSOptions = {}): boolean {
  /**
   * ★★ 第一道關卡：使用者關掉了語音就直接結束。
   *    這是**唯一**該擋掉的地方 —— 設 volume 0 不算關閉（見檔頭說明）。
   */
  if (!isTtsEnabled()) {
    return false;
  }

  if (!text || text.trim() === '') {
    return false;
  }

  const rate = options.rate ?? 0.88;
  const pitch = options.pitch ?? 1.0;
  const volume = options.volume ?? getTtsVolume();
  const preferLanguage = options.preferLanguage ?? 'cantonese';

  /* ── 原生（APK）路徑 ─────────────────────────────────────────── */
  if (isNativeTts()) {
    options.onStart?.();
    void speakNative(text, preferLanguage, rate, pitch, volume).catch((err) => {
      nativeSpeaking = false;
      options.onError?.(err);
    });
    return true;
  }

  /* ── 瀏覽器路徑（Web Speech API）────────────────────────────── */
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    // 兩條路都不通：明確回報，不要再靜默失敗
    options.onError?.(new Error('此環境不支援語音朗讀（既非原生 App，瀏覽器也沒有 Web Speech API）'));
    return false;
  }

  // 清除待播排程
  if (speakTimeoutId) {
    clearTimeout(speakTimeoutId);
    speakTimeoutId = null;
  }

  // 若當前已在播放，平順停止前一段
  try {
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      window.speechSynthesis.cancel();
    }
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  } catch {
    // 忽略特定瀏覽器取消過程的非致命例外
  }

  const utterance = new SpeechSynthesisUtterance(text);
  activeUtterance = utterance;

  utterance.rate = rate;
  utterance.pitch = pitch;
  utterance.volume = volume;

  const voice = findBestVoice(preferLanguage);

  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else {
    // 找不到對應語音時，至少把 lang 標籤設對（瀏覽器會自行挑一個最接近的）
    utterance.lang = bcp47(preferLanguage);
  }

  utterance.onstart = () => {
    options.onStart?.();
  };

  utterance.onend = () => {
    if (activeUtterance === utterance) {
      activeUtterance = null;
    }
    options.onEnd?.();
  };

  utterance.onerror = (e: any) => {
    if (activeUtterance === utterance) {
      activeUtterance = null;
    }
    // 在 Chrome 等瀏覽器中，當呼叫 cancel() 或切換新音訊時，會觸發 'canceled' 或 'interrupted' 事件
    // 這是預期的正常行為，不應當作異常錯誤記錄
    if (e.error === 'canceled' || e.error === 'interrupted') {
      options.onEnd?.();
      return;
    }
    // 僅在發生非取消的真正錯誤時回呼
    options.onError?.(e);
  };

  // 在 Chrome 與 Webview 中，cancel() 後立即 speak() 會導致新語音被連帶取消
  // 透過微小的 setTimeout(40ms) 確保瀏覽器底層音訊佇列完全就緒
  speakTimeoutId = setTimeout(() => {
    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      options.onError?.(e);
    }
  }, 40);

  return true;
}

/**
 * 停止當前正在播放的語音
 */
export function stopSpeech(): void {
  if (isNativeTts()) {
    nativeSpeaking = false;
    void TextToSpeech.stop().catch(() => undefined);
    return;
  }

  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    if (speakTimeoutId) {
      clearTimeout(speakTimeoutId);
      speakTimeoutId = null;
    }
    try {
      window.speechSynthesis.cancel();
    } catch {
      // 容錯防護
    }
    activeUtterance = null;
  }
}

/**
 * 檢查當前是否正在播放語音
 */
export function isSpeaking(): boolean {
  if (isNativeTts()) return nativeSpeaking;
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    return window.speechSynthesis.speaking;
  }
  return false;
}

/**
 * 這個環境**能不能**發出聲音（給設定頁顯示用）。
 *
 * 【為什麼要單獨做一個檢查】
 *   使用者說「沒有聲音」時，最需要知道的是「是設定關掉了」還是「這個裝置做不到」。
 *   兩者的處理方式完全不同（一個是去設定打開，一個是無法解決）。
 *   設定頁要能直接告訴使用者是哪一種。
 */
export function canSpeak(): boolean {
  if (isNativeTts()) return true;
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}
