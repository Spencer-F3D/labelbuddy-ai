/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ============================================================================
 * 『我的飲食健康紀錄』模組 (Senior Diet Health History & Tiered Graded Records)
 * ============================================================================
 * 
 * 【功能特性】
 * 1. 介面緊湊精簡 (Compact Layout)：大幅提升可讀性與一覽性。
 * 2. 分級健康評級系統 (Tiered Grading)：
 *    - 🏆 A/B/C 飲食健康評級與把關綜合評分
 *    - 🟢 安心推薦級 / 🟡 留意份量級 / 🔴 嚴防避開級
 *    - 一鍵分級篩選按鈕 (Filter Tabs)，快速檢視各級食品
 * 3. 摺疊卡片設計：預設展示關鍵品名、時間與大白話結論，可一鍵展開詳細營養與替代建議。
 * 4. 語音朗讀支援：提供本週總結與個別紀錄的大白話語音播報（粵語/國語）。
 * 5. 匯出健康概況 (Export Health Summary)：
 *    - 將整理好的飲食分析摘要與生理指標整理成簡潔的文字格式。
 *    - 提供一鍵複製、長按選取複製文字框，並支援 Web Share 分享給子女或家人。
 * ============================================================================
 */

import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Award,
  Volume2,
  VolumeX,
  TrendingUp,
  RotateCcw,
  Clock,
  Trash2,
  Layers,
  Info,
  Share2,
  Copy,
  CheckCheck,
  FileText,
  X,
} from 'lucide-react';
import { DietRecord, SeniorPhysicalIndicators } from '../types';
import { PHYSICAL_INDICATORS } from '../data/conditions';
import { speakText, stopSpeech } from '../utils/tts';
// 雙語（2026-09-28 第三階段）：介面文字走 t()，慢性病名稱查共用對照表
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { conditionName as localizedConditionName } from '../data/bilingual';

interface DietHealthHistoryProps {
  records: DietRecord[];
  onClearRecords: () => void;
  onResetSampleRecords: () => void;
  indicators?: SeniorPhysicalIndicators;
  selectedConditions?: string[];
}

type GradeFilter = 'all' | 'green' | 'yellow' | 'red';

export const DietHealthHistory: React.FC<DietHealthHistoryProps> = ({
  records,
  onClearRecords,
  onResetSampleRecords,
  indicators,
  selectedConditions = [],
}) => {
  const { t, language } = useI18n();
  /** 朗讀語言：中文維持粵語，英文改用英文語音（否則會用中文腔念英文句子） */
  const ttsLang = language === 'en' ? ('english' as const) : ('cantonese' as const);

  const [selectedGradeFilter, setSelectedGradeFilter] = useState<GradeFilter>('all');
  const [expandedRecordIds, setExpandedRecordIds] = useState<Record<string, boolean>>({});
  const [isSpeakingSummary, setIsSpeakingSummary] = useState<boolean>(false);
  const [activeSpeakingRecordId, setActiveSpeakingRecordId] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [copiedSuccess, setCopiedSuccess] = useState<boolean>(false);

  // 計算過去一週（7天內）的紀錄
  const pastWeekRecords = useMemo(() => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    return records.filter((r) => r.timestamp >= sevenDaysAgo);
  }, [records]);

  // 統計過去一週各風險等級數量與分級評分
  const stats = useMemo(() => {
    const total = pastWeekRecords.length;
    const greenCount = pastWeekRecords.filter((r) => r.risk_level === 'green').length;
    const yellowCount = pastWeekRecords.filter((r) => r.risk_level === 'yellow').length;
    const redCount = pastWeekRecords.filter((r) => r.risk_level === 'red').length;

    const greenPercent = total > 0 ? Math.round((greenCount / total) * 100) : 0;
    const yellowPercent = total > 0 ? Math.round((yellowCount / total) * 100) : 0;
    const redPercent = total > 0 ? Math.round((redCount / total) * 100) : 0;

    // 計算綜合健康把關分數 (綠燈 100分, 黃燈 60分, 紅燈 0分)
    const score = total > 0 ? Math.round((greenCount * 100 + yellowCount * 60) / total) : 85;

    let gradeLetter = 'A';
    let gradeTitleKey: TranslationKey = 'history.gradeA';
    let gradeBadgeClass = 'bg-emerald-100 text-emerald-950 border-emerald-500';

    if (score < 60 || redCount >= 3) {
      gradeLetter = 'C';
      gradeTitleKey = 'history.gradeC';
      gradeBadgeClass = 'bg-rose-100 text-rose-950 border-rose-500';
    } else if (score < 80 || redCount >= 1) {
      gradeLetter = 'B';
      gradeTitleKey = 'history.gradeB';
      gradeBadgeClass = 'bg-amber-100 text-amber-950 border-amber-500';
    }

    return {
      total,
      greenCount,
      yellowCount,
      redCount,
      greenPercent,
      yellowPercent,
      redPercent,
      score,
      gradeLetter,
      gradeTitleKey,
      gradeBadgeClass,
    };
  }, [pastWeekRecords]);

  // 根據所選分級過濾紀錄
  const filteredRecords = useMemo(() => {
    if (selectedGradeFilter === 'all') return pastWeekRecords;
    return pastWeekRecords.filter((r) => r.risk_level === selectedGradeFilter);
  }, [pastWeekRecords, selectedGradeFilter]);

  // 切換個別卡片展開狀態
  const toggleExpand = (id: string) => {
    setExpandedRecordIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // 生成供長者與家人分享的簡潔純文字健康概況週報
  const exportSummaryText = useMemo(() => {
    const today = new Date();
    const dateStr =
      language === 'en'
        ? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
            today.getDate()
          ).padStart(2, '0')}`
        : `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;

    // ⚠️ 舊版這裡是硬編碼的 4 項對照表，新增到 12 項之後其餘 8 項會走 `|| id`
    //    直接印出英文代碼（例如「gout」），使用者完全看不懂。
    //    改為一律從共用的資料檔推導，資料檔增減項目時這裡自動跟上。
    const conditionListStr =
      selectedConditions.length > 0
        ? selectedConditions
            .map((id) => {
              const zh = PHYSICAL_INDICATORS.find((c) => c.id === id)?.name ?? id;
              return localizedConditionName(id, zh, language);
            })
            .join(t('common.listSeparator'))
        : t('history.report.noConditions');

    let vitalsStr = '';
    if (indicators) {
      const bpComment =
        indicators.systolicBp >= 140 || indicators.diastolicBp >= 90
          ? t('history.report.bpHigh')
          : indicators.systolicBp >= 130
          ? t('history.report.bpElevated')
          : t('history.report.bpNormal');
      const bsTiming =
        indicators.bloodSugarTiming === 'fasting'
          ? t('history.report.fasting')
          : t('history.report.postMeal');
      vitalsStr =
        [
          t('history.report.vitalsHeader'),
          t('history.report.bp', {
            sys: indicators.systolicBp,
            dia: indicators.diastolicBp,
            comment: bpComment,
          }),
          t('history.report.hr', { hr: indicators.heartRate || 72 }),
          t('history.report.bs', {
            bs: indicators.bloodSugar,
            unit: indicators.bloodSugarUnit || 'mmol/L',
            timing: bsTiming,
          }),
          t('history.report.conditions', { list: conditionListStr }),
          '',
        ].join('\n') + '\n';
    } else {
      vitalsStr = t('history.report.conditionsOnly', { list: conditionListStr }) + '\n';
    }

    const itemsSummary =
      pastWeekRecords.length > 0
        ? pastWeekRecords
            .slice(0, 5)
            .map((r, idx) => {
              const tag =
                r.risk_level === 'green'
                  ? t('history.report.itemGreen')
                  : r.risk_level === 'yellow'
                  ? t('history.report.itemYellow')
                  : t('history.report.itemRed');
              return t('history.report.item', {
                i: idx + 1,
                name: r.foodName,
                tag,
                title: r.warning_title,
              });
            })
            .join('\n')
        : t('history.report.noItems');

    return [
      t('history.report.title'),
      t('history.report.date', { date: dateStr }),
      '',
      vitalsStr,
      t('history.report.gradeHeader', {
        letter: stats.gradeLetter,
        title: t(stats.gradeTitleKey),
      }),
      t('history.report.total', { n: stats.total }),
      t('history.report.greenRow', { n: stats.greenCount, pct: stats.greenPercent }),
      t('history.report.yellowRow', { n: stats.yellowCount, pct: stats.yellowPercent }),
      t('history.report.redRow', { n: stats.redCount, pct: stats.redPercent }),
      '',
      t('history.report.itemsHeader'),
      itemsSummary,
      '',
      t('history.report.tipsHeader'),
      t('history.report.tip1'),
      t('history.report.tip2'),
      t('history.report.tip3'),
    ].join('\n');
    // t 與 language 都要進依賴：切語言時週報文字必須重新產生
  }, [pastWeekRecords, stats, indicators, selectedConditions, t, language]);

  // 執行複製到剪貼簿
  const handleCopyText = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(exportSummaryText);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = exportSummaryText;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedSuccess(true);
      setTimeout(() => setCopiedSuccess(false), 3000);
    } catch (err) {
      console.warn('複製失敗，請手動選取:', err);
    }
  };

  // 執行系統原生分享（如 LINE / WhatsApp / 微信 / 簡訊）
  const handleShareToFamily = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: t('history.shareTitle'),
          text: exportSummaryText,
        });
      } catch (e) {
        console.log('取消分享或不支援', e);
      }
    } else {
      handleCopyText();
    }
  };

  // 產生長輩大白話週總結語音文稿
  const weeklyVoiceScript = useMemo(() => {
    if (stats.total === 0) return t('history.speech.empty');
    return t('history.speech.summary', {
      total: stats.total,
      letter: stats.gradeLetter,
      green: stats.greenCount,
      yellow: stats.yellowCount,
      red: stats.redCount,
    });
  }, [stats, t]);

  // 朗讀本週總結語音
  const handleToggleSpeakWeeklySummary = () => {
    if (isSpeakingSummary) {
      stopSpeech();
      setIsSpeakingSummary(false);
    } else {
      setIsSpeakingSummary(true);
      speakText(weeklyVoiceScript, {
        rate: 0.88,
        volume: 1.0,
        preferLanguage: ttsLang,
        onEnd: () => setIsSpeakingSummary(false),
        onError: () => setIsSpeakingSummary(false),
      });
    }
  };

  // 朗讀個別單項紀錄
  const handleToggleSpeakSingleRecord = (record: DietRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeSpeakingRecordId === record.id) {
      stopSpeech();
      setActiveSpeakingRecordId(null);
    } else {
      setActiveSpeakingRecordId(record.id);
      const textToSpeak = `${record.foodName}。${record.warning_title}。${record.plain_summary}`;
      speakText(textToSpeak, {
        rate: 0.88,
        volume: 1.0,
        preferLanguage: ttsLang,
        onEnd: () => setActiveSpeakingRecordId(null),
        onError: () => setActiveSpeakingRecordId(null),
      });
    }
  };

  return (
    <section
      aria-label={t('history.ariaModule')}
      className="w-full bg-white rounded-3xl p-4 sm:p-5 border-3 border-blue-900 shadow-sm flex flex-col space-y-4 relative"
    >
      {/* 1. 模組標題與分級總評頂欄 (緊湊設計) */}
      <div className="flex items-center justify-between border-b-2 border-slate-200 pb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0 border-2 border-blue-900">
            <Calendar className="w-6 h-6 text-blue-900" />
          </div>
          <div>
            <h2 className="text-[20px] font-black text-slate-950 leading-tight">
              {t('history.title')}
            </h2>
            <p className="text-[16px] font-bold text-slate-500">
              {t('history.subtitle')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-[8px] flex-wrap justify-end">
          {/* 匯出健康概況按鈕 */}
          <button
            type="button"
            id="btn-open-export-summary"
            onClick={() => setShowExportModal(true)}
            className="px-3.5 py-2 rounded-2xl bg-indigo-50 hover:bg-indigo-100 text-indigo-950 border-2 border-indigo-700 font-black text-[16px] whitespace-nowrap flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-xs"
          >
            <Share2 className="w-4 h-4 text-indigo-700 shrink-0" />
            <span>{t('history.export')}</span>
          </button>

          {/* 飲食分級評等 Badge */}
          <div className={`px-3 py-1.5 rounded-2xl border-2 whitespace-nowrap flex items-center gap-1.5 shadow-xs ${stats.gradeBadgeClass}`}>
            <Award className="w-5 h-5 shrink-0" />
            <span className="text-[16px] font-black">
              {t('history.gradeBadge', {
                letter: stats.gradeLetter,
                title: t(stats.gradeTitleKey),
              })}
            </span>
          </div>
        </div>
      </div>

      {/* 2. 精簡分級數據統計卡片 (Compact 3-Tier Micro Bento) */}
      <div className="bg-gradient-to-br from-blue-950 to-slate-900 text-white rounded-2xl p-4 shadow-sm border-2 border-blue-950 flex flex-col space-y-3">
        {/* 上方：總數與語音朗讀條 */}
        <div className="flex items-center justify-between gap-[8px] flex-wrap">
          <div className="flex items-baseline gap-1.5 whitespace-nowrap">
            <TrendingUp className="w-5 h-5 text-yellow-400 shrink-0 self-center" />
            <span className="text-[16px] font-bold text-slate-300">{t('history.sevenDays')}</span>
            <span className="text-[20px] font-black text-yellow-300 ml-1 drop-shadow">
              {stats.total}
            </span>
            <span className="text-[16px] font-bold text-slate-200">{t('history.timesFood')}</span>
          </div>

          <button
            type="button"
            id="btn-speak-weekly-summary"
            onClick={handleToggleSpeakWeeklySummary}
            className={`px-3 py-1.5 rounded-xl font-black text-[16px] whitespace-nowrap flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 border-2 ${
              isSpeakingSummary
                ? 'bg-rose-600 text-white border-rose-400 animate-pulse'
                : 'bg-yellow-400 hover:bg-yellow-500 text-slate-950 border-yellow-300'
            }`}
          >
            {isSpeakingSummary ? (
              <>
                <VolumeX className="w-4 h-4 shrink-0" />
                <span>{t('history.stopSpeak')}</span>
              </>
            ) : (
              <>
                <Volume2 className="w-4 h-4 text-slate-950 shrink-0" />
                <span>{t('history.speakWeekly')}</span>
              </>
            )}
          </button>
        </div>

        {/* 中間：三色分級快速摘要 (綠・黃・紅) */}
        <div className="grid grid-cols-3 gap-2">
          {/* 🟢 安心級 */}
          <div className="bg-emerald-950/70 border border-emerald-500/60 rounded-xl p-2.5 text-center flex flex-col items-center">
            <span className="text-[16px] font-bold text-emerald-300 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              {t('history.greenLight')}
            </span>
            <span className="text-[20px] font-black text-emerald-300 my-0.5">
              {stats.greenCount} <span className="text-[16px] font-bold text-emerald-400">
                {t('history.timesUnit')}
              </span>
            </span>
            <span className="text-[16px] font-bold text-emerald-400 bg-emerald-900/60 px-2 py-0.5 rounded-full">
              {stats.greenPercent}%
            </span>
          </div>

          {/* 🟡 留意級 */}
          <div className="bg-amber-950/70 border border-amber-500/60 rounded-xl p-2.5 text-center flex flex-col items-center">
            <span className="text-[16px] font-bold text-amber-300 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
              {t('history.yellowLight')}
            </span>
            <span className="text-[20px] font-black text-amber-300 my-0.5">
              {stats.yellowCount} <span className="text-[16px] font-bold text-amber-400">
                {t('history.timesUnit')}
              </span>
            </span>
            <span className="text-[16px] font-bold text-amber-400 bg-amber-900/60 px-2 py-0.5 rounded-full">
              {stats.yellowPercent}%
            </span>
          </div>

          {/* 🔴 避開級 */}
          <div className="bg-rose-950/70 border border-rose-500/60 rounded-xl p-2.5 text-center flex flex-col items-center">
            <span className="text-[16px] font-bold text-rose-300 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />
              {t('history.redLight')}
            </span>
            <span className="text-[20px] font-black text-rose-300 my-0.5">
              {stats.redCount} <span className="text-[16px] font-bold text-rose-400">
                {t('history.timesUnit')}
              </span>
            </span>
            <span className="text-[16px] font-bold text-rose-400 bg-rose-900/60 px-2 py-0.5 rounded-full">
              {stats.redPercent}%
            </span>
          </div>
        </div>

        {/* 底部：精簡分級長條圖 */}
        {stats.total > 0 && (
          <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden flex border border-slate-700">
            {stats.greenPercent > 0 && (
              <div
                style={{ width: `${stats.greenPercent}%` }}
                className="bg-emerald-500 h-full"
                title={t('history.barGreen', { n: stats.greenPercent })}
              />
            )}
            {stats.yellowPercent > 0 && (
              <div
                style={{ width: `${stats.yellowPercent}%` }}
                className="bg-amber-400 h-full"
                title={t('history.barYellow', { n: stats.yellowPercent })}
              />
            )}
            {stats.redPercent > 0 && (
              <div
                style={{ width: `${stats.redPercent}%` }}
                className="bg-rose-500 h-full"
                title={t('history.barRed', { n: stats.redPercent })}
              />
            )}
          </div>
        )}
      </div>

      {/* 3. 分級篩選標籤 (Tiered Filter Pills) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setSelectedGradeFilter('all')}
          className={`px-3 py-1.5 rounded-xl font-black text-[16px] border-2 flex items-center gap-1 shrink-0 transition-all cursor-pointer ${
            selectedGradeFilter === 'all'
              ? 'bg-blue-900 text-white border-blue-950 shadow-xs'
              : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>{t('history.filterAll', { n: pastWeekRecords.length })}</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedGradeFilter('green')}
          className={`px-3 py-1.5 rounded-xl font-black text-[16px] border-2 flex items-center gap-1 shrink-0 transition-all cursor-pointer ${
            selectedGradeFilter === 'green'
              ? 'bg-emerald-700 text-white border-emerald-900 shadow-xs'
              : 'bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100'
          }`}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
          <span>{t('history.filterGreen', { n: stats.greenCount })}</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedGradeFilter('yellow')}
          className={`px-3 py-1.5 rounded-xl font-black text-[16px] border-2 flex items-center gap-1 shrink-0 transition-all cursor-pointer ${
            selectedGradeFilter === 'yellow'
              ? 'bg-amber-500 text-slate-950 border-amber-700 shadow-xs'
              : 'bg-amber-50 text-amber-950 border-amber-300 hover:bg-amber-100'
          }`}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
          <span>{t('history.filterYellow', { n: stats.yellowCount })}</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedGradeFilter('red')}
          className={`px-3 py-1.5 rounded-xl font-black text-[16px] border-2 flex items-center gap-1 shrink-0 transition-all cursor-pointer ${
            selectedGradeFilter === 'red'
              ? 'bg-rose-700 text-white border-rose-900 shadow-xs'
              : 'bg-rose-50 text-rose-900 border-rose-300 hover:bg-rose-100'
          }`}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
          <span>{t('history.filterRed', { n: stats.redCount })}</span>
        </button>
      </div>

      {/* 4. 精簡分級紀錄清單 (Compact Card List with Expandable Detail) */}
      <div className="flex flex-col space-y-2.5">
        {filteredRecords.length === 0 ? (
          <div className="p-6 text-center bg-slate-50 rounded-2xl border-2 border-slate-200 text-slate-500 font-bold text-[16px]">
            {t('history.emptyFilter')}
          </div>
        ) : (
          filteredRecords.map((record) => {
            const isExpanded = !!expandedRecordIds[record.id];
            const isSpeakingThis = activeSpeakingRecordId === record.id;

            const isGreen = record.risk_level === 'green';
            const isYellow = record.risk_level === 'yellow';

            const borderAccent = isGreen
              ? 'border-l-6 border-l-emerald-600 border-t border-r border-b border-slate-200 bg-emerald-50/40'
              : isYellow
              ? 'border-l-6 border-l-amber-500 border-t border-r border-b border-slate-200 bg-amber-50/40'
              : 'border-l-6 border-l-rose-600 border-t border-r border-b border-slate-200 bg-rose-50/40';

            const badgeColor = isGreen
              ? 'bg-emerald-700 text-white'
              : isYellow
              ? 'bg-amber-400 text-slate-950 font-black'
              : 'bg-rose-700 text-white';

            const badgeText = isGreen
              ? t('history.badgeGreen')
              : isYellow
              ? t('history.badgeYellow')
              : t('history.badgeRed');

            return (
              <div
                key={record.id}
                className={`w-full rounded-2xl p-3.5 shadow-xs transition-all ${borderAccent}`}
              >
                {/* 卡片標頭：品名、分級徽章、時間 */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-[20px] font-black text-slate-950">
                        {record.foodName}
                      </h4>
                      <span className={`text-[16px] font-black px-2.5 py-0.5 rounded-full ${badgeColor}`}>
                        {badgeText}
                      </span>
                    </div>
                    <span className="text-[16px] font-bold text-slate-500 flex items-center gap-1 mt-0.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {record.dateString}
                    </span>
                  </div>

                  {/* 語音朗讀小按鈕 */}
                  <button
                    type="button"
                    id={`btn-speak-record-${record.id}`}
                    onClick={(e) => handleToggleSpeakSingleRecord(record, e)}
                    className={`p-2 rounded-xl border flex items-center gap-1 text-[16px] font-black shrink-0 transition-all cursor-pointer active:scale-90 ${
                      isSpeakingThis
                        ? 'bg-rose-600 text-white border-rose-700 animate-pulse'
                        : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300 shadow-xs'
                    }`}
                    title={t('history.speakThisTitle')}
                  >
                    {isSpeakingThis ? (
                      <VolumeX className="w-4 h-4 shrink-0 text-white" />
                    ) : (
                      <Volume2 className="w-4 h-4 shrink-0 text-blue-900" />
                    )}
                    <span className="hidden sm:inline">{t('history.speakThis')}</span>
                  </button>
                </div>

                {/* 關鍵結論警示 (精簡 1-2 行) */}
                <p className="text-[16px] font-extrabold text-slate-800 mt-2 leading-snug">
                  {record.warning_title}
                </p>

                {/* 展開後的完整白話文與生活替代建議 */}
                {isExpanded ? (
                  <div className="mt-2.5 pt-2.5 border-t border-slate-200/80 flex flex-col space-y-2 animate-in fade-in duration-150">
                    <div className="bg-white/80 rounded-xl p-2.5 border border-slate-200">
                      <span className="text-[16px] font-bold text-slate-500 block mb-0.5">
                        {t('history.plainLabel')}
                      </span>
                      <p className="text-[16px] font-bold text-slate-800 leading-relaxed">
                        {record.plain_summary}
                      </p>
                    </div>

                    {record.alternative_advice && (
                      <div className="bg-blue-50/70 rounded-xl p-2.5 border border-blue-200">
                        <span className="text-[16px] font-bold text-blue-900 block mb-0.5">
                          {t('history.altLabel')}
                        </span>
                        <p className="text-[16px] font-bold text-blue-950 leading-relaxed">
                          {record.alternative_advice}
                        </p>
                      </div>
                    )}
                  </div>
                ) : null}

                {/* 展開 / 收起切換小按鈕 */}
                <button
                  type="button"
                  onClick={() => toggleExpand(record.id)}
                  className="mt-2 text-[16px] font-bold text-blue-900 hover:text-blue-950 flex items-center gap-1 cursor-pointer"
                >
                  <span>{t(isExpanded ? 'history.collapse' : 'history.expand')}</span>
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* 5. 底部輔助工具列 (精簡重設與清除) */}
      <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-2 flex-wrap">
        <button
          type="button"
          id="btn-reset-sample-records"
          onClick={onResetSampleRecords}
          className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[16px] flex items-center gap-1.5 cursor-pointer border border-slate-300 active:scale-95"
        >
          <RotateCcw className="w-4 h-4 text-slate-600" />
          <span>{t('history.resetSample')}</span>
        </button>

        <button
          type="button"
          onClick={() => setShowExportModal(true)}
          className="px-3.5 py-2 rounded-xl bg-blue-900 hover:bg-blue-950 text-white font-black text-[16px] flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-xs"
        >
          <Share2 className="w-4 h-4 text-yellow-300 shrink-0" />
          <span>{t('history.exportFooter')}</span>
        </button>

        {pastWeekRecords.length > 0 && (
          <button
            type="button"
            id="btn-clear-all-records"
            onClick={() => {
              if (window.confirm(t('history.clearConfirm'))) {
                onClearRecords();
              }
            }}
            className="px-3 py-2 rounded-xl bg-slate-50 hover:bg-rose-50 text-rose-700 font-bold text-[16px] flex items-center gap-1.5 cursor-pointer border border-slate-300 hover:border-rose-300 active:scale-95"
          >
            <Trash2 className="w-4 h-4 text-rose-600" />
            <span>{t('history.clear')}</span>
          </button>
        )}
      </div>

      {/* ======================================================== */}
      {/* 匯出健康概況彈出視窗 (EXPORT SUMMARY MODAL) */}
      {/* ======================================================== */}
      {showExportModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 min-[520px]:absolute z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
        >
          <div className="bg-white w-full max-w-lg rounded-3xl p-5 sm:p-6 border-4 border-blue-900 shadow-2xl flex flex-col space-y-4 max-h-[92%] overflow-y-auto">
            {/* 標題與關閉按鈕 */}
            <div className="flex items-center justify-between border-b-2 border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 border-2 border-indigo-900 flex items-center justify-center shrink-0">
                  <FileText className="w-6 h-6 text-indigo-900" />
                </div>
                <div>
                  <h3 className="text-[20px] font-black text-slate-950">
                    {t('history.modalTitle')}
                  </h3>
                  <p className="text-[16px] font-bold text-slate-500">
                    {t('history.modalSubtitle')}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer active:scale-90 border border-slate-300"
                aria-label={t('history.closeAria')}
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* 說明提示卡 */}
            <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-3 flex items-start gap-2.5">
              <Info className="w-5 h-5 text-blue-800 shrink-0 mt-0.5" />
              <p className="text-[16px] font-bold text-blue-950 leading-snug">
                {t('history.modalTip1')}
                <strong>{t('history.modalTipStrong1')}</strong>
                {t('history.modalTip2')}
                <strong>{t('history.modalTipStrong2')}</strong>
                {t('history.modalTip3')}
              </p>
            </div>

            {/* 格式化純文字預覽區（支援長按選取複製） */}
            <div className="flex flex-col space-y-1.5">
              <label htmlFor="export-text-area" className="text-[16px] font-black text-slate-700 flex items-center justify-between">
                <span>{t('history.textLabel')}</span>
                <span className="text-[16px] text-slate-500 font-bold">{t('history.textHint')}</span>
              </label>
              <textarea
                id="export-text-area"
                readOnly
                value={exportSummaryText}
                rows={12}
                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                className="w-full p-3.5 rounded-2xl border-3 border-slate-300 bg-slate-50 text-slate-900 font-mono text-[16px] sm:text-[16px] leading-relaxed focus:bg-white focus:border-blue-900 focus:outline-hidden resize-none select-all"
              />
            </div>

            {/* 操作按鈕群（一鍵複製 / 原生分享） */}
            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              {/* 一鍵複製按鈕 */}
              <button
                type="button"
                id="btn-copy-summary-text"
                onClick={handleCopyText}
                className={`flex-1 min-h-[56px] py-3 px-4 rounded-2xl font-black text-[18px] flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 border-3 shadow-sm ${
                  copiedSuccess
                    ? 'bg-emerald-600 border-emerald-800 text-white animate-bounce'
                    : 'bg-blue-900 hover:bg-blue-950 border-blue-950 text-white'
                }`}
              >
                {copiedSuccess ? (
                  <>
                    <CheckCheck className="w-6 h-6 text-yellow-300 shrink-0" />
                    <span>{t('history.copied')}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-5 h-5 text-yellow-300 shrink-0" />
                    <span>{t('history.copy')}</span>
                  </>
                )}
              </button>

              {/* 分享按鈕 */}
              <button
                type="button"
                id="btn-share-to-family"
                onClick={handleShareToFamily}
                className="min-h-[56px] py-3 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 border-3 border-emerald-800 text-white font-black text-[18px] flex items-center justify-center gap-2 cursor-pointer active:scale-95 shadow-sm"
              >
                <Share2 className="w-5 h-5 text-white shrink-0" />
                <span>{t('history.share')}</span>
              </button>
            </div>

            {/* 關閉按鈕 */}
            <button
              type="button"
              onClick={() => setShowExportModal(false)}
              className="w-full py-2.5 text-center text-slate-600 hover:text-slate-900 font-bold text-[16px] cursor-pointer"
            >
              {t('history.closeWindow')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
