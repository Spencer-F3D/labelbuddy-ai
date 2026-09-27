/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, HeartPulse, CheckSquare, Square, Filter, Sparkles, RotateCcw } from 'lucide-react';
import { ChronicCondition } from '../types';
import { PHYSICAL_INDICATORS, CONDITION_CATEGORIES } from '../data/conditions';

interface HealthSettingsProps {
  selectedConditions: string[];
  onToggleCondition: (id: string) => void;
  onSelectMultiple?: (ids: string[]) => void;
  contrastTheme?: string;
}

export const HealthSettings: React.FC<HealthSettingsProps> = ({
  selectedConditions,
  onToggleCondition,
  onSelectMultiple,
  contrastTheme = 'standard',
}) => {
  // 預設展開，長者一目了然
  const [isOpen, setIsOpen] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const isYellowContrast = contrastTheme === 'high_contrast_yellow';

  // 篩選分類
  const filteredConditions = activeCategory === 'all'
    ? PHYSICAL_INDICATORS
    : PHYSICAL_INDICATORS.filter((c) => c.category === activeCategory);

  // 快捷組合套用
  const handleApplyPreset = (presetType: 'san_gao' | 'gout_kidney' | 'all' | 'clear') => {
    if (!onSelectMultiple) {
      // 容錯依序切換
      return;
    }
    if (presetType === 'san_gao') {
      onSelectMultiple(['hypertension', 'diabetes', 'hyperlipidemia']);
    } else if (presetType === 'gout_kidney') {
      onSelectMultiple(['hypertension', 'gout', 'kidney_disease', 'gerd']);
    } else if (presetType === 'all') {
      onSelectMultiple(PHYSICAL_INDICATORS.map((c) => c.id));
    } else if (presetType === 'clear') {
      onSelectMultiple([]);
    }
  };

  const selectedCount = selectedConditions.length;

  return (
    <section
      className={`rounded-3xl border-4 shadow-md overflow-hidden transition-all ${
        isYellowContrast
          ? 'bg-zinc-950 border-yellow-400 text-yellow-300'
          : 'bg-white border-slate-300 text-slate-950'
      }`}
    >
      {/* 摺疊面板按鈕 (超大點擊區、大圖標、大字體) */}
      <button
        type="button"
        id="btn-toggle-health-settings"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        className={`w-full px-6 py-5 flex items-center justify-between gap-4 cursor-pointer text-left border-b-2 transition-colors ${
          isYellowContrast
            ? 'bg-zinc-900 border-yellow-500/60 hover:bg-zinc-800'
            : 'bg-slate-50 border-slate-200 hover:bg-slate-100 active:bg-slate-200'
        }`}
      >
        <div className="flex items-center gap-4">
          <span
            className={`p-3 rounded-2xl ${
              isYellowContrast
                ? 'bg-yellow-400 text-black'
                : 'bg-red-100 text-red-700'
            }`}
          >
            <HeartPulse className="w-8 h-8" />
          </span>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl sm:text-3xl font-extrabold">
                個人各項身體健康指標設定
              </h2>
              <span
                className={`text-sm sm:text-base font-extrabold px-3 py-0.5 rounded-full border ${
                  isYellowContrast
                    ? 'bg-yellow-400 text-black border-yellow-500'
                    : 'bg-blue-600 text-white border-blue-700'
                }`}
              >
                已勾選 {selectedCount} 項
              </span>
            </div>
            <p
              className={`text-lg sm:text-xl font-bold mt-1 ${
                isYellowContrast ? 'text-yellow-400/90' : 'text-slate-600'
              }`}
            >
              已守護：
              <span
                className={`font-extrabold ml-1 ${
                  isYellowContrast ? 'text-yellow-300 underline' : 'text-blue-700'
                }`}
              >
                {selectedCount === 0
                  ? '尚未選擇（建議勾選您關注的身體指標）'
                  : selectedConditions
                      .map((id) => PHYSICAL_INDICATORS.find((c) => c.id === id)?.name)
                      .filter(Boolean)
                      .slice(0, 4)
                      .join('、') + (selectedCount > 4 ? ` 等共 ${selectedCount} 項` : '')}
              </span>
            </p>
          </div>
        </div>

        <div
          className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 shrink-0 ${
            isYellowContrast
              ? 'bg-black border-yellow-400 text-yellow-300'
              : 'bg-white border-slate-300 text-slate-700'
          }`}
        >
          <span className="text-lg font-bold">
            {isOpen ? '收起指標' : '展開 12 項指標'}
          </span>
          {isOpen ? (
            <ChevronUp className="w-7 h-7" />
          ) : (
            <ChevronDown className="w-7 h-7" />
          )}
        </div>
      </button>

      {/* 展開後的身體指標清單 */}
      {isOpen && (
        <div
          className={`p-6 sm:p-8 space-y-6 ${
            isYellowContrast ? 'bg-zinc-950' : 'bg-white'
          }`}
        >
          {/* 快捷一鍵套用按鈕列 */}
          {onSelectMultiple && (
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 pb-2 border-b border-dashed border-slate-300/80">
              <span className="text-base sm:text-lg font-bold flex items-center gap-1 opacity-90">
                <Sparkles className="w-5 h-5 text-amber-500" />
                長輩快捷推薦：
              </span>
              <button
                type="button"
                id="btn-preset-sanggao"
                onClick={() => handleApplyPreset('san_gao')}
                className={`px-4 py-2 rounded-xl text-base font-bold border-2 cursor-pointer transition-colors ${
                  isYellowContrast
                    ? 'bg-zinc-900 border-yellow-400 hover:bg-zinc-800 text-yellow-300'
                    : 'bg-blue-50 border-blue-400 text-blue-900 hover:bg-blue-100'
                }`}
              >
                🫀 常用三高必選 (血壓/血糖/血脂)
              </button>
              <button
                type="button"
                id="btn-preset-gout"
                onClick={() => handleApplyPreset('gout_kidney')}
                className={`px-4 py-2 rounded-xl text-base font-bold border-2 cursor-pointer transition-colors ${
                  isYellowContrast
                    ? 'bg-zinc-900 border-yellow-400 hover:bg-zinc-800 text-yellow-300'
                    : 'bg-amber-50 border-amber-400 text-amber-900 hover:bg-amber-100'
                }`}
              >
                🧪 痛風/腎臟/腸胃專案
              </button>
              <button
                type="button"
                id="btn-preset-all"
                onClick={() => handleApplyPreset('all')}
                className={`px-3 py-2 rounded-xl text-base font-bold border-2 cursor-pointer transition-colors ${
                  isYellowContrast
                    ? 'bg-zinc-900 border-zinc-700 hover:bg-zinc-800 text-yellow-300'
                    : 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200'
                }`}
              >
                全部 12 項勾選
              </button>
              <button
                type="button"
                id="btn-preset-clear"
                onClick={() => handleApplyPreset('clear')}
                className={`px-3 py-2 rounded-xl text-base font-bold border-2 cursor-pointer transition-colors ${
                  isYellowContrast
                    ? 'bg-zinc-900 border-zinc-700 hover:bg-zinc-800 text-yellow-300/80'
                    : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <RotateCcw className="w-4 h-4 inline mr-1" />
                清空
              </button>
            </div>
          )}

          {/* 指標分類標籤過濾列 */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-bold flex items-center gap-1 opacity-80 mr-1">
              <Filter className="w-4 h-4" /> 分類：
            </span>
            {CONDITION_CATEGORIES.map((cat) => {
              const isActive = activeCategory === cat.id;
              return (
                <button
                  type="button"
                  key={cat.id}
                  id={`cat-filter-${cat.id}`}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-4 py-2 rounded-2xl text-base sm:text-lg font-bold border-2 transition-all cursor-pointer ${
                    isActive
                      ? isYellowContrast
                        ? 'bg-yellow-400 text-black border-yellow-500 shadow-md scale-105'
                        : 'bg-blue-600 text-white border-blue-700 shadow-md scale-105'
                      : isYellowContrast
                      ? 'bg-zinc-900 text-yellow-300/80 border-zinc-700 hover:bg-zinc-800'
                      : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                  }`}
                >
                  <span className="mr-1.5">{cat.icon}</span>
                  {cat.name}
                </button>
              );
            })}
          </div>

          <p
            className={`text-lg sm:text-xl font-bold ${
              isYellowContrast ? 'text-yellow-300' : 'text-slate-800'
            }`}
          >
            點擊下方身體指標方塊，AI 會針對您關注的健康與成分特別把關：
          </p>

          {/* 12 項指標大卡片網格 (超大點擊面積，防止長者誤觸) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredConditions.map((cond) => {
              const isChecked = selectedConditions.includes(cond.id);
              return (
                <button
                  type="button"
                  key={cond.id}
                  id={`checkbox-${cond.id}`}
                  onClick={() => onToggleCondition(cond.id)}
                  aria-pressed={isChecked}
                  className={`flex items-start gap-4 p-5 rounded-2xl border-4 text-left transition-all cursor-pointer select-none ${
                    isChecked
                      ? isYellowContrast
                        ? 'border-yellow-400 bg-zinc-900 text-yellow-300 shadow-lg ring-2 ring-yellow-400/50'
                        : 'border-blue-600 bg-blue-50/90 text-slate-950 shadow-md ring-2 ring-blue-500/30'
                      : isYellowContrast
                      ? 'border-zinc-800 bg-black text-yellow-400/60 hover:bg-zinc-900 hover:border-zinc-700'
                      : 'border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100 hover:border-slate-400'
                  }`}
                >
                  {/* 大打勾框 (長者清晰可見) */}
                  <div
                    className={`mt-1 shrink-0 ${
                      isChecked
                        ? isYellowContrast
                          ? 'text-yellow-400'
                          : 'text-blue-700'
                        : 'text-slate-400'
                    }`}
                  >
                    {isChecked ? (
                      <CheckSquare
                        className={`w-9 h-9 ${
                          isYellowContrast
                            ? 'text-yellow-400 fill-zinc-900'
                            : 'fill-blue-600 text-white'
                        }`}
                      />
                    ) : (
                      <Square className="w-9 h-9" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-2xl sm:text-3xl font-black tracking-wide">
                        {cond.name}
                      </span>
                      <span
                        className={`text-sm sm:text-base font-black px-3 py-1 rounded-xl whitespace-nowrap ${
                          isChecked
                            ? isYellowContrast
                              ? 'bg-yellow-400 text-black shadow-sm'
                              : 'bg-blue-600 text-white shadow-sm'
                            : isYellowContrast
                            ? 'bg-zinc-800 text-yellow-400/80 border border-zinc-700'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {cond.badge}
                      </span>
                    </div>

                    <p
                      className={`text-lg font-bold mt-2 leading-relaxed ${
                        isYellowContrast ? 'text-yellow-300/90' : 'text-slate-700'
                      }`}
                    >
                      {cond.description}
                    </p>

                    {/* 監測成分標籤 */}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {cond.targetNutrients.map((nutrient, idx) => (
                        <span
                          key={idx}
                          className={`text-xs sm:text-sm font-bold px-2.5 py-0.5 rounded-md border ${
                            isChecked
                              ? isYellowContrast
                                ? 'bg-zinc-800 border-yellow-500/50 text-yellow-300'
                                : 'bg-blue-100 border-blue-300 text-blue-900'
                              : isYellowContrast
                              ? 'bg-zinc-900 border-zinc-800 text-zinc-400'
                              : 'bg-white border-slate-200 text-slate-600'
                          }`}
                        >
                          {nutrient}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};
