/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 分析模式選擇器（Analysis Mode Picker）— 三選一
 * ============================================================================
 *
 * 【為什麼要抽成共用元件】
 *   引導頁與設定頁都要讓使用者選同一件事。
 *   各寫一份的話，選項文字、順序、說明遲早會漂移 ——
 *   而且漂移**不會報錯**，只會出現「引導頁說會上傳照片、設定頁說不會」
 *   這種最不該發生的矛盾。
 *
 * 【★ 為什麼每一張卡片都要寫「什麼會離開這台手機」】
 *   這是三個模式唯一的差別，也是使用者做選擇的唯一依據。
 *   只寫「準確 / 快速 / 私密」這種形容詞是不夠的 ——
 *   使用者有權知道**具體哪一項資料**會被送出去。
 *   這一行與後端**所有** `localOnly` 判斷必須一致 —— 目前有三處：
 *   `server/handlers.ts` 的 analyze-label／ask-health-question，
 *   以及 `server/fitnessReport.ts` 的 fitness-report（2026-10-04 補上）。
 *   新增任何會呼叫雲端的功能時，這裡的文案與該功能的閘門都要一起改。
 */

import React from 'react';
import { Cloud, WifiOff, Check } from 'lucide-react';
import type { AnalysisMode } from '../types';
import { useI18n } from '../i18n/I18nContext';
import { ANALYSIS_MODES, MODE_LABEL_KEY, MODE_NOTE_KEY, MODE_DATA_KEY } from '../data/analysisModes';

export interface AnalysisModePickerProps {
  value: AnalysisMode;
  onChange: (mode: AnalysisMode) => void;
  /** 是否顯示標題與說明（預設 true） */
  showHeading?: boolean;
}

export const AnalysisModePicker: React.FC<AnalysisModePickerProps> = ({
  value,
  onChange,
  showHeading = true,
}) => {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-3">
      {showHeading && (
        <div>
          <h2 className="text-[19px] font-black text-slate-950">{t('mode.title')}</h2>
          <p className="text-[16px] font-bold text-slate-800 leading-relaxed mt-1">
            {t('mode.body')}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {ANALYSIS_MODES.map((m) => {
          const on = value === m;
          const Icon = m === 'local_only' ? WifiOff : Cloud;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onChange(m)}
              aria-pressed={on}
              /**
               * ★ 2026-10-02：由 `flex items-start` 改為 `flex flex-col`。
               *
               * 【為什麼】
               *   「上傳：…」那一行原本是右側欄位的一部分 ——
               *   要跟圖示（24px）、間距（15px）、**選中時的勾勾（24px＋間距）**
               *   一起分那 360px 的寬度。實測剩下只有 **128px**
               *   （長者字級 19px → 一行只放得下 6 個字），
               *   於是「上傳：照片與病史」被折成 2 行、末行只剩 1 個字（孤行）。
               *
               *   但這一行是**整張卡片最重要的一句**（它決定使用者按不按得下去），
               *   卻分到最少的寬度 —— 順序完全錯了。
               *   改成獨立一列之後它拿到全寬（約 238px），英文版也放得下。
               */
              className={`min-h-[48px] rounded-xl px-4 py-3 text-left border-2 flex flex-col gap-2 transition-all active:scale-[0.99] cursor-pointer ${
                on ? 'bg-blue-800 text-white border-blue-800' : 'bg-white text-slate-800 border-slate-300'
              }`}
            >
              <span className="flex items-start gap-3 w-full">
                <Icon className="w-6 h-6 shrink-0 mt-[2px]" aria-hidden="true" />
                <span className="flex flex-col gap-[2px] flex-1 min-w-0">
                  <span className="text-[18px] font-black">{t(MODE_LABEL_KEY[m])}</span>
                  <span
                    className={`text-[16px] font-bold leading-snug ${
                      on ? 'text-blue-100' : 'text-slate-600'
                    }`}
                  >
                    {t(MODE_NOTE_KEY[m])}
                  </span>
                </span>
                {on && <Check className="w-6 h-6 shrink-0 mt-[2px]" aria-hidden="true" />}
              </span>
              <span
                className={`block w-full text-[16px] font-black leading-snug ${
                  on ? 'text-yellow-300' : 'text-amber-700'
                }`}
              >
                {t(MODE_DATA_KEY[m])}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-[16px] font-bold text-slate-700 leading-relaxed">
        {t('mode.changeLater')}
      </p>
    </div>
  );
};
