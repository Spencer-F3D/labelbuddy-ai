/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  X,
  Volume2,
  VolumeX,
  Volume1,
  Type,
  Eye,
  Sliders,
  Play,
  RotateCcw,
  Check,
  ShieldAlert,
} from 'lucide-react';
import { AppSettings } from '../types';
import { speakText, stopSpeech } from '../utils/tts';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (newSettings: Partial<AppSettings>) => void;
  onResetSettings: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onResetSettings,
}) => {
  if (!isOpen) return null;

  // 測試目前音量與發音
  const handleTestVoice = () => {
    stopSpeech();
    const testPhrase =
      settings.voiceLang === 'cantonese'
        ? '阿伯阿婆你好！呢個係 LabelBuddy AI 嘅粵語朗讀音量測試，聽唔聽得清楚呀？'
        : '您好！這是 LabelBuddy AI 的國語語音音量測試，您聽得清楚嗎？';

    speakText(testPhrase, {
      preferLanguage: settings.voiceLang,
      volume: settings.voiceVolume,
      rate: settings.voiceRate,
    });
  };

  const isYellowContrast = settings.contrastTheme === 'high_contrast_yellow';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm overflow-y-auto"
    >
      <div
        className={`w-full max-w-2xl rounded-3xl border-4 shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col ${
          isYellowContrast
            ? 'bg-black border-yellow-400 text-yellow-300'
            : 'bg-white border-blue-600 text-slate-900'
        }`}
      >
        {/* 設定標題列 (超大文字與關閉按鈕) */}
        <div
          className={`px-6 py-5 flex items-center justify-between border-b-4 ${
            isYellowContrast
              ? 'bg-zinc-900 border-yellow-400 text-yellow-300'
              : 'bg-blue-600 border-blue-700 text-white'
          }`}
        >
          <div className="flex items-center gap-3">
            <Sliders className="w-8 h-8" />
            <h2 id="settings-dialog-title" className="text-2xl sm:text-3xl font-black">
              個人偏好與聲音設定
            </h2>
          </div>
          <button
            type="button"
            id="btn-close-settings"
            onClick={onClose}
            className={`p-3 rounded-2xl font-bold cursor-pointer transition-colors ${
              isYellowContrast
                ? 'bg-yellow-400 text-black hover:bg-yellow-300'
                : 'bg-white/20 hover:bg-white/30 text-white'
            }`}
            title="關閉設定視窗"
          >
            <X className="w-8 h-8" />
          </button>
        </div>

        {/* 設定主滾動區 */}
        <div className="p-6 sm:p-8 space-y-8 overflow-y-auto">
          {/* =========================================================
              1. 語音音量設定 (Voice Volume)
             ========================================================= */}
          <div
            className={`p-5 rounded-2xl border-3 ${
              isYellowContrast
                ? 'border-yellow-500/60 bg-zinc-900'
                : 'border-slate-300 bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="flex items-center gap-2 text-2xl font-black">
                <Volume2 className="w-7 h-7 text-blue-600" />
                語音朗讀音量
              </span>
              <span className="text-2xl font-extrabold text-blue-600 px-3 py-1 rounded-xl bg-blue-100">
                {Math.round(settings.voiceVolume * 100)}%
              </span>
            </div>

            {/* 音量滑桿 (超粗易拖曳) */}
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.voiceVolume}
              onChange={(e) =>
                onUpdateSettings({ voiceVolume: parseFloat(e.target.value) })
              }
              aria-label="調整音量大小"
              className="w-full h-8 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />

            {/* 快速音量檔位按鈕 (大尺寸按鈕，適合手指觸控) */}
            <div className="grid grid-cols-4 gap-2 mt-4">
              {[
                { label: '靜音', val: 0.0, icon: <VolumeX className="w-5 h-5" /> },
                { label: '小聲 40%', val: 0.4, icon: <Volume1 className="w-5 h-5" /> },
                { label: '適中 75%', val: 0.75, icon: <Volume2 className="w-5 h-5" /> },
                { label: '最大聲 100%', val: 1.0, icon: <Volume2 className="w-5 h-5 font-bold" /> },
              ].map((item) => (
                <button
                  type="button"
                  key={item.label}
                  onClick={() => onUpdateSettings({ voiceVolume: item.val })}
                  className={`py-3 px-2 rounded-xl text-lg font-bold flex flex-col items-center justify-center gap-1 border-2 transition-colors cursor-pointer ${
                    Math.abs(settings.voiceVolume - item.val) < 0.05
                      ? 'bg-blue-600 text-white border-blue-700 shadow'
                      : isYellowContrast
                      ? 'bg-zinc-800 text-yellow-300 border-yellow-500/50 hover:bg-zinc-700'
                      : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {item.icon}
                  <span className="text-base">{item.label}</span>
                </button>
              ))}
            </div>

            {/* 即時試聽按鈕 */}
            <div className="mt-4 pt-4 border-t border-slate-200">
              <button
                type="button"
                id="btn-test-voice-sound"
                onClick={handleTestVoice}
                className="w-full py-3 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black text-xl flex items-center justify-center gap-3 shadow transition-colors cursor-pointer"
              >
                <Play className="w-6 h-6 fill-white" />
                <span>🔊 點此試聽目前音量與語音</span>
              </button>
            </div>
          </div>

          {/* =========================================================
              2. 語速與方言語言 (Voice Rate & Language)
             ========================================================= */}
          <div
            className={`p-5 rounded-2xl border-3 ${
              isYellowContrast
                ? 'border-yellow-500/60 bg-zinc-900'
                : 'border-slate-300 bg-slate-50'
            }`}
          >
            <h3 className="text-2xl font-black mb-3">語音方言與朗讀語速</h3>

            {/* 語言選擇 */}
            <div className="mb-4">
              <span className="text-lg font-bold block mb-2 text-slate-700">朗讀方言：</span>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ voiceLang: 'cantonese' })}
                  className={`py-4 px-4 rounded-xl text-xl font-bold border-3 flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                    settings.voiceLang === 'cantonese'
                      ? 'bg-blue-600 text-white border-blue-700 shadow'
                      : isYellowContrast
                      ? 'bg-zinc-800 text-yellow-300 border-zinc-600'
                      : 'bg-white text-slate-900 border-slate-300'
                  }`}
                >
                  {settings.voiceLang === 'cantonese' && <Check className="w-6 h-6" />}
                  <span>🇭🇰 粵語 (廣東話)</span>
                </button>

                <button
                  type="button"
                  onClick={() => onUpdateSettings({ voiceLang: 'mandarin' })}
                  className={`py-4 px-4 rounded-xl text-xl font-bold border-3 flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                    settings.voiceLang === 'mandarin'
                      ? 'bg-blue-600 text-white border-blue-700 shadow'
                      : isYellowContrast
                      ? 'bg-zinc-800 text-yellow-300 border-zinc-600'
                      : 'bg-white text-slate-900 border-slate-300'
                  }`}
                >
                  {settings.voiceLang === 'mandarin' && <Check className="w-6 h-6" />}
                  <span>🗣️ 標準國語 (普通話)</span>
                </button>
              </div>
            </div>

            {/* 語速選擇 */}
            <div>
              <span className="text-lg font-bold block mb-2 text-slate-700">朗讀速度：</span>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: '慢速 0.75x', val: 0.75 },
                  { label: '適中 0.88x', val: 0.88 },
                  { label: '常速 1.0x', val: 1.0 },
                ].map((item) => (
                  <button
                    type="button"
                    key={item.label}
                    onClick={() => onUpdateSettings({ voiceRate: item.val })}
                    className={`py-3 px-3 rounded-xl text-lg font-bold border-2 text-center cursor-pointer transition-colors ${
                      settings.voiceRate === item.val
                        ? 'bg-blue-600 text-white border-blue-700 shadow'
                        : isYellowContrast
                        ? 'bg-zinc-800 text-yellow-300 border-zinc-600'
                        : 'bg-white text-slate-800 border-slate-300'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 自動朗讀結果開關 */}
            <div className="mt-4 pt-4 border-t border-slate-200 flex items-center justify-between gap-4">
              <div>
                <span className="text-xl font-extrabold block text-slate-900">
                  辨識完成後自動朗讀
                </span>
                <span className="text-base text-slate-600">
                  開啟後，AI 辨識完畢會自動為您朗讀結果
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({ autoPlaySpeech: !settings.autoPlaySpeech })
                }
                className={`px-5 py-2.5 rounded-xl font-extrabold text-lg border-2 cursor-pointer transition-colors ${
                  settings.autoPlaySpeech
                    ? 'bg-emerald-600 text-white border-emerald-700'
                    : 'bg-slate-300 text-slate-700 border-slate-400'
                }`}
              >
                {settings.autoPlaySpeech ? '已開啟' : '已關閉'}
              </button>
            </div>
          </div>

          {/* =========================================================
              3. 全應用字體大小 (App Font Size Scale)
             ========================================================= */}
          <div
            className={`p-5 rounded-2xl border-3 ${
              isYellowContrast
                ? 'border-yellow-500/60 bg-zinc-900'
                : 'border-slate-300 bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2 text-2xl font-black mb-3">
              <Type className="w-7 h-7 text-blue-600" />
              全應用字體大小 (即時縮放整套 App)
            </div>
            <p className="text-lg text-slate-600 mb-4">
              選擇最適合您雙眼的字體大小，整個頁面所有字體將同步放大：
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { id: 'standard', label: '標準大字 (20px)', desc: '推薦' },
                { id: 'large', label: '特大字 (24px)', desc: '視力退化推薦' },
                { id: 'huge', label: '放大鏡模式 (28px)', desc: '特大字號' },
              ].map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() =>
                    onUpdateSettings({ fontSizeLevel: item.id as any })
                  }
                  className={`p-4 rounded-xl border-3 text-left transition-colors cursor-pointer ${
                    settings.fontSizeLevel === item.id
                      ? 'bg-blue-600 text-white border-blue-700 shadow-md'
                      : isYellowContrast
                      ? 'bg-zinc-800 text-yellow-300 border-zinc-600'
                      : 'bg-white text-slate-900 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <div className="font-black text-xl">{item.label}</div>
                  <div
                    className={`text-sm mt-1 font-bold ${
                      settings.fontSizeLevel === item.id
                        ? 'text-blue-100'
                        : 'text-slate-500'
                    }`}
                  >
                    {item.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* =========================================================
              4. 全站視覺對比度主題 (Screen Theme / High Contrast)
             ========================================================= */}
          <div
            className={`p-5 rounded-2xl border-3 ${
              isYellowContrast
                ? 'border-yellow-500/60 bg-zinc-900'
                : 'border-slate-300 bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2 text-2xl font-black mb-3">
              <Eye className="w-7 h-7 text-blue-600" />
              視覺色彩模式
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onUpdateSettings({ contrastTheme: 'standard' })}
                className={`p-4 rounded-xl border-3 text-left cursor-pointer transition-colors ${
                  settings.contrastTheme === 'standard'
                    ? 'bg-blue-600 text-white border-blue-700 shadow-md'
                    : 'bg-white text-slate-900 border-slate-300 hover:bg-slate-100'
                }`}
              >
                <div className="font-black text-xl">☀️ 標準白底清晰模式</div>
                <div className="text-base mt-1 text-slate-500">
                  純白背景，深色大字，藍綠鮮明
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({ contrastTheme: 'high_contrast_yellow' })
                }
                className={`p-4 rounded-xl border-3 text-left cursor-pointer transition-colors ${
                  settings.contrastTheme === 'high_contrast_yellow'
                    ? 'bg-yellow-400 text-black border-yellow-500 font-bold shadow-md'
                    : 'bg-black text-yellow-300 border-yellow-500/50 hover:bg-zinc-900'
                }`}
              >
                <div className="font-black text-xl">🌙 弱視專用黃黑高對比</div>
                <div className="text-base mt-1 opacity-90">
                  極黑底金色大字，減少刺眼白光
                </div>
              </button>
            </div>
          </div>

          {/* =========================================================
              5. 拍照防手抖鎖定秒數 (Anti-Shake Lock Seconds)
             ========================================================= */}
          <div
            className={`p-5 rounded-2xl border-3 ${
              isYellowContrast
                ? 'border-yellow-500/60 bg-zinc-900'
                : 'border-slate-300 bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <span className="text-xl font-black block">
                  拍照防手抖鎖定時長
                </span>
                <span className="text-base text-slate-600">
                  按下拍照後暫時鎖定按鈕，防止長者手抖連按
                </span>
              </div>

              <div className="flex gap-2">
                {[3, 4, 5].map((sec) => (
                  <button
                    type="button"
                    key={sec}
                    onClick={() => onUpdateSettings({ debounceSeconds: sec })}
                    className={`px-4 py-2 rounded-xl text-lg font-black border-2 cursor-pointer ${
                      settings.debounceSeconds === sec
                        ? 'bg-blue-600 text-white border-blue-700'
                        : isYellowContrast
                        ? 'bg-zinc-800 text-yellow-300 border-zinc-600'
                        : 'bg-white text-slate-800 border-slate-300'
                    }`}
                  >
                    {sec} 秒
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 底部操作欄 */}
        <div
          className={`p-5 border-t-4 flex flex-col sm:flex-row items-center justify-between gap-4 ${
            isYellowContrast
              ? 'bg-zinc-900 border-yellow-400'
              : 'bg-slate-100 border-slate-300'
          }`}
        >
          <button
            type="button"
            onClick={onResetSettings}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-bold text-lg px-4 py-2 rounded-xl hover:bg-slate-200 cursor-pointer transition-colors"
          >
            <RotateCcw className="w-5 h-5" />
            恢復預設設定
          </button>

          <button
            type="button"
            id="btn-confirm-settings"
            onClick={onClose}
            className={`w-full sm:w-auto px-8 py-4 rounded-2xl font-black text-2xl flex items-center justify-center gap-2 shadow-lg cursor-pointer transition-colors ${
              isYellowContrast
                ? 'bg-yellow-400 hover:bg-yellow-300 text-black'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            <Check className="w-7 h-7" />
            <span>完成並儲存設定</span>
          </button>
        </div>
      </div>
    </div>
  );
};
