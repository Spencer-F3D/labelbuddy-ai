/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 清除所有資料（Clear All Data）— 設在設定頁最下方
 * ============================================================================
 *
 * 【★ 為什麼要做「兩級警告」而不是一個 confirm】
 *   這個按鈕一按下去，使用者的身分、慢性病設定、身體指標、整週飲食紀錄
 *   全部消失，而且**無法復原**（我們沒有帳號、沒有雲端備份 —— 那正是隱私承諾）。
 *   單一確認框在手機上很容易被誤觸（尤其長者滑動時）。
 *   所以拆成兩步，而且兩步的**用詞與按鈕顏色都不同**：
 *     第 1 步：說明「會刪掉什麼」→ 按鈕是中性色
 *     第 2 步：最後確認，按鈕是**紅色**且文字寫明「無法復原」
 *   刻意不用「再按一次相同按鈕」的做法 —— 那對誤觸沒有防護力。
 *
 * 【為什麼清完要重新載入整頁，而不是逐一重設 state】
 *   逐一重設很容易漏掉某個 useState（而且不會報錯，只會留下殘留資料）。
 *   `location.reload()` 會讓 App 用「乾淨的 localStorage」重新初始化，
 *   保證回到真正的初始狀態 —— 也就會自動回到引導頁。
 *
 * 【清除範圍】
 *   所有以 `labelbuddy` 開頭的鍵（涵蓋身分、稱謂、慢性病、指標、紀錄、
 *   學習進度、雲端同意、引導頁旗標、介面語言）。
 *   用「前綴比對」而不是逐一列出鍵名 —— 這樣日後新增儲存鍵不必回來改這裡。
 */

import React, { useState } from 'react';
import { Trash2, AlertTriangle, X } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

/** 本 App 所有儲存鍵的共同前綴（含 `labelbuddy-` 與 `labelbuddy_`） */
const STORAGE_PREFIX = 'labelbuddy';

/**
 * 刪除本 App 寫入的所有 localStorage 資料。
 *
 * ⚠️ 用前綴掃描而非寫死清單：新增儲存鍵時不必回來改這裡，
 *    也不會因為漏列而留下殘留資料（那種 bug 不會報錯）。
 */
export function clearAllAppData(): number {
  let removed = 0;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) keys.push(k);
    }
    for (const k of keys) {
      localStorage.removeItem(k);
      removed++;
    }
  } catch (e) {
    console.warn('清除資料失敗:', e);
  }
  return removed;
}

export const ClearAllDataSection: React.FC = () => {
  const { t } = useI18n();
  /** 0 = 未開啟；1 = 第一級警告；2 = 第二級（最後確認） */
  const [stage, setStage] = useState<0 | 1 | 2>(0);

  const doClear = () => {
    clearAllAppData();
    // 重新載入 → App 從空的 localStorage 重新初始化 → 自動回到引導頁
    window.location.reload();
  };

  return (
    <section className="w-full bg-white rounded-2xl border-2 border-rose-300 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Trash2 className="w-[26px] h-[26px] text-rose-700 shrink-0" aria-hidden="true" />
        <h2 className="text-[19px] font-black text-rose-900">{t('clear.title')}</h2>
      </div>

      <p className="text-[16px] font-bold text-slate-700 leading-relaxed">
        {t('clear.summary')}
      </p>

      <button
        type="button"
        id="btn-clear-all-data"
        onClick={() => setStage(1)}
        className="w-full min-h-[56px] rounded-2xl bg-white hover:bg-rose-50 text-rose-800 font-black text-[18px] border-2 border-rose-500 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition-all"
      >
        <Trash2 className="w-5 h-5 shrink-0" aria-hidden="true" />
        {t('clear.button')}
      </button>

      {/* ── 兩級警告彈窗 ──────────────────────────────────────── */}
      {stage > 0 && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white w-full max-w-md rounded-3xl p-5 border-4 border-rose-600 flex flex-col gap-4 max-h-[90%] overflow-y-auto">
            {/* 標題列 */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-7 h-7 text-rose-700 shrink-0" aria-hidden="true" />
                <h3 className="text-[19px] font-black text-rose-900">
                  {stage === 1 ? t('clear.step1Title') : t('clear.step2Title')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setStage(0)}
                aria-label={t('clear.cancel')}
                className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center shrink-0 cursor-pointer border border-slate-300"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            {/* 第 1 級：說明會刪掉什麼 */}
            {stage === 1 && (
              <>
                <p className="text-[16px] font-bold text-slate-800 leading-relaxed">
                  {t('clear.step1Body')}
                </p>
                <ul className="text-[16px] font-bold text-slate-700 flex flex-col gap-1 bg-slate-50 rounded-2xl p-3">
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <li key={`ci-${n}`} className="flex gap-2">
                      <span className="text-rose-600 shrink-0">・</span>
                      <span>{t(`clear.item${n}` as 'clear.item1')}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* 第 2 級：最後確認 */}
            {stage === 2 && (
              <p className="text-[18px] font-black text-rose-900 bg-rose-50 border-2 border-rose-300 rounded-2xl p-4 leading-relaxed">
                {t('clear.step2Body')}
              </p>
            )}

            {/* 按鈕 */}
            <div className="flex flex-col gap-2.5">
              {stage === 1 ? (
                <button
                  type="button"
                  id="btn-clear-stage1-continue"
                  onClick={() => setStage(2)}
                  className="w-full min-h-[56px] rounded-2xl bg-rose-700 hover:bg-rose-800 text-white font-black text-[18px] flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                >
                  {t('clear.continue')}
                </button>
              ) : (
                <button
                  type="button"
                  id="btn-clear-stage2-confirm"
                  onClick={doClear}
                  className="w-full min-h-[56px] rounded-2xl bg-rose-700 hover:bg-rose-800 text-white font-black text-[18px] flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                >
                  <Trash2 className="w-5 h-5 shrink-0" aria-hidden="true" />
                  {t('clear.confirmDelete')}
                </button>
              )}

              <button
                type="button"
                id="btn-clear-cancel"
                onClick={() => setStage(0)}
                className="w-full min-h-[52px] rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-[18px] border-2 border-slate-300 cursor-pointer active:scale-[0.98]"
              >
                {t('clear.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
