/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 學一個小知識（Learn from scan）— 結果頁的學習卡片
 * ============================================================================
 * 【它解決什麼問題】
 *   結果頁給「結論」、食育學堂教「原理」，但兩者之間原本沒有任何連結：
 *   使用者看完紅／黃／綠就走了，很少主動進學堂。
 *   這張卡片把**每一次掃描變成一堂微課**：AI 判讀 → 為什麼 → 學原理 → 自我檢核。
 *
 * 【兩段結構】
 *   ① 原理：一張知識卡（標題／重點／說明／小撇步 ＋ 語音朗讀 ＋「我知道了」）
 *   ② 換你想想：一道測驗題（3 選項，點下去即時對答案與詳解）
 *
 *   兩段**都可以單獨失敗**：知識卡挑不到就只顯示題目；
 *   題目挑不到（且不能生成）就只顯示知識卡；
 *   兩者都沒有 → **整張卡片不渲染**（不留空白區塊）。
 *
 * 【★ `local_only` 也能用 —— 這是刻意的】
 *   ① 的內容是**已打包在 App 裡的** 21＋1 張知識卡，零網路。
 *   ② 優先從「內建 60 題 ＋ 手機題庫」挑，也是零網路。
 *   只有在「題庫真的沒有相關的題」時才會呼叫 AI —— 那條路徑在 `local_only` 關閉，
 *   改用一題通用題當後備。
 *
 *   → 只在本機的使用者正是最在意隱私的一群人，
 *     把教育功能排除在他們之外，等於「保護隱私的代價是不能學習」——
 *     而這件事其實不需要付。
 *
 * 【顏色】
 *   用 `TONES.action`（藍）與既有的「食育教學」卡一致。
 *   ⚠️ 刻意**不用琥珀色**（P1 規格原本的建議）——在本專案琥珀＝警示，
 *      拿它當學習卡會讓顏色語意混亂。
 */

import React, { useEffect, useMemo, useState } from 'react';
import { GraduationCap, Lightbulb, Volume2 } from 'lucide-react';
import type { AnalysisMode, KnowledgeCard, LearnerProfileId, LabelAnalysisResult, QuizQuestion } from '../types';
import { useI18n } from '../i18n/I18nContext';
import { KNOWLEDGE_CARDS } from '../data/educationContent';
import { localizeCard, localizeQuestion } from '../data/educationContentEn';
import { pickLearningCard } from '../utils/learnFromScan';
import { pickQuizQuestion } from '../data/pickQuizQuestion';
import { QUIZ_QUESTIONS } from '../data/educationContent';
import { getBankQuestions, mergeIntoBank, subscribeQuizBank } from '../data/quizBank';
import {
  getAnsweredQuestionIds,
  loadProgress,
  saveProgress,
  withAttempt,
  withCardRead,
} from '../data/learningProgress';
import { toLabelKey } from '../data/labelKeys';
import { apiUrl } from '../utils/apiBase';
import { speakText, stopSpeech, ttsLanguageFor } from '../utils/tts';
import { QuizCard } from './QuizCard';
import { CARD_BASE, TONES, TYPE, WEIGHT } from '../theme';

interface LearnFromScanCardProps {
  result: LabelAnalysisResult;
  profileId: LearnerProfileId;
  /** 決定「能不能呼叫 AI 生成題目」（`local_only` 時不行） */
  analysisMode: AnalysisMode;
  /**
   * 使用者勾選的慢性病／過敏原 id。
   * ⚠️ 一定要傳：知識卡的「過敏原優先」判斷靠它，
   *    否則雲端 AI 自願回報的過敏原會把卡片劫持走（見 `learnFromScan.ts`）。
   */
  selectedConditions: string[];
}

type QuizState =
  | { kind: 'loading' }
  | { kind: 'ready'; question: QuizQuestion; fromAi: boolean }
  | { kind: 'none' };

export const LearnFromScanCard: React.FC<LearnFromScanCardProps> = ({
  result,
  profileId,
  analysisMode,
  selectedConditions,
}) => {
  const { t, language } = useI18n();
  const [quizState, setQuizState] = useState<QuizState>({ kind: 'loading' });
  const [markedRead, setMarkedRead] = useState(false);
  /** 題庫變更時重繪（AI 生成一題之後會寫進題庫） */
  const [bankTick, setBankTick] = useState(0);

  useEffect(() => subscribeQuizBank(() => setBankTick((n) => n + 1)), []);

  /* ── ① 原理：知識卡（純前端，永遠可用）──────────────────────────── */
  const knowledgeCard: KnowledgeCard | null = useMemo(() => {
    const pick = pickLearningCard(result, profileId, selectedConditions);
    if (!pick) return null;
    const found = KNOWLEDGE_CARDS.find((c) => c.id === pick.cardId);
    if (!found) return null; // runtime 防線：挑到不存在的卡就不渲染（不留空白）
    return localizeCard(found, language);
  }, [result, profileId, language, selectedConditions]);

  /* ── ② 檢核：測驗題 ─────────────────────────────────────────────── */
  const labelKeys = useMemo(
    () =>
      (result.nutrient_facts ?? [])
        .map((f) => toLabelKey(f.name))
        .filter((k): k is NonNullable<typeof k> => k !== null),
    [result]
  );

  useEffect(() => {
    let cancelled = false;
    setQuizState({ kind: 'loading' });

    const answered = getAnsweredQuestionIds();
    const pool = [...QUIZ_QUESTIONS, ...getBankQuestions()];

    // 先用「內建 ＋ 手機題庫」找**真正相關**的題（requireMatch）。
    // ⚠️ 通用題不算「題庫有」——否則 AI 生成永遠不會被觸發（見 pickQuizQuestion 的說明）。
    const local = pickQuizQuestion({
      pool,
      facts: labelKeys,
      excludeIds: answered,
      requireMatch: true,
    });
    if (local) {
      setQuizState({ kind: 'ready', question: local, fromAi: local.source === 'ai' });
      return;
    }

    /** AI 失敗或不能連網時的後備：放寬到通用題 */
    const fallback = (): QuizState => {
      const q = pickQuizQuestion({
        pool: QUIZ_QUESTIONS,
        facts: labelKeys,
        excludeIds: answered,
        requireMatch: false,
      });
      return q ? { kind: 'ready', question: q, fromAi: false } : { kind: 'none' };
    };

    // ★ 只在本機：絕不連網。直接用通用題，或用既有的知識卡就夠。
    if (analysisMode === 'local_only' || labelKeys.length === 0) {
      setQuizState(fallback());
      return;
    }

    // 請 AI 針對這張標籤出一題
    const primary = (result.nutrient_facts ?? []).find((f) => toLabelKey(f.name) !== null);
    (async () => {
      try {
        const res = await fetch(apiUrl('/api/quiz-question'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            labelKeys,
            labelContext: primary
              ? {
                  name: primary.name,
                  value: primary.value,
                  unit: primary.unit,
                  dailyLimit: primary.dailyLimit,
                  percent: primary.percent,
                }
              : undefined,
            language,
            profileId,
            excludeIds: answered,
            // ⚠️ 由 analysisMode 推導，呼叫端不得自己決定（見 AnalysisMode 的說明）
            localOnly: false,
          }),
        });
        const json = await res.json();
        if (cancelled) return;
        const q: QuizQuestion | null = json?.data ?? null;
        if (q) {
          // 立刻存進本機題庫 —— 同一台裝置下次就不用再生成（也省 AI 額度）
          if (q.source === 'ai') mergeIntoBank([q]);
          setQuizState({ kind: 'ready', question: q, fromAi: q.source === 'ai' });
        } else {
          setQuizState(fallback());
        }
      } catch {
        if (!cancelled) setQuizState(fallback());
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [labelKeys, analysisMode, profileId, language, bankTick, result]);

  const handleAnswer = (selectedIndex: number) => {
    if (quizState.kind !== 'ready') return;
    const isCorrect = selectedIndex === quizState.question.correctIndex;
    saveProgress(
      withAttempt(loadProgress(), quizState.question.id, selectedIndex, isCorrect)
    );
  };

  const handleMarkRead = () => {
    if (!knowledgeCard) return;
    saveProgress(withCardRead(loadProgress(), knowledgeCard.id));
    setMarkedRead(true);
    try {
      navigator.vibrate?.(50);
    } catch {
      /* 不支援震動的裝置就略過 */
    }
  };

  /* ── 兩段都沒有 → 整張卡片不渲染 ─────────────────────────────────
   *
   * ⚠️ 這一行同時處理三種情況，不要拆開寫（拆開容易漏掉其中一種）：
   *   · 有知識卡 ＋ 題目還在載入 → 顯示（知識卡先出來，題目稍後補上）
   *   · 沒知識卡 ＋ 題目還在載入 → **不顯示**（避免閃出一個只有標題的空卡片）
   *   · 沒知識卡 ＋ 題目挑不到   → 不顯示（使用者什麼都不會看到，這才是對的）
   */
  if (!knowledgeCard && quizState.kind !== 'ready') return null;

  return (
    <section
      id="learn-card"
      aria-label={t('learn.title')}
      className={`${CARD_BASE} p-[16px] flex flex-col gap-[14px]`}
      style={{ background: TONES.action.bg, borderColor: TONES.action.border }}
    >
      <h3
        className={`${TYPE.title} ${WEIGHT.strong} flex items-center gap-[8px]`}
        style={{ color: TONES.action.text }}
      >
        <GraduationCap className="w-[26px] h-[26px] shrink-0" />
        {t('learn.title')}
      </h3>

      {/* ── ① 原理 ─────────────────────────────────────────────── */}
      {knowledgeCard && (
        <div className="flex flex-col gap-[8px]">
          <span className={`${TYPE.body} font-black`} style={{ color: TONES.action.text }}>
            {t('learn.knowledgeLabel')}
          </span>
          <div className="bg-white/90 rounded-[12px] p-[12px] border border-[#185FA5] flex flex-col gap-[8px]">
            <p className={`${TYPE.body} ${WEIGHT.strong}`} style={{ color: TONES.action.text }}>
              {knowledgeCard.title}
            </p>
            <p className={`${TYPE.body} ${WEIGHT.normal} leading-snug`} style={{ color: TONES.action.text }}>
              {knowledgeCard.headline}
            </p>
            <div className="flex flex-col gap-[6px]">
              {knowledgeCard.body.map((line, i) => (
                <p
                  key={i}
                  className={`${TYPE.body} ${WEIGHT.normal} leading-relaxed text-slate-800`}
                >
                  {line}
                </p>
              ))}
            </div>
            <div className="flex items-start gap-[8px] bg-slate-50 rounded-[10px] p-[10px]">
              <Lightbulb className="w-[20px] h-[20px] shrink-0 mt-[2px] text-amber-700" aria-hidden="true" />
              <p className={`${TYPE.body} ${WEIGHT.normal} leading-snug text-slate-800`}>
                <span className="font-black">{t('learn.tipLabel')}：</span>
                {knowledgeCard.tip}
              </p>
            </div>

            <div className="flex flex-wrap gap-[8px]">
              <button
                type="button"
                id="learn-card-listen"
                onClick={() => {
                  stopSpeech();
                  speakText(knowledgeCard.voiceScript, {
                    rate: 0.88,
                    preferLanguage: ttsLanguageFor(language),
                  });
                }}
                className="flex-1 min-h-[52px] px-[12px] rounded-[10px] bg-white border-2 border-[#185FA5] text-[16px] font-black cursor-pointer active:scale-95 flex items-center justify-center gap-[6px]"
                style={{ color: TONES.action.text }}
              >
                <Volume2 className="w-[22px] h-[22px] shrink-0" />
                {t('classroom.listen')}
              </button>
              <button
                type="button"
                id="learn-card-got-it"
                onClick={handleMarkRead}
                disabled={markedRead}
                className={`flex-1 min-h-[52px] px-[12px] rounded-[10px] text-[16px] font-black border-2 ${
                  markedRead
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-800 cursor-default'
                    : 'bg-[#185FA5] border-[#185FA5] text-white cursor-pointer active:scale-95'
                }`}
              >
                {markedRead ? t('learn.markedRead') : t('classroom.markRead')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ② 換你想想 ─────────────────────────────────────────── */}
      {quizState.kind === 'loading' && (
        <div className="flex flex-col gap-[8px]">
          <span className={`${TYPE.body} font-black`} style={{ color: TONES.action.text }}>
            {t('learn.quizLabel')}
          </span>
          <p className={`${TYPE.body} ${WEIGHT.normal} text-slate-700`}>{t('learn.loading')}</p>
        </div>
      )}

      {quizState.kind === 'ready' && (
        <div className="flex flex-col gap-[8px]">
          <span className={`${TYPE.body} font-black`} style={{ color: TONES.action.text }}>
            {t('learn.quizLabel')}
          </span>
          <QuizCard
            key={quizState.question.id}
            question={localizeQuestion(quizState.question, language)}
            index={0}
            total={1}
            onAnswer={handleAnswer}
            /* 只有一題，顯示「第 1 題 / 共 1 題」是噪音 */
            showProgress={false}
          />
        </div>
      )}
    </section>
  );
};
