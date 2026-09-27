/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ============================================================================
 * 食品標籤拍攝使用說明彈窗 (Usage Guide Modal for Senior Mobile Users)
 * ============================================================================
 * 專為手機端長者設計：
 * 1. 大字體圖文解說：如何正確平整擺放食品標籤以獲得最佳辨識率。
 * 2. 正確 vs 錯誤對比圖解卡片：一秒看懂「太遠/反光/手指遮擋」等常見問題。
 * 3. 語音朗讀功能：一鍵大聲朗讀拍攝秘訣（支援粵語/國語）。
 * 4. 手機省力技巧：手肘靠推車防手抖、開啟補光燈等貼心建議。
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  BookOpen,
  CheckCircle2,
  XCircle,
  Volume2,
  VolumeX,
  Camera,
  Lightbulb,
  Smartphone,
  Scan,
  Sparkles,
  Zap,
} from 'lucide-react';
import { AppSettings } from '../types';
import { speakText, stopSpeech } from '../utils/tts';

interface UsageGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartCamera?: () => void;
  settings: AppSettings;
}

export const UsageGuideModal: React.FC<UsageGuideModalProps> = ({
  isOpen,
  onClose,
  onStartCamera,
  settings,
}) => {
  const [isPlayingVoice, setIsPlayingVoice] = useState<boolean>(false);
  const isYellowContrast = settings.contrastTheme === 'high_contrast_yellow';

  useEffect(() => {
    if (!isOpen) {
      stopSpeech();
      setIsPlayingVoice(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // 語音朗讀口語腳本
  const voiceScript =
    settings.voiceLang === 'cantonese'
      ? '長輩您好！在手機上拍照食品標籤有三個簡單竅門：第一，將包裝袋拉平，避開超市頭頂的燈光反光；第二，將手機拿近約十五公分，不用拍整包食物，只要將成分表或者營養標籤填滿螢幕中央的框框；第三，將手肘輕輕靠在手推車上防手抖，按下拍照鍵，手機震一下就代表拍好，ＡＩ就會大聲唸給您聽！'
      : '長輩您好！在手機上拍照食品標籤有三個好用小訣竅：第一，把包裝袋拉平，避開超市天花板的燈光反光；第二，手機拿近大約十五公分，不用拍整包食品，只要把成分表或營養標示填滿畫面中央的框線；第三，手肘可以輕靠在推車上手就不會晃，按下拍照鍵，手機震動一下就代表拍成功，ＡＩ就會直接大聲讀給您聽喔！';

  const handleToggleVoice = () => {
    if (isPlayingVoice) {
      stopSpeech();
      setIsPlayingVoice(false);
    } else {
      setIsPlayingVoice(true);
      speakText(voiceScript, {
        rate: settings.voiceRate || 0.88,
        volume: settings.voiceVolume || 1.0,
        preferLanguage: settings.voiceLang || 'cantonese',
        onEnd: () => setIsPlayingVoice(false),
        onError: () => setIsPlayingVoice(false),
      });
    }
  };

  const handleClose = () => {
    stopSpeech();
    setIsPlayingVoice(false);
    onClose();
  };

  const handleStartCaptureNow = () => {
    handleClose();
    if (onStartCamera) {
      onStartCamera();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      id="usage-guide-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-150"
    >
      <div
        className={`relative w-full max-w-2xl my-auto rounded-3xl border-4 shadow-2xl overflow-hidden transition-all ${
          isYellowContrast
            ? 'bg-black border-yellow-400 text-yellow-300'
            : 'bg-white border-blue-600 text-slate-900'
        }`}
      >
        {/* 頂部導覽列 */}
        <header
          className={`flex items-center justify-between p-5 sm:p-6 border-b-3 ${
            isYellowContrast
              ? 'bg-zinc-950 border-yellow-500/50'
              : 'bg-blue-50 border-blue-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <span
              className={`p-3 rounded-2xl shadow-md ${
                isYellowContrast
                  ? 'bg-yellow-400 text-black'
                  : 'bg-blue-600 text-white'
              }`}
            >
              <BookOpen className="w-7 h-7 sm:w-8 sm:h-8" />
            </span>
            <div>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
                食品標籤拍照指南
              </h2>
              <p className="text-base sm:text-lg font-bold text-slate-600 dark:text-yellow-400/80">
                手機簡單三步驟，字字清晰秒辨識
              </p>
            </div>
          </div>

          <button
            type="button"
            id="btn-close-usage-guide"
            onClick={handleClose}
            className="p-3 rounded-2xl bg-slate-200 hover:bg-slate-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-yellow-300 font-black cursor-pointer transition-all active:scale-95"
            aria-label="關閉使用說明"
          >
            <X className="w-7 h-7 sm:w-8 sm:h-8" />
          </button>
        </header>

        {/* 彈窗主要內容區 */}
        <div className="p-5 sm:p-7 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* 語音大聲讀按鈕 (專為不愛看字長輩設計) */}
          <div
            className={`p-4 sm:p-5 rounded-2xl border-3 flex flex-col sm:flex-row items-center justify-between gap-4 ${
              isYellowContrast
                ? 'bg-zinc-900 border-yellow-400/80'
                : 'bg-emerald-50 border-emerald-400'
            }`}
          >
            <div className="flex items-center gap-3 text-center sm:text-left">
              <span className="text-3xl">🔊</span>
              <div>
                <h3 className="text-xl sm:text-2xl font-black text-emerald-950 dark:text-yellow-300">
                  想用聽的？請點右邊按鈕
                </h3>
                <p className="text-base font-bold text-emerald-800 dark:text-yellow-400/80">
                  系統會以清晰慢速廣東話 / 國語大聲讀出拍攝技巧
                </p>
              </div>
            </div>

            <button
              type="button"
              id="btn-guide-tts"
              onClick={handleToggleVoice}
              className={`w-full sm:w-auto px-6 py-3.5 rounded-2xl font-black text-lg sm:text-xl flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all active:scale-95 ${
                isPlayingVoice
                  ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
                  : isYellowContrast
                  ? 'bg-yellow-400 text-black hover:bg-yellow-300'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              {isPlayingVoice ? (
                <>
                  <VolumeX className="w-6 h-6" />
                  <span>停止朗讀</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-6 h-6" />
                  <span>語音大聲唸給我聽</span>
                </>
              )}
            </button>
          </div>

          {/* 核心三步驟說明卡片 */}
          <div className="space-y-4">
            <h3 className="text-2xl sm:text-3xl font-black flex items-center gap-2">
              <span>📱 簡單三步驟（手機拍照最清晰）</span>
            </h3>

            {/* 步驟 1 */}
            <div className="p-4 sm:p-5 rounded-2xl border-2 border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900/60 flex items-start gap-4">
              <span className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-blue-600 text-white font-black text-2xl flex items-center justify-center shrink-0 shadow-md">
                1
              </span>
              <div className="space-y-1">
                <h4 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-yellow-300">
                  拉平包裝，稍微避開頂燈反光
                </h4>
                <p className="text-lg font-bold text-slate-700 dark:text-zinc-300 leading-relaxed">
                  食品袋若皺皺的，用雙手把標籤處稍微拉平；若超市天花板的燈光直射包裝造成反光白斑，將手機或包裝稍微傾斜 15 度即可。
                </p>
              </div>
            </div>

            {/* 步驟 2 */}
            <div className="p-4 sm:p-5 rounded-2xl border-2 border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900/60 flex items-start gap-4">
              <span className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-emerald-600 text-white font-black text-2xl flex items-center justify-center shrink-0 shadow-md">
                2
              </span>
              <div className="space-y-1">
                <h4 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-yellow-300">
                  靠近鏡頭，不用拍整包食物
                </h4>
                <p className="text-lg font-bold text-slate-700 dark:text-zinc-300 leading-relaxed">
                  距離約 <strong className="text-emerald-700 dark:text-yellow-400">15 ~ 20 公分</strong>（約一個手掌長度）。只需將「成分表」或「營養標示」填滿畫面中間的綠色框線即可。
                </p>
              </div>
            </div>

            {/* 步驟 3 */}
            <div className="p-4 sm:p-5 rounded-2xl border-2 border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900/60 flex items-start gap-4">
              <span className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-amber-600 text-white font-black text-2xl flex items-center justify-center shrink-0 shadow-md">
                3
              </span>
              <div className="space-y-1">
                <h4 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-yellow-300">
                  手拿穩，震動一下即拍好
                </h4>
                <p className="text-lg font-bold text-slate-700 dark:text-zinc-300 leading-relaxed">
                  點擊中間大按鈕，手機震動一下就代表照片拍好囉！AI 馬上為您放大關鍵成分並以語音大聲播放。
                </p>
              </div>
            </div>
          </div>

          {/* 正確 vs 錯誤 對比圖解卡片 */}
          <div className="space-y-3">
            <h3 className="text-2xl font-black flex items-center gap-2">
              <span>⚖️ 一秒看懂：正確示範 vs 常見錯誤</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 正確示範卡片 */}
              <div className="p-5 rounded-2xl border-3 border-emerald-500 bg-emerald-50/80 dark:bg-zinc-900/90 space-y-3 shadow-md">
                <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-400 font-black text-2xl">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 shrink-0" />
                  <span>✅ 正確拍法</span>
                </div>
                <div className="p-4 rounded-xl bg-white dark:bg-black border-2 border-emerald-300 text-center space-y-2">
                  <div className="w-full py-4 border-2 border-dashed border-emerald-500 rounded-lg bg-emerald-50 dark:bg-zinc-800">
                    <p className="font-mono font-black text-xl text-emerald-950 dark:text-emerald-300">
                      【營養標示 / 成分表】
                    </p>
                    <p className="text-sm font-bold text-emerald-800 dark:text-emerald-400">
                      文字平整、大字置中填滿
                    </p>
                  </div>
                </div>
                <ul className="text-base sm:text-lg font-bold text-emerald-950 dark:text-zinc-200 space-y-1.5 list-disc pl-5">
                  <li>標籤文字拉平且正對相機</li>
                  <li>成分與糖/鈉數字清晰不模糊</li>
                  <li>光線均勻，無強烈眩光白斑</li>
                </ul>
              </div>

              {/* 錯誤 NG 卡片 */}
              <div className="p-5 rounded-2xl border-3 border-rose-400 bg-rose-50/80 dark:bg-zinc-900/90 space-y-3 shadow-md">
                <div className="flex items-center gap-2 text-rose-800 dark:text-rose-400 font-black text-2xl">
                  <XCircle className="w-8 h-8 text-rose-600 shrink-0" />
                  <span>❌ 常見 NG 錯誤</span>
                </div>
                <div className="p-4 rounded-xl bg-white dark:bg-black border-2 border-rose-300 text-center space-y-2">
                  <div className="w-full py-4 border-2 border-dashed border-rose-400 rounded-lg bg-rose-50 dark:bg-zinc-800">
                    <p className="font-mono font-bold text-base text-rose-900 dark:text-rose-300 line-through">
                      [ 整包餅乾遠遠拍，字如芝麻 ]
                    </p>
                    <p className="text-sm font-bold text-rose-700 dark:text-rose-400">
                      或者手指擋住了營養數字
                    </p>
                  </div>
                </div>
                <ul className="text-base sm:text-lg font-bold text-rose-950 dark:text-zinc-200 space-y-1.5 list-disc pl-5">
                  <li>拍整包食品（太遠字太小，AI 看不清）</li>
                  <li>手拿著拍照時，大拇指遮住成分字樣</li>
                  <li>晃動太快或超市燈光在包裝上反白</li>
                </ul>
              </div>
            </div>
          </div>

          {/* 長輩手機省力私房秘訣 */}
          <div
            className={`p-4 sm:p-5 rounded-2xl border-2 flex items-start gap-3.5 ${
              isYellowContrast
                ? 'bg-zinc-900 border-yellow-400'
                : 'bg-amber-50 border-amber-300 text-amber-950'
            }`}
          >
            <Lightbulb className="w-8 h-8 text-amber-500 shrink-0 mt-1" />
            <div className="space-y-1">
              <h4 className="text-xl font-black">💡 長輩防手抖貼心小招數</h4>
              <p className="text-base sm:text-lg font-bold leading-relaxed">
                在超市拍照時，可以將<strong>手肘輕靠在購物推車的手把</strong>或貨架邊緣，手部有了支撐點，拍照時手機就會非常穩定，一拍即中！
              </p>
            </div>
          </div>
        </div>

        {/* 底部行動按鈕 */}
        <footer
          className={`p-5 sm:p-6 border-t-3 flex flex-col sm:flex-row items-center justify-between gap-4 ${
            isYellowContrast
              ? 'bg-zinc-950 border-yellow-500/50'
              : 'bg-slate-50 border-slate-200'
          }`}
        >
          <button
            type="button"
            id="btn-close-guide-secondary"
            onClick={handleClose}
            className="w-full sm:w-auto px-6 py-4 rounded-2xl bg-slate-200 hover:bg-slate-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 font-black text-xl cursor-pointer transition-all active:scale-95"
          >
            關閉說明
          </button>

          <button
            type="button"
            id="btn-guide-start-camera"
            onClick={handleStartCaptureNow}
            className={`w-full sm:flex-1 py-4 sm:py-5 px-8 rounded-2xl font-black text-2xl flex items-center justify-center gap-3 shadow-xl cursor-pointer transition-all active:scale-95 border-3 ${
              isYellowContrast
                ? 'bg-yellow-400 text-black border-yellow-300 hover:bg-yellow-300'
                : 'bg-blue-600 hover:bg-blue-700 text-white border-blue-400 ring-4 ring-blue-500/30'
            }`}
          >
            <Camera className="w-7 h-7 sm:w-8 sm:h-8" />
            <span>📸 我懂了，立刻去拍照！</span>
          </button>
        </footer>
      </div>
    </div>
  );
};
