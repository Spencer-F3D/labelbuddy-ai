/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 字體大小設定（2026-10-06 使用者指定新增）
 * ============================================================================
 * 【為什麼需要它】
 *   改動前，字級是**完全由身分決定**的（長者＝大字、其他＝小字），
 *   使用者只能接受。但「長者」這個身分不等於「每個人的眼睛都一樣」——
 *   使用者要的是自己調。
 *
 * 【★ 為什麼一定要有「預覽」那一行】
 *   只給「小／中／大」三顆按鈕，使用者其實不知道選下去會變多大 ——
 *   尤其長者對「14px 和 24px 差多少」沒有概念。
 *   所以下面放一段**真的用當前字級渲染**的示範句：
 *   按下去馬上看得到結果，不必先離開設定頁再去別頁確認。
 *   （它是全域的 `text-[20px]`，所以會跟著 `data-density` 一起變。）
 *
 * 【⚠️ 這裡不寫入 localStorage】
 *   儲存與推導都交給 `src/utils/fontScale.ts`，
 *   由 `App.tsx` 持有 state（因為字級 effect 也在那裡）。
 *   元件本身是**受控**的：只回報「使用者選了什麼」。
 */

import React from 'react';
import { useI18n } from '../i18n/I18nContext';
import type { FontScale } from '../utils/fontScale';

interface FontSizeOption {
  id: FontScale;
  /** ⚠️ 存的是翻譯鍵，不是字串 —— 存字串的話切語言不會跟著變 */
  labelKey: 'settings.fontSize.small' | 'settings.fontSize.normal' | 'settings.fontSize.large';
}

/** 由小到大 —— 順序本身就是給使用者的視覺提示，不要打亂。 */
const OPTIONS: FontSizeOption[] = [
  { id: 'small', labelKey: 'settings.fontSize.small' },
  { id: 'normal', labelKey: 'settings.fontSize.normal' },
  { id: 'large', labelKey: 'settings.fontSize.large' },
];

interface FontSizeSectionProps {
  /** 目前**實際生效**的級別（不是手動值 —— 沒手動選過時是身分預設值） */
  value: FontScale;
  onChange: (scale: FontScale) => void;
}

export const FontSizeSection: React.FC<FontSizeSectionProps> = ({ value, onChange }) => {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-[12px]">
      <p className="text-[16px] font-bold text-slate-700 leading-snug">
        {t('settings.fontSize.desc')}
      </p>

      {/* ⚠️ 用 flex-wrap 讓按鈕整顆換行，不要用 overflow-x-auto 水平捲動 ——
          長者看不到「右邊還有東西」，會以為只有這兩顆（見 UI_RULES）。 */}
      <div
        className="flex flex-wrap gap-[8px]"
        role="group"
        aria-label={t('settings.fontSize.title')}
      >
        {OPTIONS.map((opt) => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              id={`font-scale-${opt.id}`}
              aria-pressed={active}
              onClick={() => onChange(opt.id)}
              className={`flex-1 min-w-[84px] min-h-[56px] px-[12px] rounded-xl border-2 text-[20px] font-black cursor-pointer transition-all active:scale-95 ${
                active
                  ? 'bg-blue-900 border-blue-950 text-white'
                  : 'bg-white border-slate-300 text-slate-800'
              }`}
            >
              {t(opt.labelKey)}
            </button>
          );
        })}
      </div>

      {/* 即時預覽：這一行會**跟著上面選的級別一起變大變小**。
          用 `text-[20px]` 是刻意的 —— 它是全 App 最大的正文級別，
          差異最明顯；而且它會自動吃 `data-density` 的覆寫，不需要另寫 inline style。 */}
      <div className="bg-slate-50 border-2 border-slate-300 rounded-xl px-[12px] py-[10px] flex flex-col gap-[2px]">
        <span className="text-[16px] font-black text-slate-600">
          {t('settings.fontSize.preview')}
        </span>
        <span className="text-[20px] font-bold text-slate-900 leading-relaxed">
          {t('settings.fontSize.sample')}
        </span>
      </div>
    </div>
  );
};
