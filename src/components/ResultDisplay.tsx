/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ============================================================================
 * 【結果顯示區與語音朗讀實作】
 * ============================================================================
 * 說明：
 * 1. 根據 AI 回傳的 JSON 資料解析：
 *    - risk_level ('red' | 'yellow' | 'green')：對應紅、黃、綠三種高辨識度警示背景
 *    - warning_title：大字警告標題 (字體 32px 以上)
 *    - plain_summary：長者專用大字白話摘要 (字體 24px 以上)
 *    - alternative_advice：健康替代與份量建議
 * 2. 語音朗讀按鈕 (TTS)：提供一個極大、色彩鮮明的喇叭圖標按鈕，
 *    點擊後調用 Web Speech API 朗讀白話摘要，預設使用粵語發音（支援切換國語）。
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { Volume2, VolumeX, AlertTriangle, CheckCircle, AlertCircle, ShoppingBag, Lightbulb, RotateCcw } from 'lucide-react';
import { LabelAnalysisResult, AppSettings } from '../types';
import { speakText, stopSpeech } from '../utils/tts';

interface ResultDisplayProps {
  result: LabelAnalysisResult;
  settings: AppSettings;
  onReset: () => void;
}

export const ResultDisplay: React.FC<ResultDisplayProps> = ({
  result,
  settings,
  onReset,
}) => {
  const [isSpeakingNow, setIsSpeakingNow] = useState<boolean>(false);

  // 當新結果出現時，若設定允許自動朗讀且未靜音，自動為長者朗讀白話摘要
  useEffect(() => {
    if (settings.autoPlaySpeech && settings.voiceVolume > 0) {
      handleSpeak();
    }
    return () => {
      stopSpeech();
    };
  }, [result, settings.voiceLang, settings.voiceVolume, settings.voiceRate, settings.autoPlaySpeech]);

  /**
   * 觸發 Web Speech API 朗讀白話摘要
   */
  const handleSpeak = () => {
    if (isSpeakingNow) {
      stopSpeech();
      setIsSpeakingNow(false);
      return;
    }

    // 朗讀內容包含警示標題與白話摘要
    const speechScript = `${result.warning_title}。${result.plain_summary}。建議：${result.alternative_advice}`;

    const started = speakText(speechScript, {
      preferLanguage: settings.voiceLang,
      rate: settings.voiceRate,
      volume: settings.voiceVolume,
      onStart: () => setIsSpeakingNow(true),
      onEnd: () => setIsSpeakingNow(false),
      onError: () => setIsSpeakingNow(false),
    });

    if (!started) {
      setIsSpeakingNow(false);
    }
  };

  // 根據 risk_level 取得顏色主題配置
  const getThemeConfig = (level: string) => {
    switch (level) {
      case 'red':
        return {
          bg: 'bg-red-50',
          border: 'border-red-600',
          headerBg: 'bg-red-600',
          headerText: 'text-white',
          titleColor: 'text-red-950',
          badgeText: '⚠️ 不建議購買 / 含有害指標',
          icon: <AlertTriangle className="w-12 h-12 text-white shrink-0" />,
        };
      case 'yellow':
        return {
          bg: 'bg-amber-50',
          border: 'border-amber-600',
          headerBg: 'bg-amber-500',
          headerText: 'text-slate-950',
          titleColor: 'text-amber-950',
          badgeText: '⚠️ 需注意份量 / 限量食用',
          icon: <AlertCircle className="w-12 h-12 text-slate-950 shrink-0" />,
        };
      case 'green':
      default:
        return {
          bg: 'bg-emerald-50',
          border: 'border-emerald-600',
          headerBg: 'bg-emerald-600',
          headerText: 'text-white',
          titleColor: 'text-emerald-950',
          badgeText: '✅ 成分健康 / 適合食用',
          icon: <CheckCircle className="w-12 h-12 text-white shrink-0" />,
        };
    }
  };

  const theme = getThemeConfig(result.risk_level);

  return (
    <section className="space-y-6 my-6">
      {/* 1. 風險等級主卡片 */}
      <div
        className={`rounded-3xl border-4 ${theme.border} ${theme.bg} shadow-xl overflow-hidden transition-all`}
      >
        {/* 卡片頂部彩條 */}
        <div className={`px-6 py-4 ${theme.headerBg} ${theme.headerText} flex items-center justify-between gap-4`}>
          <div className="flex items-center gap-3">
            {theme.icon}
            <span className="text-2xl sm:text-3xl font-black tracking-wide">
              {theme.badgeText}
            </span>
          </div>
          <span className="text-xl font-bold bg-white/20 px-4 py-1 rounded-full">
            AI 評估結果
          </span>
        </div>

        <div className="p-6 sm:p-10 space-y-8">
          {/* 大字警告標題 (字體 32px 以上，極度顯眼) */}
          <div className="border-b-4 border-slate-200/80 pb-6">
            <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
              <span className="text-sm sm:text-base font-extrabold px-3 py-1 rounded-full bg-slate-200 text-slate-800">
                {result.analysis_mode === 'cloud_ai'
                  ? '✨ 雲端視覺 AI 分析'
                  : '🛡️ 智慧長者營養與身體指標守護引擎'}
              </span>
            </div>
            <h2
              className={`text-3xl sm:text-5xl font-black ${theme.titleColor} leading-tight`}
            >
              {result.warning_title}
            </h2>

            {/* 觸發的身體指標提醒 */}
            {result.matched_conditions && result.matched_conditions.length > 0 && (
              <div className="mt-4 p-4 rounded-2xl bg-white/90 border-2 border-red-300">
                <span className="text-lg font-black text-red-900 block mb-1">
                  ⚠️ 比對您勾選的健康指標發現：
                </span>
                <div className="flex flex-wrap gap-2">
                  {result.matched_conditions.map((item, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1 rounded-xl text-base sm:text-lg font-black bg-red-600 text-white shadow-sm"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 語音朗讀專用按鈕 (超巨大喇叭圖示，符合語音優先原則) */}
          <div className="bg-white p-6 rounded-3xl border-3 border-slate-300 shadow-md">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-center sm:text-left">
                <span className="text-lg font-extrabold text-blue-900 bg-blue-100 px-3 py-1 rounded-lg">
                  語音播報（{settings.voiceLang === 'cantonese' ? '粵語' : '國語'} · 音量 {Math.round(settings.voiceVolume * 100)}%）
                </span>
                <p className="text-xl font-bold text-slate-700 mt-2">
                  {isSpeakingNow ? '🔊 正在為您大聲朗讀中...' : '點擊下方大喇叭，聽專人朗讀給您聽'}
                </p>
              </div>

              <button
                type="button"
                id="btn-tts-speak"
                onClick={handleSpeak}
                className={`w-full sm:w-auto px-8 py-5 rounded-2xl font-black text-2xl sm:text-3xl flex items-center justify-center gap-4 text-white shadow-lg transition-all cursor-pointer border-3 ${
                  isSpeakingNow
                    ? 'bg-rose-600 hover:bg-rose-700 border-rose-400 animate-pulse'
                    : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 border-blue-400'
                }`}
              >
                {isSpeakingNow ? (
                  <>
                    <VolumeX className="w-9 h-9" />
                    <span>停止朗讀</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-9 h-9" />
                    <span>🔊 語音朗讀</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 白話摘要卡片 (大字體，口語化解說，長者一看就懂) */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border-3 border-slate-300 shadow-md">
            <div className="flex items-center gap-3 text-blue-900 mb-3">
              <ShoppingBag className="w-8 h-8 text-blue-700" />
              <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-950">
                白話摘要說明
              </h3>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-slate-900 leading-relaxed">
              {result.plain_summary}
            </p>
          </div>

          {/* 替代建議卡片 (實用超市選購與份量指引) */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border-3 border-slate-300 shadow-md">
            <div className="flex items-center gap-3 text-emerald-900 mb-3">
              <Lightbulb className="w-8 h-8 text-amber-500" />
              <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-950">
                健康選購與替代建議
              </h3>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-slate-800 leading-relaxed">
              {result.alternative_advice}
            </p>
          </div>

          {/* 偵測到的成分與指標細項 */}
          {(result.nutrition_concerns?.length || result.ingredients_detected?.length) ? (
            <div className="bg-white/80 rounded-2xl p-5 border-2 border-slate-300">
              <h4 className="text-xl font-extrabold text-slate-900 mb-3">
                🔍 標籤詳細檢查紀錄：
              </h4>
              {result.nutrition_concerns && result.nutrition_concerns.length > 0 && (
                <div className="mb-3">
                  <span className="text-lg font-bold text-red-700">注意事項：</span>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {result.nutrition_concerns.map((item, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1 bg-red-100 border border-red-300 text-red-900 rounded-lg text-lg font-bold"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {result.ingredients_detected && result.ingredients_detected.length > 0 && (
                <div>
                  <span className="text-lg font-bold text-slate-700">辨識成分：</span>
                  <p className="text-lg text-slate-800 mt-1 font-medium">
                    {result.ingredients_detected.join('、')}
                  </p>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* 重新拍照 / 檢查下一個食品按鈕 */}
      <div className="flex justify-center pt-2">
        <button
          type="button"
          id="btn-scan-another"
          onClick={() => {
            stopSpeech();
            onReset();
          }}
          className="w-full max-w-xl py-5 px-8 rounded-3xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-black text-2xl sm:text-3xl shadow-xl flex items-center justify-center gap-3 border-4 border-blue-400 cursor-pointer transition-transform active:scale-[0.98]"
        >
          <RotateCcw className="w-8 h-8" />
          <span>📸 再照一張 / 檢查其他食品</span>
        </button>
      </div>
    </section>
  );
};
