/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ============================================================================
 * 【AI 分析狀態區與語音提示實作】
 * ============================================================================
 * 說明：
 * 當長者送出圖片進行分析時：
 * 1. 顯示高可見度的旋轉 Loading 動畫。
 * 2. 顯示超大字體「AI 正在為您分析，請稍等...」。
 * 3. 透過 Web Speech API (speakText) 自動播放粵語/中文語音提示：「AI 正在為您分析，請稍等」，
 *    並完全遵循使用者個人設定之音量與語速。
 * ============================================================================
 */

import React, { useEffect } from 'react';
import { Sparkles, Volume2 } from 'lucide-react';
import { speakText } from '../utils/tts';
import { AppSettings } from '../types';

interface AnalysisStatusProps {
  settings: AppSettings;
}

export const AnalysisStatus: React.FC<AnalysisStatusProps> = ({ settings }) => {
  // 元件掛載時，依使用者設定之音量與語言自動播放 Web Speech API 語音提示
  useEffect(() => {
    if (settings.voiceVolume <= 0) return; // 靜音模式下不發聲

    const promptText =
      settings.voiceLang === 'cantonese'
        ? 'AI 正在為您分析，請稍等。'
        : 'AI 正在為您分析，請稍等。';

    speakText(promptText, {
      preferLanguage: settings.voiceLang,
      volume: settings.voiceVolume,
      rate: settings.voiceRate,
    });
  }, [settings.voiceLang, settings.voiceVolume, settings.voiceRate]);

  const isYellowContrast = settings.contrastTheme === 'high_contrast_yellow';

  return (
    <section
      className={`border-4 rounded-3xl p-8 sm:p-12 text-center shadow-lg my-6 transition-colors ${
        isYellowContrast
          ? 'bg-zinc-950 border-yellow-400 text-yellow-300'
          : 'bg-blue-50 border-blue-500 text-blue-950'
      }`}
    >
      <div className="flex flex-col items-center justify-center gap-6">
        {/* 大型轉圈圈 Loading 動畫 */}
        <div className="relative">
          <div
            className={`w-24 h-24 sm:w-28 sm:h-28 rounded-full border-8 animate-spin ${
              isYellowContrast
                ? 'border-zinc-800 border-t-yellow-400'
                : 'border-blue-200 border-t-blue-600'
            }`}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <Sparkles
              className={`w-10 h-10 animate-pulse ${
                isYellowContrast ? 'text-yellow-400' : 'text-blue-600'
              }`}
            />
          </div>
        </div>

        {/* 超大字體狀態說明 (長者友善) */}
        <div>
          <h3 className="text-3xl sm:text-4xl font-black tracking-wide">
            AI 正在為您分析，請稍等...
          </h3>
          <p
            className={`text-xl sm:text-2xl font-bold mt-3 flex items-center justify-center gap-2 ${
              isYellowContrast ? 'text-yellow-400/90' : 'text-blue-800'
            }`}
          >
            <Volume2 className="w-6 h-6 animate-bounce" />
            正在對照您的健康指標，為您檢查高鈉、高糖與過敏原
          </p>
        </div>
      </div>
    </section>
  );
};
