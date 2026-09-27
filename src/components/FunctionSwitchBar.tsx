/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ============================================================================
 * 行動裝置專用功能切換列 (Mobile-Friendly Function Switch Bar)
 * ============================================================================
 * 1. 專為手機拇指單手操作優化 (Ergonomic Thumb-Zone Design for Mobile Phones)
 * 2. 支援「底部懸浮固定導航列 (Fixed Mobile Bottom Bar)」與「頂部大按鈕分段列」
 * 3. 具備 48px+ 超大觸控目標、無障礙高對比色彩、防誤觸間距
 * 4. 內建環境震動回饋 (Haptic Feedback) 與安全區域適應 (Safe-Area Inset)
 * ============================================================================
 */

import React, { useCallback } from 'react';
import { Camera, HeartPulse, Sliders, CheckCircle2, BookOpen } from 'lucide-react';
import { AppSettings } from '../types';

export type ActiveFunctionTab = 'food_scanner' | 'physical_indicators';

interface FunctionSwitchBarProps {
  activeTab: ActiveFunctionTab;
  onSelectTab: (tab: ActiveFunctionTab) => void;
  onOpenSettings?: () => void;
  onOpenGuide?: () => void;
  contrastTheme?: string;
  variant?: 'bottom_bar' | 'top_bar';
}

export const FunctionSwitchBar: React.FC<FunctionSwitchBarProps> = ({
  activeTab,
  onSelectTab,
  onOpenSettings,
  onOpenGuide,
  contrastTheme = 'standard',
  variant = 'bottom_bar',
}) => {
  const isYellowContrast = contrastTheme === 'high_contrast_yellow';

  // 輕微觸覺回饋
  const triggerHaptic = useCallback((duration = 40) => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(duration);
      } catch {
        // ignore
      }
    }
  }, []);

  const handleTabChange = (tab: ActiveFunctionTab) => {
    triggerHaptic(50);
    onSelectTab(tab);
    // 平滑滾動至頁面頂端，方便長者從頭閱讀
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSettingsClick = () => {
    triggerHaptic(40);
    if (onOpenSettings) onOpenSettings();
  };

  const handleGuideClick = () => {
    triggerHaptic(40);
    if (onOpenGuide) onOpenGuide();
  };

  // ==========================================
  // 樣式 A：手機專用「底部懸浮固定切換列」 (Mobile Bottom App Bar)
  // ==========================================
  if (variant === 'bottom_bar') {
    return (
      <nav
        role="navigation"
        aria-label="行動端功能切換列"
        id="mobile-bottom-function-bar"
        className={`fixed bottom-0 left-0 right-0 z-40 sm:hidden border-t-4 transition-all pb-[max(env(safe-area-inset-bottom),10px)] pt-2 px-2.5 shadow-[0_-6px_25px_rgba(0,0,0,0.25)] ${
          isYellowContrast
            ? 'bg-black/95 border-yellow-400 text-yellow-300 backdrop-blur-md'
            : 'bg-white/95 border-blue-600 text-slate-900 backdrop-blur-md'
        }`}
      >
        <div className="max-w-md mx-auto flex items-center justify-around gap-1.5">
          {/* 功能 1：拍照檢查食品 */}
          <button
            type="button"
            id="mobile-tab-food-scanner"
            onClick={() => handleTabChange('food_scanner')}
            className={`flex-1 min-h-[64px] py-1.5 px-2 rounded-2xl flex flex-col items-center justify-center gap-1 font-black transition-all cursor-pointer active:scale-95 border-2 ${
              activeTab === 'food_scanner'
                ? isYellowContrast
                  ? 'bg-yellow-400 text-black border-yellow-300 shadow-md ring-2 ring-yellow-400'
                  : 'bg-blue-600 text-white border-blue-400 shadow-md ring-2 ring-blue-500'
                : isYellowContrast
                ? 'bg-zinc-900 text-yellow-300/80 border-zinc-800'
                : 'bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <div className="relative">
              <Camera className="w-6 h-6" />
              {activeTab === 'food_scanner' && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-white animate-pulse" />
              )}
            </div>
            <span className="text-base font-black leading-tight tracking-tight">
              📸 檢查
            </span>
          </button>

          {/* 功能 2：自填身體指標 */}
          <button
            type="button"
            id="mobile-tab-physical-indicators"
            onClick={() => handleTabChange('physical_indicators')}
            className={`flex-1 min-h-[64px] py-1.5 px-2 rounded-2xl flex flex-col items-center justify-center gap-1 font-black transition-all cursor-pointer active:scale-95 border-2 ${
              activeTab === 'physical_indicators'
                ? isYellowContrast
                  ? 'bg-yellow-400 text-black border-yellow-300 shadow-md ring-2 ring-yellow-400'
                  : 'bg-emerald-600 text-white border-emerald-400 shadow-md ring-2 ring-emerald-500'
                : isYellowContrast
                ? 'bg-zinc-900 text-yellow-300/80 border-zinc-800'
                : 'bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <div className="relative">
              <HeartPulse className="w-6 h-6" />
              {activeTab === 'physical_indicators' && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-400 ring-2 ring-white animate-pulse" />
              )}
            </div>
            <span className="text-base font-black leading-tight tracking-tight">
              🫀 指標
            </span>
          </button>

          {/* 功能 3：使用說明 (新手圖文導引與大字口訣) */}
          {onOpenGuide && (
            <button
              type="button"
              id="mobile-tab-guide"
              onClick={handleGuideClick}
              className={`w-16 min-h-[64px] py-1.5 px-1 rounded-2xl flex flex-col items-center justify-center gap-1 font-black transition-all cursor-pointer active:scale-95 border-2 ${
                isYellowContrast
                  ? 'bg-zinc-900 text-amber-300 border-amber-400 hover:bg-zinc-800'
                  : 'bg-amber-100 text-amber-950 border-amber-300 hover:bg-amber-200'
              }`}
              title="查看標籤拍照圖文說明"
            >
              <BookOpen className="w-6 h-6 text-amber-600 dark:text-amber-300" />
              <span className="text-sm font-black leading-tight">說明</span>
            </button>
          )}

          {/* 快捷輔助：手機端快速打開偏好設定（音量/字體/語系） */}
          {onOpenSettings && (
            <button
              type="button"
              id="mobile-tab-settings"
              onClick={handleSettingsClick}
              className={`w-16 min-h-[64px] py-1.5 px-1 rounded-2xl flex flex-col items-center justify-center gap-1 font-black transition-all cursor-pointer active:scale-95 border-2 ${
                isYellowContrast
                  ? 'bg-zinc-900 text-yellow-300 border-zinc-700 hover:bg-zinc-800'
                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
              }`}
              title="調整音量與字體大小"
            >
              <Sliders className="w-6 h-6" />
              <span className="text-sm font-bold leading-tight">設定</span>
            </button>
          )}
        </div>
      </nav>
    );
  }

  // ==========================================
  // 樣式 B：頁面內容切換卡片條 (Top Segmented Bar)
  // ==========================================
  return (
    <nav
      role="navigation"
      aria-label="主要功能分頁列"
      id="desktop-function-switch-bar"
      className="w-full"
    >
      <div
        className={`p-2 sm:p-2.5 rounded-3xl border-4 shadow-xl flex flex-col sm:flex-row gap-3 transition-all ${
          isYellowContrast
            ? 'bg-zinc-950 border-yellow-400/90'
            : 'bg-white border-blue-600'
        }`}
      >
        {/* 按鈕 1: 拍照檢查食品 */}
        <button
          type="button"
          id="main-tab-food-scanner"
          onClick={() => handleTabChange('food_scanner')}
          className={`flex-1 py-4 sm:py-5 px-5 rounded-2xl font-black text-xl sm:text-2xl flex items-center justify-center gap-3 transition-all cursor-pointer active:scale-[0.98] border-3 shadow-md ${
            activeTab === 'food_scanner'
              ? isYellowContrast
                ? 'bg-yellow-400 text-black border-yellow-300 ring-4 ring-yellow-400/50'
                : 'bg-blue-600 text-white border-blue-400 ring-4 ring-blue-500/40'
              : isYellowContrast
              ? 'bg-zinc-900 text-yellow-300/80 border-zinc-800 hover:bg-zinc-800'
              : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-blue-50/50'
          }`}
        >
          <Camera className="w-7 h-7 sm:w-8 sm:h-8 shrink-0" />
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span>📸 拍照檢查食品</span>
              {activeTab === 'food_scanner' && (
                <span className="hidden md:inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-white/25">
                  目前功能
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm font-semibold opacity-85 hidden sm:block">
              對焦拍攝食品成分表與營養標示
            </p>
          </div>
        </button>

        {/* 按鈕 2: 自填身體指標 */}
        <button
          type="button"
          id="main-tab-physical-indicators"
          onClick={() => handleTabChange('physical_indicators')}
          className={`flex-1 py-4 sm:py-5 px-5 rounded-2xl font-black text-xl sm:text-2xl flex items-center justify-center gap-3 transition-all cursor-pointer active:scale-[0.98] border-3 shadow-md ${
            activeTab === 'physical_indicators'
              ? isYellowContrast
                ? 'bg-yellow-400 text-black border-yellow-300 ring-4 ring-yellow-400/50'
                : 'bg-emerald-600 text-white border-emerald-400 ring-4 ring-emerald-500/40'
              : isYellowContrast
              ? 'bg-zinc-900 text-yellow-300/80 border-zinc-800 hover:bg-zinc-800'
              : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-emerald-50/50'
          }`}
        >
          <HeartPulse className="w-7 h-7 sm:w-8 sm:h-8 text-rose-400 shrink-0 animate-pulse" />
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span>🫀 身體指標與諮詢</span>
              {activeTab === 'physical_indicators' && (
                <span className="hidden md:inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-white/25">
                  目前功能
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm font-semibold opacity-85 hidden sm:block">
              血壓血糖即時分析與常見健康問答
            </p>
          </div>
        </button>
      </div>
    </nav>
  );
};
