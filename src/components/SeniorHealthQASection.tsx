/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  HelpCircle,
  Sparkles,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  X,
  Send,
  MessageCircleQuestion,
  Lightbulb,
} from 'lucide-react';
import { SeniorPhysicalIndicators, HealthQuestionAnswer, AppSettings } from '../types';

interface SeniorHealthQASectionProps {
  indicators: SeniorPhysicalIndicators;
  contrastTheme?: string;
  settings: AppSettings;
}

const PRESET_QUESTIONS = [
  {
    icon: '☕',
    text: '我有高血壓，喝咖啡可以嗎？',
    tag: '血壓與咖啡',
  },
  {
    icon: '🍌',
    text: '血糖偏高，可以吃香蕉或水果嗎？',
    tag: '血糖與水果',
  },
  {
    icon: '🍲',
    text: '尿酸高或痛風，能吃豆腐喝豆漿嗎？',
    tag: '痛風與豆腐',
  },
  {
    icon: '🍊',
    text: '吃降血壓藥，可以吃柚子或葡萄柚嗎？',
    tag: '血壓藥與柚子',
  },
  {
    icon: '🍷',
    text: '每天睡前喝一小杯紅酒對心臟好嗎？',
    tag: '心臟與喝酒',
  },
  {
    icon: '💧',
    text: '傍晚雙腳微水腫，晚上還能多喝水嗎？',
    tag: '水腫與喝水',
  },
];

const STORAGE_QA_HISTORY_KEY = 'labelbuddy_last_health_qa';

export const SeniorHealthQASection: React.FC<SeniorHealthQASectionProps> = ({
  indicators,
  contrastTheme = 'standard',
  settings,
}) => {
  const isYellowContrast = contrastTheme === 'high_contrast_yellow';

  const [questionInput, setQuestionInput] = useState<string>('我有高血壓，喝咖啡可以嗎？');
  const [qaResult, setQaResult] = useState<HealthQuestionAnswer | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_QA_HISTORY_KEY);
        if (saved) return JSON.parse(saved);
      } catch (e) {
        console.warn('載入問答歷史失敗:', e);
      }
    }
    return null;
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);

  const recognitionRef = useRef<any>(null);

  // 儲存最新問答
  useEffect(() => {
    if (qaResult) {
      try {
        localStorage.setItem(STORAGE_QA_HISTORY_KEY, JSON.stringify(qaResult));
      } catch (e) {
        console.warn('儲存問答失敗:', e);
      }
    }
  }, [qaResult]);

  // 元件卸載時停止語音朗讀
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  // 語音朗讀解答
  const toggleSpeech = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      alert('抱歉，此瀏覽器未支援語音朗讀功能');
      return;
    }

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    if (!qaResult) return;

    const speechText = qaResult.voice_script || `${qaResult.key_takeaway}。${qaResult.answer}`;
    const utterance = new SpeechSynthesisUtterance(speechText);
    const targetLang = settings.voiceLang === 'cantonese' ? 'zh-HK' : 'zh-TW';
    utterance.lang = targetLang;
    utterance.rate = settings.voiceRate || 0.85; // 長輩友善語速：稍慢溫柔
    utterance.pitch = 1.0;
    utterance.volume = settings.voiceVolume || 1.0;

    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(
      (v) =>
        v.lang === targetLang ||
        v.lang.replace('_', '-').toLowerCase() === targetLang.toLowerCase() ||
        (settings.voiceLang === 'cantonese' && (v.name.includes('Cantonese') || v.lang.includes('HK')))
    );
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  // 語音輸入 (麥克風說話)
  const toggleListening = () => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('您的瀏覽器未支援語音輸入，請直接點擊快捷問題按鈕或打字發問喔！');
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = settings.voiceLang === 'cantonese' ? 'zh-HK' : 'zh-TW';
      recognition.interimResults = false;
      recognition.continuous = false;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setQuestionInput(transcript);
        }
        setIsListening(false);
      };

      recognition.onerror = (event: any) => {
        console.warn('語音識別錯誤:', event);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      console.warn('啟動語音輸入失敗:', e);
      setIsListening(false);
    }
  };

  // 送出提問給 Gemini
  const handleAskQuestion = async (overrideQ?: string) => {
    const q = (overrideQ || questionInput || '').trim();
    if (!q) {
      setErrorMessage('請先輸入阿公阿嬤想問的問題喔！');
      return;
    }

    // 停止正在朗讀的舊語音
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/ask-health-question', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(settings.customApiKey ? { 'x-gemini-key': settings.customApiKey } : {}),
        },
        body: JSON.stringify({
          question: q,
          indicators,
          apiKey: settings.customApiKey,
        }),
      });

      if (!response.ok) {
        throw new Error(`伺服器回應異常 (${response.status})`);
      }

      const resJson = await response.json();
      if (resJson.success && resJson.data) {
        setQaResult(resJson.data);

        // 如果長者啟動了自動朗讀，自動播放語音
        if (settings.autoPlaySpeech && typeof window !== 'undefined' && 'speechSynthesis' in window) {
          setTimeout(() => {
            const speechText =
              resJson.data.voice_script || `${resJson.data.key_takeaway}。${resJson.data.answer}`;
            const utterance = new SpeechSynthesisUtterance(speechText);
            utterance.lang = settings.voiceLang === 'cantonese' ? 'zh-HK' : 'zh-TW';
            utterance.rate = settings.voiceRate || 0.85;
            utterance.volume = settings.voiceVolume || 1.0;
            window.speechSynthesis.speak(utterance);
            setIsSpeaking(true);
            utterance.onend = () => setIsSpeaking(false);
            utterance.onerror = () => setIsSpeaking(false);
          }, 400);
        }
      } else {
        throw new Error(resJson.message || '無法取得解答');
      }
    } catch (err: any) {
      console.error('發問失敗:', err);
      setErrorMessage('網路稍微有點不順，請稍候再按一次重試喔！');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectPreset = (text: string) => {
    setQuestionInput(text);
    handleAskQuestion(text);
  };

  return (
    <div
      id="senior-health-qa-container"
      className={`rounded-3xl border-4 p-6 sm:p-8 space-y-6 shadow-xl transition-all ${
        isYellowContrast
          ? 'bg-black text-yellow-300 border-yellow-400'
          : 'bg-white text-slate-900 border-indigo-300'
      }`}
    >
      {/* 標題欄 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-indigo-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-indigo-100 text-indigo-700">
            <MessageCircleQuestion className="w-8 h-8 sm:w-10 sm:h-10" />
          </div>
          <div>
            <h3 className="text-2xl sm:text-3xl font-black flex items-center gap-2">
              <span>常見健康疑問</span>
              <span className="text-sm sm:text-base font-bold px-3 py-1 rounded-full bg-indigo-600 text-white">
                Gemini 即時大白話解答
              </span>
            </h3>
            <p className="text-base sm:text-lg font-bold text-slate-500 mt-1">
              長者可以用平常說話方式發問，Gemini 醫生會結合您剛填的指標，以通俗大白話回答！
            </p>
          </div>
        </div>
      </div>

      {/* 快捷常見問題按鈕 (長輩免打字、一鍵點擊發問) */}
      <div className="space-y-2">
        <span className="text-lg sm:text-xl font-black text-slate-700 flex items-center gap-2">
          <Lightbulb className="w-6 h-6 text-amber-500" />
          長輩最常問的問題（點一下直接問）：
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
          {PRESET_QUESTIONS.map((item, idx) => {
            const isSelected = questionInput === item.text;
            return (
              <button
                type="button"
                id={`btn-preset-q-${idx}`}
                key={item.text}
                onClick={() => handleSelectPreset(item.text)}
                disabled={isLoading}
                className={`p-3.5 rounded-2xl border-2 text-left font-extrabold text-base sm:text-lg flex items-start gap-2.5 cursor-pointer transition-all active:scale-95 disabled:opacity-50 ${
                  isSelected
                    ? 'bg-indigo-600 text-white border-indigo-700 shadow-md ring-2 ring-indigo-400'
                    : isYellowContrast
                    ? 'bg-zinc-900 text-yellow-300 border-zinc-700 hover:bg-zinc-800'
                    : 'bg-slate-50 text-slate-800 border-slate-300 hover:bg-indigo-50 hover:border-indigo-400'
                }`}
              >
                <span className="text-2xl shrink-0">{item.icon}</span>
                <span className="leading-snug">{item.text}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 自然語言輸入框與麥克風/清除按鈕 */}
      <div className="space-y-3">
        <label
          htmlFor="input-health-question"
          className="text-xl sm:text-2xl font-black flex items-center justify-between"
        >
          <span>✍️ 或者直接輸入阿公阿嬤想問的事：</span>
          {questionInput && (
            <button
              type="button"
              id="btn-clear-question-input"
              onClick={() => setQuestionInput('')}
              className="text-base text-slate-500 hover:text-red-600 font-bold flex items-center gap-1 cursor-pointer"
            >
              <X className="w-5 h-5" />
              清空
            </button>
          )}
        </label>

        <div className="relative flex items-center">
          <input
            type="text"
            id="input-health-question"
            value={questionInput}
            onChange={(e) => setQuestionInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAskQuestion();
              }
            }}
            placeholder="例如：我有高血壓，喝咖啡可以嗎？/ 血糖高能吃香蕉嗎？"
            className="w-full text-xl sm:text-2xl font-bold p-4 sm:p-5 pr-28 rounded-2xl border-3 border-indigo-300 focus:outline-none focus:ring-4 focus:ring-indigo-400 bg-white text-slate-900 shadow-inner"
          />

          {/* 麥克風語音輸入大按鈕 */}
          <div className="absolute right-3 flex items-center gap-2">
            <button
              type="button"
              id="btn-voice-input-mic"
              onClick={toggleListening}
              title={isListening ? '正在聽您說話...' : '點擊用麥克風說話'}
              className={`p-3 rounded-xl border-2 font-black cursor-pointer transition-all ${
                isListening
                  ? 'bg-red-600 text-white border-red-700 animate-pulse scale-110 shadow-lg'
                  : 'bg-indigo-100 text-indigo-800 border-indigo-300 hover:bg-indigo-200'
              }`}
            >
              {isListening ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {isListening && (
          <p className="text-base sm:text-lg font-black text-red-600 animate-pulse flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-600 inline-block animate-ping" />
            正在聽您說話，請慢慢說出您的問題...（例如：吃降血壓藥可以吃柚子嗎？）
          </p>
        )}
      </div>

      {/* 提問動作大按鈕 */}
      <div>
        <button
          type="button"
          id="btn-submit-health-question"
          onClick={() => handleAskQuestion()}
          disabled={isLoading || !questionInput.trim()}
          className="w-full py-5 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-black text-2xl sm:text-3xl shadow-lg flex items-center justify-center gap-3 cursor-pointer border-3 border-indigo-400 transition-all disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <RefreshCw className="w-8 h-8 animate-spin" />
              <span>Gemini 醫生正在為您大白話解答中...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-8 h-8 text-yellow-300" />
              <span>請 Gemini 醫生大白話解答</span>
              <Send className="w-7 h-7 ml-1" />
            </>
          )}
        </button>
      </div>

      {/* 錯誤提示 */}
      {errorMessage && (
        <div
          role="alert"
          className="p-4 rounded-2xl bg-red-100 border-2 border-red-400 text-red-800 font-extrabold text-lg flex items-center gap-3"
        >
          <AlertCircle className="w-7 h-7 text-red-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 解答結果卡片 (大字體、純白話、大喇叭語音朗讀) */}
      {qaResult && (
        <div
          id="health-qa-result-card"
          className={`mt-6 p-6 sm:p-8 rounded-3xl border-4 shadow-2xl space-y-6 animate-in fade-in duration-300 ${
            isYellowContrast
              ? 'bg-zinc-950 border-yellow-400 text-yellow-300'
              : 'bg-indigo-50/70 border-indigo-400 text-slate-900'
          }`}
        >
          {/* 問題回顧與語音按鈕 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-indigo-200 pb-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl">👵</span>
              <div>
                <span className="text-sm font-bold text-slate-500 block">您問的問題：</span>
                <span className="text-2xl sm:text-3xl font-black text-indigo-950">
                  「{qaResult.question}」
                </span>
              </div>
            </div>

            {/* 大喇叭朗讀按鈕 */}
            <button
              type="button"
              id="btn-speak-qa-answer"
              onClick={toggleSpeech}
              className={`px-6 py-3.5 rounded-2xl font-black text-xl sm:text-2xl flex items-center justify-center gap-3 cursor-pointer shadow-md border-3 transition-all ${
                isSpeaking
                  ? 'bg-rose-600 text-white border-rose-700 animate-pulse'
                  : 'bg-blue-600 hover:bg-blue-700 text-white border-blue-400'
              }`}
            >
              {isSpeaking ? (
                <>
                  <VolumeX className="w-7 h-7" />
                  <span>停止朗讀</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-7 h-7" />
                  <span>🔊 語音大聲讀給我聽 ({settings.voiceLang === 'cantonese' ? '粵語' : '國語'})</span>
                </>
              )}
            </button>
          </div>

          {/* 1. 一句話結論 (超大字醒目卡片) */}
          <div className="p-5 sm:p-6 rounded-2xl bg-white border-3 border-indigo-300 shadow-md space-y-2">
            <span className="text-lg font-black text-indigo-700 block">
              💡 一句話結論（阿公阿嬤看這裡）：
            </span>
            <p className="text-2xl sm:text-4xl font-black text-slate-900 leading-snug">
              {qaResult.key_takeaway}
            </p>
          </div>

          {/* 2. 溫馨大白話詳細解說 */}
          <div className="p-5 sm:p-6 rounded-2xl bg-white border-3 border-slate-300 shadow-sm space-y-3">
            <span className="text-xl sm:text-2xl font-black text-slate-800 flex items-center gap-2">
              <span>🩺 Gemini 醫生的溫暖說明：</span>
            </span>
            <div className="text-xl sm:text-2xl font-bold text-slate-800 leading-relaxed whitespace-pre-line">
              {qaResult.answer}
            </div>
          </div>

          {/* 3. 實用安心小提醒 (條列卡片) */}
          {qaResult.safe_tips && qaResult.safe_tips.length > 0 && (
            <div className="p-5 sm:p-6 rounded-2xl bg-emerald-50 border-3 border-emerald-400 shadow-sm space-y-3">
              <span className="text-xl sm:text-2xl font-black text-emerald-950 flex items-center gap-2">
                <CheckCircle className="w-7 h-7 text-emerald-600" />
                <span>日常生活實用小叮嚀：</span>
              </span>
              <ul className="space-y-2.5">
                {qaResult.safe_tips.map((tip, idx) => (
                  <li
                    key={idx}
                    className="text-lg sm:text-xl font-bold text-emerald-900 flex items-start gap-2.5"
                  >
                    <span className="text-emerald-700 font-black shrink-0 mt-0.5">👉</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 底部狀態與資料來源 */}
          <div className="flex flex-wrap items-center justify-between text-base font-bold text-slate-500 pt-2">
            <span>
              解答模式：
              {qaResult.source === 'cloud_ai' ? (
                <span className="text-indigo-700 font-black">✨ 雲端 AI 即時分析</span>
              ) : (
                <span className="text-emerald-700 font-black">🛡️ 智慧高齡醫學白話知識庫</span>
              )}
            </span>
            <span className="text-slate-400 text-sm">
              *此建議僅供生活飲食保健參考，若有服藥或特殊病情請遵循主治醫師醫囑。
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
