/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 私隱條款與免責聲明（Privacy Notice & Disclaimer）
 * ============================================================================
 *
 * 【為什麼要放在兩個地方】
 *   引導頁（第一次使用前同意）與設定頁（隨時可查）都要有。
 *   同一個元件共用，內容才不會兩邊漂移 —— 漂移的話，
 *   使用者「同意過的版本」和「現在看到的版本」會不一致。
 *
 * 【★ 字級 12px 是刻意的例外（2026-09-29 使用者指定）】
 *   本專案有一條「字級地板 16px」的規則（為長者可讀性，WCAG）。
 *   但條款屬於**法定告知文字**，性質不同：
 *     ① 它不是操作介面，沒有「看不清楚就按錯」的風險；
 *     ② 它必須完整呈現、不能為了放大而刪減內容；
 *     ③ 全站只有這一處例外，其餘畫面仍維持 16px 地板。
 *   ⚠️ 12px 不是既有的四種字級（16/18/19/20），所以：
 *      ① 它**不會**被 `html[data-density='compact']` 的字級縮放影響
 *         （那條規則只命中既有的四個 class）；
 *      ② 若日後有人想「順手」把條款也納入縮放，要先想清楚
 *         它已經很小了，再縮會到 10px。
 *   這條例外已同步記在 `.workbuddy-ai/memory/UI_RULES.md`。
 */

import React from 'react';
import { ShieldCheck, AlertTriangle } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';

/** 條款本文的字級（唯一使用 12px 的地方） */
const LEGAL_TEXT_CLASS = 'text-[12px] leading-relaxed font-bold';

/** 私隱條款與免責聲明的段落數（新增段落時改這裡，翻譯鍵要一起補） */
const PRIVACY_ITEMS = [1, 2, 3, 4, 5] as const;
const DISCLAIMER_ITEMS = [1, 2, 3, 4, 5] as const;

export interface LegalNoticeProps {
  /** 是否顯示「我已閱讀並同意」勾選框（引導頁要，設定頁不用） */
  showAgree?: boolean;
  /** 目前的同意狀態 */
  agreed?: boolean;
  /** 切換同意狀態 */
  onAgreeChange?: (next: boolean) => void;
  /** 未勾選時是否顯示提醒（例如使用者按了「開始使用」才顯示） */
  showAgreeWarning?: boolean;
}

export const LegalNotice: React.FC<LegalNoticeProps> = ({
  showAgree = false,
  agreed = false,
  onAgreeChange,
  showAgreeWarning = false,
}) => {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-3">
      {/* ── 私隱條款 ─────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-4 border-2 border-emerald-700">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0" aria-hidden="true" />
          <h2 className="text-[16px] font-black text-emerald-900">
            {t('legal.privacy.title')}
          </h2>
        </div>
        <ul className={`flex flex-col gap-1.5 text-slate-800 ${LEGAL_TEXT_CLASS}`}>
          {PRIVACY_ITEMS.map((n) => (
            <li key={`pv-${n}`} className="flex gap-1.5">
              <span className="shrink-0">・</span>
              <span>{t(`legal.privacy.${n}` as TranslationKey)}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* ── 免責聲明 ─────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-4 border-2 border-amber-600">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" aria-hidden="true" />
          <h2 className="text-[16px] font-black text-amber-900">
            {t('legal.disclaimer.title')}
          </h2>
        </div>
        <ul className={`flex flex-col gap-1.5 text-slate-800 ${LEGAL_TEXT_CLASS}`}>
          {DISCLAIMER_ITEMS.map((n) => (
            <li key={`dc-${n}`} className="flex gap-1.5">
              <span className="shrink-0">・</span>
              <span>{t(`legal.disclaimer.${n}` as TranslationKey)}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* ── 同意勾選（引導頁專用）────────────────────────────── */}
      {showAgree && (
        <label
          className={`rounded-2xl p-4 border-2 flex items-start gap-3 cursor-pointer transition-all ${
            agreed ? 'bg-emerald-50 border-emerald-700' : 'bg-white border-slate-400'
          }`}
        >
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => onAgreeChange?.(e.target.checked)}
            className="w-6 h-6 mt-0.5 shrink-0 accent-emerald-700 cursor-pointer"
          />
          <span className="text-[16px] font-black text-slate-900 leading-snug">
            {t('legal.agreeLabel')}
          </span>
        </label>
      )}

      {/* 未勾選就按「開始使用」時的提醒 */}
      {showAgree && showAgreeWarning && !agreed && (
        <p
          role="alert"
          className="text-[16px] font-black text-rose-800 bg-rose-50 border-2 border-rose-300 rounded-xl p-3"
        >
          {t('legal.agreeRequired')}
        </p>
      )}
    </div>
  );
};
