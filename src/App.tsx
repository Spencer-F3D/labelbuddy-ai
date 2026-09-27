/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ============================================================================
 * LabelBuddy AI - 超市食品成分智能放大鏡 (Mobile-First Senior Edition)
 * ============================================================================
 * 
 * 【重要安全提示 / Security Notice】
 * ⚠️ 絕對不能將 API Key 寫死在前端瀏覽器程式碼中！
 * 本應用採用後端代理中轉架構（Backend Proxy via /api/analyze-label）：
 * 前端僅將經由 Canvas 壓縮至 1024px 的食品圖片與慢性病清單傳送至伺服器端，
 * 由伺服器環境變數（process.env.OPENROUTER_API_KEY）安全調用雲端視覺模型，
 * 徹底杜絕 API Key 暴露給客戶端或遭人盜用的安全風險。
 * 
 * 【手機優先設計原則 / Mobile-First Principles】
 * 1. 單欄垂直滾動（flex-col），無任何橫向並排欄位。
 * 2. 觸控區域全面大於 60px x 60px。
 * 3. 核心拍照按鈕固定在螢幕底部（sticky bottom-0），高度至少 80px，深藍底白字高對比。
 * 4. 字體規格：基礎字體 20px，標題 28px，警告字體 36px 粗體。
 * 5. 拍照成功觸發 navigator.vibrate(200)。
 * 6. 全螢幕 Loading 狀態動畫，並以 Web Speech API 朗讀「正在為您分析」。
 * 7. 429 錯誤處理友善提示：「網絡繁忙，請稍後再試」。
 * ============================================================================
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  Volume2,
  VolumeX,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  HeartPulse,
  Sparkles,
  ShieldCheck,
  RotateCcw,
  Check,
  Lightbulb,
  FileImage,
  Wifi,
  WifiOff,
  Calendar,
  ArrowRight,
  SlidersHorizontal,
  GraduationCap,
  XCircle,
  ChevronDown,
  BarChart3,
  Info,
  CheckSquare,
  ShieldAlert,
} from 'lucide-react';
import { LabelAnalysisResult, DietRecord, SeniorPhysicalIndicators, LearnerProfileId } from './types';
import { compressImage } from './utils/imageCompression';
import { speakText, stopSpeech } from './utils/tts';
import { generateSampleLabelDataUrl } from './data/samples';
import { getInitialDietRecords } from './data/initialDietRecords';
import { DietHealthHistory } from './components/DietHealthHistory';
import { VitalMetricsSection } from './components/VitalMetricsSection';
import { FoodEdClassroom } from './components/FoodEdClassroom';
import { LearnerProfilePicker } from './components/LearnerProfilePicker';
import { NutrientFactBars } from './components/NutrientFactBars';
import {
  DEFAULT_PROFILE_ID,
  getLearnerProfile,
  isValidProfileId,
} from './data/learnerProfiles';
import { PHYSICAL_INDICATORS, CONDITION_CATEGORIES } from './data/conditions';
import {
  TONES,
  RISK_TONE,
  RISK_ICON,
  RISK_LABEL,
  TYPE,
  WEIGHT,
  CARD_BASE,
  CONCLUSION_CARD_BASE,
  FOOTER_CTA_SECONDARY,
} from './theme';

// 導航 Bar 頁面定義：拍照辨識、健康設定、飲食紀錄、食育學堂
export type NavigationTab = 'scan' | 'conditions' | 'history' | 'classroom';

// 預設四大慢性健康指標（單欄垂直勾選）
// ⚠️ 資料來源改為 src/data/conditions.ts 的 PHYSICAL_INDICATORS（12 項），
//    該檔同時供前端與後端共用，必須保持「純資料」——不得引入瀏覽器或 Node 專屬 API。
//
// 【為什麼名稱必須保留關鍵字】後端 server/smartNutritionAnalyzer.ts 的本機備援引擎
// 是用「中文字子字串 includes()」比對，不是用 id。若某項的名稱不含規則認得的關鍵字
// （例：把「胃食道逆流」改成「火燒心」），離線時該項會**靜默不產生任何警示**——
// 不會當機、不會報錯，只是長者勾了卻沒有把關，這對安全類 App 是最糟的失敗模式。
// 日後要改 name 之前，請先確認仍含 smartNutritionAnalyzer.ts 的關鍵字。

const STORAGE_CONDITIONS_KEY = 'labelbuddy_selected_conditions';
const STORAGE_CONDITIONS_MIGRATED_KEY = 'labelbuddy_conditions_migrated_v1';
const STORAGE_DIET_RECORDS_KEY = 'labelbuddy_diet_records_v1';
const STORAGE_INDICATORS_KEY = 'labelbuddy_senior_indicators_v2';
const STORAGE_PROFILE_KEY = 'labelbuddy_learner_profile_v1';
/**
 * 是否同意把照片上傳雲端辨識。
 *
 * ⚠️ 預設值是 **false（不同意）**，這是刻意的：
 *    沒表態過的使用者，照片一律不離開裝置，由本機離線 OCR 處理。
 *    要提升準確度必須由使用者自己按下開關（見結果頁的隱私說明區）。
 */
const STORAGE_CLOUD_CONSENT_KEY = 'labelbuddy_cloud_consent_v1';

/** 全部可勾選的慢性病與過敏原（12 項，來源為共用資料檔） */
const ALL_CONDITIONS = PHYSICAL_INDICATORS;
/** 新版的合法 id 集合，用於判斷使用者存的設定是不是舊版遺留 */
const VALID_CONDITION_IDS = new Set(ALL_CONDITIONS.map((c) => c.id));

/**
 * id → 顯示名稱。
 * 找不到時回退成原始 id，至少不會顯示空白（正式流程不應發生）。
 */
const conditionName = (id: string) =>
  ALL_CONDITIONS.find((c) => c.id === id)?.name ?? id;

/** id → 完整項目資料（給清單渲染用） */
const conditionById = (id: string) => ALL_CONDITIONS.find((c) => c.id === id);

/** 過敏原是「絕對不能吃」，慢性病是「少吃一點」——後果等級不同，所以徽章文字要分開。 */
const ALLERGEN_SEVERITY: Record<string, 'critical' | 'mild'> = {
  peanut_allergy: 'critical',
  seafood_allergy: 'critical',
  gluten_sensitivity: 'critical',
  // 乳糖「不耐」是生理性不適（脹氣腹瀉），不是致命過敏，所以降一級
  lactose_intolerance: 'mild',
};

/**
 * 分類膠囊的顯示文字。
 * ⚠️ 不可直接用 `cat.name`：「全部」那顆的名稱在資料檔裡寫死了「(12種)」，
 * 一旦新增或刪除項目就會漂移，所以這裡改成由陣列長度推導。
 */
const categoryPillLabel = (cat: { id: string; name: string }) =>
  cat.id === 'all' ? `全部 (${ALL_CONDITIONS.length})` : cat.name;

/**
 * 底部主要操作按鈕的共用樣式。
 *
 * 【為什麼要抽出來】原本 5 個按鈕各自複製同一長串 className，改一處要改五處，容易漏。
 *
 * 【16:9 矮螢幕優化】16:9 手機（例：360×640）比 19.5:9 矮得多，上下兩條固定列原本
 * 吃掉 43% 的畫面。這裡把內距與字級收斂，並讓文字維持單行不換行——原本 26px 字在
 * 360px 寬下會折成兩行，把按鈕從 80px 撐到 133px，這才是真正的高度元兇。
 *
 * ⚠️ 注意本專案 `:root { font-size: 20px }`，Tailwind 的 rem 間距都被放大 1.25 倍
 * （`py-4` 實際是 20px、`w-9` 實際是 45px）。因此這裡一律改用明確的 px 值，
 * 避免換算錯誤。
 *
 * ⚠️ 【按鈕文字長度上限】實測（320×568 最窄的 16:9 手機）：
 *    可用文字寬度約 234px，20px 全形字每字約 20px。
 *    → 含 emoji 請控制在 9 個全形字以內，超過就會折成兩行、把按鈕從 72px 撐高。
 *    已驗證安全：「一鍵拍照」「重新拍照」「去超市試試看」「前往拍照辨識」「拍照為食品把關」
 */
const FOOTER_CTA_CLASS =
  'w-full min-h-[72px] py-[8px] px-[16px] rounded-2xl font-black text-[20px] leading-tight ' +
  'bg-blue-900 hover:bg-blue-950 active:bg-blue-900 text-white ' +
  'flex items-center justify-center gap-[10px] shadow-xl border-4 border-blue-700 ' +
  'cursor-pointer transition-all active:scale-[0.98]';

/** 底部列圖示尺寸（明確 px，避免 rem 被 20px 根字體放大） */
const FOOTER_CTA_ICON = 'w-[28px] h-[28px] shrink-0';

/**
 * 去掉標題開頭的裝飾性 emoji／符號。
 *
 * 【為什麼要處理】模型習慣在 warning_title 前面加 ⚠️ / ✅ / 🛑，
 * 但改版後的結論卡已經有一個專屬的大圖示（紅叉／驚嘆號／打勾）。
 * 兩者同時出現會變成「⚠️ ⛔ 不建議購買」，既重複又浪費一行的寬度，
 * 而 360px 寬的螢幕每一行都很珍貴。
 */
function stripLeadingEmoji(text: string): string {
  if (!text) return text;
  // 移除開頭的空白、emoji、變體選擇符、以及 ❗⚠✅⛔ 這類符號
  return text
    .replace(/^[\s\u200d\ufe0f\u2600-\u27bf\ud83c-\udbff\udc00-\udfff\ufe00-\ufe0f]+/u, '')
    .trim();
}

/**
 * 根據分析結果產生『每日營養建議』簡單健康叮嚀（如：多喝水、少吃重鹹），幫助長者養成健康飲食習慣
 */
function getDailyNutritionAdvice(result: LabelAnalysisResult): {
  badge: string;
  advice: string;
  habit: string;
} {
  const text = `${result.warning_title || ''} ${result.plain_summary || ''} ${result.alternative_advice || ''}`.toLowerCase();

  if (result.risk_level === 'red') {
    if (text.includes('鈉') || text.includes('鹽') || text.includes('高血壓') || text.includes('sodium')) {
      return {
        badge: '少吃重鹹・多喝溫水',
        advice: '若吃了重鹹或含鈉較高的食品，請記得多喝 2 至 3 杯溫開水幫助體內排鈉，今天其他餐點請記得少鹽少醬汁！',
        habit: '長期小習慣：煮菜少放半匙鹽，喝湯只喝半碗，心血管更輕鬆。',
      };
    }
    if (text.includes('糖') || text.includes('甜') || text.includes('糖尿病') || text.includes('sugar')) {
      return {
        badge: '控糖護血管・飯後走動',
        advice: '高糖容易造成血糖劇烈波動。今天建議改喝溫水或無糖麥茶，飯後在家中慢步 15 分鐘！',
        habit: '長期小習慣：下午點心用低糖水果或無調味堅果取代精緻甜點蛋糕。',
      };
    }
    if (text.includes('腎') || text.includes('磷') || text.includes('鉀')) {
      return {
        badge: '護腎減負擔・多吃原型',
        advice: '腎臟代謝需要水分與天然營養，今天其他餐點請以清蒸水煮的原型食物為主，避免重鹹或加工醃製肉品！',
        habit: '長期小習慣：多吃新鮮蔬果，少喝火鍋湯底與濃稠肉汁。',
      };
    }
    return {
      badge: '減輕負擔・清淡飲食',
      advice: '這類食品加工與添加成分較多，今天其餘餐點多吃一份深綠色蔬菜，讓腸胃與身體好好休息！',
      habit: '長期小習慣：正餐盡量選擇看得到食物原本形貌的天然食材。',
    };
  }

  if (result.risk_level === 'yellow') {
    return {
      badge: '注意份量・細嚼慢嚥',
      advice: '這款食品建議偶爾嚐鮮即可，食用時分次少量、慢嚼細嚥，並搭配一杯溫水減少身體負擔！',
      habit: '長期小習慣：每餐吃七分飽，放慢進食速度，幫助腸胃消化吸收。',
    };
  }

  // green
  return {
    badge: '天然安心・保持好習慣',
    advice: '太棒了！這款食品成分單純無過多負擔，天天多攝取天然原型食物，身體元氣滿分！',
    habit: '長期小習慣：每天定時喝足溫開水、多吃五色蔬果，維持長壽活力。',
  };
}

export default function App() {
  /**
   * 0. 學習者身分：決定 AI 的判斷基準（每日參考值）與學堂內容排序。
   *    未選擇或儲存值損毀時，安全退回「長者三高」，與舊版行為一致。
   */
  const [learnerProfileId, setLearnerProfileId] = useState<LearnerProfileId>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_PROFILE_KEY);
        if (isValidProfileId(saved)) return saved;
      } catch (e) {
        console.warn('讀取學習者身分失敗:', e);
      }
    }
    return DEFAULT_PROFILE_ID;
  });

  // 目前身分的完整定義（供畫面顯示每日參考值）
  const learnerProfile = getLearnerProfile(learnerProfileId);

  // 切換身分並儲存；同時以語音回饋，讓不識字的長者也知道切換成功
  const handleChangeProfile = (id: LearnerProfileId) => {
    setLearnerProfileId(id);
    try {
      localStorage.setItem(STORAGE_PROFILE_KEY, JSON.stringify(id));
    } catch {}

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(60);
      } catch {}
    }

    const next = getLearnerProfile(id);
    speakText(`已切換為${next.name}`, { rate: 0.9, preferLanguage: 'mandarin' });
  };

  // 1. 個人慢性病設定：預設全選或讀取本地儲存
  const [selectedConditions, setSelectedConditions] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_CONDITIONS_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) return parsed;
        }
      } catch (e) {
        console.warn('讀取個人設定失敗:', e);
      }
    }
    // 預設勾選四個最常見的慢性病與過敏原
    return ['hypertension', 'diabetes', 'kidney_disease', 'peanut_allergy'];
  });

  // 1.0.1 清單 UI 狀態：分類篩選、展開說明的項目（單一展開）、舊版設定遷移提示
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [expandedConditionId, setExpandedConditionId] = useState<string | null>(null);
  const [showMigrationPrompt, setShowMigrationPrompt] = useState(false);

  /**
   * 舊版設定遷移。
   *
   * 【為什麼需要】專案從 4 項擴充到 12 項，但使用者手機裡可能還存著舊的勾選。
   * 我們**不能**靜默覆蓋（那等於擅自改掉使用者的健康設定），也不能無條件跳提示
   * （每次開 App 都跳會很煩）。所以用旗標記住「已經問過了」，並且只在「存有非本版
   * 合法 id」時才判定為舊版遺留。
   *
   * ⚠️ 四種情境要分清楚：
   *   1. 旗標已是 true            → 問過了，不提示
   *   2. 完全沒有存檔（新使用者）  → 直接用預設值，不提示
   *   3. 存檔全是合法 id          → 已是新版，不提示
   *   4. 存檔含非法 id（舊版遺留）→ 才提示
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (localStorage.getItem(STORAGE_CONDITIONS_MIGRATED_KEY) === 'true') return;

      const raw = localStorage.getItem(STORAGE_CONDITIONS_KEY);
      if (!raw) {
        // 情境 2：全新使用者，沒有東西要遷移
        localStorage.setItem(STORAGE_CONDITIONS_MIGRATED_KEY, 'true');
        return;
      }

      let parsed: unknown = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }

      const ids = Array.isArray(parsed) ? (parsed as string[]) : [];
      const hasLegacyId = ids.some((id) => !VALID_CONDITION_IDS.has(id));

      if (hasLegacyId) {
        // 情境 4：真的有舊版遺留 → 問使用者
        setShowMigrationPrompt(true);
      } else {
        // 情境 3：已經是新版格式
        localStorage.setItem(STORAGE_CONDITIONS_MIGRATED_KEY, 'true');
      }
    } catch {
      // localStorage 不可用時直接放行，不要讓遷移邏輯擋住 App
    }
  }, []);

  /** 關閉遷移提示。「保留原設定」與「點背景關閉」都會走這裡（絕不靜默丟失）。 */
  const keepExistingConditions = () => {
    try {
      const kept = selectedConditions.filter((id) => VALID_CONDITION_IDS.has(id));
      // 舊 id 若全部不合法，至少留下一組可用的預設值，不要變成空清單
      const next = kept.length > 0 ? kept : ALL_CONDITIONS.filter((c) => c.defaultChecked).map((c) => c.id);
      setSelectedConditions(next);
      localStorage.setItem(STORAGE_CONDITIONS_KEY, JSON.stringify(next));
      localStorage.setItem(STORAGE_CONDITIONS_MIGRATED_KEY, 'true');
    } catch {}
    setShowMigrationPrompt(false);
    speakText('已保留您原本的設定', { rate: 0.9, preferLanguage: 'mandarin' });
  };

  /** 改用新版資料的預設勾選（高血壓／糖尿病／高血脂），不設成空清單。 */
  const resetToDefaultConditions = () => {
    const next = ALL_CONDITIONS.filter((c) => c.defaultChecked).map((c) => c.id);
    try {
      setSelectedConditions(next);
      localStorage.setItem(STORAGE_CONDITIONS_KEY, JSON.stringify(next));
      localStorage.setItem(STORAGE_CONDITIONS_MIGRATED_KEY, 'true');
    } catch {}
    setShowMigrationPrompt(false);
    speakText('已為您重新套用預設的健康項目', { rate: 0.9, preferLanguage: 'mandarin' });
  };

  // 1.1 長者生理指標量測設定（血壓、心跳、血糖等）
  const [physicalIndicators, setPhysicalIndicators] = useState<SeniorPhysicalIndicators>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_INDICATORS_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && typeof parsed.systolicBp === 'number') {
            return {
              heartRate: 72,
              ...parsed,
            };
          }
        }
      } catch (e) {
        console.warn('讀取生理指標失敗:', e);
      }
    }
    return {
      systolicBp: 136,
      diastolicBp: 86,
      heartRate: 72,
      bloodSugar: 7.2,
      bloodSugarUnit: 'mmol/L',
      bloodSugarTiming: 'post_meal',
      uricAcidStatus: 'normal',
      cholesterolStatus: 'borderline',
      kidneyStatus: 'normal',
      symptoms: ['容易疲倦'],
      ageGroup: '70-79歲',
    };
  });

  // 更新生理指標並儲存至本地
  const handleUpdateIndicators = (updated: SeniorPhysicalIndicators) => {
    setPhysicalIndicators(updated);
    try {
      localStorage.setItem(STORAGE_INDICATORS_KEY, JSON.stringify(updated));
    } catch {}

    // 自動與慢性病把關連動：若血壓偏高自動勾選高血壓，若血糖偏高自動勾選糖尿病
    setSelectedConditions((prev) => {
      let next = [...prev];
      if ((updated.systolicBp >= 135 || updated.diastolicBp >= 88) && !next.includes('hypertension')) {
        next.push('hypertension');
      }
      const isBsElevated =
        (updated.bloodSugarUnit === 'mmol/L' && updated.bloodSugar >= 7.0) ||
        (updated.bloodSugarUnit === 'mg/dL' && updated.bloodSugar >= 126);
      if (isBsElevated && !next.includes('diabetes')) {
        next.push('diabetes');
      }
      try {
        localStorage.setItem(STORAGE_CONDITIONS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // 2. 『我的飲食健康紀錄』狀態管理（過去一週歷史與掃描累積）
  const [dietRecords, setDietRecords] = useState<DietRecord[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_DIET_RECORDS_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch (e) {
        console.warn('讀取飲食紀錄失敗:', e);
      }
    }
    return getInitialDietRecords();
  });

  // 3. 應用狀態管理與導航 Bar
  const [activeTab, setActiveTab] = useState<NavigationTab>('scan');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isNetworkDelayed, setIsNetworkDelayed] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<LabelAnalysisResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [geminiConnected, setGeminiConnected] = useState<boolean | null>(null);
  /**
   * 載入畫面已等待的秒數。
   *
   * 【為什麼要顯示秒數】改版前只寫「請稍等」，但沒有進度資訊的等待，
   * 在長者感受上會被放大好幾倍（實測平均 5～10 秒）。把秒數寫出來，
   * 等待就從「不知道還要多久」變成「我知道已經過幾秒了」，焦慮明顯降低。
   */
  const [loadingSeconds, setLoadingSeconds] = useState<number>(0);
  /**
   * 是否同意把照片上傳雲端辨識。預設 false（不同意）。
   *
   * 【為什麼預設關】這是隱私優先的預設值：沒表態過的使用者，
   * 照片一律只在本機用離線 OCR 處理。使用者若覺得本機結果不夠準，
   * 可以在結果頁按下開關同意上傳，之後的掃描才會走雲端。
   */
  const [cloudConsent, setCloudConsent] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_CLOUD_CONSENT_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const latencyTimerRef = useRef<NodeJS.Timeout | null>(null);
  const loadingTickRef = useRef<NodeJS.Timeout | null>(null);

  // 檢查雲端 AI 服務狀態
  // 【重要】必須以 hasKey 為判斷依據：/api/ai-status 只要伺服器存活就會回 status: 'ok'，
  // 若誤用 status 判斷，會在沒有金鑰、實際走本機備援引擎時仍顯示「已連線」，對長者形成誤導。
  useEffect(() => {
    fetch('/api/ai-status')
      .then((res) => res.json())
      .then((data) => {
        // 唯有伺服器確實讀取到 OPENROUTER_API_KEY 時，才算雲端 AI 已就緒
        setGeminiConnected(!!(data && data.status === 'ok' && data.hasKey));
      })
      .catch(() => {
        setGeminiConnected(false);
      });
  }, []);

  // 清除全部紀錄
  const handleClearDietRecords = () => {
    setDietRecords([]);
    try {
      localStorage.setItem(STORAGE_DIET_RECORDS_KEY, JSON.stringify([]));
    } catch {}
  };

  // 恢復預設一週健康飲食範例紀錄
  const handleResetSampleDietRecords = () => {
    const initial = getInitialDietRecords();
    setDietRecords(initial);
    try {
      localStorage.setItem(STORAGE_DIET_RECORDS_KEY, JSON.stringify(initial));
    } catch {}
  };

  // 隱藏相機 input ref
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // 儲存勾選狀態至 localStorage
  const handleToggleCondition = (id: string) => {
    // 觸摸回饋
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(50);
      } catch {}
    }

    setSelectedConditions((prev) => {
      const exists = prev.includes(id);
      const updated = exists ? prev.filter((item) => item !== id) : [...prev, id];
      try {
        localStorage.setItem(STORAGE_CONDITIONS_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  /**
   * 主清單要顯示的項目：套用分類篩選，並**排除已勾選的**。
   *
   * 【為什麼要互斥】已勾選的項目已經釘在上方「已選擇」區。若下方又出現一次，
   * 長者會不確定「我剛剛點的是上面那個還是下面那個」，所以同一項只出現在一處。
   * 心智模型就是：上面是我選的、下面是我還沒選的。
   */
  const unselectedConditions = ALL_CONDITIONS.filter(
    (c) =>
      !selectedConditions.includes(c.id) &&
      (activeCategory === 'all' || c.category === activeCategory)
  );

  // 喚醒手機相機
  const handleTriggerCamera = () => {
    if (cameraInputRef.current) {
      cameraInputRef.current.click();
    }
  };

  // 處理相機拍攝或選取的相片
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 清空 input 避免重複選取同一檔案時不觸發
    event.target.value = '';

    try {
      // 拍照成功，觸發震動回饋 (200ms)
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(200);
        } catch {}
      }

      // 前端使用 HTML5 Canvas 壓縮至最大 1024px，JPEG 品質 0.8
      const compressed = await compressImage(file, 1024, 0.8);
      setPreviewImage(compressed.base64);

      // 開始呼叫分析
      await sendImageForAnalysis(compressed.base64);
    } catch (err) {
      console.error('圖片處理失敗:', err);
      setErrorMessage('讀取照片失敗，請重新拍照。');
    }
  };

  // 載入測試範例標籤（方便在電腦或無實物時快速驗證）
  const handleLoadSample = async (sampleType: 'ramen' | 'oatmeal') => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(100);
      } catch {}
    }

    let sampleDataUrl = '';
    if (sampleType === 'ramen') {
      sampleDataUrl = generateSampleLabelDataUrl('【超重鹹】特濃紅燒牛肉泡麵', {
        serving: '100公克 (每包一份)',
        calories: '495 大卡',
        sodium: '2,350 毫克 (⚠️ 高達一日上限 118%)',
        sugar: '8.5 公克',
        carbs: '62.0 公克',
        allergens: '本產品含有小麥、大豆、花生油及牛肉成分。',
        ingredients: '油炸麵條、棕櫚油、精鹽、味精、醬油粉、辣椒粉、花生油香料、防腐劑。',
      });
    } else {
      sampleDataUrl = generateSampleLabelDataUrl('【高纖健康】純天然有機大燕麥片', {
        serving: '50公克 (每包一份)',
        calories: '185 大卡',
        sodium: '2 毫克 (✅ 幾乎無鈉)',
        sugar: '0.6 公克 (✅ 無添加精緻糖)',
        carbs: '33.5 公克 (含豐富β-葡聚醣膳食纖維)',
        allergens: '本產品含有燕麥。生產線無花生等過敏原。',
        ingredients: '100% 純天然全粒大燕麥片。',
      });
    }

    setPreviewImage(sampleDataUrl);
    await sendImageForAnalysis(sampleDataUrl);
  };

  /**
   * 切換「允許上傳雲端辨識」。
   *
   * 【為什麼要語音告知】這是會影響隱私的設定。
   * 只給視覺提示的話，不識字的長者不會知道自己剛剛把照片送出去了。
   */
  const handleToggleCloudConsent = (next: boolean) => {
    setCloudConsent(next);
    try {
      localStorage.setItem(STORAGE_CLOUD_CONSENT_KEY, String(next));
    } catch {}
    speakText(
      next
        ? '已開啟雲端辨識。之後拍的照片會上傳到雲端分析。'
        : '已改回本機模式，照片不會離開這支手機。',
      { rate: 0.9, preferLanguage: 'mandarin' }
    );
  };

  /**
   * 發送圖片至中轉後端（Backend Proxy）調用雲端視覺 AI 分析
   * 【重要安全提示】金鑰由後端安全讀取，前端絕無暴露 API Key
   */
  const sendImageForAnalysis = async (base64Data: string) => {
    setActiveTab('scan');
    setIsLoading(true);
    setIsNetworkDelayed(false);
    setErrorMessage(null);
    setAnalysisResult(null);

    // AI 分析狀態語音提示：「正在為您分析」（粵語優先）
    speakText('正在為您分析', {
      rate: 0.88,
      preferLanguage: 'cantonese',
    });

    // 為了提升長者在訊號不佳的超市內的體驗：
    // 若偵測到網路連線不穩或延遲（超過 2.5 秒仍未完成），主動語音朗讀安撫，改善長者的等待焦慮
    if (latencyTimerRef.current) clearTimeout(latencyTimerRef.current);
    latencyTimerRef.current = setTimeout(() => {
      setIsNetworkDelayed(true);
      speakText('掃描成功，正在處理資料，請保持在網絡訊號良好區域', {
        rate: 0.88,
        preferLanguage: 'cantonese',
      });
    }, 2500);

    // 每秒更新一次已等待秒數，讓載入畫面能顯示具體進度
    setLoadingSeconds(0);
    if (loadingTickRef.current) clearInterval(loadingTickRef.current);
    loadingTickRef.current = setInterval(() => {
      setLoadingSeconds((s) => s + 1);
    }, 1000);

    try {
      // 將選取的病史轉換為繁體中文標籤
      const conditionNames = selectedConditions.map((id) => conditionName(id));

      // 呼叫中轉後端 API
      const response = await fetch('/api/analyze-label', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageBase64: base64Data,
          conditions: conditionNames,
          // 身分會改變 AI 的判斷基準與每日參考值（例如健身族看蛋白質、學生看鈣質）
          profileId: learnerProfileId,
          // 【隱私優先】預設 true → 照片只在本機用離線 OCR 處理，不上傳。
          // 只有使用者自己打開同意開關（cloudConsent）才會送雲端。
          localOnly: !cloudConsent,
          vitals: {
            systolicBp: physicalIndicators.systolicBp,
            diastolicBp: physicalIndicators.diastolicBp,
            heartRate: physicalIndicators.heartRate || 72,
            bloodSugar: physicalIndicators.bloodSugar,
            bloodSugarUnit: physicalIndicators.bloodSugarUnit,
            bloodSugarTiming: physicalIndicators.bloodSugarTiming,
          },
        }),
      });

      // 錯誤處理：特別針對 429 Too Many Requests 顯示友善提示
      if (response.status === 429) {
        throw new Error('網絡繁忙，請稍後再試');
      }

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        if (response.status === 429 || errJson.error === 'RATE_LIMIT_EXCEEDED') {
          throw new Error('網絡繁忙，請稍後再試');
        }
        throw new Error(errJson.message || '網絡繁忙，請稍後再試');
      }

      const resultJson = await response.json();
      if (!resultJson.success || !resultJson.data) {
        throw new Error('無法取得食品辨識結果，請再試一次');
      }

      const data: LabelAnalysisResult = resultJson.data;
      setAnalysisResult(data);

      // ══════════════════════════════════════════════════════════════════
      // 離線 OCR 讀不到標籤數字（ocr_failed）時就到此為止：
      //   ① 不寫入飲食紀錄 —— 那不是一次真正的分析，
      //      存進去會讓週報出現「看不清楚標籤數字」的假紀錄
      //   ② 仍然用語音念出重拍建議 —— 長者最需要的就是這句引導
      // ══════════════════════════════════════════════════════════════════
      if (data.ocr_failed) {
        if (data.plain_summary) {
          speakText(data.plain_summary, {
            rate: 0.88,
            volume: 1.0,
            preferLanguage: 'cantonese',
          });
        }
        return;
      }

      // 自動將本次掃描辨識結果存入「我的飲食健康紀錄」，以利一週統計與長者健康習慣養成
      const extractFoodName = (warningTitle?: string, plainSummary?: string) => {
        if (warningTitle && warningTitle.includes('【') && warningTitle.includes('】')) {
          const match = warningTitle.match(/【(.*?)】/);
          if (match && match[1]) return match[1];
        }
        if (plainSummary && plainSummary.includes('【') && plainSummary.includes('】')) {
          const match = plainSummary.match(/【(.*?)】/);
          if (match && match[1]) return match[1];
        }
        if (plainSummary) {
          if (plainSummary.includes('泡麵') || plainSummary.includes('牛肉麵')) return '紅燒牛肉風味泡麵';
          if (plainSummary.includes('燕麥')) return '純天然高纖大燕麥片';
          if (plainSummary.includes('豆漿') || plainSummary.includes('黑豆')) return '低糖黑豆營養豆漿';
          if (plainSummary.includes('蘇打餅')) return '海鹽無添加蘇打餅';
          if (plainSummary.includes('牛奶') || plainSummary.includes('鮮乳')) return '無加糖高鈣全脂鮮奶';
        }
        return data.risk_level === 'green'
          ? '健康安心選購食品'
          : data.risk_level === 'yellow'
          ? '微量調味需注意食品'
          : '高負擔不建議食品';
      };

      const now = new Date();
      const timeStr = `${now.getMonth() + 1}月${now.getDate()}日 ${
        now.getHours() < 12 ? '上午' : '下午'
      } ${String(now.getHours() % 12 || 12).padStart(2, '0')}:${String(
        now.getMinutes()
      ).padStart(2, '0')}`;

      const newRecord: DietRecord = {
        id: `rec-${Date.now()}`,
        timestamp: Date.now(),
        dateString: `剛剛 (${timeStr})`,
        foodName: extractFoodName(data.warning_title, data.plain_summary),
        risk_level: data.risk_level,
        warning_title: data.warning_title,
        plain_summary: data.plain_summary,
        alternative_advice: data.alternative_advice,
        matched_conditions: conditionNames,
      };

      setDietRecords((prev) => {
        const updated = [newRecord, ...prev];
        try {
          localStorage.setItem(STORAGE_DIET_RECORDS_KEY, JSON.stringify(updated));
        } catch {}
        return updated;
      });

      // 自動使用 Web Speech API（粵語）朗讀 plain_summary
      if (data.plain_summary) {
        setTimeout(() => {
          setIsSpeaking(true);
          speakText(data.plain_summary, {
            rate: 0.88,
            volume: 1.0,
            preferLanguage: 'cantonese',
            onEnd: () => setIsSpeaking(false),
            onError: () => setIsSpeaking(false),
          });
        }, 500);
      }
    } catch (err: any) {
      console.error('分析出錯:', err);
      // 依錯誤類型分流提示：只有真正的流量限制才說「網絡繁忙」，
      // 其餘（圖片讀取失敗、參數錯誤、伺服器異常）一律引導長者重拍，
      // 避免讓長者對著一個永遠不會成功的狀況反覆重試。
      const isRateLimited =
        err?.message?.includes('網絡繁忙') ||
        err?.message?.includes('429') ||
        err?.message?.includes('RATE_LIMIT');
      const msg = isRateLimited
        ? '網絡繁忙，請稍後再試'
        : '照片看不清楚，請重新拍一次';

      if (!isRateLimited) {
        // 照片本身的問題：清掉暫存的舊照片，讓下方「重新再試」按鈕直接開啟相機重拍，
        // 而不是拿同一張註定失敗的照片再送一次。
        setPreviewImage(null);
      }

      setErrorMessage(msg);
      // 以語音同步告知，讓不識字的長者也能理解目前狀況
      speakText(msg, { preferLanguage: 'cantonese' });
    } finally {
      if (latencyTimerRef.current) {
        clearTimeout(latencyTimerRef.current);
        latencyTimerRef.current = null;
      }
      if (loadingTickRef.current) {
        clearInterval(loadingTickRef.current);
        loadingTickRef.current = null;
      }
      setIsLoading(false);
      setIsNetworkDelayed(false);
    }
  };

  // 點擊巨大喇叭按鈕朗讀 plain_summary
  const handleToggleSpeakSummary = () => {
    if (!analysisResult?.plain_summary) return;

    if (isSpeaking) {
      stopSpeech();
      setIsSpeaking(false);
    } else {
      setIsSpeaking(true);
      speakText(analysisResult.plain_summary, {
        rate: 0.88,
        volume: 1.0,
        preferLanguage: 'cantonese',
        onEnd: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false),
      });
    }
  };

  // 重新拍照
  const handleResetToCamera = () => {
    stopSpeech();
    setIsSpeaking(false);
    setAnalysisResult(null);
    setErrorMessage(null);
    setPreviewImage(null);

    // 觸覺回饋
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(100);
      } catch {}
    }

    // 延遲喚醒相機，體驗順暢
    setTimeout(() => {
      handleTriggerCamera();
    }, 150);
  };

  // 清除錯誤重試
  const handleRetryAfterError = () => {
    setErrorMessage(null);
    if (previewImage) {
      sendImageForAnalysis(previewImage);
    } else {
      handleTriggerCamera();
    }
  };

  return (
    <>
      {/* ======================================================== */}
      {/* 桌機用的背景舞台：只在 ≥520px 顯示，讓手機框浮起來         */}
      {/* 手機（<520px）完全不顯示，不影響任何既有版面              */}
      {/* ======================================================== */}
      <div
        aria-hidden="true"
        className="hidden min-[520px]:block fixed inset-0 -z-10 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950"
      />

      {/* ======================================================== */}
      {/* 最外層手機框                                              */}
      {/*   手機（<520px）：滿版，維持原本體驗（零改動）             */}
      {/*   桌機（≥520px）：變成置中的 16:9 直向手機                 */}
      {/*   ⚠️ 尺寸算法：border-box 下 border 會佔用寬高，          */}
      {/*      故 380 = 360 內容 + 10×2 邊框、660 = 640 內容 + 邊框 */}
      {/*   ⚠️ 用明確 px（非 rem），因為 :root 是 20px             */}
      {/* ======================================================== */}
      <div className="min-h-screen w-full flex flex-col bg-slate-100 text-[20px] text-slate-900 leading-relaxed antialiased relative min-[520px]:min-h-0 min-[520px]:w-[380px] min-[520px]:h-[660px] min-[520px]:mx-auto min-[520px]:my-[24px] min-[520px]:rounded-[36px] min-[520px]:border-[10px] min-[520px]:border-slate-800 min-[520px]:shadow-2xl min-[520px]:overflow-hidden">
      {/* 隱藏的原生相機 input (拍照直接調用手機鏡頭) */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-hidden="true"
        onChange={handleFileChange}
      />

      {/* ======================================================== */}
      {/* 模組 1：頂部標題區 */}
      {/* ======================================================== */}
      <header className="bg-white border-b-4 border-blue-900 px-[16px] py-[10px] text-center shadow-sm min-[520px]:shrink-0">
        <div className="flex flex-col items-center justify-center gap-1">
          <div className="flex items-center justify-between w-full">
            <h1 className="text-[20px] font-black text-blue-950 tracking-tight flex items-center gap-[6px] whitespace-nowrap">
              <Sparkles className="w-[26px] h-[26px] text-blue-800 shrink-0" />
              LabelBuddy AI
            </h1>
            
            {/* 雲端 AI 服務狀態小標籤（不綁死模型名稱，避免模型更換後文案過期）
                ⚠️ 360px 寬（16:9 手機）下這裡極容易折行，故字級與內距都收斂並強制不換行
                ⚠️ 字級地板 16px：此處已是全站最小，不可再往下 */}
            <div className="flex items-center gap-[4px] px-[8px] py-[3px] rounded-full bg-slate-100 border border-slate-300 text-[16px] font-extrabold text-slate-700 whitespace-nowrap shrink-0">
              <span className={`w-[7px] h-[7px] rounded-full shrink-0 ${geminiConnected ? 'bg-emerald-500 animate-pulse' : 'bg-blue-500'}`} />
              <span>{geminiConnected ? '雲端 AI 辨識' : '本機備援引擎'}</span>
            </div>
          </div>
          <p className="text-[16px] font-extrabold text-blue-900 flex items-center justify-center gap-1.5 mt-0.5">
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
            專為長者設計的超市食品健康放大鏡
          </p>
        </div>
      </header>

      {/* ======================================================== */}
      {/* 導航 Bar：三大主要頁面快速切換（觸控高度大於 64px，字體 20px） */}
      {/* ======================================================== */}
      <nav
        aria-label="主要功能導航列"
        className="sticky top-0 z-40 bg-white border-b-4 border-blue-900 shadow-md w-full min-[520px]:shrink-0"
      >
        <div className="w-full grid grid-cols-4 gap-[4px] p-[8px]">
          {/* 標籤 1：拍照辨識 */}
          <button
            type="button"
            id="nav-tab-scan"
            role="tab"
            aria-selected={activeTab === 'scan'}
            onClick={() => {
              stopSpeech();
              setActiveTab('scan');
            }}
            className={`min-h-[64px] py-[6px] px-[2px] rounded-2xl flex flex-col items-center justify-center gap-[3px] cursor-pointer transition-all active:scale-95 ${
              activeTab === 'scan'
                ? 'bg-blue-900 text-white font-black shadow-md border-3 border-blue-950 ring-3 ring-yellow-400'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold border-2 border-slate-300'
            }`}
          >
            <Camera className="w-[26px] h-[26px] shrink-0" />
            <span className="text-[16px] leading-[1.2] whitespace-nowrap">拍照辨識</span>
          </button>

          {/* 標籤 2：健康設定 */}
          <button
            type="button"
            id="nav-tab-conditions"
            role="tab"
            aria-selected={activeTab === 'conditions'}
            onClick={() => {
              stopSpeech();
              setActiveTab('conditions');
            }}
            className={`min-h-[64px] py-[6px] px-[2px] rounded-2xl flex flex-col items-center justify-center gap-[3px] cursor-pointer transition-all active:scale-95 relative ${
              activeTab === 'conditions'
                ? 'bg-blue-900 text-white font-black shadow-md border-3 border-blue-950 ring-3 ring-yellow-400'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold border-2 border-slate-300'
            }`}
          >
            <HeartPulse className="w-[26px] h-[26px] shrink-0" />
            <span className="text-[16px] leading-[1.2] whitespace-nowrap">健康設定</span>
            <span className="absolute top-1.5 right-2 bg-rose-600 text-white text-[16px] font-black px-1.5 py-0.2 rounded-full border border-white">
              {selectedConditions.length}項
            </span>
          </button>

          {/* 標籤 3：飲食紀錄 */}
          <button
            type="button"
            id="nav-tab-history"
            role="tab"
            aria-selected={activeTab === 'history'}
            onClick={() => {
              stopSpeech();
              setActiveTab('history');
            }}
            className={`min-h-[64px] py-[6px] px-[2px] rounded-2xl flex flex-col items-center justify-center gap-[3px] cursor-pointer transition-all active:scale-95 relative ${
              activeTab === 'history'
                ? 'bg-blue-900 text-white font-black shadow-md border-3 border-blue-950 ring-3 ring-yellow-400'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold border-2 border-slate-300'
            }`}
          >
            <Calendar className="w-[26px] h-[26px] shrink-0" />
            <span className="text-[16px] leading-[1.2] whitespace-nowrap">飲食紀錄</span>
            <span className="absolute top-1.5 right-2 bg-emerald-600 text-white text-[16px] font-black px-1.5 py-0.2 rounded-full border border-white">
              {dietRecords.length}筆
            </span>
          </button>

          {/* 標籤 4：食育學堂（知識卡＋測驗，離線可完整使用） */}
          <button
            type="button"
            id="nav-tab-classroom"
            role="tab"
            aria-selected={activeTab === 'classroom'}
            onClick={() => {
              stopSpeech();
              setActiveTab('classroom');
            }}
            className={`min-h-[64px] py-[6px] px-[2px] rounded-2xl flex flex-col items-center justify-center gap-[3px] cursor-pointer transition-all active:scale-95 ${
              activeTab === 'classroom'
                ? 'bg-blue-900 text-white font-black shadow-md border-3 border-blue-950 ring-3 ring-yellow-400'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold border-2 border-slate-300'
            }`}
          >
            <GraduationCap className="w-[26px] h-[26px] shrink-0" />
            <span className="text-[16px] leading-[1.2] whitespace-nowrap">食育學堂</span>
          </button>
        </div>
      </nav>

      {/* ======================================================== */}
      {/* 主內容區：單欄垂直滾動 (flex-col)，根據導航 Bar 切換 */}
      {/* ======================================================== */}
      <main className="flex-1 flex flex-col p-4 space-y-5 pb-28 min-h-0 min-[520px]:overflow-y-auto min-[520px]:pb-4">
        {/* ======================================================== */}
        {/* 頁面 1：拍照辨識（SCANNER TAB） */}
        {/* ======================================================== */}
        {activeTab === 'scan' && (
          <>
            {/* 錯誤提示區（如網絡繁忙，請稍後再試）
                【文案原則】長者遇到失敗時的第一反應是「我是不是弄壞了」，
                因此先明確卸責（不是您的問題），再給三個具體可做的事，
                而不是只丟一句「請重試」——那只會讓人再失敗一次。 */}
            {errorMessage && (
              <section
                role="alert"
                className="w-full bg-[#FCEBEB] border-[3px] border-[#A32D2D] rounded-[16px] p-[20px] shadow-lg flex flex-col gap-[16px]"
              >
                <div className="flex flex-col items-center justify-center gap-[8px] text-center">
                  <span
                    className="w-[64px] h-[64px] rounded-full bg-[#A32D2D] flex items-center justify-center shrink-0"
                    aria-hidden="true"
                  >
                    <AlertCircle className="w-[40px] h-[40px] text-white" />
                  </span>
                  <h3 className={`${TYPE.conclusion} ${WEIGHT.strong} text-[#501313] leading-tight`}>
                    這次沒成功
                  </h3>
                  <p className={`${TYPE.body} ${WEIGHT.normal} text-[#791F1F] leading-snug`}>
                    不是您的問題，不用擔心。
                  </p>
                </div>

                {/* 失敗原因（來自後端的具體訊息） */}
                <p className={`${TYPE.secondary} ${WEIGHT.normal} text-[#501313] bg-white/70 rounded-[12px] p-[12px] text-center leading-snug border border-[#F09595]`}>
                  {errorMessage}
                </p>

                {/* 三個具體可做的事 */}
                <div className="flex flex-col gap-[8px]">
                  <span className={`${TYPE.secondary} font-black text-[#501313]`}>
                    可以試試這三件事：
                  </span>
                  <ul className="flex flex-col gap-[6px]">
                    {[
                      '把手機靠近成分標籤一點，讓字看清楚',
                      '找光線亮一點的地方，避開反光',
                      '走到訊號比較好的位置再拍一次',
                    ].map((tip, i) => (
                      <li
                        key={tip}
                        className={`${TYPE.secondary} ${WEIGHT.normal} text-[#501313] flex items-start gap-[8px] leading-snug`}
                      >
                        <span className="shrink-0 w-[26px] h-[26px] rounded-full bg-[#A32D2D] text-white font-black text-[16px] flex items-center justify-center mt-[1px]">
                          {i + 1}
                        </span>
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  id="btn-retry"
                  onClick={handleRetryAfterError}
                  className={FOOTER_CTA_CLASS}
                >
                  <RefreshCw className={FOOTER_CTA_ICON} />
                  <span>📸 再拍一次</span>
                </button>
              </section>
            )}

            {/* 尚未拍照：顯示拍照指引、當前把關指標與快速體驗測試 */}
            {!analysisResult && !errorMessage && (
              <div className="flex flex-col space-y-[16px]">
                {/* ══════════════════════════════════════════════════════
                    區塊 1：身分（壓縮成一行 56px，只顯示「現在用誰的標準」）
                    ══════════════════════════════════════════════════════ */}
                <button
                  type="button"
                  id="btn-change-profile-quick"
                  onClick={() => {
                    stopSpeech();
                    setActiveTab('conditions');
                  }}
                  className="w-full min-h-[56px] text-left rounded-[16px] bg-white border-[1.5px] border-slate-300 hover:border-[#185FA5] px-[16px] py-[10px] flex items-center justify-between gap-[12px] cursor-pointer active:scale-[0.98] transition-all shadow-sm"
                >
                  <div className="flex items-center gap-[10px] min-w-0">
                    {/* emoji 圖示：用 width/height 明確控制，不用 text-[Npx]
                        （本專案已把字級規則限制在 16～20px，emoji 不算文字） */}
                    <span className="w-[26px] h-[26px] leading-none shrink-0 text-center" aria-hidden="true">
                      {learnerProfile.emoji}
                    </span>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[16px] font-bold text-slate-600">目前身分</span>
                      <span className="text-[20px] font-black text-slate-900 truncate">
                        {learnerProfile.name}
                      </span>
                    </div>
                  </div>
                  <span className="text-[16px] font-black text-[#0C447C] shrink-0 whitespace-nowrap">
                    切換 ➔
                  </span>
                </button>

                {/* ══════════════════════════════════════════════════════
                    區塊 2：拍照 —— 首頁唯一的主要行動
                    （原本的「把關項目」與「生理指標」兩塊合併進來，
                      首頁從 6 塊降到 3 塊，長者只需要看一件事）
                    ══════════════════════════════════════════════════════ */}
                <section className="bg-white rounded-[16px] border-[3px] border-[#185FA5] shadow-md p-[20px] text-center flex flex-col items-center gap-[12px]">
                  <div className="w-[88px] h-[88px] rounded-full bg-[#185FA5] text-white flex items-center justify-center shadow-md">
                    <Camera className="w-[48px] h-[48px]" />
                  </div>
                  <h2 className="text-[20px] font-black text-slate-900 leading-snug">
                    對準商品背後的成分標籤
                  </h2>
                  {/* ⚠️ 文案長度上限：360px 下可用寬約 320px，16px 全形字每字約 16px
                      → 含 emoji 請控制在 17 個全形字以內，否則折行會把卡片撐高 */}
                  <p className="text-[16px] font-bold text-slate-700 leading-snug">
                    點下方「📸 一鍵拍照」
                  </p>

                  {/* 目前把關的健康項目：合併自原本獨立的區塊 */}
                  <button
                    type="button"
                    id="btn-change-conditions-quick"
                    onClick={() => setActiveTab('conditions')}
                    className="w-full rounded-[12px] bg-slate-100 border border-slate-300 px-[12px] py-[10px] flex items-center gap-[8px] cursor-pointer active:scale-[0.99] transition-all text-left"
                  >
                    <HeartPulse className="w-[22px] h-[22px] text-rose-600 shrink-0" />
                    <span className="text-[16px] font-bold text-slate-700 min-w-0">
                      正在把關：
                      <strong className="font-black text-slate-900">
                        {/* ⚠️ 最多只列前 3 項。改為 12 項後若全部列出，
                            這段會變成 2～3 行並把首頁卡片撐高。 */}
                        {selectedConditions.length === 0
                          ? '無特殊病史'
                          : selectedConditions.length <= 3
                          ? selectedConditions.map((id) => conditionName(id)).join('、')
                          : `${selectedConditions
                              .slice(0, 3)
                              .map((id) => conditionName(id))
                              .join('、')} 等 ${selectedConditions.length} 項`}
                      </strong>
                    </span>
                    <SlidersHorizontal className="w-[18px] h-[18px] text-slate-500 shrink-0 ml-auto" />
                  </button>
                </section>

                {/* ══════════════════════════════════════════════════════
                    區塊 3：示範與測試（預設收起）
                    這些是開發／示範用的入口，對長者是干擾，
                    因此藏進折疊區，需要的人仍找得到。
                    ══════════════════════════════════════════════════════ */}
                <details className="group">
                  <summary
                    className={`${CARD_BASE} w-full min-h-[56px] px-[16px] py-[10px] flex items-center justify-between gap-[12px] cursor-pointer list-none [&::-webkit-details-marker]:hidden active:scale-[0.99] transition-all`}
                  >
                    <span className="text-[16px] font-black text-slate-700 flex items-center gap-[8px] min-w-0">
                      <Lightbulb className="w-[22px] h-[22px] text-amber-600 shrink-0" />
                      <span className="truncate">沒有食品？用示範標籤</span>
                    </span>
                    <ChevronDown className="w-[24px] h-[24px] text-slate-600 shrink-0 transition-transform group-open:rotate-180" />
                  </summary>

                  <div className="flex flex-col space-y-[12px] mt-[12px]">
                    <button
                      type="button"
                      id="btn-sample-ramen"
                      onClick={() => handleLoadSample('ramen')}
                      className="w-full min-h-[60px] p-[14px] rounded-[12px] border-[1.5px] border-[#854F0B] bg-[#FAEEDA] hover:brightness-95 text-[#412402] font-black text-[18px] text-left flex items-center justify-between gap-[8px] cursor-pointer transition-all active:scale-[0.98]"
                    >
                      <span>🍜 高鈉泡麵標籤</span>
                      <span className="text-[16px] font-bold px-[8px] py-[3px] rounded-[8px] bg-[#FAC775] text-[#412402] shrink-0">
                        高鈉警示
                      </span>
                    </button>

                    <button
                      type="button"
                      id="btn-sample-oatmeal"
                      onClick={() => handleLoadSample('oatmeal')}
                      className="w-full min-h-[60px] p-[14px] rounded-[12px] border-[1.5px] border-[#3B6D11] bg-[#EAF3DE] hover:brightness-95 text-[#173404] font-black text-[18px] text-left flex items-center justify-between gap-[8px] cursor-pointer transition-all active:scale-[0.98]"
                    >
                      <span>🥣 無糖燕麥片標籤</span>
                      <span className="text-[16px] font-bold px-[8px] py-[3px] rounded-[8px] bg-[#C0DD97] text-[#173404] shrink-0">
                        安全適合
                      </span>
                    </button>

                    {/* 超市訊號弱語音安撫測試按鈕（開發驗證用） */}
                    <button
                      type="button"
                      id="btn-test-weak-signal-voice"
                      onClick={() => {
                        stopSpeech();
                        speakText('掃描成功，正在處理資料，請保持在網絡訊號良好區域', {
                          rate: 0.88,
                          preferLanguage: 'cantonese',
                        });
                      }}
                      className="w-full min-h-[56px] p-[12px] rounded-[12px] border-[1.5px] border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800 font-black text-[18px] flex items-center justify-between gap-[8px] cursor-pointer transition-all active:scale-[0.98]"
                    >
                      <span className="flex items-center gap-[8px]">
                        <Wifi className="w-[22px] h-[22px] text-slate-600 shrink-0" />
                        <span>弱訊號語音安撫</span>
                      </span>
                      <span className="text-[16px] font-black px-[8px] py-[3px] rounded-[8px] bg-slate-200 text-slate-800 shrink-0">
                        🔊 試聽
                      </span>
                    </button>
                  </div>
                </details>
              </div>
            )}

            {/* 已有辨識結果：顯示分析結果（三層結構） */}
            {analysisResult && (() => {
              /* ══════════════════════════════════════════════════════════
                 離線 OCR 讀不到標籤數字 → 只顯示「請重拍」，不顯示風險結論
                 【為什麼】讀不到數字卻照樣給紅／黃／綠，長者會當真。
                 誠實說「看不清楚」遠比捏造一個結論安全。
                 ══════════════════════════════════════════════════════════ */
              if (analysisResult.ocr_failed) {
                return (
                  <div className="flex flex-col space-y-[16px] animate-in fade-in duration-200">
                    <div
                      role="status"
                      aria-live="polite"
                      className={`${CONCLUSION_CARD_BASE} p-[20px] gap-[12px]`}
                      style={{
                        background: TONES.neutral.bg,
                        borderColor: TONES.neutral.border,
                      }}
                    >
                      <span
                        className="w-[64px] h-[64px] rounded-full flex items-center justify-center shrink-0"
                        style={{ background: TONES.neutral.solid }}
                        aria-hidden="true"
                      >
                        <Camera className="w-[36px] h-[36px] text-white" />
                      </span>

                      <h2
                        className={`${TYPE.conclusion} ${WEIGHT.strong} leading-tight`}
                        style={{ color: TONES.neutral.text }}
                      >
                        {stripLeadingEmoji(analysisResult.warning_title || '') ||
                          '看不清楚標籤數字'}
                      </h2>

                      <p
                        className={`${TYPE.body} ${WEIGHT.normal} leading-snug`}
                        style={{ color: TONES.neutral.textMuted }}
                      >
                        沒有讀到足夠的營養數字，所以我這次不給結論 —— 這樣才不會猜錯。
                      </p>
                    </div>

                    <section
                      aria-label="重拍建議"
                      className={`${CARD_BASE} p-[16px] flex flex-col gap-[14px]`}
                    >
                      <p
                        className={`${TYPE.body} ${WEIGHT.normal} text-slate-900 leading-relaxed`}
                      >
                        {analysisResult.plain_summary}
                      </p>

                      {analysisResult.alternative_advice && (
                        <p
                          className={`${TYPE.body} ${WEIGHT.normal} text-slate-600 leading-relaxed`}
                        >
                          {analysisResult.alternative_advice}
                        </p>
                      )}

                      <button
                        type="button"
                        onClick={handleResetToCamera}
                        className={FOOTER_CTA_SECONDARY}
                      >
                        <Camera className="w-[28px] h-[28px] shrink-0" />
                        <span>📷 再拍一次</span>
                      </button>
                    </section>
                  </div>
                );
              }

              /* 結論的顏色、圖示、文字三重編碼 —— 顏色不能是唯一線索 */
              const tone = TONES[RISK_TONE[analysisResult.risk_level]];
              const riskIconName = RISK_ICON[analysisResult.risk_level];
              const RiskIcon =
                riskIconName === 'cross'
                  ? XCircle
                  : riskIconName === 'warning'
                  ? AlertTriangle
                  : CheckCircle2;

              const riskHeadline =
                stripLeadingEmoji(analysisResult.warning_title || '') ||
                RISK_LABEL[analysisResult.risk_level];
              const riskSubline =
                analysisResult.risk_level === 'red'
                  ? '這包對您的身體負擔比較大，建議先放回架上。'
                  : analysisResult.risk_level === 'yellow'
                  ? '可以吃，但要留意份量，不要一次吃完整包。'
                  : '成分溫和，可以放心買回家。';

              const nutritionAdvice = getDailyNutritionAdvice(analysisResult);

              return (
                <div className="flex flex-col space-y-[16px] animate-in fade-in duration-200">
                  {/* ══════════════════════════════════════════════════════
                      第一層：結論 —— 全頁最大的字，只回答「能不能買」
                      ══════════════════════════════════════════════════════ */}
                  <div
                    role="status"
                    aria-live="polite"
                    className={`${CONCLUSION_CARD_BASE} p-[20px] gap-[12px]`}
                    style={{ background: tone.bg, borderColor: tone.border }}
                  >
                    <span
                      className="w-[64px] h-[64px] rounded-full flex items-center justify-center shrink-0"
                      style={{ background: tone.solid }}
                      aria-hidden="true"
                    >
                      <RiskIcon className="w-[40px] h-[40px] text-white" />
                    </span>

                    <h2
                      className={`${TYPE.conclusion} ${WEIGHT.strong} leading-tight`}
                      style={{ color: tone.text }}
                    >
                      {riskHeadline}
                    </h2>

                    <p
                      className={`${TYPE.body} ${WEIGHT.normal} leading-snug`}
                      style={{ color: tone.textMuted }}
                    >
                      {riskSubline}
                    </p>
                  </div>

                  {/* ══════════════════════════════════════════════════════
                      第二層：為什麼 —— 百分比長條 + 白話說明 + 語音
                      ══════════════════════════════════════════════════════ */}
                  <section
                    aria-label="判斷依據"
                    className={`${CARD_BASE} p-[16px] flex flex-col gap-[14px]`}
                  >
                    <div className="flex items-center justify-between gap-[8px] flex-wrap">
                      <h3 className={`${TYPE.title} ${WEIGHT.strong} text-slate-900 flex items-center gap-[8px]`}>
                        <BarChart3 className="w-[26px] h-[26px] text-slate-700 shrink-0" />
                        為什麼？
                      </h3>

                      {/* 結果來源標示：讓使用者能分辨是雲端 AI 還是本機離線辨識 */}
                      <span
                        className={`${TYPE.body} font-black px-[8px] py-[3px] rounded-full border shrink-0 whitespace-nowrap ${
                          analysisResult.analysis_mode === 'cloud_ai'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-400'
                            : 'bg-amber-50 text-amber-800 border-amber-400'
                        }`}
                        title={
                          analysisResult.ai_model
                            ? `模型：${analysisResult.ai_model}`
                            : analysisResult.ocr_used
                            ? '本機離線 OCR（照片沒有離開裝置）'
                            : '本機規則引擎（未使用雲端 AI）'
                        }
                      >
                        {analysisResult.analysis_mode === 'cloud_ai'
                          ? analysisResult.cached
                            ? '☁️ 雲端 AI（快取）'
                            : '☁️ 雲端 AI'
                          : '📴 本機離線'}
                      </span>
                    </div>

                    {/* ══════════════════════════════════════════════════════
                        隱私說明：這張照片到底去了哪裡
                        【為什麼要放在結果頁】使用者在乎的是「我剛剛拍的這張」，
                        而不是抽象的政策條文。因此在每一次結果旁直接說明，
                        並提供一鍵切換，讓「不上傳」是可驗證的事實而非口號。
                        ══════════════════════════════════════════════════════ */}
                    <div
                      className={`flex items-start gap-[8px] rounded-[10px] border px-[10px] py-[8px] ${
                        analysisResult.data_handling === 'cloud'
                          ? 'bg-blue-50 border-blue-300'
                          : 'bg-emerald-50 border-emerald-300'
                      }`}
                    >
                      <ShieldCheck
                        className={`w-[22px] h-[22px] shrink-0 mt-[2px] ${
                          analysisResult.data_handling === 'cloud'
                            ? 'text-blue-700'
                            : 'text-emerald-700'
                        }`}
                      />
                      <div className="flex flex-col gap-[8px] min-w-0">
                        <span
                          className={`${TYPE.body} ${WEIGHT.normal} leading-snug ${
                            analysisResult.data_handling === 'cloud'
                              ? 'text-blue-900'
                              : 'text-emerald-900'
                          }`}
                        >
                          {analysisResult.data_handling === 'cloud'
                            ? '這次的照片有上傳到雲端辨識。'
                            : '這次的照片只在這支手機上處理，沒有上傳。'}
                        </span>

                        {/* 同意開關：永遠顯示「目前設定」的相反動作，
                            不論這次結果走哪條路徑，使用者都隨時改得回來 */}
                        {cloudConsent ? (
                          <button
                            type="button"
                            onClick={() => handleToggleCloudConsent(false)}
                            className="self-start min-h-[48px] px-[12px] rounded-[10px] bg-white border-2 border-slate-400 text-slate-800 text-[16px] font-black"
                          >
                            改回本機模式（不上傳）
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleToggleCloudConsent(true)}
                            className="self-start min-h-[48px] px-[12px] rounded-[10px] bg-blue-800 text-white text-[16px] font-black"
                          >
                            開啟雲端辨識（更準）
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 成分對照長條圖：把「2480 毫克」變成「佔每日上限 124%」 */}
                    <NutrientFactBars
                      facts={analysisResult.nutrient_facts}
                      profileName={analysisResult.learner_profile_name || learnerProfile.name}
                    />

                    <p className={`${TYPE.body} ${WEIGHT.normal} text-slate-900 leading-relaxed`}>
                      {analysisResult.plain_summary}
                    </p>

                    {/* 語音朗讀：長者最常用的功能，維持大按鈕 */}
                    <button
                      type="button"
                      id="btn-speak-summary"
                      onClick={handleToggleSpeakSummary}
                      className={`${FOOTER_CTA_CLASS} ${
                        isSpeaking ? '!bg-[#A32D2D] !border-[#791F1F] animate-pulse' : ''
                      }`}
                      title="點擊聽語音朗讀"
                    >
                      {isSpeaking ? (
                        <>
                          <VolumeX className="w-[28px] h-[28px] shrink-0" />
                          <span>⏹️ 停止朗讀</span>
                        </>
                      ) : (
                        <>
                          <Volume2 className="w-[28px] h-[28px] shrink-0" />
                          <span>🔊 念給我聽</span>
                        </>
                      )}
                    </button>
                  </section>

                  {/* ══════════════════════════════════════════════════════
                      第三層：更多資訊 —— 需要時再展開，降低第一眼的負擔
                      ══════════════════════════════════════════════════════ */}
                  <details className="group" id="details-more-info">
                    <summary
                      id="btn-more-info"
                      className={`${CARD_BASE} w-full min-h-[64px] px-[16px] py-[12px] flex items-center justify-between gap-[12px] cursor-pointer list-none [&::-webkit-details-marker]:hidden active:scale-[0.99] transition-all`}
                    >
                      <span className={`${TYPE.body} ${WEIGHT.strong} text-slate-900 flex items-center gap-[8px] min-w-0`}>
                        <Info className="w-[24px] h-[24px] text-slate-700 shrink-0" />
                        <span className="truncate">更多資訊與替代建議</span>
                      </span>
                      <ChevronDown className="w-[26px] h-[26px] text-slate-600 shrink-0 transition-transform group-open:rotate-180" />
                    </summary>

                    <div className="flex flex-col space-y-[16px] mt-[16px]">
                      {/* ══════════════════════════════════════════════════
                          食育教學 —— 把「這一包」變成「下一包也會看」
                          【為什麼放在這一層】它是補充教材，不是結論，
                          所以不打擾第一眼的判斷，但展開後要看得到。
                          用 action（藍）色系：藍色在本專案代表「可操作」，
                          不承載安全／危險語意（長者水晶體黃化會吸收藍光）。
                          ══════════════════════════════════════════════════ */}
                      {(analysisResult.knowledge_point ||
                        analysisResult.label_reading_tip ||
                        analysisResult.daily_limit_context) && (
                        <section
                          aria-label="食育教學"
                          className={`${CARD_BASE} p-[16px] flex flex-col gap-[12px]`}
                          style={{ background: TONES.action.bg, borderColor: TONES.action.border }}
                        >
                          <h3
                            className={`${TYPE.title} ${WEIGHT.strong} flex items-center gap-[8px]`}
                            style={{ color: TONES.action.text }}
                          >
                            <GraduationCap className="w-[26px] h-[26px] shrink-0" />
                            學一個帶得走的觀念
                          </h3>

                          {analysisResult.knowledge_point && (
                            <div className="flex flex-col gap-[4px]">
                              <span
                                className={`${TYPE.body} font-black`}
                                style={{ color: TONES.action.text }}
                              >
                                為什麼
                              </span>
                              <p
                                className={`${TYPE.body} ${WEIGHT.normal} leading-relaxed`}
                                style={{ color: TONES.action.text }}
                              >
                                {analysisResult.knowledge_point}
                              </p>
                            </div>
                          )}

                          {analysisResult.label_reading_tip && (
                            <div className="flex flex-col gap-[4px]">
                              <span
                                className={`${TYPE.body} font-black`}
                                style={{ color: TONES.action.text }}
                              >
                                下次怎麼看
                              </span>
                              <p
                                className={`${TYPE.body} ${WEIGHT.normal} leading-relaxed`}
                                style={{ color: TONES.action.text }}
                              >
                                {analysisResult.label_reading_tip}
                              </p>
                            </div>
                          )}

                          {analysisResult.daily_limit_context && (
                            <div className="flex flex-col gap-[4px]">
                              <span
                                className={`${TYPE.body} font-black`}
                                style={{ color: TONES.action.text }}
                              >
                                對您代表什麼
                              </span>
                              <p
                                className={`${TYPE.body} ${WEIGHT.normal} leading-relaxed`}
                                style={{ color: TONES.action.text }}
                              >
                                {analysisResult.daily_limit_context}
                              </p>
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              stopSpeech();
                              speakText(
                                [
                                  analysisResult.knowledge_point
                                    ? `為什麼：${analysisResult.knowledge_point}`
                                    : '',
                                  analysisResult.label_reading_tip
                                    ? `下次怎麼看：${analysisResult.label_reading_tip}`
                                    : '',
                                  analysisResult.daily_limit_context
                                    ? `對您代表什麼：${analysisResult.daily_limit_context}`
                                    : '',
                                ]
                                  .filter(Boolean)
                                  .join('。'),
                                { rate: 0.88, preferLanguage: 'cantonese' }
                              );
                            }}
                            className={FOOTER_CTA_SECONDARY}
                          >
                            <Volume2 className="w-[28px] h-[28px] shrink-0" />
                            <span>🔊 念給我聽</span>
                          </button>
                        </section>
                      )}

                      {/* ══════════════════════════════════════════════════
                          慢性病專屬提醒 —— 回答「那我要怎麼挑」
                          【與上面「判斷依據」的差別】那裡說的是「這一包」，
                          這裡說的是「這個病」，與產品無關，所以放在補充資訊。
                          ══════════════════════════════════════════════════ */}
                      {analysisResult.condition_reminders &&
                        analysisResult.condition_reminders.length > 0 && (
                          <section
                            aria-label="慢性病提醒"
                            className={`${CARD_BASE} p-[16px] flex flex-col gap-[12px]`}
                          >
                            <h3
                              className={`${TYPE.title} ${WEIGHT.strong} text-slate-900 flex items-center gap-[8px]`}
                            >
                              <ShieldAlert className="w-[26px] h-[26px] text-slate-700 shrink-0" />
                              您的慢性病提醒
                            </h3>

                            <ul className="flex flex-col gap-[10px]">
                              {analysisResult.condition_reminders.map((reminder) => (
                                <li
                                  key={reminder.condition}
                                  className="flex items-start gap-[10px] bg-white rounded-[12px] border-2 border-slate-300 p-[12px]"
                                >
                                  {/* emoji 用固定 px 控制大小，不用 text-[Npx]，
                                      這樣「字級一律 16–20px」才能用 grep 機械驗證 */}
                                  <span
                                    className="w-[26px] h-[26px] leading-none text-center shrink-0"
                                    role="img"
                                    aria-hidden="true"
                                  >
                                    {reminder.icon}
                                  </span>
                                  <div className="flex flex-col gap-[4px] min-w-0">
                                    <span className={`${TYPE.body} font-black text-slate-900`}>
                                      {reminder.condition}
                                    </span>
                                    <span
                                      className={`${TYPE.body} ${WEIGHT.normal} text-slate-800 leading-snug`}
                                    >
                                      {reminder.advice}
                                    </span>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </section>
                        )}

                      {/* 替代建議 */}
                      {analysisResult.alternative_advice && (
                        <div
                          className={`${CARD_BASE} p-[16px] flex flex-col gap-[8px]`}
                          style={{ background: TONES.safe.bg, borderColor: TONES.safe.border }}
                        >
                          <span
                            className={`${TYPE.title} ${WEIGHT.strong} flex items-center gap-[8px]`}
                            style={{ color: TONES.safe.text }}
                          >
                            <Lightbulb className="w-[26px] h-[26px] shrink-0" />
                            可以改買這些
                          </span>
                          <p
                            className={`${TYPE.body} ${WEIGHT.normal} leading-relaxed`}
                            style={{ color: TONES.safe.text }}
                          >
                            {analysisResult.alternative_advice}
                          </p>
                        </div>
                      )}

                      {/* 每日營養建議 */}
                      <section
                        aria-label="每日營養建議"
                        className={`${CARD_BASE} p-[16px] flex flex-col gap-[12px]`}
                        style={{ background: TONES.caution.bg, borderColor: TONES.caution.border }}
                      >
                        <div className="flex items-center justify-between gap-[8px]">
                          <h3
                            className={`${TYPE.title} ${WEIGHT.strong} flex items-center gap-[8px]`}
                            style={{ color: TONES.caution.text }}
                          >
                            <span aria-hidden="true">💡</span>
                            每日營養建議
                          </h3>
                          <span
                            className={`${TYPE.caption} font-black px-[10px] py-[3px] rounded-full bg-white/70 border shrink-0`}
                            style={{ color: TONES.caution.text, borderColor: TONES.caution.border }}
                          >
                            {nutritionAdvice.badge}
                          </span>
                        </div>

                        <p
                          className={`${TYPE.body} ${WEIGHT.normal} leading-relaxed`}
                          style={{ color: TONES.caution.text }}
                        >
                          {nutritionAdvice.advice}
                        </p>

                        <div className="bg-white/90 rounded-[12px] p-[12px] border border-[#EF9F27] flex items-start gap-[10px]">
                          <span className="text-[20px] shrink-0" role="img" aria-label="習慣">
                            🌱
                          </span>
                          <div className="flex flex-col">
                            <span className={`${TYPE.secondary} font-black`} style={{ color: TONES.caution.text }}>
                              長效健康習慣
                            </span>
                            <span className={`${TYPE.body} ${WEIGHT.normal} text-slate-800 leading-snug`}>
                              {nutritionAdvice.habit}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          id="btn-speak-nutrition-advice"
                          onClick={() => {
                            stopSpeech();
                            speakText(
                              `每日營養建議：${nutritionAdvice.advice}。長效健康習慣：${nutritionAdvice.habit}`,
                              { rate: 0.88, preferLanguage: 'cantonese' }
                            );
                          }}
                          className={FOOTER_CTA_SECONDARY}
                        >
                          <Volume2 className="w-[26px] h-[26px] shrink-0" />
                          <span>🔊 念這條叮嚀</span>
                        </button>
                      </section>

                      {/* 已存入飲食紀錄 */}
                      <div
                        className={`${CARD_BASE} p-[16px] flex flex-col gap-[12px]`}
                        style={{ background: TONES.action.bg, borderColor: TONES.action.border }}
                      >
                        <div className="flex items-center gap-[10px]">
                          <ShieldCheck
                            className="w-[26px] h-[26px] shrink-0"
                            style={{ color: TONES.action.text }}
                          />
                          <span className={`${TYPE.body} ${WEIGHT.normal}`} style={{ color: TONES.action.text }}>
                            已自動存入您的「飲食健康紀錄」
                          </span>
                        </div>
                        <button
                          type="button"
                          id="btn-goto-history-from-result"
                          onClick={() => {
                            stopSpeech();
                            setActiveTab('history');
                          }}
                          className={FOOTER_CTA_SECONDARY}
                        >
                          <Calendar className="w-[26px] h-[26px] shrink-0" />
                          <span>查看本週紀錄</span>
                        </button>
                      </div>
                    </div>
                  </details>
                </div>
              );
            })()}
          </>
        )}

        {/* ======================================================== */}
        {/* 頁面 2：健康設定（CONDITIONS TAB） */}
        {/* ======================================================== */}
        {activeTab === 'conditions' && (
          <div className="flex flex-col space-y-6">
            {/* 第零部分：學習者身分（決定 AI 的判斷基準與每日參考值） */}
            <section className="bg-white rounded-3xl p-5 border-4 border-blue-900 shadow-md">
              <LearnerProfilePicker
                selectedId={learnerProfileId}
                onSelect={handleChangeProfile}
              />
            </section>

            {/* 第一部分：日常生理指標量測（血壓、心跳、血糖等） */}
            <VitalMetricsSection
              indicators={physicalIndicators}
              onChangeIndicators={handleUpdateIndicators}
            />

            {/* 第二部分：常見慢性病與過敏原把關清單 */}
            <section
              aria-label="個人慢性健康狀況勾選"
              className="bg-white rounded-3xl p-5 border-4 border-blue-900 shadow-md flex flex-col space-y-5"
            >
              <div className="border-b-2 border-slate-200 pb-3">
                <div className="flex items-center justify-between gap-[8px] flex-wrap">
                  <h2 className="text-[20px] font-black text-slate-950 flex items-center gap-2">
                    <HeartPulse className="w-[32px] h-[32px] text-rose-600 shrink-0" />
                    個人慢性病與過敏把關
                  </h2>
                  <span className="text-[16px] font-black bg-blue-100 text-blue-950 px-[12px] py-[4px] rounded-full border border-blue-300 whitespace-nowrap shrink-0">
                    共 {ALL_CONDITIONS.length} 項可選
                  </span>
                </div>
                <p className="text-[16px] font-bold text-slate-600 mt-[4px]">
                  AI 在超市辨識食品時，會依據勾選項目嚴格比對食品成分與禁忌：
                </p>
              </div>

              {/* ── 分類篩選膠囊 ─────────────────────────────────────
                  ⚠️ 用 flex-wrap 讓膠囊整顆換行，不要用 overflow-x-auto 水平捲動
                     ——長者看不到「右邊還有東西」，會以為只有這幾顆。 */}
              <div className="flex flex-wrap gap-[8px]" role="group" aria-label="依分類篩選健康項目">
                {CONDITION_CATEGORIES.map((cat) => {
                  const isActive = activeCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      aria-pressed={isActive}
                      id={`condition-cat-${cat.id}`}
                      onClick={() => setActiveCategory(cat.id)}
                      className={`min-h-[48px] px-[12px] py-[6px] rounded-full border-[1.5px] text-[16px] font-black whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all flex items-center gap-[6px] ${
                        isActive
                          ? 'bg-blue-900 text-white border-blue-950'
                          : 'bg-slate-100 text-slate-700 border-slate-300'
                      }`}
                    >
                      {/* ⚠️ emoji 用 w/h 控制尺寸，不要用 text-[Npx]，否則字級規則無法用 grep 驗證 */}
                      <span className="w-[20px] h-[20px] leading-none text-center shrink-0" aria-hidden="true">
                        {cat.icon}
                      </span>
                      {categoryPillLabel(cat)}
                    </button>
                  );
                })}
              </div>

              {/* ── 釘選「已選擇」區 ──────────────────────────────────
                  不論切到哪個分類，已勾選的項目永遠看得到。這解決了「選了之後
                  切換分類就找不到自己選了什麼」的風險。 */}
              <div className="flex flex-col gap-[8px]">
                <div className="flex items-center gap-[8px] flex-wrap">
                  <h3 className="text-[18px] font-black text-slate-900 flex items-center gap-[6px]">
                    <CheckSquare className="w-[22px] h-[22px] text-blue-900 shrink-0" />
                    已選擇（{selectedConditions.length}）
                  </h3>
                  {selectedConditions.length === ALL_CONDITIONS.length && (
                    <span className="text-[16px] font-black text-blue-950 bg-blue-100 border border-blue-300 px-[10px] py-[2px] rounded-full whitespace-nowrap shrink-0">
                      已全部選擇
                    </span>
                  )}
                </div>

                {selectedConditions.length === 0 ? (
                  <p className="text-[16px] font-bold text-slate-700 bg-slate-100 border border-slate-300 rounded-[12px] px-[12px] py-[10px]">
                    尚未選擇任何項目。建議至少勾選 1 項，AI 才能為您把關。
                  </p>
                ) : (
                  <div className="flex flex-col gap-[8px]">
                    {selectedConditions.map((id) => {
                      const cond = conditionById(id);
                      if (!cond) return null;
                      const isAllergen = cond.category === 'allergen';
                      const isExpanded = expandedConditionId === cond.id;
                      return (
                        <div key={`pinned-${cond.id}`} className="flex flex-col">
                          <div
                            className={`grid grid-cols-[1fr_48px] items-stretch rounded-[12px] border-[1.5px] overflow-hidden ${
                              isAllergen ? 'bg-[#FCEBEB] border-[#A32D2D]' : 'bg-blue-50 border-blue-900'
                            }`}
                          >
                            <button
                              type="button"
                              role="checkbox"
                              aria-checked={true}
                              id={`pinned-checkbox-${cond.id}`}
                              onClick={() => handleToggleCondition(cond.id)}
                              className="min-h-[56px] px-[12px] py-[8px] flex items-center gap-[8px] text-left cursor-pointer active:scale-[0.99] transition-all"
                            >
                              {/* ⚠️ min-w-0 必加：flex 子項預設 min-width:auto 會撐到最長那一行，擠掉同層元素。
                                  ⚠️ 不要加 flex-wrap：加了反而會在窄機把徽章擠到第二行、撐破 56px。
                                  ⚠️ 名稱要 whitespace-nowrap：否則在 320px 下「高血壓」會被拆成
                                     「高血 / 壓」兩行，既難讀又讓列高失控。名稱本來就都 ≤6 字，
                                     一行一定放得下；真正需要讓步的是徽章。 */}
                              <div className="flex-1 min-w-0 flex items-center gap-[8px]">
                                <span
                                  className={`text-[20px] font-black leading-tight whitespace-nowrap ${
                                    isAllergen ? 'text-[#501313]' : 'text-blue-950'
                                  }`}
                                >
                                  {cond.name}
                                </span>
                                <span
                                  className={`text-[16px] font-black px-[8px] py-[2px] rounded-full whitespace-nowrap shrink-0 ${
                                    isAllergen ? 'bg-[#A32D2D] text-white' : 'bg-blue-900 text-white'
                                  }`}
                                >
                                  {cond.badge}
                                </span>
                              </div>
                              {/* 44px checkbox：純視覺，不可點（整列已是 tap target） */}
                              <div
                                aria-hidden="true"
                                className={`w-[44px] h-[44px] rounded-[10px] border-[3px] flex items-center justify-center shrink-0 pointer-events-none ${
                                  isAllergen ? 'bg-[#A32D2D] border-[#A32D2D] text-white' : 'bg-blue-900 border-blue-900 text-white'
                                }`}
                              >
                                <Check className="w-[26px] h-[26px] stroke-[4]" />
                              </div>
                            </button>
                            <button
                              type="button"
                              id={`pinned-expand-${cond.id}`}
                              aria-expanded={isExpanded}
                              aria-label={isExpanded ? `收起「${cond.name}」說明` : `展開「${cond.name}」說明`}
                              onClick={() =>
                                setExpandedConditionId(isExpanded ? null : cond.id)
                              }
                              className={`min-h-[56px] w-[48px] flex items-center justify-center border-l-[1.5px] cursor-pointer active:scale-[0.95] transition-all ${
                                isAllergen ? 'border-[#A32D2D]/40 bg-[#F5DADA]' : 'border-blue-300 bg-blue-100'
                              }`}
                            >
                              <ChevronDown
                                className={`w-[24px] h-[24px] shrink-0 transition-transform ${
                                  isAllergen ? 'text-[#501313]' : 'text-blue-950'
                                } ${isExpanded ? 'rotate-180' : ''}`}
                              />
                            </button>
                          </div>
                          {isExpanded && (
                            <div
                              className={`px-[12px] pb-[10px] pt-[8px] border-x-[1.5px] border-b-[1.5px] rounded-b-[12px] ${
                                isAllergen ? 'border-[#A32D2D] bg-[#FDF5F5]' : 'border-blue-900 bg-blue-50/60'
                              }`}
                            >
                              <p className="text-[16px] font-bold text-slate-700 leading-relaxed">
                                {cond.description}
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── 主清單（依分類篩選；排除已在釘選區的項目，避免同一項出現兩次） ── */}
              <div className="flex flex-col gap-[8px]">
                <div className="flex items-center gap-[8px] flex-wrap">
                  <h3 className="text-[18px] font-black text-slate-900 flex items-center gap-[6px]">
                    <SlidersHorizontal className="w-[22px] h-[22px] text-slate-700 shrink-0" />
                    可選擇的項目（{unselectedConditions.length}）
                  </h3>
                  {activeCategory === 'allergen' && (
                    <span className="text-[16px] font-black text-white bg-[#A32D2D] px-[10px] py-[2px] rounded-full whitespace-nowrap shrink-0">
                      絕對要避開
                    </span>
                  )}
                </div>

                {/* 過敏原區塊標頭：只在「全部」分類且清單內確實有過敏原時出現 */}
                {activeCategory === 'all' && unselectedConditions.some((c) => c.category === 'allergen') && (
                  <div className="flex items-center gap-[8px] flex-wrap bg-[#FCEBEB] border-[1.5px] border-[#A32D2D] rounded-[12px] px-[12px] py-[10px]">
                    <ShieldAlert className="w-[22px] h-[22px] text-[#A32D2D] shrink-0" />
                    <span className="text-[18px] font-black text-[#501313]">
                      食物過敏原（後果最嚴重）
                    </span>
                    <span className="text-[16px] font-bold text-[#791F1F]">
                      誤食可能呼吸困難，請務必勾選
                    </span>
                  </div>
                )}

                {unselectedConditions.length === 0 ? (
                  <p className="text-[16px] font-bold text-slate-700 bg-slate-100 border border-slate-300 rounded-[12px] px-[12px] py-[10px]">
                    {activeCategory === 'all'
                      ? '所有項目都已勾選完畢。'
                      : '這個分類的項目都已勾選，都在上方的「已選擇」區。'}
                  </p>
                ) : (
                  <div className="flex flex-col gap-[8px]">
                    {unselectedConditions.map((cond) => {
                      const isAllergen = cond.category === 'allergen';
                      const isExpanded = expandedConditionId === cond.id;
                      const severity = ALLERGEN_SEVERITY[cond.id];
                      return (
                        <div key={cond.id} className="flex flex-col">
                          <div
                            className={`grid grid-cols-[1fr_48px] items-stretch rounded-[12px] border-[1.5px] overflow-hidden ${
                              isAllergen
                                ? 'bg-[#FCEBEB] border-[#A32D2D]'
                                : 'bg-white border-slate-300'
                            }`}
                          >
                            <button
                              type="button"
                              role="checkbox"
                              aria-checked={false}
                              id={`checkbox-${cond.id}`}
                              onClick={() => handleToggleCondition(cond.id)}
                              className="min-h-[56px] px-[12px] py-[8px] flex items-center gap-[8px] text-left cursor-pointer active:scale-[0.99] transition-all"
                            >
                              {/* 這一列有四樣東西（圖示／名稱／徽章／後果等級），
                                  320px 下硬塞同一行必定擠壓折行。所以拆成兩層：
                                  第一行 = 圖示 + 名稱 + 徽章（並排、不換行）
                                  第二行 = 後果等級文字（只有過敏原才有）
                                  這樣列高仍是 56px 起跳，不會互相搶寬度。 */}
                              <div className="flex-1 min-w-0 flex flex-col gap-[2px]">
                                <div className="flex items-center gap-[8px] min-w-0">
                                  {/* 過敏原要「三重編碼」：顏色 + 圖示 + 文字，不能只靠顏色 */}
                                  {isAllergen && (
                                    <AlertTriangle
                                      className="w-[20px] h-[20px] text-[#A32D2D] shrink-0"
                                      aria-hidden="true"
                                    />
                                  )}
                                  <span
                                    className={`text-[20px] font-black leading-tight whitespace-nowrap ${
                                      isAllergen ? 'text-[#501313]' : 'text-slate-900'
                                    }`}
                                  >
                                    {cond.name}
                                  </span>
                                  <span
                                    className={`text-[16px] font-black px-[8px] py-[2px] rounded-full whitespace-nowrap shrink-0 ${
                                      isAllergen
                                        ? severity === 'mild'
                                          ? 'bg-[#FAEEDA] text-[#412402] border border-[#854F0B]'
                                          : 'bg-[#A32D2D] text-white'
                                        : 'bg-slate-200 text-slate-700'
                                    }`}
                                  >
                                    {cond.badge}
                                  </span>
                                </div>
                                {/* 後果等級用文字明說，避免長者以為過敏原只是「注意一下」 */}
                                {isAllergen && (
                                  <span
                                    className={`text-[16px] font-black whitespace-nowrap ${
                                      severity === 'mild' ? 'text-[#854F0B]' : 'text-[#A32D2D]'
                                    }`}
                                  >
                                    {severity === 'mild' ? '⚠️ 吃了會腹瀉' : '⚠️ 絕對不能吃，會呼吸困難'}
                                  </span>
                                )}
                              </div>
                              <div
                                aria-hidden="true"
                                className={`w-[44px] h-[44px] rounded-[10px] border-[3px] flex items-center justify-center shrink-0 pointer-events-none ${
                                  isAllergen ? 'bg-white border-[#A32D2D]' : 'bg-white border-slate-400'
                                }`}
                              />
                            </button>
                            <button
                              type="button"
                              id={`expand-${cond.id}`}
                              aria-expanded={isExpanded}
                              aria-label={isExpanded ? `收起「${cond.name}」說明` : `展開「${cond.name}」說明`}
                              onClick={() =>
                                setExpandedConditionId(isExpanded ? null : cond.id)
                              }
                              className={`min-h-[56px] w-[48px] flex items-center justify-center border-l-[1.5px] cursor-pointer active:scale-[0.95] transition-all ${
                                isAllergen ? 'border-[#A32D2D]/40 bg-[#F5DADA]' : 'border-slate-200 bg-slate-50'
                              }`}
                            >
                              <ChevronDown
                                className={`w-[24px] h-[24px] shrink-0 transition-transform ${
                                  isAllergen ? 'text-[#501313]' : 'text-slate-700'
                                } ${isExpanded ? 'rotate-180' : ''}`}
                              />
                            </button>
                          </div>
                          {isExpanded && (
                            <div
                              className={`px-[12px] pb-[10px] pt-[8px] border-x-[1.5px] border-b-[1.5px] rounded-b-[12px] ${
                                isAllergen ? 'border-[#A32D2D] bg-[#FDF5F5]' : 'border-slate-300 bg-slate-50'
                              }`}
                            >
                              <p className="text-[16px] font-bold text-slate-700 leading-relaxed">
                                {cond.description}
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* {DESC_TOGGLE_MARKER} */}

              {/* 說明目前是「展開顯示」而非浮層，桌面手機框的 overflow-hidden 不會切到。
                  若日後改成 fixed 浮層，記得同步加上 min-[520px]:absolute（見約束 F）。 */}

              {/* 語音朗讀當前完整健康設定 */}
              <button
                type="button"
                id="btn-speak-all-settings"
                onClick={() => {
                  // ⚠️ 只唸前 3 項。12 個全名念完要 25～35 秒，長者會中途放棄，
                  //    所以改成「N 項 + 前 3 項 + 引導去設定頁看詳細」。
                  const preview = selectedConditions
                    .slice(0, 3)
                    .map((id) => conditionName(id))
                    .join('、');
                  const condPart =
                    selectedConditions.length === 0
                      ? '目前沒有勾選任何病史'
                      : selectedConditions.length <= 3
                      ? `包括：${preview}`
                      : `共 ${selectedConditions.length} 項，包括：${preview} 等等`;
                  const text = `您好！您的健康指標設定為：收縮壓 ${physicalIndicators.systolicBp}，舒張壓 ${physicalIndicators.diastolicBp}，心跳每分鐘 ${physicalIndicators.heartRate || 72} 次，血糖 ${physicalIndicators.bloodSugar} ${physicalIndicators.bloodSugarUnit === 'mmol/L' ? '毫摩爾每升' : '毫克每分升'}。把關的病史${condPart}。詳細設定可以在健康設定頁查看。在超市買餸時，我們會為您嚴密把關！`;
                  speakText(text, { preferLanguage: 'cantonese' });
                }}
                className="w-full min-h-[56px] py-3 px-4 rounded-2xl bg-amber-50 hover:bg-amber-100 text-amber-950 font-black text-[18px] border-3 border-amber-400 flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <Volume2 className="w-6 h-6 text-amber-700 shrink-0" />
                <span>🔊 朗讀我的完整健康設定（粵語/國語）</span>
              </button>

              {/* 儲存並前往拍照按鈕 */}
              <button
                type="button"
                id="btn-save-and-scan"
                onClick={() => setActiveTab('scan')}
                className="w-full min-h-[64px] py-3.5 px-5 rounded-2xl bg-blue-900 hover:bg-blue-950 text-white font-black text-[20px] flex items-center justify-center gap-3 shadow-md cursor-pointer active:scale-95 border-3 border-blue-950"
              >
                <Camera className="w-7 h-7 text-yellow-300 shrink-0" />
                <span>✅ 設定完成，前往拍照辨識</span>
              </button>
            </section>
          </div>
        )}

        {/* ======================================================== */}
        {/* 頁面 3：飲食紀錄（HISTORY TAB） */}
        {/* ======================================================== */}
        {activeTab === 'history' && (
          <div className="flex flex-col space-y-5">
            <DietHealthHistory
              records={dietRecords}
              onClearRecords={handleClearDietRecords}
              onResetSampleRecords={handleResetSampleDietRecords}
              indicators={physicalIndicators}
              selectedConditions={selectedConditions}
            />
          </div>
        )}

        {/* ======================================================== */}
        {/* 頁面 4：食育學堂（CLASSROOM TAB） */}
        {/* ======================================================== */}
        {activeTab === 'classroom' && (
          <div className="flex flex-col space-y-5">
            <FoodEdClassroom
              profileId={learnerProfileId}
              onChangeProfile={handleChangeProfile}
            />
          </div>
        )}
      </main>

      {/* ======================================================== */}
      {/* 模組 4：AI 分析狀態區（全螢幕 Loading 與超市弱訊號安撫語音） */}
      {/* ======================================================== */}

      {/* 舊版健康設定遷移提示。
          ⚠️ overlay 必須寫 `fixed inset-0 min-[520px]:absolute`：
             手機容器是 min-h-screen，內容長時會比視窗高，只寫 absolute 會以「文件」
             為基準置中，導致彈窗掉出視窗外。 */}
      {showMigrationPrompt && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="migration-title"
          className="fixed inset-0 min-[520px]:absolute z-[60] bg-black/70 flex items-center justify-center p-[20px]"
          onClick={keepExistingConditions}
        >
          <div
            className="w-full max-w-[340px] bg-white rounded-[16px] border-[3px] border-blue-900 shadow-lg p-[20px] flex flex-col gap-[12px]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="migration-title"
              className="text-[20px] font-black text-slate-950 flex items-center gap-[8px]"
            >
              <Sparkles className="w-[26px] h-[26px] text-blue-900 shrink-0" />
              我們新增了更多健康項目
            </h2>
            <p className="text-[16px] font-bold text-slate-700 leading-relaxed">
              現在可以勾選的慢性病與過敏原變多了（共 {ALL_CONDITIONS.length} 項）。
              您原本勾選的項目我們都保留了，要不要花一分鐘重新確認一下？
            </p>
            <button
              type="button"
              id="btn-keep-conditions"
              onClick={keepExistingConditions}
              className="w-full min-h-[48px] px-[16px] py-[10px] rounded-[12px] bg-blue-900 hover:bg-blue-950 text-white text-[18px] font-black flex items-center justify-center gap-[8px] cursor-pointer active:scale-95 transition-all"
            >
              <Check className="w-[22px] h-[22px] shrink-0" />
              保留我原本的設定
            </button>
            <button
              type="button"
              id="btn-reset-conditions"
              onClick={resetToDefaultConditions}
              className="w-full min-h-[48px] px-[16px] py-[10px] rounded-[12px] bg-white hover:bg-slate-100 text-slate-900 text-[18px] font-black border-[1.5px] border-slate-400 flex items-center justify-center gap-[8px] cursor-pointer active:scale-95 transition-all"
            >
              <RotateCcw className="w-[22px] h-[22px] shrink-0" />
              重新選擇
            </button>
          </div>
        </div>
      )}

      {isLoading && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 min-[520px]:absolute z-50 bg-black/90 flex flex-col items-center justify-center p-[20px] text-center animate-in fade-in duration-200"
        >
          {/* 超大轉圈圈 Loading 動畫 */}
          <div className="relative mb-[16px]">
            <div className="w-[96px] h-[96px] rounded-full border-[8px] border-slate-700 border-t-[#85B7EB] animate-spin" />
            <Sparkles className="w-[40px] h-[40px] text-yellow-400 absolute inset-0 m-auto animate-pulse" />
          </div>

          <h2 className="text-[20px] font-black text-white mb-[8px] leading-tight">
            正在為您分析…
          </h2>

          {/* 具體的等待預期 + 即時秒數：把「不知道還要多久」變成可掌握的進度 */}
          <p className="text-[16px] font-bold text-slate-300 leading-snug">
            通常需要 5 到 10 秒
            {loadingSeconds > 0 && (
              <span className="ml-[6px] text-slate-400">（已等 {loadingSeconds} 秒）</span>
            )}
          </p>

          {isNetworkDelayed ? (
            /* 超市弱訊號安撫卡片（醒目大字 22px，消除長者等待焦慮） */
            <div className="w-full max-w-sm mt-[16px] bg-amber-400 text-slate-950 p-[16px] rounded-[16px] border-[3px] border-yellow-200 shadow-2xl flex flex-col items-center gap-[8px]">
              <div className="flex items-center gap-[8px]">
                <Wifi className="w-[28px] h-[28px] text-slate-950 shrink-0 animate-pulse" />
                <span className="text-[20px] font-black">超市訊號提示</span>
              </div>
              <p className="text-[18px] font-black leading-snug">
                掃描成功，正在處理資料，請保持在網絡訊號良好區域
              </p>
              <span className="text-[16px] font-bold text-slate-900 bg-amber-300 px-[10px] py-[3px] rounded-full">
                🔊 語音已為您播報，資料傳輸中
              </span>
            </div>
          ) : (
            <p className="text-[16px] font-bold text-yellow-300 mt-[8px]">
              🔊 語音：「正在為您分析」
            </p>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 固定在螢幕底部的主要操作按鈕（觸控高度 ≥ 72px，符合無障礙規範） */}
      {/* ======================================================== */}
      <footer className="sticky bottom-0 left-0 right-0 z-30 w-full p-[8px] bg-white/95 backdrop-blur-md border-t-4 border-blue-900 shadow-[0_-8px_25px_rgba(0,0,0,0.2)] min-[520px]:shrink-0">
        {activeTab === 'scan' ? (
          analysisResult ? (
            <button
              type="button"
              id="btn-retake-photo"
              onClick={handleResetToCamera}
              className={FOOTER_CTA_CLASS}
            >
              <RotateCcw className={FOOTER_CTA_ICON} />
              <span>📸 重新拍照</span>
            </button>
          ) : (
            <button
              type="button"
              id="btn-one-click-camera"
              onClick={handleTriggerCamera}
              disabled={isLoading}
              className={`${FOOTER_CTA_CLASS} disabled:opacity-60`}
            >
              <Camera className={FOOTER_CTA_ICON} />
              <span>📸 一鍵拍照</span>
            </button>
          )
        ) : activeTab === 'conditions' ? (
          <button
            type="button"
            id="btn-conditions-to-scan"
            onClick={() => setActiveTab('scan')}
            className={FOOTER_CTA_CLASS}
          >
            <Camera className={FOOTER_CTA_ICON} />
            <span>📸 前往拍照辨識</span>
          </button>
        ) : activeTab === 'classroom' ? (
          <button
            type="button"
            id="btn-classroom-to-scan"
            onClick={() => {
              stopSpeech();
              setActiveTab('scan');
            }}
            className={FOOTER_CTA_CLASS}
          >
            <Camera className={FOOTER_CTA_ICON} />
            <span>📸 去超市試試看</span>
          </button>
        ) : (
          <button
            type="button"
            id="btn-history-to-scan"
            onClick={() => {
              handleResetToCamera();
              setActiveTab('scan');
            }}
            className={FOOTER_CTA_CLASS}
          >
            <Camera className={FOOTER_CTA_ICON} />
            <span>📸 拍照為食品把關</span>
          </button>
        )}
      </footer>
      </div>
    </>
  );
}
