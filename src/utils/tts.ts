/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ============================================================================
 * 【語音合成 TTS 邏輯實作位置】
 * ============================================================================
 * 說明：
 * 本模組使用瀏覽器原生的 Web Speech API (window.speechSynthesis / SpeechSynthesisUtterance)
 * 專為 60 歲以上長者設計的語音朗讀輔助：
 * 1. 優先匹配粵語 (zh-HK / yue-Hant-HK / Cantonese) 語音包，滿足香港與廣東地區長者的偏好；
 *    若長者裝置未安裝粵語包，則優雅自動降級至標準中文 (zh-TW / zh-CN)。
 * 2. 設定專為長者設計的清晰慢速語速 (rate: 0.88)，讓聽力較弱的長者能聽清每一個字。
 * 3. 提供完整的播放控制：即時打斷重播、播放中狀態追蹤、以及分析中的即時語音提示。
 * ============================================================================
 */

export interface TTSOptions {
  rate?: number;       // 語速，預設 0.88 (慢速清晰)
  pitch?: number;      // 音調，預設 1.0
  volume?: number;     // 音量，預設 1.0
  preferLanguage?: 'cantonese' | 'mandarin'; // 偏好語言
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: any) => void;
}

/**
 * 取得裝置支援的語音列表，優先選取粵語語音
 */
export function findBestVoice(preferLang: 'cantonese' | 'mandarin' = 'cantonese'): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    return null;
  }

  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) {
    return null;
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
    // 預設語言標籤設為繁體中文/香港
    utterance.lang = preferLanguage === 'cantonese' ? 'zh-HK' : 'zh-TW';
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
