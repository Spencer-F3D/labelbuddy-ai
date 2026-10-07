/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 自填病症輸入對話框（Custom condition dialog）
 * ============================================================================
 * 【為什麼從「行內展開」改成「彈出對話框」（2026-10-07 使用者指定）】
 *   原本的作法是：勾了「其他（自行填寫）」之後，輸入框**長在清單下方**。
 *   問題是它藏在「已選擇」釘選區的正下方 —— 使用者勾完之後，
 *   視線還在原本那一列上，很容易**沒注意到輸入框出現了**，
 *   於是帶著一個「勾了卻沒有填、也沒有把關」的狀態離開這一頁。
 *
 *   改成「按下去就立刻彈出」之後，輸入框**不可能被錯過** ——
 *   它就在使用者剛剛點的位置上蓋住整個畫面。
 *
 * 【⚠️ 一個刻意的行為：空白不可以按確定】
 *   自填病症在送出時是 `其他：<內容>`（見 App.tsx 的 `CUSTOM_CONDITION_PREFIX`）。
 *   若允許空白確定，就會勾了一個**什麼都不會送出去**的項目 ——
 *   那正是本專案最想避免的靜默失效（使用者以為有人在看，其實沒有）。
 *   所以這裡按確定時若內容為空，**留在對話框並顯示提示**，不關閉也不勾選。
 */

import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

interface CustomConditionDialogProps {
  /** 是否顯示 */
  open: boolean;
  /** 開啟時帶入的初始值（使用者之前填過的） */
  initialValue: string;
  /** 目前是否為「只在本機」模式 —— 決定要不要顯示「本機無法把關」的警告 */
  isLocalOnly: boolean;
  /** 按確定（內容保證非空） */
  onConfirm: (text: string) => void;
  /** 按取消或關閉 */
  onCancel: () => void;
}

export const CustomConditionDialog: React.FC<CustomConditionDialogProps> = ({
  open,
  initialValue,
  isLocalOnly,
  onConfirm,
  onCancel,
}) => {
  const { t } = useI18n();
  const [text, setText] = useState(initialValue);
  const [showEmptyHint, setShowEmptyHint] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * 每次「開啟」都重設成傳入的初始值，並把焦點放進輸入框。
   *
   * ⚠️ 重設是必要的：使用者按了取消之後，`text` 還留著上一次打的字，
   *    下次開啟若不重設，就會看到一份「不確定是不是自己的」內容。
   *    以 `initialValue` 為準（那是真正存起來的值）才不會有幻覺。
   */
  useEffect(() => {
    if (!open) return;
    setText(initialValue);
    setShowEmptyHint(false);
    // 焦點要在對話框渲染完成之後才放得進去
    const id = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(id);
  }, [open, initialValue]);

  if (!open) return null;

  const handleConfirm = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setShowEmptyHint(true);
      inputRef.current?.focus();
      return;
    }
    onConfirm(trimmed);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('conditions.customLabel')}
      className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="bg-white w-full max-w-md rounded-3xl p-5 border-4 border-blue-800 flex flex-col gap-4 max-h-[90%] overflow-y-auto">
        {/* 標題列 */}
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[19px] font-black text-blue-950 leading-snug">
            {t('conditions.customLabel')}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t('conditions.customCancel')}
            className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center shrink-0 cursor-pointer border border-slate-300"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <input
          id="custom-condition-input"
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (showEmptyHint) setShowEmptyHint(false);
          }}
          /* Enter 直接確定 —— 只填幾個字的東西不該逼使用者去點按鈕 */
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleConfirm();
            }
          }}
          /* 20 字：足夠寫下完整的病症名（最長常見者約 8 字），
             又能避免有人貼一整段文章進來。 */
          maxLength={20}
          placeholder={t('conditions.customPlaceholder')}
          className="w-full min-h-[56px] px-[12px] rounded-[10px] border-2 border-slate-400 bg-white text-[19px] font-bold text-slate-900"
        />

        {showEmptyHint && (
          <p
            role="alert"
            className="text-[16px] font-black text-amber-900 bg-amber-50 border-2 border-amber-400 rounded-[10px] px-[10px] py-[8px] leading-snug"
          >
            {t('conditions.customEmptyHint')}
          </p>
        )}

        <p className="text-[16px] font-bold text-slate-600 leading-snug">
          {t('conditions.customHint')}
        </p>

        {/* 只有在真的選了「只在本機」時才提醒 —— 其他模式不需要嚇人 */}
        {isLocalOnly && (
          <p className="text-[16px] font-bold text-amber-900 bg-amber-50 border-2 border-amber-300 rounded-[10px] px-[10px] py-[8px] leading-snug">
            {t('conditions.customLocalOnly')}
          </p>
        )}

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            id="btn-custom-condition-confirm"
            onClick={handleConfirm}
            className="w-full min-h-[56px] rounded-2xl bg-blue-800 hover:bg-blue-900 text-white font-black text-[18px] flex items-center justify-center cursor-pointer active:scale-[0.98] transition-all"
          >
            {t('conditions.customConfirm')}
          </button>
          <button
            type="button"
            id="btn-custom-condition-cancel"
            onClick={onCancel}
            className="w-full min-h-[56px] rounded-2xl bg-white hover:bg-slate-50 text-slate-800 font-black text-[18px] border-2 border-slate-400 flex items-center justify-center cursor-pointer active:scale-[0.98] transition-all"
          >
            {t('conditions.customCancel')}
          </button>
        </div>
      </div>
    </div>
  );
};
