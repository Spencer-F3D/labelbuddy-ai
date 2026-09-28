/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 語言選擇器（放在「健康設定」頁最上方）
 * ============================================================================
 * 【設計原則——沿用本專案對長者的三項生理考量】
 *   1. 水晶體黃化（藍光被吸收）→ 藍色只給「可操作」，不承載安全／危險語意
 *   2. 周邊視野縮減 → 關鍵資訊集中中央主欄
 *   3. 對比敏感度下降 → 內文一律深色，不用淺灰
 *
 * 【三重編碼】
 *   選中狀態同時用「打勾圖示 + 文字 + 顏色」表達，
 *   不讓顏色單獨承載資訊（紅綠色盲在男性約 8%）。
 *
 * 【為什麼選項要顯示母語名稱而不是翻譯】
 *   「繁體中文」永遠寫成「繁體中文」，不會因為切到英文就變成「Traditional Chinese」。
 *   使用者若看不懂當前語言，才找得到自己的語言 —— 這是語言選擇器的通用慣例。
 */

import { Check, Languages } from 'lucide-react';
import { useI18n } from './I18nContext';
import { LANGUAGE_OPTIONS } from './translations';

export function LanguagePicker() {
  const { language, setLanguage, t } = useI18n();

  return (
    <section
      id="settings-language"
      aria-labelledby="settings-language-title"
      className="bg-white rounded-3xl p-5 border-4 border-blue-900 shadow-md flex flex-col space-y-4"
    >
      <div className="border-b-2 border-slate-200 pb-3">
        <h2
          id="settings-language-title"
          className="text-[20px] font-black text-slate-950 flex items-center gap-2"
        >
          <Languages className="w-[32px] h-[32px] text-blue-800 shrink-0" />
          {t('settings.language.title')}
        </h2>
        <p className="text-[16px] font-bold text-slate-700 mt-[4px]">
          {t('settings.language.desc')}
        </p>
      </div>

      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-[10px]">
        {LANGUAGE_OPTIONS.map((opt) => {
          const isActive = language === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              id={`language-option-${opt.id}`}
              aria-pressed={isActive}
              onClick={() => setLanguage(opt.id)}
              className={`min-h-[76px] px-[14px] py-[10px] rounded-[14px] flex items-center gap-[12px] text-left cursor-pointer transition-all active:scale-95 border-[2px] ${
                isActive
                  ? 'bg-blue-900 text-white border-blue-950 shadow-md'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-900 border-slate-300'
              }`}
            >
              {/* 語言代碼圓形徽章：讓不識字的視覺線索也能分辨兩個選項 */}
              <span
                className={`w-[44px] h-[44px] shrink-0 rounded-full flex items-center justify-center text-[18px] font-black ${
                  isActive ? 'bg-blue-800 text-white' : 'bg-white text-slate-700 border border-slate-300'
                }`}
                aria-hidden="true"
              >
                {opt.short}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-[19px] font-black leading-tight">
                  {t(opt.labelKey)}
                </span>
                <span
                  className={`block text-[16px] font-bold leading-tight ${
                    isActive ? 'text-blue-200' : 'text-slate-600'
                  }`}
                >
                  {t(opt.hintKey)}
                </span>
              </span>

              {/* 打勾：不讓顏色單獨承載「已選中」這個資訊 */}
              {isActive && (
                <Check className="w-[26px] h-[26px] shrink-0 text-yellow-400" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
