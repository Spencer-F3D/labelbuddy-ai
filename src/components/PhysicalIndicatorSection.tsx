/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  HeartPulse,
  Sparkles,
  Volume2,
  VolumeX,
  Plus,
  Minus,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  ShoppingBag,
  HeartHandshake,
  Camera,
  RefreshCw,
  HelpCircle,
} from 'lucide-react';
import {
  SeniorPhysicalIndicators,
  SeniorIndicatorAnalysis,
  AppSettings,
} from '../types';
import { SeniorHealthQASection } from './SeniorHealthQASection';

interface PhysicalIndicatorSectionProps {
  settings: AppSettings;
  onApplyToFoodScanner: (matchedConditionIds: string[]) => void;
  contrastTheme?: string;
}

const STORAGE_INDICATORS_KEY = 'labelbuddy_senior_indicators';
const STORAGE_INDICATOR_RESULT_KEY = 'labelbuddy_senior_indicator_result';

export const PhysicalIndicatorSection: React.FC<PhysicalIndicatorSectionProps> = ({
  settings,
  onApplyToFoodScanner,
  contrastTheme = 'standard',
}) => {
  const isYellowContrast = contrastTheme === 'high_contrast_yellow';

  // 1. 長者指標輸入表單狀態
  const [indicators, setIndicators] = useState<SeniorPhysicalIndicators>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_INDICATORS_KEY);
        if (saved) {
          return JSON.parse(saved);
        }
      } catch (e) {
        console.warn('載入長者身體指標失敗:', e);
      }
    }
    return {
      systolicBp: 138,
      diastolicBp: 86,
      bloodSugar: 7.2,
      bloodSugarUnit: 'mmol/L',
      bloodSugarTiming: 'post_meal',
      uricAcidStatus: 'normal',
      cholesterolStatus: 'borderline',
      kidneyStatus: 'normal',
      symptoms: ['容易頭暈'],
      ageGroup: '70-79歲',
    };
  });

  // 2. 分析結果狀態
  const [analysisResult, setAnalysisResult] = useState<SeniorIndicatorAnalysis | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_INDICATOR_RESULT_KEY);
        if (saved) return JSON.parse(saved);
      } catch (e) {
        console.warn('載入指標分析結果失敗:', e);
      }
    }
    return null;
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  // 儲存至 LocalStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_INDICATORS_KEY, JSON.stringify(indicators));
    } catch (e) {
      console.warn('儲存指標失敗:', e);
    }
  }, [indicators]);

  useEffect(() => {
    if (analysisResult) {
      try {
        localStorage.setItem(STORAGE_INDICATOR_RESULT_KEY, JSON.stringify(analysisResult));
      } catch (e) {
        console.warn('儲存指標結果失敗:', e);
      }
    }
  }, [analysisResult]);

  // 步進按鈕處理
  const adjustSystolic = (delta: number) => {
    setIndicators((prev) => ({
      ...prev,
      systolicBp: Math.max(80, Math.min(220, prev.systolicBp + delta)),
    }));
  };

  const adjustDiastolic = (delta: number) => {
    setIndicators((prev) => ({
      ...prev,
      diastolicBp: Math.max(50, Math.min(140, prev.diastolicBp + delta)),
    }));
  };

  const adjustBloodSugar = (delta: number) => {
    setIndicators((prev) => {
      const step = prev.bloodSugarUnit === 'mmol/L' ? delta * 0.2 : delta * 5;
      const current = prev.bloodSugar;
      const next = +(current + step).toFixed(1);
      const min = prev.bloodSugarUnit === 'mmol/L' ? 3.0 : 50;
      const max = prev.bloodSugarUnit === 'mmol/L' ? 25.0 : 450;
      return {
        ...prev,
        bloodSugar: Math.max(min, Math.min(max, next)),
      };
    });
  };

  // 單位切換
  const toggleSugarUnit = () => {
    setIndicators((prev) => {
      if (prev.bloodSugarUnit === 'mmol/L') {
        return {
          ...prev,
          bloodSugarUnit: 'mg/dL',
          bloodSugar: Math.round(prev.bloodSugar * 18),
        };
      } else {
        return {
          ...prev,
          bloodSugarUnit: 'mmol/L',
          bloodSugar: +(prev.bloodSugar / 18).toFixed(1),
        };
      }
    });
  };

  // 症狀勾選切換
  const toggleSymptom = (sym: string) => {
    setIndicators((prev) => {
      const exists = prev.symptoms.includes(sym);
      const next = exists
        ? prev.symptoms.filter((s) => s !== sym)
        : [...prev.symptoms, sym];
      return { ...prev, symptoms: next };
    });
  };

  // 快捷套用範例
  const applyPreset = (type: 'hypertension' | 'diabetes' | 'sanggao' | 'normal' | 'gout') => {
    if (type === 'hypertension') {
      setIndicators((prev) => ({
        ...prev,
        systolicBp: 148,
        diastolicBp: 92,
        bloodSugar: prev.bloodSugarUnit === 'mmol/L' ? 5.8 : 104,
        uricAcidStatus: 'normal',
        cholesterolStatus: 'borderline',
        kidneyStatus: 'normal',
        symptoms: ['容易頭暈'],
      }));
    } else if (type === 'diabetes') {
      setIndicators((prev) => ({
        ...prev,
        systolicBp: 132,
        diastolicBp: 82,
        bloodSugar: prev.bloodSugarUnit === 'mmol/L' ? 8.8 : 158,
        bloodSugarTiming: 'post_meal',
        uricAcidStatus: 'normal',
        cholesterolStatus: 'normal',
        kidneyStatus: 'normal',
        symptoms: ['常口渴想多喝水'],
      }));
    } else if (type === 'sanggao') {
      setIndicators((prev) => ({
        ...prev,
        systolicBp: 145,
        diastolicBp: 90,
        bloodSugar: prev.bloodSugarUnit === 'mmol/L' ? 7.8 : 140,
        bloodSugarTiming: 'fasting',
        uricAcidStatus: 'normal',
        cholesterolStatus: 'high',
        kidneyStatus: 'mild_edema',
        symptoms: ['容易頭暈', '傍晚雙腳微水腫'],
      }));
    } else if (type === 'gout') {
      setIndicators((prev) => ({
        ...prev,
        systolicBp: 135,
        diastolicBp: 84,
        bloodSugar: prev.bloodSugarUnit === 'mmol/L' ? 6.0 : 108,
        uricAcidStatus: 'gout_history',
        cholesterolStatus: 'normal',
        kidneyStatus: 'normal',
        symptoms: ['關節或腳趾容易痛'],
      }));
    } else if (type === 'normal') {
      setIndicators((prev) => ({
        ...prev,
        systolicBp: 120,
        diastolicBp: 78,
        bloodSugar: prev.bloodSugarUnit === 'mmol/L' ? 5.4 : 97,
        bloodSugarTiming: 'fasting',
        uricAcidStatus: 'normal',
        cholesterolStatus: 'normal',
        kidneyStatus: 'normal',
        symptoms: ['精神很好無不適'],
      }));
    }
  };

  // 呼叫後端 API 執行 Gemini / 智慧指標分析
  const handleAnalyzeIndicators = async () => {
    setIsLoading(true);
    setNoticeMessage(null);
    try {
      const response = await fetch('/api/analyze-indicators', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gemini-key': settings.customApiKey || '',
        },
        body: JSON.stringify({
          indicators,
        }),
      });

      if (!response.ok) {
        throw new Error('伺服器處理中，為您啟動本地守護引擎');
      }

      const resJson = await response.json();
      if (resJson.success && resJson.data) {
        setAnalysisResult(resJson.data);
        // 自動滾動到結果區域
        setTimeout(() => {
          const el = document.getElementById('indicator-analysis-result');
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }, 200);

        // 若開啟自動朗讀
        if (settings.autoPlaySpeech) {
          playSpeechText(resJson.data.voice_summary || resJson.data.simple_explanation);
        }
      } else {
        throw new Error('無法取得分析數據');
      }
    } catch (err: any) {
      console.warn('分析處理中:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 語音朗讀處理
  const playSpeechText = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const targetLang = settings.voiceLang === 'cantonese' ? 'zh-HK' : 'zh-TW';
    utterance.lang = targetLang;
    utterance.rate = settings.voiceRate || 0.88;
    utterance.volume = settings.voiceVolume || 1.0;

    const voices = window.speechSynthesis.getVoices();
    const matchedVoice = voices.find((v) =>
      settings.voiceLang === 'cantonese'
        ? v.lang === 'zh-HK' || v.lang.includes('yue') || v.name.includes('Hong Kong')
        : v.lang === 'zh-TW' || v.lang.includes('cmn') || v.name.includes('Taiwan')
    );
    if (matchedVoice) utterance.voice = matchedVoice;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  const handleToggleSpeak = () => {
    if (!analysisResult) return;
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    } else {
      const textToRead = analysisResult.voice_summary || analysisResult.simple_explanation;
      playSpeechText(textToRead);
    }
  };

  // 將分析出的重點同步至食品相機
  const handleLinkToCamera = () => {
    const matchedIds: string[] = [];
    if (indicators.systolicBp >= 135 || indicators.diastolicBp >= 85) {
      matchedIds.push('hypertension');
    }
    const sugarVal = indicators.bloodSugarUnit === 'mmol/L' ? indicators.bloodSugar : indicators.bloodSugar / 18;
    if (sugarVal >= 7.0) {
      matchedIds.push('diabetes');
    }
    if (indicators.cholesterolStatus !== 'normal') {
      matchedIds.push('hyperlipidemia', 'cardiovascular');
    }
    if (indicators.uricAcidStatus !== 'normal') {
      matchedIds.push('gout');
    }
    if (indicators.kidneyStatus !== 'normal') {
      matchedIds.push('kidney_disease');
    }

    onApplyToFoodScanner(matchedIds);
    setNoticeMessage('✅ 已成功將您的身體指標同步至食品標籤放大鏡！請直接拍照檢查食品。');
    setTimeout(() => setNoticeMessage(null), 4000);
  };

  return (
    <section
      id="section-physical-indicators"
      className={`rounded-3xl border-4 shadow-xl overflow-hidden transition-all ${
        isYellowContrast
          ? 'bg-zinc-950 border-yellow-400 text-yellow-300'
          : 'bg-white border-blue-500 text-slate-950'
      }`}
    >
      {/* 標題欄 */}
      <div
        className={`px-6 py-6 border-b-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
          isYellowContrast
            ? 'bg-zinc-900 border-yellow-500'
            : 'bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white border-blue-600'
        }`}
      >
        <div className="flex items-center gap-4">
          <div className="p-3 bg-white/10 rounded-2xl border-2 border-white/20 shrink-0">
            <HeartPulse className="w-10 h-10 text-rose-400 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-2xl sm:text-4xl font-black tracking-wide">
                長者身體指標自填與 Gemini 智慧守護
              </h2>
              <span className="text-xs sm:text-sm font-extrabold px-3 py-1 rounded-full bg-amber-400 text-black shadow-sm">
                純通俗大白話 · 零生澀難字
              </span>
            </div>
            <p className="text-lg sm:text-xl font-bold mt-1 opacity-90">
              阿公阿嬤只要點幾下數字，Gemini 會像孝順孫子一樣用大白話解釋，並告訴您去超市什麼絕對不能買！
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 sm:p-8 space-y-8">
        {/* 提示通知 */}
        {noticeMessage && (
          <div className="p-4 rounded-2xl bg-emerald-100 border-2 border-emerald-400 text-emerald-950 text-xl font-black flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-emerald-700 shrink-0" />
            <span>{noticeMessage}</span>
          </div>
        )}

        {/* 快捷範例一鍵帶入列 */}
        <div className="p-5 rounded-2xl bg-slate-50 border-2 border-slate-300 space-y-3">
          <div className="flex items-center gap-2 text-slate-800">
            <Sparkles className="w-6 h-6 text-amber-500" />
            <span className="text-xl font-black">點一下快速帶入長輩日常身體狀況：</span>
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <button
              type="button"
              id="btn-preset-bp"
              onClick={() => applyPreset('hypertension')}
              className="px-4 py-2.5 rounded-xl text-lg font-black bg-rose-50 border-2 border-rose-300 text-rose-900 hover:bg-rose-100 cursor-pointer shadow-sm active:scale-95"
            >
              👴 李爺爺血壓偏高 (148/92)
            </button>
            <button
              type="button"
              id="btn-preset-sugar"
              onClick={() => applyPreset('diabetes')}
              className="px-4 py-2.5 rounded-xl text-lg font-black bg-amber-50 border-2 border-amber-300 text-amber-900 hover:bg-amber-100 cursor-pointer shadow-sm active:scale-95"
            >
              👵 王奶奶飯後血糖高 (8.8度)
            </button>
            <button
              type="button"
              id="btn-preset-sanggao"
              onClick={() => applyPreset('sanggao')}
              className="px-4 py-2.5 rounded-xl text-lg font-black bg-blue-50 border-2 border-blue-300 text-blue-900 hover:bg-blue-100 cursor-pointer shadow-sm active:scale-95"
            >
              🫀 常見三高長者 (血壓145/血糖7.8/血脂高)
            </button>
            <button
              type="button"
              id="btn-preset-gout"
              onClick={() => applyPreset('gout')}
              className="px-4 py-2.5 rounded-xl text-lg font-black bg-purple-50 border-2 border-purple-300 text-purple-900 hover:bg-purple-100 cursor-pointer shadow-sm active:scale-95"
            >
              🦵 痛風/腳趾易腫長者
            </button>
            <button
              type="button"
              id="btn-preset-normal"
              onClick={() => applyPreset('normal')}
              className="px-4 py-2.5 rounded-xl text-lg font-black bg-emerald-50 border-2 border-emerald-300 text-emerald-900 hover:bg-emerald-100 cursor-pointer shadow-sm active:scale-95"
            >
              🌿 張伯伯健康正常 (120/78, 5.4度)
            </button>
          </div>
        </div>

        {/* 核心身體指標輸入卡片網格 (超大字、大步進按鈕) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 指標 1: 血壓輸入 */}
          <div className="p-6 rounded-3xl bg-slate-100 border-3 border-slate-300 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-2xl sm:text-3xl font-black flex items-center gap-2">
                🫀 血壓 (上壓 / 下壓)
              </span>
              <span className="text-sm sm:text-base font-bold text-slate-600 bg-white px-3 py-1 rounded-lg border">
                單位：mmHg
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 上壓 (收縮壓) */}
              <div className="bg-white p-4 rounded-2xl border-2 border-slate-300 text-center space-y-2">
                <span className="text-xl font-extrabold text-slate-700 block">
                  上壓 (心臟打血)
                </span>
                <div className="text-4xl sm:text-5xl font-black text-rose-600 tracking-tight">
                  {indicators.systolicBp}
                </div>
                <div className="flex items-center justify-center gap-3 pt-1">
                  <button
                    type="button"
                    id="btn-bp-sys-minus"
                    onClick={() => adjustSystolic(-5)}
                    className="w-14 h-14 rounded-2xl bg-slate-200 hover:bg-slate-300 active:bg-slate-400 font-black text-3xl flex items-center justify-center cursor-pointer border-2 border-slate-400"
                    aria-label="調低上壓 5 點"
                  >
                    <Minus className="w-7 h-7" />
                  </button>
                  <button
                    type="button"
                    id="btn-bp-sys-plus"
                    onClick={() => adjustSystolic(5)}
                    className="w-14 h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-black text-3xl flex items-center justify-center cursor-pointer border-2 border-blue-400"
                    aria-label="調高上壓 5 點"
                  >
                    <Plus className="w-7 h-7" />
                  </button>
                </div>
              </div>

              {/* 下壓 (舒張壓) */}
              <div className="bg-white p-4 rounded-2xl border-2 border-slate-300 text-center space-y-2">
                <span className="text-xl font-extrabold text-slate-700 block">
                  下壓 (血管放鬆)
                </span>
                <div className="text-4xl sm:text-5xl font-black text-blue-600 tracking-tight">
                  {indicators.diastolicBp}
                </div>
                <div className="flex items-center justify-center gap-3 pt-1">
                  <button
                    type="button"
                    id="btn-bp-dia-minus"
                    onClick={() => adjustDiastolic(-5)}
                    className="w-14 h-14 rounded-2xl bg-slate-200 hover:bg-slate-300 active:bg-slate-400 font-black text-3xl flex items-center justify-center cursor-pointer border-2 border-slate-400"
                    aria-label="調低下壓 5 點"
                  >
                    <Minus className="w-7 h-7" />
                  </button>
                  <button
                    type="button"
                    id="btn-bp-dia-plus"
                    onClick={() => adjustDiastolic(5)}
                    className="w-14 h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-black text-3xl flex items-center justify-center cursor-pointer border-2 border-blue-400"
                    aria-label="調高下壓 5 點"
                  >
                    <Plus className="w-7 h-7" />
                  </button>
                </div>
              </div>
            </div>

            <p className="text-base sm:text-lg font-bold text-slate-600 bg-white/80 p-3 rounded-xl">
              💡 <span className="font-extrabold">白話參考：</span>
              {indicators.systolicBp >= 145 || indicators.diastolicBp >= 92 ? (
                <span className="text-red-700 font-black">
                  目前偏高！飲食要嚴格避開泡麵、鹹魚、醃漬醬菜等高鹽食品。
                </span>
              ) : indicators.systolicBp >= 135 ? (
                <span className="text-amber-800 font-black">
                  稍微偏高一點點，煮菜少放一小匙鹽巴、多喝水。
                </span>
              ) : (
                <span className="text-emerald-700 font-black">
                  數字很標準，血管維持得很輕鬆！
                </span>
              )}
            </p>
          </div>

          {/* 指標 2: 血糖輸入 */}
          <div className="p-6 rounded-3xl bg-slate-100 border-3 border-slate-300 space-y-4 shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-2xl sm:text-3xl font-black flex items-center gap-2">
                🍬 血糖數值
              </span>
              <button
                type="button"
                id="btn-toggle-sugar-unit"
                onClick={toggleSugarUnit}
                className="text-base font-black px-3 py-1 rounded-xl bg-blue-600 text-white hover:bg-blue-700 cursor-pointer shadow-sm"
              >
                切換單位：{indicators.bloodSugarUnit}
              </button>
            </div>

            <div className="bg-white p-4 rounded-2xl border-2 border-slate-300 text-center space-y-3">
              {/* 狀態切換 (空腹 vs 飯後) */}
              <div className="flex justify-center gap-2">
                <button
                  type="button"
                  id="btn-sugar-fasting"
                  onClick={() => setIndicators((prev) => ({ ...prev, bloodSugarTiming: 'fasting' }))}
                  className={`px-4 py-2 rounded-xl text-lg font-black border-2 cursor-pointer transition-colors ${
                    indicators.bloodSugarTiming === 'fasting'
                      ? 'bg-blue-600 text-white border-blue-700 shadow-md'
                      : 'bg-slate-100 text-slate-700 border-slate-300'
                  }`}
                >
                  早晨空腹
                </button>
                <button
                  type="button"
                  id="btn-sugar-postmeal"
                  onClick={() => setIndicators((prev) => ({ ...prev, bloodSugarTiming: 'post_meal' }))}
                  className={`px-4 py-2 rounded-xl text-lg font-black border-2 cursor-pointer transition-colors ${
                    indicators.bloodSugarTiming === 'post_meal'
                      ? 'bg-blue-600 text-white border-blue-700 shadow-md'
                      : 'bg-slate-100 text-slate-700 border-slate-300'
                  }`}
                >
                  吃飽飯後 2 小時
                </button>
              </div>

              <div className="text-5xl font-black text-amber-600 tracking-tight">
                {indicators.bloodSugar}{' '}
                <span className="text-2xl font-bold text-slate-500">
                  {indicators.bloodSugarUnit}
                </span>
              </div>

              <div className="flex items-center justify-center gap-4 pt-1">
                <button
                  type="button"
                  id="btn-sugar-minus"
                  onClick={() => adjustBloodSugar(-1)}
                  className="w-14 h-14 rounded-2xl bg-slate-200 hover:bg-slate-300 active:bg-slate-400 font-black text-3xl flex items-center justify-center cursor-pointer border-2 border-slate-400"
                  aria-label="調低血糖數值"
                >
                  <Minus className="w-7 h-7" />
                </button>
                <button
                  type="button"
                  id="btn-sugar-plus"
                  onClick={() => adjustBloodSugar(1)}
                  className="w-14 h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-black text-3xl flex items-center justify-center cursor-pointer border-2 border-blue-400"
                  aria-label="調高血糖數值"
                >
                  <Plus className="w-7 h-7" />
                </button>
              </div>
            </div>

            <p className="text-base sm:text-lg font-bold text-slate-600 bg-white/80 p-3 rounded-xl">
              💡 <span className="font-extrabold">白話參考：</span>
              {(indicators.bloodSugarUnit === 'mmol/L' ? indicators.bloodSugar >= 7.8 : indicators.bloodSugar >= 140) ? (
                <span className="text-red-700 font-black">
                  血糖稍微偏高，含糖飲料、甜餅乾與白麵包請少吃，飯後散步 15 分鐘！
                </span>
              ) : (
                <span className="text-emerald-700 font-black">
                  血糖平穩正常，身體把糖分代謝得很好！
                </span>
              )}
            </p>
          </div>
        </div>

        {/* 指標 3, 4, 5: 尿酸、血脂、腎臟水腫快速選擇 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* 尿酸與關節 */}
          <div className="p-5 rounded-3xl bg-slate-100 border-3 border-slate-300 space-y-3">
            <span className="text-2xl font-black block text-slate-900">
              🦵 尿酸與關節
            </span>
            <div className="space-y-2">
              {[
                { id: 'normal', label: '正常無痛風' },
                { id: 'high', label: '尿酸偏高 / 抽血紅字' },
                { id: 'gout_history', label: '曾痛風 / 腳趾紅腫' },
              ].map((opt) => (
                <button
                  type="button"
                  key={opt.id}
                  onClick={() => setIndicators((prev) => ({ ...prev, uricAcidStatus: opt.id as any }))}
                  className={`w-full py-3 px-4 rounded-xl text-lg font-black text-left border-2 cursor-pointer transition-all ${
                    indicators.uricAcidStatus === opt.id
                      ? 'bg-purple-600 text-white border-purple-700 shadow-md'
                      : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {indicators.uricAcidStatus === opt.id ? '🔘 ' : '⚪ '}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 血脂與心血管油質 */}
          <div className="p-5 rounded-3xl bg-slate-100 border-3 border-slate-300 space-y-3">
            <span className="text-2xl font-black block text-slate-900">
              🫀 血脂與血管油質
            </span>
            <div className="space-y-2">
              {[
                { id: 'normal', label: '正常清澈' },
                { id: 'borderline', label: '稍偏高 / 少吃肥肉' },
                { id: 'high', label: '偏高 / 怕血管卡油' },
              ].map((opt) => (
                <button
                  type="button"
                  key={opt.id}
                  onClick={() => setIndicators((prev) => ({ ...prev, cholesterolStatus: opt.id as any }))}
                  className={`w-full py-3 px-4 rounded-xl text-lg font-black text-left border-2 cursor-pointer transition-all ${
                    indicators.cholesterolStatus === opt.id
                      ? 'bg-blue-600 text-white border-blue-700 shadow-md'
                      : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {indicators.cholesterolStatus === opt.id ? '🔘 ' : '⚪ '}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 腎臟與水腫 */}
          <div className="p-5 rounded-3xl bg-slate-100 border-3 border-slate-300 space-y-3">
            <span className="text-2xl font-black block text-slate-900">
              💧 腎臟與水腫狀況
            </span>
            <div className="space-y-2">
              {[
                { id: 'normal', label: '正常無水腫' },
                { id: 'mild_edema', label: '傍晚雙腳有些水腫' },
                { id: 'ckd', label: '腎臟需嚴格限鹽排毒' },
              ].map((opt) => (
                <button
                  type="button"
                  key={opt.id}
                  onClick={() => setIndicators((prev) => ({ ...prev, kidneyStatus: opt.id as any }))}
                  className={`w-full py-3 px-4 rounded-xl text-lg font-black text-left border-2 cursor-pointer transition-all ${
                    indicators.kidneyStatus === opt.id
                      ? 'bg-teal-600 text-white border-teal-700 shadow-md'
                      : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {indicators.kidneyStatus === opt.id ? '🔘 ' : '⚪ '}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 指標 6: 長輩自覺感覺症狀 (多選大按鈕) */}
        <div className="p-6 rounded-3xl bg-slate-100 border-3 border-slate-300 space-y-3">
          <span className="text-2xl font-black block text-slate-900">
            🩺 阿公阿嬤最近身體感覺（可多選）：
          </span>
          <div className="flex flex-wrap gap-3">
            {[
              '容易頭暈 / 站起來眼前發黑',
              '常常口渴想多喝水',
              '傍晚雙腳微水腫',
              '常火燒心 / 胃酸衝上來',
              '關節或腳趾隱隱作痛',
              '排便不大順暢',
              '精神很好無不適',
            ].map((sym) => {
              const isChecked = indicators.symptoms.includes(sym);
              return (
                <button
                  type="button"
                  key={sym}
                  onClick={() => toggleSymptom(sym)}
                  className={`px-4 py-3 rounded-2xl text-lg sm:text-xl font-black border-3 cursor-pointer transition-all ${
                    isChecked
                      ? 'bg-blue-600 text-white border-blue-700 shadow-md scale-105'
                      : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {isChecked ? '✅ ' : '⬜ '}
                  {sym}
                </button>
              );
            })}
          </div>
        </div>

        {/* 長者常見健康疑問 (Gemini 大白話即時解答專區) */}
        <SeniorHealthQASection
          indicators={indicators}
          contrastTheme={contrastTheme}
          settings={settings}
        />

        {/* 觸發分析大按鈕 */}
        <div className="pt-2">
          <button
            type="button"
            id="btn-analyze-indicators"
            onClick={handleAnalyzeIndicators}
            disabled={isLoading}
            className="w-full py-6 px-8 rounded-3xl bg-gradient-to-r from-emerald-600 via-teal-600 to-blue-600 hover:from-emerald-700 hover:to-blue-700 active:scale-[0.98] text-white font-black text-2xl sm:text-4xl shadow-2xl flex items-center justify-center gap-4 cursor-pointer border-4 border-emerald-400 transition-all disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-10 h-10 animate-spin" />
                <span>Gemini 醫生正在為阿公阿嬤整理大白話分析...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-10 h-10 text-yellow-300" />
                <span>✨ 請 Gemini 幫我看身體狀況 (通俗大白話)</span>
              </>
            )}
          </button>
        </div>

        {/* 分析結果區塊 (大字體、大喇叭語音朗讀、超市買菜指南) */}
        {analysisResult && (
          <div
            id="indicator-analysis-result"
            className="mt-8 rounded-3xl border-4 border-slate-400 overflow-hidden bg-white shadow-2xl space-y-6 p-6 sm:p-10"
          >
            {/* 結果標題與健康燈號 */}
            <div
              className={`p-6 rounded-3xl border-4 ${
                analysisResult.status_level === 'red'
                  ? 'bg-rose-50 border-rose-500 text-rose-950'
                  : analysisResult.status_level === 'yellow'
                  ? 'bg-amber-50 border-amber-500 text-amber-950'
                  : 'bg-emerald-50 border-emerald-500 text-emerald-950'
              }`}
            >
              <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                <span className="text-base font-extrabold px-3 py-1 rounded-full bg-white/90 border shadow-sm">
                  {analysisResult.analysis_mode === 'cloud_ai'
                    ? '✨ 雲端 AI 家庭醫生分析'
                    : '🛡️ 智慧長者身體健康守護引擎'}
                </span>
              </div>
              <div className="flex items-start gap-4">
                {analysisResult.status_level === 'red' ? (
                  <AlertTriangle className="w-12 h-12 text-rose-600 shrink-0 mt-1" />
                ) : analysisResult.status_level === 'yellow' ? (
                  <AlertCircle className="w-12 h-12 text-amber-600 shrink-0 mt-1" />
                ) : (
                  <CheckCircle2 className="w-12 h-12 text-emerald-600 shrink-0 mt-1" />
                )}
                <div>
                  <h3 className="text-3xl sm:text-5xl font-black leading-tight">
                    {analysisResult.status_title}
                  </h3>
                </div>
              </div>
            </div>

            {/* 語音大聲朗讀區 (巨型喇叭) */}
            <div className="bg-slate-100 p-6 rounded-3xl border-3 border-slate-300 shadow-md flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <span className="text-lg font-extrabold text-blue-900 bg-blue-200 px-3 py-1 rounded-lg">
                  🔊 專人語音大聲朗讀（{settings.voiceLang === 'cantonese' ? '粵語' : '國語'} · 音量 {Math.round(settings.voiceVolume * 100)}%）
                </span>
                <p className="text-xl font-bold text-slate-700 mt-2">
                  {isSpeaking ? '正在為阿公阿嬤大聲唸出分析建議中...' : '點擊右邊大喇叭，聽孝順孫子親口為您解說！'}
                </p>
              </div>

              <button
                type="button"
                id="btn-indicator-tts"
                onClick={handleToggleSpeak}
                className={`w-full sm:w-auto px-8 py-5 rounded-2xl font-black text-2xl sm:text-3xl flex items-center justify-center gap-3 text-white shadow-xl cursor-pointer border-3 transition-all ${
                  isSpeaking
                    ? 'bg-rose-600 hover:bg-rose-700 border-rose-400 animate-pulse'
                    : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 border-blue-400'
                }`}
              >
                {isSpeaking ? (
                  <>
                    <VolumeX className="w-9 h-9" />
                    <span>停止朗讀</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-9 h-9" />
                    <span>🔊 大聲朗讀給我聽</span>
                  </>
                )}
              </button>
            </div>

            {/* 大白話身體診斷 */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border-3 border-slate-300 shadow-sm space-y-4">
              <div className="flex items-center gap-3">
                <HeartHandshake className="w-9 h-9 text-blue-700" />
                <h4 className="text-2xl sm:text-3xl font-black text-slate-950">
                  👵 阿公阿嬤大白話診斷說明：
                </h4>
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-slate-900 leading-relaxed whitespace-pre-line bg-slate-50 p-6 rounded-2xl border-2 border-slate-200">
                {analysisResult.simple_explanation}
              </div>
            </div>

            {/* 超市買菜實戰指南 (什麼絕對不能買、什麼可以放心買) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 千萬不要買 */}
              <div className="bg-rose-50 rounded-3xl p-6 sm:p-8 border-4 border-rose-300 space-y-4">
                <div className="flex items-center gap-3 text-rose-900">
                  <ShoppingBag className="w-9 h-9 text-rose-700" />
                  <h4 className="text-2xl sm:text-3xl font-black">
                    ❌ 去超市千萬不要買：
                  </h4>
                </div>
                <ul className="space-y-3">
                  {analysisResult.supermarket_rules.do_not_buy.map((item, idx) => (
                    <li
                      key={idx}
                      className="text-xl sm:text-2xl font-black text-rose-950 bg-white p-4 rounded-2xl border-2 border-rose-200 shadow-sm leading-relaxed"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* 可以放心買 */}
              <div className="bg-emerald-50 rounded-3xl p-6 sm:p-8 border-4 border-emerald-300 space-y-4">
                <div className="flex items-center gap-3 text-emerald-900">
                  <ShoppingBag className="w-9 h-9 text-emerald-700" />
                  <h4 className="text-2xl sm:text-3xl font-black">
                    ✅ 去超市可以放心買：
                  </h4>
                </div>
                <ul className="space-y-3">
                  {analysisResult.supermarket_rules.recommended_to_buy.map((item, idx) => (
                    <li
                      key={idx}
                      className="text-xl sm:text-2xl font-black text-emerald-950 bg-white p-4 rounded-2xl border-2 border-emerald-200 shadow-sm leading-relaxed"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* 生活小叮嚀 */}
            <div className="bg-amber-50 rounded-3xl p-6 sm:p-8 border-3 border-amber-300 space-y-3">
              <h4 className="text-2xl sm:text-3xl font-black text-amber-950">
                🌿 今日生活貼心小叮嚀：
              </h4>
              <ul className="space-y-2">
                {analysisResult.daily_care_tips.map((tip, idx) => (
                  <li
                    key={idx}
                    className="text-xl sm:text-2xl font-extrabold text-amber-900 leading-relaxed"
                  >
                    {tip}
                  </li>
                ))}
              </ul>
            </div>

            {/* 快捷連動至拍照檢查按鈕 */}
            <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-3xl border-3 border-blue-300">
              <div>
                <h4 className="text-2xl sm:text-3xl font-black text-blue-950">
                  📸 馬上帶著這組健康數值去買菜？
                </h4>
                <p className="text-lg sm:text-xl font-bold text-blue-800 mt-1">
                  點擊右方按鈕，AI 會立刻記住您的血壓與血糖，拍照時為您精確審核！
                </p>
              </div>
              <button
                type="button"
                id="btn-apply-indicators-to-camera"
                onClick={handleLinkToCamera}
                className="w-full sm:w-auto px-8 py-5 rounded-2xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-black text-2xl flex items-center justify-center gap-3 cursor-pointer shadow-xl border-3 border-blue-400 shrink-0"
              >
                <Camera className="w-8 h-8" />
                <span>帶入數值並去拍照</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
