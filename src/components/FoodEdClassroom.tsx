/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 食育學堂（Food Education Classroom）
 * ============================================================================
 *
 * 三個區塊：
 *   1. 知識卡 —— 19 張卡片，可依主題篩選，支援語音朗讀
 *   2. 測驗   —— 14 道題目，逐題作答並即時解說
 *   3. 我的進度 —— 已讀卡片與測驗成績統計
 *
 * 所有內容皆為內建資料，離線可完整使用，不消耗 AI 額度。
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  BookOpen,
  GraduationCap,
  Trophy,
  Volume2,
  VolumeX,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Lightbulb,
  Target,
  Award,
} from 'lucide-react';
import type {
  LearnerProfileId,
  KnowledgeCard,
  KnowledgeTopic,
  LearningProgress,
  QuizQuestion,
} from '../types';
import {
  KNOWLEDGE_CARDS,
  QUIZ_QUESTIONS,
  // ⚠️ `getQuestionsByTopic`（educationContent.ts）**現在沒有任何呼叫端了**。
  //    第二階段的合併改成在「全部題目」那一層做（見下方 `allQuestions`）——
  //    因為統計數字（X / 60）需要跨主題的總數，不能只拿單一主題的清單。
  //
  //    計劃書明訂它「保持不動（維持純函式）」，所以**刻意保留不刪**：
  //    它仍是 `educationContent.ts` 對外的資料 API，
  //    而且是未來「只取某主題」時最自然的入口。
  //    （若日後確定不需要，連同這裡的註解一起刪掉即可。）
} from '../data/educationContent';
// 線上題庫（2026-10-07 第二階段）
import { getBankQuestions, subscribeQuizBank } from '../data/quizBank';
import {
  getLearnerProfile,
  TOPIC_LABELS,
  TOPIC_ORDER,
} from '../data/learnerProfiles';
import { LearnerProfilePicker } from './LearnerProfilePicker';
import { speakText, stopSpeech, ttsLanguageFor } from '../utils/tts';
// 雙語（2026-09-28 第三階段）：介面文字走 t()，教材內容查 educationContentEn.ts
// ⚠️ 教材與外框必須一起雙語，否則會變成「英文外殼 + 中文內容」
import { useI18n } from '../i18n/I18nContext';
import { localizeCard, localizeQuestion } from '../data/educationContentEn';
// 單題測驗卡（2026-10-07 抽出）：結果頁的「學一個小知識」也用它，
// 兩邊共用同一份，避免答題介面在兩個地方長得不一樣。
import { QuizCard } from './QuizCard';
import { topicLabel, profileDisplayName } from '../data/bilingualContent';
// 學習進度（2026-10-07 抽到共用模組）：結果頁的「學一個小知識」也要讀寫同一把鍵，
// 否則「在結果頁答過的題」在學堂不算數。
import { LEARNING_PROGRESS_KEY, loadProgress, saveProgress } from '../data/learningProgress';

/**
 * ⚠️ 保留這個 re-export 是刻意的。
 *
 * 這個常數原本定義在本檔，且是 `export` 的 —— 移出時若直接刪掉，
 * **任何還在 import 它的地方會編譯失敗**（好事，不會靜默），
 * 但會讓另一個工作目錄的 AI 在合併時多一次衝突。
 * 留著這一行，兩邊都不會壞。
 */
export { LEARNING_PROGRESS_KEY };

type ClassroomTab = 'cards' | 'quiz' | 'progress';

interface FoodEdClassroomProps {
  /** 目前的學習者身分 */
  profileId: LearnerProfileId;
  /** 切換身分 */
  onChangeProfile: (id: LearnerProfileId) => void;
}

/* ---------------------------------------------------------------------------
 * 知識卡單張呈現
 * ------------------------------------------------------------------------- */

function KnowledgeCardView({
  card,
  isRead,
  onMarkRead,
}: {
  card: KnowledgeCard;
  isRead: boolean;
  onMarkRead: () => void;
}) {
  const { t, language } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const handleSpeak = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (speaking) {
      stopSpeech();
      setSpeaking(false);
      return;
    }
    speakText(card.voiceScript, {
      // 中文一律粵語、英文用英文語音。判斷集中在 ttsLanguageFor()，
      // 避免像 2026-10-01 那樣「只改了部分呼叫端」而靜默講成國語。
      preferLanguage: ttsLanguageFor(language),
      onEnd: () => setSpeaking(false),
    });
    setSpeaking(true);
  };

  return (
    <article
      className={`rounded-2xl border-3 overflow-hidden transition-all ${
        isRead ? 'bg-emerald-50 border-emerald-400' : 'bg-white border-slate-300'
      }`}
    >
      {/* 卡片標題列（整列可點擊展開） */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full min-h-[70px] text-left p-4 flex items-start gap-3 cursor-pointer hover:bg-slate-50 active:scale-[0.99] transition-all"
      >
        <span className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[20px] font-black text-slate-900">{card.title}</span>
            {isRead && (
              <span className="bg-emerald-600 text-white text-[16px] font-black px-2 py-0.5 rounded-full flex items-center gap-1">
                <Check className="w-3 h-3" />
                {t('classroom.read')}
              </span>
            )}
          </div>
          <p className="text-[18px] font-bold text-blue-800 mt-1 leading-snug">
            {card.headline}
          </p>
        </span>
        <ChevronRight
          className={`w-6 h-6 text-slate-400 shrink-0 mt-1 transition-transform ${
            expanded ? 'rotate-90' : ''
          }`}
        />
      </button>

      {/* 展開內容 */}
      {expanded && (
        <div className="px-4 pb-4 border-t-2 border-slate-200 pt-3">
          <div className="space-y-2.5">
            {card.body.map((para, i) => (
              <p key={i} className="text-[18px] leading-relaxed text-slate-800">
                {para}
              </p>
            ))}
          </div>

          {/* 口訣 */}
          <div className="mt-3 rounded-xl bg-yellow-50 border-2 border-yellow-400 p-3 flex items-start gap-2">
            <Lightbulb className="w-5 h-5 text-yellow-700 shrink-0 mt-0.5" />
            <p className="text-[16px] font-bold text-yellow-900 leading-snug">{card.tip}</p>
          </div>

          {/* 操作按鈕 */}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleSpeak}
              className="flex-1 min-h-[56px] rounded-xl bg-blue-900 text-white text-[18px] font-bold flex items-center justify-center gap-2 cursor-pointer hover:bg-blue-950 active:scale-95 transition-all"
            >
              {speaking ? (
                <>
                  <VolumeX className="w-5 h-5" /> {t('classroom.stopReading')}
                </>
              ) : (
                <>
                  <Volume2 className="w-5 h-5" /> {t('classroom.listen')}
                </>
              )}
            </button>
            {!isRead && (
              <button
                type="button"
                onClick={onMarkRead}
                className="flex-1 min-h-[56px] rounded-xl bg-emerald-600 text-white text-[18px] font-bold flex items-center justify-center gap-2 cursor-pointer hover:bg-emerald-700 active:scale-95 transition-all"
              >
                <Check className="w-5 h-5" /> {t('classroom.markRead')}
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

/* ---------------------------------------------------------------------------
 * 主元件
 * ------------------------------------------------------------------------- */

export const FoodEdClassroom: React.FC<FoodEdClassroomProps> = ({
  profileId,
  onChangeProfile,
}) => {
  const { t, language } = useI18n();
  // 預設停在「測驗」分頁 —— 見分頁順序的說明（2026-10-02）
  const [tab, setTab] = useState<ClassroomTab>('quiz');
  const [topicFilter, setTopicFilter] = useState<KnowledgeTopic | null>(null);
  const [progress, setProgress] = useState<LearningProgress>(() => loadProgress());
  const [quizTopic, setQuizTopic] = useState<KnowledgeTopic | null>(null);
  const [quizIndex, setQuizIndex] = useState(0);

  const profile = useMemo(() => getLearnerProfile(profileId), [profileId]);

  // 每次進站更新造訪時間並存檔
  useEffect(() => {
    const next = { ...progress, lastVisitedAt: Date.now() };
    setProgress(next);
    saveProgress(next);
    // 只在身分切換或首次載入時執行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  // 離開頁面時停止朗讀
  useEffect(() => () => stopSpeech(), []);

  /* -------- 知識卡：依身分排序（該身分專屬的排前面） -------- */
  const cards = useMemo(() => {
    const filtered = topicFilter
      ? KNOWLEDGE_CARDS.filter((c) => c.topic === topicFilter)
      : KNOWLEDGE_CARDS;
    const sorted = [...filtered].sort((a, b) => {
      const aMine = a.forProfiles.includes(profileId) ? 0 : 1;
      const bMine = b.forProfiles.includes(profileId) ? 0 : 1;
      return aMine - bMine;
    });
    // 教材內容依語言換成英文（查不到會安全退回中文原文，不會半英半中）
    return sorted.map((c) => localizeCard(c, language));
  }, [topicFilter, profileId, language]);

  /* -------- 線上題庫（2026-10-07 第二階段）-------- */
  /**
   * 題庫變更時要重算題目清單。
   *
   * ⚠️ **一定要訂閱。** `syncQuizBank()` 是在 App 掛載時非同步跑的；
   *    使用者如果那時候正停在學堂頁，新題目補進來卻沒有重新渲染 ——
   *    要離開再回來才看得到，而**畫面上完全看不出來有東西沒更新**。
   *
   * ⚠️ 這裡的 state 只是「重新渲染的觸發器」，值本身沒有意義。
   *    刻意不用 `getBankQuestions()` 當 state —— 那會多存一份可能過期的複本。
   */
  const [bankTick, setBankTick] = useState(0);
  useEffect(() => subscribeQuizBank(() => setBankTick((n) => n + 1)), []);

  /**
   * 內建 60 題 ＋ 線上題庫（以 `id` 去重，內建優先）。
   *
   * ⚠️ 為什麼是「內建優先」而不是「線上優先」：
   *    內建題經過 `check-quiz-bank.ts` 的完整性驗證（選項數、正解範圍、
   *    英文對照都在），品質是確定的。線上題雖然也經過 `normalizeQuizQuestion`
   *    驗證，但多一層「優先相信已驗證過的資料」比較安全。
   *    （id 是內容雜湊，所以同一題本來就不會有兩份。）
   */
  const allQuestions = useMemo(() => {
    const byId = new Map<string, QuizQuestion>();
    for (const q of QUIZ_QUESTIONS) byId.set(q.id, q);
    for (const q of getBankQuestions()) if (!byId.has(q.id)) byId.set(q.id, q);
    return [...byId.values()];
    // bankTick 是刻意的依賴：它代表「題庫內容可能變了」
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankTick]);

  /* -------- 測驗題清單 -------- */
  const questions = useMemo(
    () =>
      allQuestions
        .filter((q) => !quizTopic || q.topic === quizTopic)
        .map((q) => localizeQuestion(q, language)),
    [allQuestions, quizTopic, language]
  );
  const currentQuestion = questions[quizIndex];

  /* -------- 統計 -------- */
  const uniqueCorrect = useMemo(() => {
    const set = new Set<string>();
    for (const a of progress.attempts) if (a.isCorrect) set.add(a.questionId);
    return set;
  }, [progress.attempts]);

  /**
   * ★ 答對題數的**分子**，必須用與分母同一份清單過濾。
   *
   * 【為什麼不能直接用 `uniqueCorrect.size`】
   *   `uniqueCorrect` 是**歷史上所有**答對過的題目 id ——
   *   包含別的主題的題、也包含已經不在目前清單裡的題。
   *   分母是 `allQuestions.length`。兩者不同調就會出現
   *   **「62 / 60」**這種一看就壞掉的數字，而且不會有任何錯誤訊息。
   *
   *   （第二階段加入線上題庫之後，這個風險從「理論上」變成「真的會發生」——
   *     題庫會隨時間增減。）
   */
  const correctCount = useMemo(() => {
    const ids = new Set(allQuestions.map((q) => q.id));
    return [...uniqueCorrect].filter((id) => ids.has(id)).length;
  }, [uniqueCorrect, allQuestions]);

  const cardReadCount = progress.readCardIds.length;

  /* -------- 事件處理 -------- */
  const markCardRead = (cardId: string) => {
    if (progress.readCardIds.includes(cardId)) return;
    const next = { ...progress, readCardIds: [...progress.readCardIds, cardId] };
    setProgress(next);
    saveProgress(next);
  };

  const handleAnswer = (selectedIndex: number) => {
    if (!currentQuestion) return;
    const isCorrect = selectedIndex === currentQuestion.correctIndex;
    const next: LearningProgress = {
      ...progress,
      attempts: [
        ...progress.attempts,
        {
          questionId: currentQuestion.id,
          selectedIndex,
          isCorrect,
          timestamp: Date.now(),
        },
      ],
    };
    setProgress(next);
    saveProgress(next);
  };

  const resetQuiz = () => {
    setQuizIndex(0);
    setQuizTopic(null);
    stopSpeech();
  };

  const resetAllProgress = () => {
    const empty: LearningProgress = {
      readCardIds: [],
      attempts: [],
      lastVisitedAt: Date.now(),
    };
    setProgress(empty);
    saveProgress(empty);
    setQuizIndex(0);
  };

  /* ======================= 渲染 ======================= */
  return (
    <div className="flex flex-col space-y-4">
      {/* ---------- 頁首：身分摘要 ---------- */}
      <section className="rounded-2xl bg-gradient-to-br from-blue-900 to-blue-800 text-white p-4">
        <div className="flex items-center gap-2">
          <GraduationCap className="w-7 h-7 shrink-0" />
          <h1 className="text-[20px] font-black">{t('classroom.title')}</h1>
        </div>
        <p className="text-[16px] mt-1.5 leading-relaxed text-blue-50">
          {t('classroom.intro')}
        </p>
        <div className="mt-3 inline-flex items-center gap-2 bg-white/15 rounded-full px-3 py-1.5">
          <span className="text-[19px]" aria-hidden="true">
            {profile.emoji}
          </span>
          <span className="text-[16px] font-bold">
            {t('classroom.currentProfile', {
              name: profileDisplayName(profile.id, profile.name, language),
            })}
          </span>
        </div>
      </section>

      {/* ---------- 分頁切換 ---------- */}
      {/* ⚠️ 2026-10-02 使用者要求：**「測驗」放第一個**。
          原本順序是 教材 → 測驗 → 進度，使用者反映「沒看到測驗分頁」。
          測驗是唯一有互動、需要思考的分頁 —— 它才是食育的核心，
          放在第一並設為預設，使用者一進來就直接開始作答。 */}
      <nav aria-label={t('classroom.tabsAria')} className="grid grid-cols-3 gap-1.5">
        {(
          [
            {
              id: 'quiz',
              labelKey: 'classroom.tabQuiz',
              icon: Target,
              badge: `${allQuestions.length}`,
            },
            {
              id: 'cards',
              labelKey: 'classroom.tabCards',
              icon: BookOpen,
              badge: `${KNOWLEDGE_CARDS.length}`,
            },
            {
              id: 'progress',
              labelKey: 'classroom.tabProgress',
              icon: Trophy,
              badge: `${cardReadCount}`,
            },
          ] as const
        ).map(({ id, labelKey, icon: Icon, badge }) => (
          <button
            key={id}
            type="button"
            aria-selected={tab === id}
            role="tab"
            onClick={() => {
              stopSpeech();
              setTab(id);
            }}
            className={`min-h-[68px] rounded-2xl flex flex-col items-center justify-center gap-1 cursor-pointer transition-all active:scale-95 relative ${
              tab === id
                ? 'bg-blue-900 text-white font-black shadow-md ring-3 ring-yellow-400'
                : 'bg-slate-100 text-slate-800 font-bold border-2 border-slate-300 hover:bg-slate-200'
            }`}
          >
            <Icon className="w-6 h-6 shrink-0" />
            <span className="text-[16px] leading-tight whitespace-nowrap">{t(labelKey)}</span>
            <span
              className={`absolute top-1 right-1.5 text-[16px] font-black px-1.5 rounded-full ${
                tab === id ? 'bg-yellow-400 text-blue-950' : 'bg-slate-400 text-white'
              }`}
            >
              {badge}
            </span>
          </button>
        ))}
      </nav>

      {/* ================= 分頁 1：知識卡 ================= */}
      {tab === 'cards' && (
        <>
          {/* 主題篩選 */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTopicFilter(null)}
              className={`min-h-[48px] px-4 rounded-full text-[16px] font-bold border-2 whitespace-nowrap cursor-pointer transition-all ${
                topicFilter === null
                  ? 'bg-blue-900 text-white border-blue-950'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {t('classroom.all')}
            </button>
            {TOPIC_ORDER.map((topic) => (
              <button
                key={topic}
                type="button"
                onClick={() => setTopicFilter(topic)}
                className={`min-h-[48px] px-4 rounded-full text-[16px] font-bold border-2 whitespace-nowrap cursor-pointer transition-all ${
                  topicFilter === topic
                    ? 'bg-blue-900 text-white border-blue-950'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                {topicLabel(topic, TOPIC_LABELS[topic], language)}
              </button>
            ))}
          </div>

          <p className="text-[16px] text-slate-600">
            {t('classroom.cardCount', { n: cards.length, m: cardReadCount })}
          </p>

          <div className="space-y-2.5">
            {cards.map((card) => (
              <KnowledgeCardView
                key={card.id}
                card={card}
                isRead={progress.readCardIds.includes(card.id)}
                onMarkRead={() => markCardRead(card.id)}
              />
            ))}
          </div>
        </>
      )}

      {/* ================= 分頁 2：測驗 ================= */}
      {tab === 'quiz' && (
        <>
          {/* 主題篩選 */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setQuizTopic(null);
                setQuizIndex(0);
              }}
              className={`min-h-[48px] px-4 rounded-full text-[16px] font-bold border-2 whitespace-nowrap cursor-pointer transition-all ${
                quizTopic === null
                  ? 'bg-blue-900 text-white border-blue-950'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {t('classroom.allQuestions')}
            </button>
            {TOPIC_ORDER.map((topic) => {
              const count = allQuestions.filter((q) => q.topic === topic).length;
              if (count === 0) return null;
              return (
                <button
                  key={topic}
                  type="button"
                  onClick={() => {
                    setQuizTopic(topic);
                    setQuizIndex(0);
                  }}
                  className={`min-h-[48px] px-4 rounded-full text-[16px] font-bold border-2 whitespace-nowrap cursor-pointer transition-all ${
                    quizTopic === topic
                      ? 'bg-blue-900 text-white border-blue-950'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {t('classroom.topicCount', {
                    label: topicLabel(topic, TOPIC_LABELS[topic], language),
                    n: count,
                  })}
                </button>
              );
            })}
          </div>

          {currentQuestion ? (
            <>
              {/* 進度條 */}
              <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-700 transition-all"
                  style={{ width: `${((quizIndex + 1) / questions.length) * 100}%` }}
                />
              </div>

              {/* 使用 key 讓換題時重置內部狀態 */}
              <QuizCard
                key={currentQuestion.id}
                question={currentQuestion}
                index={quizIndex}
                total={questions.length}
                onAnswer={handleAnswer}
              />

              {/* 換題按鈕 */}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={quizIndex === 0}
                  onClick={() => {
                    stopSpeech();
                    setQuizIndex((i) => Math.max(0, i - 1));
                  }}
                  className={`flex-1 min-h-[60px] rounded-xl text-[18px] font-bold flex items-center justify-center gap-2 transition-all ${
                    quizIndex === 0
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      : 'bg-slate-700 text-white cursor-pointer hover:bg-slate-800 active:scale-95'
                  }`}
                >
                  <ChevronLeft className="w-5 h-5" /> {t('classroom.prev')}
                </button>
                <button
                  type="button"
                  disabled={quizIndex >= questions.length - 1}
                  onClick={() => {
                    stopSpeech();
                    setQuizIndex((i) => Math.min(questions.length - 1, i + 1));
                  }}
                  className={`flex-1 min-h-[60px] rounded-xl text-[18px] font-bold flex items-center justify-center gap-2 transition-all ${
                    quizIndex >= questions.length - 1
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      : 'bg-blue-900 text-white cursor-pointer hover:bg-blue-950 active:scale-95'
                  }`}
                >
                  {t('classroom.next')} <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              <button
                type="button"
                onClick={resetQuiz}
                className="w-full min-h-[56px] rounded-xl bg-white border-2 border-slate-300 text-slate-700 text-[16px] font-bold flex items-center justify-center gap-2 cursor-pointer hover:bg-slate-50 active:scale-95 transition-all"
              >
                <RotateCcw className="w-5 h-5" /> {t('classroom.restart')}
              </button>
            </>
          ) : (
            <p className="text-[18px] text-slate-600 text-center py-8">
              {t('classroom.noQuestions')}
            </p>
          )}
        </>
      )}

      {/* ================= 分頁 3：我的進度 ================= */}
      {tab === 'progress' && (
        <>
          {/* 統計卡片 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-blue-50 border-3 border-blue-400 p-4 text-center">
              <BookOpen className="w-8 h-8 text-blue-800 mx-auto mb-1" />
              <p className="text-[20px] font-black text-blue-900 leading-none">
                {cardReadCount}
                <span className="text-[20px] text-slate-500">/{KNOWLEDGE_CARDS.length}</span>
              </p>
              <p className="text-[16px] font-bold text-slate-700 mt-1">
                {t('classroom.readCards')}
              </p>
            </div>
            <div className="rounded-2xl bg-emerald-50 border-3 border-emerald-400 p-4 text-center">
              <Award className="w-8 h-8 text-emerald-800 mx-auto mb-1" />
              <p className="text-[20px] font-black text-emerald-900 leading-none">
                {uniqueCorrect.size}
                <span className="text-[20px] text-slate-500">/{allQuestions.length}</span>
              </p>
              <p className="text-[16px] font-bold text-slate-700 mt-1">
                {t('classroom.correctCount')}
              </p>
            </div>
          </div>

          {/* 累計作答 */}
          <div className="rounded-2xl bg-slate-100 border-2 border-slate-300 p-4">
            <p className="text-[18px] font-bold text-slate-800">
              {t('classroom.attempts', {
                total: progress.attempts.length,
                correct: progress.attempts.filter((a) => a.isCorrect).length,
              })}
              {progress.attempts.length > 0 &&
                t('classroom.accuracy', {
                  pct: Math.round(
                    (progress.attempts.filter((a) => a.isCorrect).length /
                      progress.attempts.length) *
                      100
                  ),
                })}
            </p>
          </div>

          {/* 尚未答對的題目提示 */}
          {correctCount < allQuestions.length && (
            <div className="rounded-2xl bg-amber-50 border-2 border-amber-400 p-4">
              <p className="text-[18px] font-bold text-amber-900 mb-1.5 flex items-center gap-2">
                <Target className="w-5 h-5" />
                {t('classroom.remaining', {
                  n: allQuestions.length - correctCount,
                })}
              </p>
              <p className="text-[16px] text-amber-800 leading-relaxed">
                {t('classroom.remainingHint')}
              </p>
            </div>
          )}

          {/* 身分切換（食育學堂上方已有自己的區塊標題，故隱藏內建標題） */}
          <LearnerProfilePicker
            selectedId={profileId}
            onSelect={onChangeProfile}
            hideHeading
          />

          {/* 重設進度 */}
          <button
            type="button"
            onClick={resetAllProgress}
            className="w-full min-h-[56px] rounded-xl bg-white border-2 border-rose-300 text-rose-700 text-[16px] font-bold flex items-center justify-center gap-2 cursor-pointer hover:bg-rose-50 active:scale-95 transition-all"
          >
            <RotateCcw className="w-5 h-5" /> {t('classroom.clearProgress')}
          </button>
        </>
      )}
    </div>
  );
};
