/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ============================================================================
 * 【語音合成 TTS 邏輯實作位置】
 * ============================================================================
 * 說明：
 * 本模組使用瀏覽器原生的 Web Speech API (window.speechSynthesis / SpeechSynthesisUtterance)
 * 為所有使用者提供語音朗讀輔助（不是只有長者 —— 本 App 有 6 種身分）：
 * 1. 優先匹配粵語 (zh-HK / yue-Hant-HK / Cantonese) 語音包，符合港澳與廣東使用者的偏好；
 *    若裝置未安裝粵語包，則優雅自動降級至標準中文 (zh-TW / zh-CN)。
 * 2. 採用清晰、稍慢的語速 (rate: 0.88)，讓聽力較弱或吵雜環境下也能聽清每一個字。
 * 3. 提供完整的播放控制：即時打斷重播、播放中狀態追蹤、以及分析中的即時語音提示。
 * ============================================================================
 */

export interface TTSOptions {
  rate?: number;       // 語速，預設 0.88 (慢速清晰)
  pitch?: number;      // 音調，預設 1.0
  volume?: number;     // 音量，預設 1.0
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
  return language === 'en' ? 'english' : 'cantonese';
}

/**
 * 取得裝置支援的語音列表，優先選取指定的語言
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
  }

  // 次選台灣正體中文或繁體中文
  const zhTwVoice = voices.find((v) => v.lang === 'zh-TW' || v.lang === 'zh-Hant');
  if (zhTwVoice) return zhTwVoice;

  // 再次選任意中文語音 (zh, zh-CN)
  const anyZhVoice = voices.find((v) => v.lang.startsWith('zh'));
  if (anyZhVoice) return anyZhVoice;

  return null;
}

// 保持當前播放的 Utterance 參照，防止被瀏覽器 Garbage Collector 提前回收
let activeUtterance: SpeechSynthesisUtterance | null = null;
let speakTimeoutId: any = null;

/**
 * 執行語音朗讀
 */
export function speakText(text: string, options: TTSOptions = {}): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    options.onError?.(new Error('瀏覽器不支援語音合成'));
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

  if (!text || text.trim() === '') {
    return false;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  activeUtterance = utterance;

  // 長者專用語速設定 (0.88x 比標準略慢，咬字更清晰)
  utterance.rate = options.rate ?? 0.88;
  utterance.pitch = options.pitch ?? 1.0;
  utterance.volume = options.volume ?? 1.0;

  const preferLanguage = options.preferLanguage ?? 'cantonese';
  const voice = findBestVoice(preferLanguage);

  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else {
    // 找不到對應語音時，至少把 lang 標籤設對（瀏覽器會自行挑一個最接近的）
    utterance.lang =
      preferLanguage === 'english' ? 'en-US' : preferLanguage === 'cantonese' ? 'zh-HK' : 'zh-TW';
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
    } catch {
      // 容錯防護
    }
  }, 40);

  return true;
}

/**
 * 停止當前正在播放的語音
 */
export function stopSpeech(): void {
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
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    return window.speechSynthesis.speaking;
  }
  return false;
}
