/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  HeartPulse,
  Activity,
  Droplet,
  Plus,
  Minus,
  Volume2,
  Check,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Info,
} from 'lucide-react';
import { SeniorPhysicalIndicators } from '../types';
import { speakText, stopSpeech } from '../utils/tts';

interface VitalMetricsSectionProps {
  indicators: SeniorPhysicalIndicators;
  onChangeIndicators: (updated: SeniorPhysicalIndicators) => void;
  onSyncConditionsWithVitals?: () => void;
}

export const VitalMetricsSection: React.FC<VitalMetricsSectionProps> = ({
  indicators,
  onChangeIndicators,
  onSyncConditionsWithVitals,
}) => {
  // 1. 血壓狀態評估
  const getBpStatus = (systolic: number, diastolic: number) => {
    if (systolic >= 140 || diastolic >= 90) {
      return {
        level: 'red' as const,
        badge: '⚠️ 偏高（需控鈉）',
        colorClass: 'bg-rose-100 text-rose-950 border-rose-400',
        advice: '血壓偏高，在超市購物時請特別注意「低鈉」，避開重鹹醃漬品與高鈉調味包！',
      };
    }
    if (systolic >= 130 || diastolic >= 85) {
      return {
        level: 'yellow' as const,
        badge: '⚡ 稍偏高（注意清淡）',
        colorClass: 'bg-amber-100 text-amber-950 border-amber-400',
        advice: '血壓稍偏高，建議多選擇天然原型食材，少吃泡麵與加工火鍋料。',
      };
    }
    return {
      level: 'green' as const,
      badge: '✅ 正常理想',
      colorClass: 'bg-emerald-100 text-emerald-950 border-emerald-400',
      advice: '血壓維持得很棒！請繼續保持少油少鹽的清淡好習慣。',
    };
  };

  // 2. 心跳狀態評估
  const getHeartRateStatus = (hr: number) => {
    if (hr > 100) {
      return {
        level: 'red' as const,
        badge: '⚠️ 偏快（避免刺激）',
        colorClass: 'bg-rose-100 text-rose-950 border-rose-400',
        advice: '靜止心跳稍快，請避免高咖啡因飲品、濃茶或能量飲料，多喝溫開水。',
      };
    }
    if (hr < 55) {
      return {
        level: 'yellow' as const,
        badge: '⚡ 偏慢（注意保暖）',
        colorClass: 'bg-amber-100 text-amber-950 border-amber-400',
        advice: '心跳稍微偏慢，若有頭暈請及時休息，飲食保持營養均衡。',
      };
    }
    return {
      level: 'green' as const,
      badge: '✅ 平穩正常',
      colorClass: 'bg-emerald-100 text-emerald-950 border-emerald-400',
      advice: '心跳脈搏非常平穩（正常範圍 60～100 bpm），元氣滿分！',
    };
  };

  // 3. 血糖狀態評估
  const getBloodSugarStatus = (val: number, unit: 'mmol/L' | 'mg/dL', timing: 'fasting' | 'post_meal') => {
    const isMmol = unit === 'mmol/L';
    let isHigh = false;
    let isBorderline = false;

    if (timing === 'fasting') {
      // 空腹
      if (isMmol) {
        if (val >= 7.0) isHigh = true;
        else if (val >= 6.1) isBorderline = true;
      } else {
        if (val >= 126) isHigh = true;
        else if (val >= 100) isBorderline = true;
      }
    } else {
      // 飯後 2 小時
      if (isMmol) {
        if (val >= 10.0) isHigh = true;
        else if (val >= 7.8) isBorderline = true;
      } else {
        if (val >= 180) isHigh = true;
        else if (val >= 140) isBorderline = true;
      }
    }

    if (isHigh) {
      return {
        level: 'red' as const,
        badge: '⚠️ 偏高（嚴格控糖）',
        colorClass: 'bg-rose-100 text-rose-950 border-rose-400',
        advice: '血糖偏高，超市選購請認明「無加糖、高纖維」，嚴防含糖飲料與精緻糕點！',
      };
    }
    if (isBorderline) {
      return {
        level: 'yellow' as const,
        badge: '⚡ 稍偏高（減少甜食）',
        colorClass: 'bg-amber-100 text-amber-950 border-amber-400',
        advice: '血糖稍微偏高，飯後建議多走動，點心少吃高糖水果與甜餅乾。',
      };
    }
    return {
      level: 'green' as const,
      badge: '✅ 血糖理想',
      colorClass: 'bg-emerald-100 text-emerald-950 border-emerald-400',
      advice: '血糖控制得相當理想，請維持定時定量、多吃蔬菜好習慣。',
    };
  };

  const bpStatus = getBpStatus(indicators.systolicBp, indicators.diastolicBp);
  const hrStatus = getHeartRateStatus(indicators.heartRate || 72);
  const bsStatus = getBloodSugarStatus(indicators.bloodSugar, indicators.bloodSugarUnit, indicators.bloodSugarTiming);

  // 語音朗讀全部指標
  const handleSpeakVitals = () => {
    stopSpeech();
    const speechText = `身體量測指標報告：您的血壓上壓為${indicators.systolicBp}，下壓為${indicators.diastolicBp}，評估為${bpStatus.badge}。心跳為每分鐘${indicators.heartRate || 72}次，評估為${hrStatus.badge}。血糖為${indicators.bloodSugar}${indicators.bloodSugarUnit === 'mmol/L' ? '毫摩爾每升' : '毫克每分升'}，評估為${bsStatus.badge}。AI已為您同步設定超市把關重點！`;
    speakText(speechText, {
      rate: 0.88,
      preferLanguage: 'cantonese',
    });
  };

  // 血壓調整
  const updateBp = (systolicDelta: number, diastolicDelta: number) => {
    const newSys = Math.max(80, Math.min(220, indicators.systolicBp + systolicDelta));
    const newDia = Math.max(50, Math.min(140, indicators.diastolicBp + diastolicDelta));
    onChangeIndicators({
      ...indicators,
      systolicBp: newSys,
      diastolicBp: newDia,
    });
  };

  // 心跳調整
  const updateHr = (delta: number) => {
    const current = indicators.heartRate || 72;
    const newHr = Math.max(40, Math.min(180, current + delta));
    onChangeIndicators({
      ...indicators,
      heartRate: newHr,
    });
  };

  // 血糖調整
  const updateBs = (delta: number) => {
    const isMmol = indicators.bloodSugarUnit === 'mmol/L';
    let newBs = indicators.bloodSugar + delta;
    if (isMmol) {
      newBs = Math.max(2.5, Math.min(25.0, Math.round(newBs * 10) / 10));
    } else {
      newBs = Math.max(45, Math.min(450, Math.round(newBs)));
    }
    onChangeIndicators({
      ...indicators,
      bloodSugar: newBs,
    });
  };

  return (
    <div className="flex flex-col space-y-4">
      {/* 標題與語音朗讀 */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-4 rounded-2xl shadow-sm">
        <div className="flex items-center gap-2.5">
          <Activity className="w-7 h-7 text-yellow-300 shrink-0" />
          <div>
            <h3 className="text-[20px] font-black leading-tight">
              日常身體量測指標
            </h3>
            <p className="text-[16px] font-bold text-blue-100">
              血壓・心跳・血糖（點擊 ＋/－ 輕鬆調整）
            </p>
          </div>
        </div>

        <button
          type="button"
          id="btn-speak-vitals"
          onClick={handleSpeakVitals}
          className="min-h-[48px] px-3.5 py-1.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 active:bg-yellow-500 text-blue-950 font-black text-[16px] flex items-center gap-2 cursor-pointer shadow-sm active:scale-95 shrink-0"
        >
          <Volume2 className="w-5 h-5" />
          <span>🔊 朗讀指標</span>
        </button>
      </div>

      {/* 指標 1：血壓 (Blood Pressure) */}
      <div className="bg-slate-50 border-3 border-blue-900 rounded-2xl p-4 shadow-sm flex flex-col space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap border-b-2 border-slate-200 pb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <HeartPulse className="w-7 h-7 text-rose-600 shrink-0" />
            <span className="text-[20px] font-black text-slate-900">
              🩸 血壓指標 (mmHg)
            </span>
          </div>
          <span className={`text-[16px] font-black px-3 py-1 rounded-full border-2 whitespace-nowrap shrink-0 ${bpStatus.colorClass}`}>
            {bpStatus.badge}
          </span>
        </div>

        {/* 數值顯示與加減按鈕 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* 上壓 (收縮壓) */}
          <div className="bg-white rounded-xl p-3 border-2 border-slate-300 flex flex-col gap-2">
            <div>
              <span className="text-[16px] font-bold text-slate-600 block">上壓 (收縮壓)</span>
              <span className="text-[20px] font-black text-blue-950">{indicators.systolicBp}</span>
              <span className="text-[16px] font-bold text-slate-500 ml-1">mmHg</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                id="btn-bp-sys-minus"
                onClick={() => updateBp(-5, 0)}
                className="w-12 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-900 flex items-center justify-center font-black text-[20px] border-2 border-slate-400 cursor-pointer active:scale-95"
                title="減少上壓 5"
              >
                <Minus className="w-6 h-6 stroke-[3]" />
              </button>
              <button
                type="button"
                id="btn-bp-sys-plus"
                onClick={() => updateBp(5, 0)}
                className="w-12 h-12 rounded-xl bg-blue-900 hover:bg-blue-950 active:bg-blue-800 text-white flex items-center justify-center font-black text-[20px] border-2 border-blue-950 cursor-pointer active:scale-95"
                title="增加上壓 5"
              >
                <Plus className="w-6 h-6 stroke-[3]" />
              </button>
            </div>
          </div>

          {/* 下壓 (舒張壓) */}
          <div className="bg-white rounded-xl p-3 border-2 border-slate-300 flex flex-col gap-2">
            <div>
              <span className="text-[16px] font-bold text-slate-600 block">下壓 (舒張壓)</span>
              <span className="text-[20px] font-black text-blue-950">{indicators.diastolicBp}</span>
              <span className="text-[16px] font-bold text-slate-500 ml-1">mmHg</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                id="btn-bp-dia-minus"
                onClick={() => updateBp(0, -5)}
                className="w-12 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-900 flex items-center justify-center font-black text-[20px] border-2 border-slate-400 cursor-pointer active:scale-95"
                title="減少下壓 5"
              >
                <Minus className="w-6 h-6 stroke-[3]" />
              </button>
              <button
                type="button"
                id="btn-bp-dia-plus"
                onClick={() => updateBp(0, 5)}
                className="w-12 h-12 rounded-xl bg-blue-900 hover:bg-blue-950 active:bg-blue-800 text-white flex items-center justify-center font-black text-[20px] border-2 border-blue-950 cursor-pointer active:scale-95"
                title="增加下壓 5"
              >
                <Plus className="w-6 h-6 stroke-[3]" />
              </button>
            </div>
          </div>
        </div>

        {/* 快速檔位選取 */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-[16px] font-bold text-slate-600">長輩快選：</span>
          <button
            type="button"
            onClick={() => onChangeIndicators({ ...indicators, systolicBp: 118, diastolicBp: 78 })}
            className="px-3 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-bold text-[16px] border border-emerald-300 whitespace-nowrap cursor-pointer active:scale-95"
          >
            標準 (118/78)
          </button>
          <button
            type="button"
            onClick={() => onChangeIndicators({ ...indicators, systolicBp: 136, diastolicBp: 86 })}
            className="px-3 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-[16px] border border-amber-300 whitespace-nowrap cursor-pointer active:scale-95"
          >
            稍高 (136/86)
          </button>
          <button
            type="button"
            onClick={() => onChangeIndicators({ ...indicators, systolicBp: 152, diastolicBp: 95 })}
            className="px-3 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-900 font-bold text-[16px] border border-rose-300 whitespace-nowrap cursor-pointer active:scale-95"
          >
            偏高 (152/95)
          </button>
        </div>

        {/* 貼心叮嚀小語 */}
        <p className="text-[16px] font-bold text-slate-800 bg-white p-2.5 rounded-xl border border-slate-200">
          💡 {bpStatus.advice}
        </p>
      </div>

      {/* 指標 2：心跳脈搏 (Heart Rate / Pulse) */}
      <div className="bg-slate-50 border-3 border-blue-900 rounded-2xl p-4 shadow-sm flex flex-col space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap border-b-2 border-slate-200 pb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Activity className="w-7 h-7 text-indigo-600 shrink-0" />
            <span className="text-[20px] font-black text-slate-900">
              💓 心跳脈搏 (次/分 bpm)
            </span>
          </div>
          <span className={`text-[16px] font-black px-3 py-1 rounded-full border-2 whitespace-nowrap shrink-0 ${hrStatus.colorClass}`}>
            {hrStatus.badge}
          </span>
        </div>

        {/* 數值與加減 */}
        <div className="bg-white rounded-xl p-3 border-2 border-slate-300 flex flex-col gap-2">
          <div>
            <span className="text-[16px] font-bold text-slate-600 block">靜態心跳脈搏</span>
            <span className="text-[20px] font-black text-blue-950">{indicators.heartRate || 72}</span>
            <span className="text-[16px] font-bold text-slate-500 ml-1.5">bpm (次/分)</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              id="btn-hr-minus"
              onClick={() => updateHr(-2)}
              className="w-12 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-900 flex items-center justify-center font-black text-[20px] border-2 border-slate-400 cursor-pointer active:scale-95"
              title="減少心跳 2"
            >
              <Minus className="w-6 h-6 stroke-[3]" />
            </button>
            <button
              type="button"
              id="btn-hr-plus"
              onClick={() => updateHr(2)}
              className="w-12 h-12 rounded-xl bg-blue-900 hover:bg-blue-950 active:bg-blue-800 text-white flex items-center justify-center font-black text-[20px] border-2 border-blue-950 cursor-pointer active:scale-95"
              title="增加心跳 2"
            >
              <Plus className="w-6 h-6 stroke-[3]" />
            </button>
          </div>
        </div>

        {/* 快速檔位選取 */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-[16px] font-bold text-slate-600">長輩快選：</span>
          <button
            type="button"
            onClick={() => onChangeIndicators({ ...indicators, heartRate: 65 })}
            className="px-3 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-bold text-[16px] border border-emerald-300 whitespace-nowrap cursor-pointer active:scale-95"
          >
            靜息平穩 (65)
          </button>
          <button
            type="button"
            onClick={() => onChangeIndicators({ ...indicators, heartRate: 75 })}
            className="px-3 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-bold text-[16px] border border-emerald-300 whitespace-nowrap cursor-pointer active:scale-95"
          >
            標準常態 (75)
          </button>
          <button
            type="button"
            onClick={() => onChangeIndicators({ ...indicators, heartRate: 88 })}
            className="px-3 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-[16px] border border-amber-300 whitespace-nowrap cursor-pointer active:scale-95"
          >
            活動稍快 (88)
          </button>
          <button
            type="button"
            onClick={() => onChangeIndicators({ ...indicators, heartRate: 105 })}
            className="px-3 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-900 font-bold text-[16px] border border-rose-300 whitespace-nowrap cursor-pointer active:scale-95"
          >
            心跳偏快 (105)
          </button>
        </div>

        {/* 貼心叮嚀小語 */}
        <p className="text-[16px] font-bold text-slate-800 bg-white p-2.5 rounded-xl border border-slate-200">
          💡 {hrStatus.advice}
        </p>
      </div>

      {/* 指標 3：血糖 (Blood Sugar) */}
      <div className="bg-slate-50 border-3 border-blue-900 rounded-2xl p-4 shadow-sm flex flex-col space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap border-b-2 border-slate-200 pb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Droplet className="w-7 h-7 text-amber-500 shrink-0" />
            <span className="text-[20px] font-black text-slate-900">
              🍬 血糖指標
            </span>
          </div>
          <span className={`text-[16px] font-black px-3 py-1 rounded-full border-2 whitespace-nowrap shrink-0 ${bsStatus.colorClass}`}>
            {bsStatus.badge}
          </span>
        </div>

        {/* 量測時機與單位切換 */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 bg-slate-200 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => onChangeIndicators({ ...indicators, bloodSugarTiming: 'fasting' })}
              className={`px-3 py-1.5 rounded-lg text-[16px] font-black whitespace-nowrap transition-colors cursor-pointer ${
                indicators.bloodSugarTiming === 'fasting'
                  ? 'bg-blue-900 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              🌅 空腹量測
            </button>
            <button
              type="button"
              onClick={() => onChangeIndicators({ ...indicators, bloodSugarTiming: 'post_meal' })}
              className={`px-3 py-1.5 rounded-lg text-[16px] font-black whitespace-nowrap transition-colors cursor-pointer ${
                indicators.bloodSugarTiming === 'post_meal'
                  ? 'bg-blue-900 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              🍱 飯後 2 小時
            </button>
          </div>

          {/* 單位切換 */}
          <div className="flex items-center gap-1 bg-slate-200 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => {
                if (indicators.bloodSugarUnit !== 'mmol/L') {
                  const mmolVal = Math.round((indicators.bloodSugar / 18) * 10) / 10;
                  onChangeIndicators({ ...indicators, bloodSugarUnit: 'mmol/L', bloodSugar: mmolVal });
                }
              }}
              className={`px-2.5 py-1 rounded-lg text-[16px] font-black whitespace-nowrap cursor-pointer ${
                indicators.bloodSugarUnit === 'mmol/L'
                  ? 'bg-blue-900 text-white'
                  : 'text-slate-700'
              }`}
            >
              mmol/L (港/國際)
            </button>
            <button
              type="button"
              onClick={() => {
                if (indicators.bloodSugarUnit !== 'mg/dL') {
                  const mgVal = Math.round(indicators.bloodSugar * 18);
                  onChangeIndicators({ ...indicators, bloodSugarUnit: 'mg/dL', bloodSugar: mgVal });
                }
              }}
              className={`px-2.5 py-1 rounded-lg text-[16px] font-black whitespace-nowrap cursor-pointer ${
                indicators.bloodSugarUnit === 'mg/dL'
                  ? 'bg-blue-900 text-white'
                  : 'text-slate-700'
              }`}
            >
              mg/dL (台)
            </button>
          </div>
        </div>

        {/* 數值與加減 */}
        <div className="bg-white rounded-xl p-3 border-2 border-slate-300 flex flex-col gap-2">
          <div>
            <span className="text-[16px] font-bold text-slate-600 block">
              {indicators.bloodSugarTiming === 'fasting' ? '空腹血糖值' : '飯後血糖值'}
            </span>
            <span className="text-[20px] font-black text-blue-950">{indicators.bloodSugar}</span>
            <span className="text-[16px] font-bold text-slate-500 ml-1.5">{indicators.bloodSugarUnit}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              id="btn-bs-minus"
              onClick={() => updateBs(indicators.bloodSugarUnit === 'mmol/L' ? -0.2 : -5)}
              className="w-12 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-900 flex items-center justify-center font-black text-[20px] border-2 border-slate-400 cursor-pointer active:scale-95"
              title="減少血糖"
            >
              <Minus className="w-6 h-6 stroke-[3]" />
            </button>
            <button
              type="button"
              id="btn-bs-plus"
              onClick={() => updateBs(indicators.bloodSugarUnit === 'mmol/L' ? 0.2 : 5)}
              className="w-12 h-12 rounded-xl bg-blue-900 hover:bg-blue-950 active:bg-blue-800 text-white flex items-center justify-center font-black text-[20px] border-2 border-blue-950 cursor-pointer active:scale-95"
              title="增加血糖"
            >
              <Plus className="w-6 h-6 stroke-[3]" />
            </button>
          </div>
        </div>

        {/* 快速檔位選取 */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-[16px] font-bold text-slate-600">長輩快選：</span>
          <button
            type="button"
            onClick={() => {
              const val = indicators.bloodSugarUnit === 'mmol/L' ? 5.2 : 94;
              onChangeIndicators({ ...indicators, bloodSugar: val, bloodSugarTiming: 'fasting' });
            }}
            className="px-3 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-bold text-[16px] border border-emerald-300 whitespace-nowrap cursor-pointer active:scale-95"
          >
            空腹正常 ({indicators.bloodSugarUnit === 'mmol/L' ? '5.2' : '94'})
          </button>
          <button
            type="button"
            onClick={() => {
              const val = indicators.bloodSugarUnit === 'mmol/L' ? 7.2 : 130;
              onChangeIndicators({ ...indicators, bloodSugar: val, bloodSugarTiming: 'post_meal' });
            }}
            className="px-3 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-bold text-[16px] border border-emerald-300 whitespace-nowrap cursor-pointer active:scale-95"
          >
            飯後正常 ({indicators.bloodSugarUnit === 'mmol/L' ? '7.2' : '130'})
          </button>
          <button
            type="button"
            onClick={() => {
              const val = indicators.bloodSugarUnit === 'mmol/L' ? 9.8 : 176;
              onChangeIndicators({ ...indicators, bloodSugar: val, bloodSugarTiming: 'post_meal' });
            }}
            className="px-3 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-900 font-bold text-[16px] border border-rose-300 whitespace-nowrap cursor-pointer active:scale-95"
          >
            血糖偏高 ({indicators.bloodSugarUnit === 'mmol/L' ? '9.8' : '176'})
          </button>
        </div>

        {/* 貼心叮嚀小語 */}
        <p className="text-[16px] font-bold text-slate-800 bg-white p-2.5 rounded-xl border border-slate-200">
          💡 {bsStatus.advice}
        </p>
      </div>

      {/* 指標 4：額外身體狀態（痛風/尿酸、血脂/膽固醇） */}
      <div className="bg-slate-50 border-3 border-blue-900 rounded-2xl p-4 shadow-sm flex flex-col space-y-3">
        <span className="text-[20px] font-black text-slate-900">
          🩺 關節尿酸與血脂狀態
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* 尿酸與痛風 */}
          <div className="bg-white rounded-xl p-3 border-2 border-slate-300 flex flex-col gap-2">
            <span className="text-[16px] font-black text-slate-800">痛風 / 尿酸指數</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => onChangeIndicators({ ...indicators, uricAcidStatus: 'normal' })}
                className={`px-3 py-1.5 rounded-lg text-[16px] font-black whitespace-nowrap cursor-pointer ${
                  indicators.uricAcidStatus === 'normal'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                正常
              </button>
              <button
                type="button"
                onClick={() => onChangeIndicators({ ...indicators, uricAcidStatus: 'high' })}
                className={`px-3 py-1.5 rounded-lg text-[16px] font-black whitespace-nowrap cursor-pointer ${
                  indicators.uricAcidStatus !== 'normal'
                    ? 'bg-amber-500 text-slate-950 font-black'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                偏高/常痛風
              </button>
            </div>
          </div>

          {/* 血脂與膽固醇 */}
          <div className="bg-white rounded-xl p-3 border-2 border-slate-300 flex flex-col gap-2">
            <span className="text-[16px] font-black text-slate-800">血脂 / 膽固醇</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => onChangeIndicators({ ...indicators, cholesterolStatus: 'normal' })}
                className={`px-3 py-1.5 rounded-lg text-[16px] font-black whitespace-nowrap cursor-pointer ${
                  indicators.cholesterolStatus === 'normal'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                正常
              </button>
              <button
                type="button"
                onClick={() => onChangeIndicators({ ...indicators, cholesterolStatus: 'high' })}
                className={`px-3 py-1.5 rounded-lg text-[16px] font-black whitespace-nowrap cursor-pointer ${
                  indicators.cholesterolStatus !== 'normal'
                    ? 'bg-amber-500 text-slate-950 font-black'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                稍高/偏高
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
