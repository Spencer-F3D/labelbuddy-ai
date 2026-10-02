/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 健康問答（Health Q&A）
 * ============================================================================
 * 長者用白話問一個健康或飲食問題，AI 依他的身體數字回答。
 * 例：「我有高血壓，喝咖啡可以嗎？」「血糖高可以吃香蕉嗎？」
 *
 * 【為什麼是「新做」而不是「還原舊元件」】
 *   舊的 SeniorHealthQASection（549 行）是死檔，且**完全沒有 i18n**
 *   （713 個中文字）。還原它等於先把 1,800 字翻譯補上，
 *   不如用現行的雙語模式重寫一份小的。
 *
 * 【為什麼放在健康設定頁而不是新分頁】
 *   問答會用到 physicalIndicators（血壓／血糖…）當背景，
 *   放在同一頁就不必把資料再傳一層，使用者也不必切來切去。
 *
 * ⚠️ 語音「輸入」尚未實作（需要 Web Speech Recognition，目前專案沒有）。
 *    語音「輸出」（唸給我聽）已經有了。
 */

import React, { useState } from 'react';
import { apiUrl } from '../utils/apiBase';
import { MessageCircleQuestion, Volume2 } from 'lucide-react';
import { AddressGender, AnalysisMode, SeniorPhysicalIndicators, HealthQuestionAnswer } from '../types';
import { speakText, stopSpeech } from '../utils/tts';
import { useI18n } from '../i18n/I18nContext';

interface HealthQASectionProps {
  indicators: SeniorPhysicalIndicators;
  /**
   * 稱謂用的性別（2026-09-29）。
   * 只影響 AI 回答與語音怎麼稱呼使用者（先生／小姐／您好），
   * 不影響任何營養或風險判斷。未指定時後端一律用中性的「您好」。
   */
  gender?: AddressGender;
  /**
   * 分析模式（2026-09-30）。
   * ⚠️ 這是**同意閘門**：`local_only` 時後端不會呼叫雲端。
   *    使用者的提問往往比標籤文字更私密（例如「我這樣是不是快中風了」），
   *    所以這個閘門比標籤那邊更需要。
   */
  analysisMode?: AnalysisMode;
}

export const HealthQASection: React.FC<HealthQASectionProps> = ({
  indicators,
  gender,
  analysisMode,
}) => {
  const { t, language } = useI18n();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<HealthQuestionAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const ask = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(apiUrl('/api/ask-health-question'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // ⚠️ 一定要帶 language，否則英文介面會拿到中文回答
        // gender 只影響稱謂（先生／小姐／您好），不影響判斷
        // localOnly 是同意閘門：只在本機時後端不呼叫雲端
        body: JSON.stringify({
          question: q,
          indicators,
          language,
          gender,
          localOnly: analysisMode === 'local_only',
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error('bad response');
      setAnswer(payload.data as HealthQuestionAnswer);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const readAloud = () => {
    if (!answer) return;
    stopSpeech();
    // TTSLanguage 是 'cantonese' | 'mandarin' | 'english'，不是介面的 'zh-TW' | 'en'
    speakText(answer.voice_script, {
      rate: 0.9,
      preferLanguage: language === 'en' ? 'english' : 'mandarin',
    });
  };

  // 常見問題：直接點就能問，長者不必打字
  const SUGGESTIONS = [
    'qa.suggestCoffee',
    'qa.suggestBanana',
    'qa.suggestTofu',
    'qa.suggestGrapefruit',
  ] as const;

  return (
    <div className="flex flex-col space-y-4">
      <p className="text-[16px] font-bold text-slate-800 leading-relaxed">{t('qa.hint')}</p>

      {/* 常見問題快選 —— 對長者來說打字很吃力，這排按鈕比輸入框更重要 */}
      <div className="flex flex-col gap-2">
        <span className="text-[16px] font-black text-slate-900">{t('qa.commonTitle')}</span>
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                const text = t(key);
                setQuestion(text);
                void ask(text);
              }}
              disabled={busy}
              className="min-h-[48px] px-3 py-2 rounded-xl bg-white border-2 border-blue-800 text-blue-900 text-[16px] font-black cursor-pointer disabled:opacity-60 text-left"
            >
              {t(key)}
            </button>
          ))}
        </div>
      </div>

      {/* 自己輸入 */}
      <div className="flex flex-col gap-2">
        <label htmlFor="qa-input" className="text-[16px] font-black text-slate-900">
          {t('qa.inputLabel')}
        </label>
        <textarea
          id="qa-input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t('qa.placeholder')}
          rows={2}
          className="w-full rounded-xl border-2 border-slate-300 p-3 text-[18px] font-bold text-slate-900 bg-white leading-relaxed"
        />
        <button
          type="button"
          onClick={() => void ask(question)}
          disabled={busy || !question.trim()}
          className="self-start min-h-[48px] px-4 py-2 rounded-xl bg-blue-800 text-white text-[18px] font-black whitespace-nowrap cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {busy ? t('qa.busy') : t('qa.ask')}
        </button>
      </div>

      {error && (
        <p className="text-[16px] font-black text-rose-950 bg-rose-100 border-2 border-rose-400 rounded-xl p-3">
          {t('qa.error')}
        </p>
      )}

      {answer && (
        <div className="flex flex-col space-y-3 pt-1">
          {/* 走雲端還是走離線？跟指標分析一樣要講清楚 */}
          <span
            className={`self-start px-3 py-1.5 rounded-lg text-[16px] font-black border-2 ${
              answer.source === 'cloud_ai'
                ? 'bg-sky-100 text-sky-950 border-sky-400'
                : 'bg-amber-100 text-amber-950 border-amber-400'
            }`}
          >
            {answer.source === 'cloud_ai' ? t('qa.modeCloud') : t('qa.modeLocal')}
          </span>

          <p className="text-[19px] font-black text-slate-950">{answer.key_takeaway}</p>

          <p className="text-[16px] font-bold text-slate-800 bg-white rounded-xl p-3 border-2 border-slate-200 whitespace-pre-line leading-relaxed">
            {answer.answer}
          </p>

          {answer.safe_tips.length > 0 && (
            <div className="bg-white rounded-xl p-3 border-2 border-slate-200 flex flex-col gap-1.5">
              <span className="text-[18px] font-black text-slate-950">{t('qa.tips')}</span>
              {answer.safe_tips.map((tip, i) => (
                <p key={`qa-tip-${i}`} className="text-[16px] font-bold text-slate-800 leading-relaxed">
                  {tip}
                </p>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={readAloud}
            className="self-start min-h-[48px] px-4 py-2 rounded-xl bg-white border-2 border-blue-800 text-blue-900 text-[16px] font-black whitespace-nowrap cursor-pointer flex items-center gap-2"
          >
            <Volume2 className="w-5 h-5" aria-hidden="true" />
            {t('qa.readAloud')}
          </button>
        </div>
      )}
    </div>
  );
};

/** 供 App.tsx 的 SettingsSection 使用 */
export const HealthQAIcon = MessageCircleQuestion;
