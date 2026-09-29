/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 稱謂性別選擇器（Gender Picker）
 * ============================================================================
 *
 * 【這個元件的唯一職責】
 *   問使用者「要怎麼稱呼您」，並把答案交給呼叫端存起來。
 *   它**不判斷任何營養或風險** —— 每日參考值不因性別改變。
 *
 * 【為什麼要抽成共用元件】
 *   引導頁與設定頁都要問同一題。如果兩邊各寫一份，
 *   選項文字、順序、預設值遲早會漂移 —— 而且不會報錯，
 *   只會出現「引導頁問先生／小姐，設定頁卻是別的選項」這種矛盾。
 *   所以選項資料（`GENDER_OPTIONS`）只留一份在這裡。
 *
 * 【為什麼一定要有「不指定」】
 *   中文稱謂分性別，但這題不該強迫作答。
 *   第三個選項不是裝飾，是為了讓「不想說」的人也能走下去。
 *   `unspecified` 時一律用中性的「您好」，不要猜。
 */

import React from 'react';
import type { AddressGender } from '../types';
import { useI18n } from '../i18n/I18nContext';

/**
 * 三個選項。
 *
 * ⚠️ `as const` 是必要的 —— `t()` 只接受合法的 `TranslationKey`，
 *    寫成 `string` 會編譯失敗（這正是型別強制同步的價值）。
 */
export const GENDER_OPTIONS = [
  { id: 'male', key: 'onboard.genderMale', emoji: '👨' },
  { id: 'female', key: 'onboard.genderFemale', emoji: '👩' },
  { id: 'unspecified', key: 'onboard.genderNone', emoji: '🙂' },
] as const;

export interface GenderPickerProps {
  value: AddressGender;
  onChange: (gender: AddressGender) => void;
  /**
   * 是否顯示標題與說明文字。
   * 引導頁與設定頁都顯示（預設 true）；
   * 若外層已經有標題（例如放在 SettingsSection 內）可設 false。
   */
  showHeading?: boolean;
}

export const GenderPicker: React.FC<GenderPickerProps> = ({
  value,
  onChange,
  showHeading = true,
}) => {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-3">
      {showHeading && (
        <div>
          <h2 className="text-[19px] font-black text-slate-950">{t('onboard.genderTitle')}</h2>
          <p className="text-[16px] font-bold text-slate-800 leading-relaxed mt-1">
            {t('onboard.genderBody')}
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {GENDER_OPTIONS.map((opt) => {
          const on = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              aria-pressed={on}
              className={`min-h-[52px] px-4 py-2 rounded-xl text-[18px] font-black flex items-center gap-2 cursor-pointer border-2 transition-all active:scale-[0.97] ${
                on ? 'bg-blue-900 border-blue-900 text-white' : 'bg-white border-slate-400 text-slate-900'
              }`}
            >
              <span aria-hidden="true">{opt.emoji}</span>
              {t(opt.key)}
            </button>
          );
        })}
      </div>
    </div>
  );
};
