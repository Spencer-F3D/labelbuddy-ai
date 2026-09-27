/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Sparkles, Volume2, ShieldCheck, Sliders, VolumeX, BookOpen } from 'lucide-react';
import { AppSettings } from '../types';

interface HeaderProps {
  settings: AppSettings;
  onOpenSettings: () => void;
  onToggleLang: () => void;
  onOpenGuide?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  settings,
  onOpenSettings,
  onToggleLang,
  onOpenGuide,
}) => {
  const isYellowContrast = settings.contrastTheme === 'high_contrast_yellow';

  return (
    <header
      className={`border-b-4 shadow-sm px-4 py-5 sm:px-8 transition-colors ${
        isYellowContrast
          ? 'bg-black border-yellow-400 text-yellow-300'
          : 'bg-white border-blue-600 text-slate-950'
      }`}
    >
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* 標題與副標題 (字體超大，確保 60 歲長者清晰閱讀) */}
        <div className="text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start gap-3">
            <span
              className={`inline-flex items-center justify-center w-12 h-12 rounded-2xl shadow-md ${
                isYellowContrast
                  ? 'bg-yellow-400 text-black font-black'
                  : 'bg-blue-600 text-white'
              }`}
            >
              <Sparkles className="w-7 h-7" />
            </span>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              LabelBuddy AI
            </h1>
          </div>
          <p
            className={`mt-2 text-xl sm:text-2xl font-bold flex items-center justify-center sm:justify-start gap-2 ${
              isYellowContrast ? 'text-yellow-400' : 'text-blue-900'
            }`}
          >
            <ShieldCheck
              className={`w-6 h-6 inline shrink-0 ${
                isYellowContrast ? 'text-yellow-400' : 'text-emerald-600'
              }`}
            />
            您的超市健康小幫手
          </p>
        </div>

        {/* 頂部快捷控制區：語音切換、使用說明與個人設定按鈕 */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          {/* 使用說明按鈕 (以大字體圖文說明如何正確擺放食品標籤) */}
          {onOpenGuide && (
            <button
              type="button"
              id="btn-header-usage-guide"
              onClick={onOpenGuide}
              className={`flex items-center gap-2 px-4 py-3 rounded-2xl border-3 font-black text-lg sm:text-xl transition-all shadow-md cursor-pointer active:scale-95 ${
                isYellowContrast
                  ? 'bg-yellow-400 border-yellow-300 text-black hover:bg-yellow-300'
                  : 'bg-emerald-600 border-emerald-500 text-white hover:bg-emerald-700 ring-2 ring-emerald-400/30'
              }`}
              title="查看食品標籤正確拍攝與擺放圖文說明"
            >
              <BookOpen className="w-6 h-6" />
              <span>📖 使用說明</span>
            </button>
          )}

          {/* 方言切換快捷按鈕 */}
          <button
            type="button"
            id="btn-toggle-tts-lang"
            onClick={onToggleLang}
            className={`flex items-center gap-2 px-4 py-3 rounded-2xl border-3 font-bold text-lg sm:text-xl transition-colors shadow-sm cursor-pointer ${
              isYellowContrast
                ? 'bg-zinc-900 border-yellow-400 text-yellow-300 hover:bg-zinc-800'
                : 'bg-blue-50 border-blue-600 text-blue-950 hover:bg-blue-100'
            }`}
            title="點擊切換朗讀方言（粵語 / 國語）"
          >
            {settings.voiceVolume === 0 ? (
              <VolumeX className="w-6 h-6 text-red-500" />
            ) : (
              <Volume2 className="w-6 h-6 text-blue-700" />
            )}
            <span>{settings.voiceLang === 'cantonese' ? '粵語' : '國語'}</span>
          </button>

          {/* 聲音音量與全應用設定按鈕 (巨大顯眼) */}
          <button
            type="button"
            id="btn-open-settings"
            onClick={onOpenSettings}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl border-3 font-black text-lg sm:text-xl transition-colors shadow-md cursor-pointer ${
              isYellowContrast
                ? 'bg-yellow-400 border-yellow-500 text-black hover:bg-yellow-300'
                : 'bg-blue-600 border-blue-700 text-white hover:bg-blue-700 active:bg-blue-800'
            }`}
            title="開啟聲音音量與全應用設定"
          >
            <Sliders className="w-6 h-6" />
            <span>
              ⚙️ 聲音與設定 (
              {settings.voiceVolume === 0
                ? '靜音'
                : `${Math.round(settings.voiceVolume * 100)}%`}
              )
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
