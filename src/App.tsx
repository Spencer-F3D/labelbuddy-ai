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
  // 側邊選單用（2026-09-28 新增）
  Menu as MenuIcon,
  X as CloseIcon,
  Home as HomeIcon,
  // 設定頁收合區塊的圖示（2026-09-28 新增）
  Users as UsersIcon,
  Activity as ActivityIcon,
  MessageCircleQuestion,
} from 'lucide-react';
import { LabelAnalysisResult, DietRecord, SeniorPhysicalIndicators, LearnerProfileId, AnalysisMode } from './types';
import { compressImage } from './utils/imageCompression';
// OCR 在瀏覽器端執行：照片不會離開使用者的裝置，只有讀出的文字會送到後端。
import { recognizeLabelTextInBrowser, warmUpBrowserOcr } from './ocr/ocrBrowser';
// 雙語介面（2026-09-28）：競賽章程要求「未使用英文」可不予評審。
import { useI18n } from './i18n/I18nContext';
import { LanguagePicker } from './i18n/LanguagePicker';
import type { TranslationKey, Language } from './i18n/translations';
// 需要「指定語言」的翻譯查表（紀錄的日期要跟隨標籤語言，不是介面語言）
import { TRANSLATIONS } from './i18n/translations';
// 本機規則引擎（2026-09-29）：飲食紀錄要「跟隨標籤語言」。
// 當介面語言 ≠ 標籤語言時，需要就地用本機引擎在標籤語言重新產生文字。
// ⚠️ 這三個模組都是**純函式**（不碰任何 Node API），所以可以直接在前端執行。
//    它們與後端本機備援用的是**同一份程式碼** —— 共用才不會兩邊判斷不一致。
import { buildRecognitionResult } from '../server/labelParser';
import { analyzeNutritionWithIndicators } from '../server/smartNutritionAnalyzer';
import { translateLocalResult } from '../server/localEngineEn';
import { detectLabelLanguage as detectLabelLanguageImpl } from './utils/labelLanguage';
import {
  ANALYSIS_MODES,
  MODE_LABEL_KEY,
  MODE_NOTE_KEY,
  MODE_DATA_KEY,
} from './data/analysisModes';
// 設定頁的可收合區塊（2026-09-28）：整頁原本超過 3 個螢幕高，收合後好找很多。
import { SettingsSection } from './components/SettingsSection';
// 身分名稱的英文對照（2026-09-28）：後端回傳的 learner_profile_name 是中文原名，
// 英文介面要換成英文，否則長條圖下方會寫「依『長者』的每日參考值計算」。
import {
  profileName as localizedProfileName,
  conditionName as localizedConditionName,
  nutrientName as localizedNutrientName,
  RISK_LABEL_EN,
} from './data/bilingual';
// 慢性病與身分的「顯示用」英文對照（2026-09-28 第三階段）。
// 與 bilingual.ts 的分工：bilingual.ts 給後端提示詞用，這份給畫面用。
import {
  conditionDescription as localizedConditionDescription,
  categoryName as localizedCategoryName,
  profileDisplayName as localizedProfileDisplayName,
} from './data/bilingualContent';
import { speakText, stopSpeech } from './utils/tts';
import { generateSampleLabelDataUrl, DEMO_LABELS } from './data/samples';
import { DietHealthHistory } from './components/DietHealthHistory';
import { VitalMetricsSection } from './components/VitalMetricsSection';
import { HealthQASection } from './components/HealthQASection';
import { OnboardingFlow, type OnboardingResult, type Gender } from './components/OnboardingFlow';
import { FoodEdClassroom } from './components/FoodEdClassroom';
import { LearnerProfilePicker } from './components/LearnerProfilePicker';
import { GenderPicker } from './components/GenderPicker';
import { LegalNotice } from './components/LegalNotice';
import { ClearAllDataSection } from './components/ClearAllDataSection';
import { AnalysisModePicker } from './components/AnalysisModePicker';
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
export type NavigationTab = 'home' | 'scan' | 'conditions' | 'history' | 'classroom' | 'qa';

/**
 * 側邊選單的項目。
 *
 * 【為什麼集中在這裡】
 *   選單是唯一的頁面切換入口（底部導航列已於 2026-09-28 移除），
 *   把項目集中成一份資料，新增頁面時只要改這裡，不必在 JSX 裡複製貼上。
 *
 * 【順序】依使用者指定的：主頁 → 拍照 → 記錄 → 學堂 → 設定
 */
const MENU_ITEMS: Array<{
  tab: NavigationTab;
  /** ⚠️ 存的是翻譯鍵而不是字串：存字串的話這裡是模組層常數，
   *  切換語言時不會跟著變。存鍵、render 時才呼叫 t() 才會即時生效。 */
  labelKey: TranslationKey;
  hintKey: TranslationKey;
  Icon: typeof Camera;
}> = [
  { tab: 'home', labelKey: 'menu.home', hintKey: 'menu.home.hint', Icon: HomeIcon },
  { tab: 'scan', labelKey: 'menu.scan', hintKey: 'menu.scan.hint', Icon: Camera },
  { tab: 'history', labelKey: 'menu.history', hintKey: 'menu.history.hint', Icon: Calendar },
  {
    tab: 'classroom',
    labelKey: 'menu.classroom',
    hintKey: 'menu.classroom.hint',
    Icon: GraduationCap,
  },
  {
    // 健康問答（2026-09-29 從「設定」搬到功能選單）
    // ⚠️ 放在設定之前：它是「功能」不是「設定」，而且使用者每天都會用。
    tab: 'qa',
    labelKey: 'menu.qa',
    hintKey: 'menu.qa.hint',
    Icon: MessageCircleQuestion,
  },
  {
    tab: 'conditions',
    labelKey: 'menu.conditions',
    hintKey: 'menu.conditions.hint',
    Icon: HeartPulse,
  },
];

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
 * 分析模式（三選一，2026-09-30 起）。
 *
 * ⚠️ 預設值是 `cloud_image` —— 這是使用者在引導頁的預設選項，
 *    但**沒走過引導頁的人不會用到這個值**（引導頁會先擋在前面）。
 *    真的沒有存值時（例如 localStorage 被清掉），見 `loadAnalysisMode()` 的保守處理。
 */
const STORAGE_ANALYSIS_MODE_KEY = 'labelbuddy_analysis_mode_v1';
/**
 * 舊的「是否同意雲端」布林鍵（**只剩遷移用途，不再寫入**）。
 *
 * 舊值對應：`true` → `cloud_text`（舊版的雲端就是只送文字）、
 *           `false` → `local_only`。
 */
const STORAGE_CLOUD_CONSENT_KEY = 'labelbuddy_cloud_consent_v1';

/**
 * 拍照後的壓縮尺寸上限（長邊像素）。
 *
 * 【為什麼「直接雲端」用 1600px，其他模式用 1024px】
 *   直接雲端把**照片本身**交給視覺模型判讀，解析度直接決定它看不看得清
 *   營養標示上的小字，所以用 1600px（base64 約 300–500 KB，
 *   仍在 Cloudflare Workers 與 OpenRouter 的容許範圍內）。
 *   其他兩個模式要先在本機跑 tesseract OCR，解析度越高越慢 ——
 *   而且 OCR 的準確度瓶頸在字元辨識而非像素數，所以維持原本的 1024px。
 */
const IMAGE_MAX_DIM_CLOUD = 1600;
const IMAGE_MAX_DIM_OCR = 1024;

/**
 * 三個分析模式的翻譯鍵與順序，定義在 `src/data/analysisModes.ts`
 * —— 引導頁與設定頁都要用同一份（見該檔的說明）。
 */

/**
 * 讀取分析模式，並處理舊版資料的遷移。
 *
 * 【為什麼要遷移而不是直接給預設值】
 *   已經用過 App 的人，舊的 `labelbuddy_cloud_consent_v1` 記錄了他當時的選擇。
 *   直接蓋成新的預設值（`cloud_image`）等於**偷偷把「不同意上傳」的人
 *   改成「照片會上傳」** —— 那是嚴重的隱私問題，不是方便問題。
 *   所以：有舊值就照舊值對應，真的什麼都沒有才用預設。
 */
function loadAnalysisMode(): AnalysisMode {
  try {
    const stored = localStorage.getItem(STORAGE_ANALYSIS_MODE_KEY);
    if (stored === 'cloud_image' || stored === 'cloud_text' || stored === 'local_only') {
      return stored;
    }
    // 舊版遷移：有舊鍵就沿用當時的選擇
    const legacy = localStorage.getItem(STORAGE_CLOUD_CONSENT_KEY);
    if (legacy !== null) {
      return legacy === 'true' ? 'cloud_text' : 'local_only';
    }
    // 全新使用者：預設直接雲端（引導頁會明確問過才走到這裡）
    return 'cloud_image';
  } catch {
    return 'local_only';
  }
}
/**
 * 是否已走過首次啟動引導頁。
 *
 * 沒有這個旗標就顯示引導頁 —— 它負責取得兩件必要的同意：
 *   ① 身分（決定營養門檻）
 *   ② AI 模式（雲端為主／只用本機）
 * 所以它不能跳過，否則後面的分析沒有正確的基準。
 */
const STORAGE_ONBOARDED_KEY = 'labelbuddy_onboarded_v1';

/**
 * 稱謂用的性別。
 *
 * ⚠️ 這**不是**營養判斷的依據 —— 每日參考值不因性別改變（本 App 未分性別）。
 *    它只決定 AI 回饋與語音要怎麼稱呼使用者。
 *    沒存過或存了無效值 → `unspecified`，一律用中性的「您好」。
 */
const STORAGE_GENDER_KEY = 'labelbuddy_gender_v1';

/** 全部可勾選的慢性病與過敏原（12 項，來源為共用資料檔） */
const ALL_CONDITIONS = PHYSICAL_INDICATORS;
/** 新版的合法 id 集合，用於判斷使用者存的設定是不是舊版遺留 */
const VALID_CONDITION_IDS = new Set(ALL_CONDITIONS.map((c) => c.id));

/**
 * id → 顯示名稱（含語言）。
 * 找不到時回退成原始 id，至少不會顯示空白（正式流程不應發生）。
 * 英文版查 bilingual.ts 的封閉清單；查不到會安全退回中文原名。
 */
const conditionName = (id: string, language: Language) => {
  const zh = ALL_CONDITIONS.find((c) => c.id === id)?.name ?? id;
  return localizedConditionName(id, zh, language);
};

/** id → 完整項目資料（給清單渲染用） */
const conditionById = (id: string) => ALL_CONDITIONS.find((c) => c.id === id);

/**
 * 判斷「標籤本身」的語言。
 *
 * 【為什麼需要這個】
 *   飲食紀錄要**跟隨標籤語言**，不是跟隨介面語言
 *   （2026-09-29 使用者要求：「照片是什麼語言，紀錄就是什麼語言」）。
 *
 * ⚠️ 實作抽到 `src/utils/labelLanguage.ts` —— 寫在這裡的話，
 *    測試腳本一 import App.tsx 就會拉起整個 React App，沒辦法單獨驗證。
 */
const detectLabelLanguage = detectLabelLanguageImpl;

/**
 * 依「指定語言」產生掃描時間字串。
 *
 * ⚠️ 不能用 `t()` —— `t()` 綁的是**當前介面語言**，
 *    但紀錄的日期要跟著**標籤語言**。
 *    所以直接查 `TRANSLATIONS[語言]` 並自己做 `{time}` 插值。
 * ⚠️ 這裡沒有共用的插值工具（`t()` 的實作在 I18nContext 內），
 *    所以是手寫的 replace。若日後模板改用別的佔位符，這裡要一起改。
 */
const formatScanTime = (lang: Language, d: Date): string => {
  const dict = TRANSLATIONS[lang];
  const hours = d.getHours();
  const clock = `${String(hours % 12 || 12).padStart(2, '0')}:${String(d.getMinutes()).padStart(
    2,
    '0'
  )}`;
  const datePart = dict['history.dateFormat']
    .replace('{m}', String(d.getMonth() + 1))
    .replace('{d}', String(d.getDate()))
    .replace('{ampm}', hours < 12 ? dict['history.am'] : dict['history.pm']);
  return dict['history.justNow'].replace('{time}', `${datePart} ${clock}`);
};

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
 * ⚠️ 英文版另外查對照表（bilingualContent.ts），查不到才退回中文原名。
 */
const categoryPillLabel = (cat: { id: string; name: string }, language: Language) =>
  cat.id === 'all'
    ? language === 'en'
      ? `All (${ALL_CONDITIONS.length})`
      : `全部 (${ALL_CONDITIONS.length})`
    : localizedCategoryName(cat.id, cat.name, language);

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
 * 底部列的次要按鈕樣式（2026-09-30 新增，用於「從相簿選擇」）。
 *
 * 【為什麼次要按鈕不做成跟主按鈕一樣大】
 *   同一列出現兩個同樣醒目的按鈕，長者會不知道該按哪一個。
 *   拍照是主要路徑（絕大多數情況），相簿是替代路徑，
 *   所以用白底＋深色框降低視覺權重，但**觸控高度仍維持 72px**（無障礙要求）。
 */
const FOOTER_SECONDARY_CLASS =
  'shrink-0 min-h-[72px] px-[14px] rounded-2xl font-black text-[16px] leading-tight ' +
  'bg-white hover:bg-slate-50 active:bg-slate-100 text-blue-950 ' +
  'flex flex-col items-center justify-center gap-[2px] shadow-md border-4 border-blue-900 ' +
  'cursor-pointer transition-all active:scale-[0.98]';

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
 *
 * ⚠️ 只回傳**翻譯鍵**，不回傳字串（2026-09-28 第三階段）。
 *    這是模組層函式，拿不到 useI18n()；回傳字串就得把 t 一路傳進來。
 *    回傳鍵、由呼叫端 t() 解析，改動最小且不可能漏翻。
 *
 * ⚠️ 判斷用的關鍵字（鈉／糖／腎…）維持中文比對**是刻意的**：
 *    這些字串來自 `warning_title` / `plain_summary`，
 *    而後端在本機規則引擎路徑下產生的就是中文內容，翻掉會讓比對失效。
 */
function getDailyNutritionAdvice(result: LabelAnalysisResult): {
  badgeKey: TranslationKey;
  adviceKey: TranslationKey;
  habitKey: TranslationKey;
} {
  const text = `${result.warning_title || ''} ${result.plain_summary || ''} ${result.alternative_advice || ''}`.toLowerCase();

  if (result.risk_level === 'red') {
    if (text.includes('鈉') || text.includes('鹽') || text.includes('高血壓') || text.includes('sodium')) {
      return {
        badgeKey: 'advice.redSodium.badge',
        adviceKey: 'advice.redSodium.advice',
        habitKey: 'advice.redSodium.habit',
      };
    }
    if (text.includes('糖') || text.includes('甜') || text.includes('糖尿病') || text.includes('sugar')) {
      return {
        badgeKey: 'advice.redSugar.badge',
        adviceKey: 'advice.redSugar.advice',
        habitKey: 'advice.redSugar.habit',
      };
    }
    if (text.includes('腎') || text.includes('磷') || text.includes('鉀')) {
      return {
        badgeKey: 'advice.redKidney.badge',
        adviceKey: 'advice.redKidney.advice',
        habitKey: 'advice.redKidney.habit',
      };
    }
    return {
      badgeKey: 'advice.redOther.badge',
      adviceKey: 'advice.redOther.advice',
      habitKey: 'advice.redOther.habit',
    };
  }

  if (result.risk_level === 'yellow') {
    return {
      badgeKey: 'advice.yellow.badge',
      adviceKey: 'advice.yellow.advice',
      habitKey: 'advice.yellow.habit',
    };
  }

  // green
  return {
    badgeKey: 'advice.green.badge',
    adviceKey: 'advice.green.advice',
    habitKey: 'advice.green.habit',
  };
}

export default function App() {
  /**
   * 0-0. 介面語言。
   *
   * 【為什麼 t 只取不用的變數】
   *   語言狀態本身存在 I18nContext（含 localStorage 持久化），
   *   這裡只需要翻譯函式。切換語言時 Context 會重新渲染整棵樹，
   *   所有用到 t() 的地方都會跟著更新。
   */
  const { t, language } = useI18n();

  /**
   * 語音朗讀要挑哪個語音。
   *
   * ⚠️ 2026-10-01 使用者指定：**中文模式一律用粵語**。
   *    原本這裡有兩個變數（`ttsLang` 粵語 / `ttsLangMandarin` 國語），
   *    有 4 處誤用了國語 —— 已全部統一，`ttsLangMandarin` 移除。
   *    使用者的情境是澳門，粵語才是他與家人實際聽的語言。
   *
   * ⚠️ 英文模式要換成英文語音，否則會用中文腔念英文句子 ——
   *    決賽的英文 Demo 影片會很難聽。
   */
  const ttsLang = language === 'en' ? ('english' as const) : ('cantonese' as const);

  /**
   * 0. 學習者身分：決定 AI 的判斷基準（每日參考值）與學堂內容排序。
   *    未選擇或儲存值損毀時，安全退回「長者」，與舊版行為一致。
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
    speakText(t('settings.profileSwitched', { name: localizedProfileName(next.id, next.name, language) }), { rate: 0.9, preferLanguage: ttsLang });
  };

  /**
   * 切換稱謂性別（設定頁與引導頁共用同一份 localStorage 鍵）。
   *
   * ⚠️ 只影響「怎麼稱呼」，**不影響任何營養或風險判斷**。
   *    所以這裡不需要重算分析結果，也不需要清快取 ——
   *    快取存的是中性文字，稱謂是在輸出最後一步才插上去的。
   */
  const handleChangeGender = (next: Gender) => {
    setGender(next);
    try {
      localStorage.setItem(STORAGE_GENDER_KEY, next);
    } catch {}
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(60);
      } catch {}
    }
  };

  // 1. 個人慢性病設定：預設全選或讀取本地儲存
  //
  // ⚠️ 這個 state 必須宣告在 `handleOnboardingComplete` **之前** ——
  //    引導頁第 3 頁（2026-09-30 新增）會回傳勾選結果，那個 handler 要寫入它。
  //    放在後面的話，TypeScript 會報「用於宣告之前」。
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

  /**
   * 走完首次啟動引導頁。
   *
   * 這裡是**唯一**能設定分析模式的地方（引導頁）＋ 設定頁的模式切換。
   * 使用者是在看過「每個模式各自會傳出什麼」的說明之後做的選擇，
   * 所以是有效的選擇。其他任何地方都不得擅自改動它。
   */
  const handleOnboardingComplete = ({
    profileId,
    gender: chosenGender,
    analysisMode: chosenMode,
    conditions: chosenConditions,
  }: OnboardingResult) => {
    setLearnerProfileId(profileId);
    setGender(chosenGender);
    setAnalysisMode(chosenMode);
    setSelectedConditions(chosenConditions);
    setOnboarded(true);

    try {
      localStorage.setItem(STORAGE_PROFILE_KEY, profileId);
      localStorage.setItem(STORAGE_GENDER_KEY, chosenGender);
      localStorage.setItem(STORAGE_ANALYSIS_MODE_KEY, chosenMode);
      // 引導頁第 3 頁的慢性病與過敏（與設定頁共用同一個鍵）
      localStorage.setItem(STORAGE_CONDITIONS_KEY, JSON.stringify(chosenConditions));
      localStorage.setItem(STORAGE_ONBOARDED_KEY, 'true');
      // 舊鍵已完成遷移，移除避免日後又被讀到而覆蓋新值
      localStorage.removeItem(STORAGE_CLOUD_CONSENT_KEY);
    } catch (e) {
      console.warn('儲存引導設定失敗:', e);
    }

    try {
      navigator.vibrate([40, 60, 40]);
    } catch {}
  };

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
    speakText(t('settings.savedKeptToast'), { rate: 0.9, preferLanguage: ttsLang });
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
    speakText(t('settings.savedResetToast'), { rate: 0.9, preferLanguage: ttsLang });
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
          /**
           * ⚠️ 這裡**不可以**寫成 `parsed.length > 0`（2026-10-01 修正）。
           *
           * 原本的寫法是「空陣列 = 沒有存過」，於是：
           *   使用者按「清除所有資料」→ 存進 `"[]"` → 重新載入時
           *   讀到空陣列 → 判定「沒存過」→ **重新種入 6 筆假紀錄**。
           *   這就是使用者回報的「清除後再進入仍存在」。
           *
           * 空陣列是**有效資料**（代表「使用者真的清空了」），要照用。
           */
          if (Array.isArray(parsed)) return parsed;
        }
      } catch (e) {
        console.warn('讀取飲食紀錄失敗:', e);
      }
    }
    /**
     * ⚠️ 2026-10-01 使用者要求：**不再預先種入示範紀錄**。
     *    原本這裡回傳 `getInitialDietRecords()`（6 筆假的燕麥片／泡麵紀錄），
     *    讓使用者一打開就看到「本週分析」。但那是假資料 ——
     *    使用者反映「首次使用時已有飲食記錄」，要求刪除。
     *    → 改回傳空陣列，讓紀錄頁從「真的掃過的東西」開始累積。
     */
    return [];
  });

  // 3. 應用狀態管理與導航 Bar
  const [activeTab, setActiveTab] = useState<NavigationTab>('home');
  /**
   * 側邊選單是否展開。
   *
   * 【為什麼不用條件渲染（isMenuOpen && <div>）】
   *   條件渲染會讓面板「憑空出現」，做不出滑出動畫。
   *   這裡改成永遠渲染、用 transform 推出去，
   *   收起時加 pointer-events-none 讓點擊穿透，才不會擋住底下的畫面。
   */
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isNetworkDelayed, setIsNetworkDelayed] = useState<boolean>(false);
  /**
   * 這次掃描是否「自動降級」了 —— 也就是使用者選了「直接雲端」，
   * 但雲端失敗，App 自己改用本機 OCR ＋ 文字重送。
   *
   * ⚠️ 一定要顯示給使用者看，不能悄悄降級：
   *    他選「直接雲端」是為了準確度，結果照片根本沒被用到 ——
   *    不講的話，他會以為自己一直在用最準的模式。
   */
  const [autoDowngraded, setAutoDowngraded] = useState<boolean>(false);
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
   * 載入中的階段。
   *
   * 【為什麼要分階段】OCR 搬到瀏覽器之後，流程變成兩段：
   *   ① 讀取標籤文字（在手機上跑，不上傳）
   *   ② 分析（本機規則引擎，或送到雲端 AI）
   * 兩段都要幾秒，若都寫「正在為您分析」，使用者會以為卡住了。
   * 講清楚現在在做什麼，等待就從「不知道還要多久」變成「我知道在幹嘛」。
   */
  const [loadingPhase, setLoadingPhase] = useState<'reading' | 'analyzing'>('analyzing');
  /**
   * 是否同意把**讀出的文字**送雲端分析。
   *
   * 【2026-09-29 語意變更：本機從「預設」改為「斷網後備」】
   *   舊：預設 false，使用者要自己按開關才會走雲端。
   *   新：由**首次啟動引導頁**取得同意，雲端是主要路徑，
   *       本機 OCR ＋ 規則引擎降級為**斷網或雲端失敗時的後備**。
   *
   * 【為什麼要改】
   *   競賽章程明訂「僅以固定規則模擬 AI」可不予評審，而 AI 技術應用佔 25%。
   *   本機規則引擎當主角，等於自己放棄那一項。
   *
   * ⚠️ **2026-09-30 起改成三模式**（見 `AnalysisMode`）。
   *    舊版的註解寫「照片永遠不離開裝置」—— 那句話對 `cloud_image`
   *    **不成立**，已不再當作通則。每個模式各自的資料流向見 `AnalysisMode` 的表。
   *
   * ⚠️ 若使用者還沒走過引導頁，一律當作最保守的模式（見 `loadAnalysisMode()`）。
   *    引導頁會明確問過，那才是有效的選擇。
   */
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>(loadAnalysisMode);
  /** 是否允許呼叫雲端（`local_only` 之外都允許） */
  const cloudAllowed = analysisMode !== 'local_only';
  /** 是否已走完引導頁。false 時覆蓋整個畫面。 */
  const [onboarded, setOnboarded] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_ONBOARDED_KEY) === 'true';
    } catch {
      return false;
    }
  });
  /** 稱謂用性別（只影響怎麼稱呼，不影響營養判斷） */
  const [gender, setGender] = useState<Gender>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_GENDER_KEY);
      if (stored === 'male' || stored === 'female') return stored;
      return 'unspecified';
    } catch {
      return 'unspecified';
    }
  });

  /**
   * 非長者身分 → 整體字級下調 2px。
   *
   * 【為什麼寫在 <html> 上而不是包一層 div】
   *   縮放規則要蓋過全 App 的字級工具類，寫在根元素最不容易漏掉
   *   （側邊選單、彈窗、引導頁都是 fixed 定位，包 div 蓋不到）。
   *   實際的 px 對應在 index.css，這裡只負責切換屬性。
   *
   * ⚠️ 這裡刻意**只依身分**，不看年齡 —— 我們沒有使用者的年齡資料，
   *    而「長者」這個身分本身就代表需要大字。
   */
  useEffect(() => {
    const compact = learnerProfileId !== 'senior';
    document.documentElement.setAttribute('data-density', compact ? 'compact' : 'comfortable');
  }, [learnerProfileId]);
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

  // 隱藏相機 input ref
  const cameraInputRef = useRef<HTMLInputElement>(null);
  /**
   * 從相簿／檔案選擇的 input（2026-09-30 新增）。
   *
   * 【為什麼一定要另外一個 input，不能共用】
   *   原本的 input 帶了 `capture="environment"`，在手機上會**直接開鏡頭**，
   *   使用者完全沒有機會選相簿。加了 `capture` 就等於拿掉了「選相簿」這個選項。
   *   所以需要兩個 input：一個有 capture（拍照）、一個沒有（選相簿）。
   *   ⚠️ 桌面瀏覽器兩者都會開檔案選取器，這是正常的。
   */
  const galleryInputRef = useRef<HTMLInputElement>(null);

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

  /** 開啟相簿／檔案選擇（2026-09-30） */
  const handleTriggerGallery = () => {
    if (galleryInputRef.current) {
      galleryInputRef.current.click();
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
      // 直接雲端要把照片交給視覺模型判讀 → 解析度直接決定看不看得清小字
      const compressed = await compressImage(
        file,
        analysisMode === 'cloud_image' ? IMAGE_MAX_DIM_CLOUD : IMAGE_MAX_DIM_OCR,
        0.8
      );
      setPreviewImage(compressed.base64);

      // 開始呼叫分析
      await sendImageForAnalysis(compressed.base64);
    } catch (err) {
      console.error('圖片處理失敗:', err);
      setErrorMessage(t('scan.errPhoto'));
    }
  };

  // 載入測試範例標籤（方便在電腦或無實物時快速驗證）
  const handleLoadSample = async (sampleType: 'ramen' | 'oatmeal') => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(100);
      } catch {}
    }

    // ⚠️ 示範標籤會被「畫成圖片」，所以語言要在這裡就決定 ——
    //    Canvas 拿不到 React context，畫完就固定了。
    //    內容來自 samples.ts 的 DEMO_LABELS（中英各一份）。
    const demo = DEMO_LABELS[language === 'en' ? 'en' : 'zh-TW'];
    const sample = sampleType === 'ramen' ? demo.ramen : demo.oatmeal;
    const sampleDataUrl = generateSampleLabelDataUrl(
      sample.title,
      sample.details,
      language === 'en' ? 'en' : 'zh-TW'
    );

    setPreviewImage(sampleDataUrl);
    await sendImageForAnalysis(sampleDataUrl);
  };

  /**
   * 切換分析模式（三選一）。引導頁與設定頁共用同一份邏輯。
   *
   * 【為什麼要語音告知】這是會影響隱私的設定。
   * 只給視覺提示的話，不識字的使用者不會知道自己剛剛把照片送出去了。
   */
  const handleChangeAnalysisMode = (next: AnalysisMode) => {
    setAnalysisMode(next);
    try {
      localStorage.setItem(STORAGE_ANALYSIS_MODE_KEY, next);
    } catch {}
    speakText(
      t('mode.savedVoice', { mode: t(MODE_LABEL_KEY[next]) }),
      { rate: 0.9, preferLanguage: ttsLang }
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
    setAutoDowngraded(false);

    // 每秒更新一次已等待秒數，讓載入畫面能顯示具體進度
    setLoadingSeconds(0);
    if (loadingTickRef.current) clearInterval(loadingTickRef.current);
    loadingTickRef.current = setInterval(() => {
      setLoadingSeconds((s) => s + 1);
    }, 1000);

    // ══════════════════════════════════════════════════════════════════
    // 依「分析模式」決定要不要先做 OCR（2026-09-30 三模式）
    //
    //   cloud_image → **不做 OCR**，直接把照片交給雲端視覺模型判讀。
    //                 OCR 從「必經之路」變成「後備方案」。
    //   cloud_text  → 先在本機 OCR，只把文字送給雲端文字模型。
    //   local_only  → 先在本機 OCR，文字交給本機規則引擎，完全不連網。
    // ══════════════════════════════════════════════════════════════════

    /**
     * 將選取的病史轉換為繁體中文標籤。
     *
     * ⚠️⚠️ 這裡**刻意不隨介面語言改變**（2026-09-28 第三階段雙語時確認）。
     *     這一組字串是「前端 → 後端」的契約：
     *       - 它是快取鍵的一部分（中英文共用同一包食品的快取要一致）
     *       - 後端提示詞用中文病名組裝「使用者的慢性病史」段落
     *     後端的輸出語言是靠 `language` 參數 + 英文覆蓋指示處理的，
     *     不需要、也不應該把病名翻成英文送過去。
     *     若日後有人「順手」把它翻成英文，會讓快取分裂、提示詞對不上病名。
     *
     * ⚠️ 2026-09-30 從 `postAnalyzeLabel()` 內部**提到外層** ——
     *    飲食紀錄的 `matched_conditions` 也要用同一份，提到外層才不會兩處各算一次。
     */
    const conditionNames = selectedConditions.map((id) => conditionName(id, 'zh-TW'));

    /**
     * 送出一次分析請求。成功回傳結果；失敗**丟出錯誤**（由呼叫端決定是否降級）。
     *
     * ⚠️ `localOnly` 一律由 `analysisMode` 推導，呼叫端不能自己傳 ——
     *    否則會出現「使用者選了只在本機，卻因為某個分支忘了帶旗標而上傳」的漏洞。
     */
    const postAnalyzeLabel = async (payload: {
      imageBase64?: string;
      ocrText?: string;
      ocrError?: string;
    }): Promise<LabelAnalysisResult> => {
      const response = await fetch('/api/analyze-label', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...payload,
          conditions: conditionNames,
          // 身分會改變 AI 的判斷基準與每日參考值（例如健身族看蛋白質、學生看鈣質）
          profileId: learnerProfileId,
          // 介面語言（2026-09-28）：分析結果的文字由後端產生，
          // 不傳的話切到英文後會看到「英文介面 + 中文結論」。
          language,
          // 稱謂（2026-09-29）：只影響後端要怎麼稱呼使用者（先生／小姐／您好），
          // 不影響任何營養判斷，也不會改變快取（快取存的是中性文字）。
          gender,
          // 只有「只在本機」模式才禁止呼叫雲端。
          localOnly: analysisMode === 'local_only',
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
        throw new Error(t('scan.errBusy'));
      }

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        if (response.status === 429 || errJson.error === 'RATE_LIMIT_EXCEEDED') {
          throw new Error(t('scan.errBusy'));
        }
        throw new Error(errJson.message || t('scan.errBusy'));
      }

      const resultJson = await response.json();
      if (!resultJson.success || !resultJson.data) {
        throw new Error(t('scan.errNoResult'));
      }
      return resultJson.data as LabelAnalysisResult;
    };

    /** 網路變慢時主動語音安撫（只有真的會連網的模式才需要） */
    const armLatencyTimer = () => {
      if (latencyTimerRef.current) clearTimeout(latencyTimerRef.current);
      latencyTimerRef.current = setTimeout(() => {
        setIsNetworkDelayed(true);
        speakText(t('common.weakSignalSpeech'), {
          rate: 0.88,
          preferLanguage: ttsLang,
        });
      }, 2500);
    };

    try {
      let data: LabelAnalysisResult | null = null;
      /** 這次真正跑過的 OCR（模式 2、3，或模式 1 降級之後） */
      let ocr: Awaited<ReturnType<typeof recognizeLabelTextInBrowser>> | null = null;

      // ── 模式 1：直接雲端（照片上傳，不做 OCR）────────────────────
      if (analysisMode === 'cloud_image') {
        setLoadingPhase('analyzing');
        speakText(t('scan.analyzing'), { rate: 0.88, preferLanguage: ttsLang });
        armLatencyTimer();
        try {
          data = await postAnalyzeLabel({ imageBase64: base64Data });
        } catch (e) {
          console.warn('直接雲端失敗，改用本機 OCR 重試:', e);
        }
        if (!data) {
          // 自動降級：自己 OCR，改用文字重送。
          // ⚠️ 一定要告訴使用者 —— 悄悄降級會讓他以為「直接雲端」成功了，
          //    但其實照片根本沒送出去（或送了卻沒被採用）。
          setAutoDowngraded(true);
          speakText(t('scan.autoDowngrade'), { rate: 0.88, preferLanguage: ttsLang });
        }
      }

      // ── OCR 階段（模式 2、3，或模式 1 降級後）──────────────────────
      if (!data) {
        setLoadingPhase('reading');
        speakText(t('scan.readingLabel'), {
          rate: 0.88,
          preferLanguage: ttsLang,
        });

        ocr = await recognizeLabelTextInBrowser(base64Data);

        setLoadingPhase('analyzing');
        // AI 分析狀態語音提示：「正在為您分析」
        speakText(t('scan.analyzing'), { rate: 0.88, preferLanguage: ttsLang });
        // 「只在本機」不連網，所以不需要安撫等待
        if (analysisMode !== 'local_only') armLatencyTimer();

        // 【只送文字，不送照片】`ocrText` 是空的代表沒讀到字，
        // 後端會回「請重拍」，我們不在前端自行捏造結果。
        data = await postAnalyzeLabel({
          ocrText: ocr.ok ? ocr.text : '',
          // OCR 失敗的原因只在瀏覽器 console 留紀錄，不打擾使用者
          ocrError: ocr.ok ? undefined : ocr.error,
        });
      }

      if (!data) throw new Error(t('scan.errNoResult'));

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
            preferLanguage: ttsLang,
          });
        }
        return;
      }

      // 自動將本次掃描辨識結果存入「我的飲食健康紀錄」，以利一週統計與健康習慣養成
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
          // ⚠️ 關鍵字比對維持中文（後端本機引擎產出的就是中文摘要）。
          //    英文模式下模型改吐英文摘要時，這裡會落空 → 走下面的通用名稱，
          //    但通用名稱本身是雙語的，所以不會出現中文殘留。
          if (plainSummary.includes('泡麵') || plainSummary.includes('牛肉麵')) return t('foodname.ramen');
          if (plainSummary.includes('燕麥')) return t('foodname.oat');
          if (plainSummary.includes('豆漿') || plainSummary.includes('黑豆')) return t('foodname.soymilk');
          if (plainSummary.includes('蘇打餅')) return t('foodname.sodaCracker');
          if (plainSummary.includes('牛奶') || plainSummary.includes('鮮乳')) return t('foodname.milk');
        }
        return data.risk_level === 'green'
          ? t('foodname.green')
          : data.risk_level === 'yellow'
          ? t('foodname.yellow')
          : t('foodname.red');
      };

      // ── 紀錄一律使用「標籤本身的語言」（2026-09-29 使用者要求）──────────
      //
      // 【直接雲端模式沒有 OCR 原文怎麼辦】
      //   那個模式刻意不跑 OCR，所以拿不到標籤原文。
      //   但模型會回傳 `ingredients_detected`（包裝上的成分原文），
      //   那是同樣有效的語言證據 —— 用它來判斷標籤語言。
      const labelEvidence =
        ocr?.text ||
        (Array.isArray(data.ingredients_detected) ? data.ingredients_detected.join(' ') : '');
      const labelLanguage = detectLabelLanguage(labelEvidence);

      /**
       * 標籤二次解析：品名與（可能的）重新產生都要用。
       *
       * ⚠️ 直接雲端模式下 `ocr` 是 null（刻意不跑 OCR）。
       *    只有在「標籤語言 ≠ 介面語言」、真的需要重新產生紀錄文字時，
       *    才會**補跑一次本機 OCR** —— 純本機、免費、不打擾使用者。
       *    這是刻意的取捨：為了不讓紀錄中英混雜，寧可多花一次本機 OCR。
       */
      let ocrTextForRecord = ocr?.text ?? '';
      if (labelLanguage !== language && !ocrTextForRecord) {
        try {
          const lateOcr = await recognizeLabelTextInBrowser(base64Data);
          ocrTextForRecord = lateOcr.ok ? lateOcr.text : '';
        } catch (e) {
          console.warn('補跑 OCR 失敗（僅影響紀錄語言）:', e);
        }
      }
      let parsedLabel: ReturnType<typeof buildRecognitionResult> | null = null;
      if (ocrTextForRecord) {
        try {
          parsedLabel = buildRecognitionResult(ocrTextForRecord);
        } catch (e) {
          console.warn('標籤二次解析失敗（不影響主要分析）:', e);
        }
      }

      /**
       * 品名：優先使用**標籤上真正讀到的品名**（labelParser 的 extractFoodName）。
       *
       * ⚠️ 舊做法是用 AI 文案的關鍵字去猜，只認得 5 種（泡麵／燕麥／豆漿／
       *    蘇打餅／牛奶），其餘一律叫「健康安心選購食品」這類通用名 ——
       *    使用者的抱怨就是「名稱常常不對」。
       */
      const labelFoodName = parsedLabel?.profile?.foodName?.trim() || null;

      /**
       * 紀錄文字一律用標籤語言。
       *
       * 【為什麼需要重新產生】
       *   後端產生的分析文字是跟著**介面語言**走的。
       *   英文介面 ＋ 中文標籤 → 後端回英文，但紀錄應該存中文。
       *   這裡用本機規則引擎在標籤語言就地重跑一次 ——
       *   引擎是純函式，**完全離線、不花任何 API 額度**。
       *
       * 【為什麼可以接受「雲端 AI 的措辭被換掉」】
       *   只有在「介面語言 ≠ 標籤語言」時才會走到這裡；
       *   同語言時完整保留 AI 原文。而紀錄清單本來就是摘要性質。
       */
      let recordText = {
        warning_title: data.warning_title,
        plain_summary: data.plain_summary,
        alternative_advice: data.alternative_advice,
      };
      if (labelLanguage !== language && parsedLabel?.ok && parsedLabel.profile) {
        try {
          const localText = translateLocalResult(
            analyzeNutritionWithIndicators(
              parsedLabel.profile,
              conditionNames,
              learnerProfile.numericLimits,
              labelLanguage
            ),
            labelLanguage
          );
          recordText = {
            warning_title: localText.warning_title,
            plain_summary: localText.plain_summary,
            alternative_advice: localText.alternative_advice,
          };
        } catch (e) {
          // 重新產生失敗就沿用分析結果 —— 寧可語言不一致，也不要讓紀錄消失
          console.warn('紀錄文字重新產生失敗，沿用分析結果:', e);
        }
      }

      const newRecord: DietRecord = {
        id: `rec-${Date.now()}`,
        timestamp: Date.now(),
        /**
         * ⚠️ 日期用**介面語言**，不是標籤語言（2026-10-01 修正）。
         *
         * 【原本錯在哪】
         *   這裡原本傳 `labelLanguage`，理由是「避免中文品名配英文日期」。
         *   但那個理由把兩件不同性質的事混在一起了：
         *     - 紀錄的**內容**（品名、說明）→ 屬於標籤 → 跟標籤語言 ✅
         *     - 紀錄的**時間**（幾月幾日幾點）→ 屬於**使用者** → 跟介面語言
         *   時間是「我什麼時候掃的」，跟包裝上印什麼語言無關。
         *
         * 【實際後果】中文介面 + 英文標籤 → 時間變成「9/30 PM 11:30」，
         *   中文使用者看不懂。這是 09-29「紀錄跟隨標籤語言」那個決定
         *   被套用到**多一個欄位**造成的 —— 規則本身沒錯，是適用範圍錯了。
         */
        dateString: formatScanTime(language, new Date()),
        foodName: labelFoodName || extractFoodName(data.warning_title, data.plain_summary),
        risk_level: data.risk_level,
        warning_title: recordText.warning_title,
        plain_summary: recordText.plain_summary,
        alternative_advice: recordText.alternative_advice,
        matched_conditions: conditionNames,
        lang: labelLanguage,
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
            preferLanguage: ttsLang,
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
        // ⚠️ 用 t('scan.errBusy') 比對，不要寫死中文字串。
        //    上面 throw 的就是 t('scan.errBusy')，兩邊同源 → 切語言也不會失準。
        err?.message?.includes(t('scan.errBusy')) ||
        err?.message?.includes('429') ||
        err?.message?.includes('RATE_LIMIT');
      const msg = isRateLimited ? t('scan.errBusy') : t('scan.errUnclear');

      if (!isRateLimited) {
        // 照片本身的問題：清掉暫存的舊照片，讓下方「重新再試」按鈕直接開啟相機重拍，
        // 而不是拿同一張註定失敗的照片再送一次。
        setPreviewImage(null);
      }

      setErrorMessage(msg);
      // 以語音同步告知，讓不識字的長者也能理解目前狀況
      speakText(msg, { preferLanguage: ttsLang });
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
        preferLanguage: ttsLang,
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
      {/* 首次啟動引導頁：還沒走過就覆蓋整個畫面                    */}
      {/*   放在最前面，連背景舞台都不渲染 —— 第一次打開的人         */}
      {/*   不該看到半成品的主介面閃過去。                           */}
      {/* ======================================================== */}
      {!onboarded && (
        <OnboardingFlow
          initialProfileId={learnerProfileId}
          initialConditions={selectedConditions}
          onComplete={handleOnboardingComplete}
        />
      )}

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

      {/* 隱藏的原生相簿 input（2026-09-30 新增）
          ⚠️ **絕對不要加 `capture`** —— 加了就會變成開鏡頭，等於沒有相簿選項。 */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-hidden="true"
        onChange={handleFileChange}
      />

      {/* ======================================================== */}
      {/* 模組 1：頂部標題區 */}
      {/* ======================================================== */}
      <header className="bg-white border-b-4 border-blue-900 px-[16px] py-[10px] shadow-sm min-[520px]:shrink-0">
        <div className="flex flex-col items-center justify-center gap-1">
          <div className="flex items-center justify-between w-full gap-[8px]">

            {/* 漢堡選單鈕（左上角）——現在是唯一的頁面切換入口。
                觸控尺寸 48×48，符合長者的操作需求。
                aria-expanded 讓螢幕閱讀器知道選單目前是開還是關。 */}
            <button
              type="button"
              id="btn-open-menu"
              aria-label={isMenuOpen ? t('app.closeMenu') : t('app.openMenu')}
              aria-expanded={isMenuOpen}
              aria-controls="app-drawer"
              onClick={() => setIsMenuOpen((v) => !v)}
              className="w-[48px] h-[48px] shrink-0 rounded-[12px] bg-blue-900 hover:bg-blue-950 text-white flex items-center justify-center cursor-pointer active:scale-95 transition-all border-[2px] border-blue-950"
            >
              {isMenuOpen ? (
                <CloseIcon className="w-[26px] h-[26px] shrink-0" />
              ) : (
                <MenuIcon className="w-[26px] h-[26px] shrink-0" />
              )}
            </button>

            {/* ⚠️ 這裡刻意不放 Sparkles 圖示：
                    360px 寬（16:9 手機）下，漢堡鈕 48px ＋ 標題 ＋ 狀態標籤會超出
                    可用寬度（328px），導致「LabelBuddy AI」被截成「LabelBuddy A」。
                    實測拿掉 24px 圖示＋4px 間距後剛好放得下。
                    App 名稱被截斷比少一個裝飾圖示嚴重得多。 */}
            <h1 className="text-[20px] font-black text-blue-950 tracking-tight whitespace-nowrap min-w-0">
              LabelBuddy AI
            </h1>

            {/* 雲端 AI 服務狀態小標籤（不綁死模型名稱，避免模型更換後文案過期）
                ⚠️ 360px 寬（16:9 手機）下這裡極容易折行，故字級與內距都收斂並強制不換行
                ⚠️ 字級地板 16px：此處已是全站最小，不可再往下 */}
            <div className="flex items-center gap-[4px] px-[8px] py-[3px] rounded-full bg-slate-100 border border-slate-300 text-[16px] font-extrabold text-slate-700 whitespace-nowrap shrink-0">
              <span className={`w-[7px] h-[7px] rounded-full shrink-0 ${geminiConnected ? 'bg-emerald-500 animate-pulse' : 'bg-blue-500'}`} />
              <span>{geminiConnected ? t('app.statusCloud') : t('app.statusLocal')}</span>
            </div>
          </div>
          <p className="text-[16px] font-extrabold text-blue-900 flex items-center justify-center gap-1.5 mt-0.5">
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
            {t('app.tagline')}
          </p>
        </div>
      </header>

      {/* ======================================================== */}
      {/* 側邊選單（Drawer）                                        */}
      {/* 2026-09-28 起取代原本的底部 4 格導航列                     */}
      {/* ======================================================== */}
      {/* ⚠️ 外層用 `fixed inset-0 min-[520px]:absolute`：
             手機是全螢幕，桌面版是 380×660 的手機框，兩種都要正確定位。
             （沿用本檔其他彈窗的既有寫法，見 showMigrationPrompt 的註解） */}
      <div
        className={`fixed inset-0 z-[70] min-[520px]:absolute ${
          isMenuOpen ? '' : 'pointer-events-none'
        }`}
        aria-hidden={!isMenuOpen}
      >
        {/* 遮罩：點一下關閉選單 */}
        <div
          className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${
            isMenuOpen ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={() => setIsMenuOpen(false)}
        />

        {/* 選單面板：從左側滑出 */}
        <nav
          id="app-drawer"
          aria-label={t('app.openMenu')}
          className={`absolute inset-y-0 left-0 w-[80%] max-w-[300px] bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
            isMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="bg-blue-900 text-white px-[16px] py-[14px] flex items-center gap-[10px] shrink-0">
            <Sparkles className="w-[26px] h-[26px] shrink-0" />
            <div className="min-w-0">
              <p className="text-[19px] font-black leading-tight">LabelBuddy AI</p>
              <p className="text-[16px] font-bold text-blue-200 leading-tight">
                {t('app.menuTitle')}
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-[10px] flex flex-col gap-[8px]">
            {MENU_ITEMS.map(({ tab, labelKey, hintKey, Icon }) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  id={`menu-item-${tab}`}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => {
                    stopSpeech();
                    setActiveTab(tab);
                    setIsMenuOpen(false);
                  }}
                  className={`w-full min-h-[64px] px-[14px] py-[10px] rounded-[14px] flex items-center gap-[12px] text-left cursor-pointer transition-all active:scale-95 border-[2px] ${
                    isActive
                      ? 'bg-blue-900 text-white border-blue-950 shadow-md'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-900 border-slate-300'
                  }`}
                >
                  {/* 圖示底色圓：用形狀輔助辨識，不讓顏色單獨承載資訊 */}
                  <span
                    className={`w-[40px] h-[40px] shrink-0 rounded-full flex items-center justify-center ${
                      isActive ? 'bg-blue-800' : 'bg-white border border-slate-300'
                    }`}
                  >
                    <Icon className="w-[24px] h-[24px] shrink-0" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[19px] font-black leading-tight">
                      {t(labelKey)}
                    </span>
                    <span
                      className={`block text-[16px] font-bold leading-tight ${
                        isActive ? 'text-blue-200' : 'text-slate-600'
                      }`}
                    >
                      {t(hintKey)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="p-[10px] border-t-2 border-slate-200 shrink-0">
            <button
              type="button"
              id="btn-close-menu"
              onClick={() => setIsMenuOpen(false)}
              className="w-full min-h-[56px] rounded-[14px] bg-slate-100 hover:bg-slate-200 text-slate-900 text-[19px] font-black border-[2px] border-slate-400 flex items-center justify-center gap-[8px] cursor-pointer active:scale-95 transition-all"
            >
              <CloseIcon className="w-[24px] h-[24px] shrink-0" />
              {t('common.close')}
            </button>
          </div>
        </nav>
      </div>


      {/* ======================================================== */}
      {/* 主內容區：單欄垂直滾動 (flex-col)，依側邊選單切換          */}
      {/* ======================================================== */}
      <main className="flex-1 flex flex-col p-4 space-y-5 pb-28 min-h-0 min-[520px]:overflow-y-auto min-[520px]:pb-4">
        {/* ======================================================== */}
        {/* 頁面 0：主頁（HOME TAB）                                   */}
        {/* ======================================================== */}
        {/* 【設計原則】
              1. 一打開就要知道「要做什麼」—— 所以拍照按鈕最大、最顯眼
              2. 不用任何人名或稱謂（2026-09-28 使用者要求）
              3. 摘要素數字要能點，點下去就跳到對應頁面（減少長者找路徑的負擔）
              4. 刻意不放隱私區塊：使用者要求，且健康設定頁已有完整說明 */}
        {activeTab === 'home' && (
          <>
            {/* 問候語 */}
            <section className="bg-white rounded-[16px] border-[3px] border-blue-900 p-[20px] flex flex-col gap-[6px] shadow-sm">
              <h2 className="text-[20px] font-black text-slate-950 leading-tight">
                {t('home.greeting')}
              </h2>
              <p className="text-[16px] font-bold text-slate-700 leading-snug">
                {t('home.intro')}
              </p>
            </section>

            {/* 主要動作：超大拍照按鈕（觸控高度 120px，遠超無障礙規範的 48px） */}
            <button
              type="button"
              id="btn-home-camera"
              onClick={handleTriggerCamera}
              className="w-full min-h-[120px] rounded-[16px] bg-blue-900 hover:bg-blue-950 text-white flex flex-col items-center justify-center gap-[6px] cursor-pointer active:scale-95 transition-all border-[3px] border-blue-950 shadow-md"
            >
              <Camera className="w-[44px] h-[44px] shrink-0" />
              <span className="text-[20px] font-black leading-tight">
                {t('home.cameraButton')}
              </span>
              <span className="text-[16px] font-bold text-blue-200 leading-tight">
                {t('home.cameraHint')}
              </span>
            </button>

            {/* 我的把關：兩個數字都可點，直接跳到對應頁面 */}
            <section className="bg-white rounded-[16px] border-[3px] border-slate-300 p-[16px] flex flex-col gap-[12px] shadow-sm">
              <h3 className="text-[19px] font-black text-slate-950 leading-tight">
                {t('home.summaryTitle')}
              </h3>

              <div className="grid grid-cols-2 gap-[10px]">
                <button
                  type="button"
                  id="btn-home-history"
                  onClick={() => {
                    stopSpeech();
                    setActiveTab('history');
                  }}
                  className="min-h-[84px] rounded-[14px] bg-slate-50 hover:bg-slate-100 border-[2px] border-slate-300 flex flex-col items-center justify-center gap-[2px] cursor-pointer active:scale-95 transition-all"
                >
                  <span className="text-[20px] font-black text-blue-800 leading-tight">
                    {dietRecords.length}
                  </span>
                  <span className="text-[16px] font-bold text-slate-600 leading-tight">
                    {t('home.recordCount')}
                  </span>
                </button>

                <button
                  type="button"
                  id="btn-home-conditions"
                  onClick={() => {
                    stopSpeech();
                    setActiveTab('conditions');
                  }}
                  className="min-h-[84px] rounded-[14px] bg-slate-50 hover:bg-slate-100 border-[2px] border-slate-300 flex flex-col items-center justify-center gap-[2px] cursor-pointer active:scale-95 transition-all"
                >
                  <span className="text-[20px] font-black text-rose-700 leading-tight">
                    {selectedConditions.length}
                  </span>
                  <span className="text-[16px] font-bold text-slate-600 leading-tight">
                    {t('home.conditionCount')}
                  </span>
                </button>
              </div>

              {/* 目前身分：讓使用者隨時知道自己是用哪個身分在做判斷 */}
              <button
                type="button"
                id="btn-home-profile"
                onClick={() => {
                  stopSpeech();
                  setActiveTab('conditions');
                }}
                className="w-full min-h-[56px] rounded-[14px] bg-slate-50 hover:bg-slate-100 border-[2px] border-slate-300 px-[14px] flex items-center gap-[10px] text-left cursor-pointer active:scale-95 transition-all"
              >
                <span className="text-[20px] shrink-0">{learnerProfile.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-bold text-slate-600 leading-tight">
                    {t('home.currentProfile')}
                  </span>
                  <span className="block text-[19px] font-black text-slate-950 leading-tight">
                    {localizedProfileDisplayName(learnerProfile.id, learnerProfile.name, language)}
                  </span>
                </span>
                <ArrowRight className="w-[24px] h-[24px] text-slate-500 shrink-0" />
              </button>
            </section>
          </>
        )}

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
                    {t('scan.retakeTitle')}
                  </h3>
                  <p className={`${TYPE.body} ${WEIGHT.normal} text-[#791F1F] leading-snug`}>
                    {t('scan.retakeSubtitle')}
                  </p>
                </div>

                {/* 失敗原因（來自後端的具體訊息） */}
                <p className={`${TYPE.secondary} ${WEIGHT.normal} text-[#501313] bg-white/70 rounded-[12px] p-[12px] text-center leading-snug border border-[#F09595]`}>
                  {errorMessage}
                </p>

                {/* 三個具體可做的事 */}
                <div className="flex flex-col gap-[8px]">
                  <span className={`${TYPE.secondary} font-black text-[#501313]`}>
                    {t('scan.retakeTips')}
                  </span>
                  <ul className="flex flex-col gap-[6px]">
                    {[
                      t('scan.tip1'),
                      t('scan.tip2'),
                      t('scan.tip3'),
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
                  <span>📸 {t('footer.retryScan')}</span>
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
                      <span className="text-[16px] font-bold text-slate-600">{t('home.currentProfile')}</span>
                      <span className="text-[20px] font-black text-slate-900 truncate">
                        {localizedProfileDisplayName(learnerProfile.id, learnerProfile.name, language)}
                      </span>
                    </div>
                  </div>
                  <span className="text-[16px] font-black text-[#0C447C] shrink-0 whitespace-nowrap">
                    {t('scan.switchProfile')}
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
                    {t('scan.aimLabel')}
                  </h2>
                  {/* ⚠️ 文案長度上限：360px 下可用寬約 320px，16px 全形字每字約 16px
                      → 含 emoji 請控制在 17 個全形字以內，否則折行會把卡片撐高 */}
                  <p className="text-[16px] font-bold text-slate-700 leading-snug">
                    {t('scan.tapButton')}
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
                      {t('scan.checking')}
                      <strong className="font-black text-slate-900">
                        {/* ⚠️ 最多只列前 3 項。改為 12 項後若全部列出，
                            這段會變成 2～3 行並把首頁卡片撐高。 */}
                        {selectedConditions.length === 0
                          ? t('common.noConditions')
                          : selectedConditions.length <= 3
                          ? selectedConditions
                              .map((id) => conditionName(id, language))
                              .join(t('common.listSeparator'))
                          : `${selectedConditions
                              .slice(0, 3)
                              .map((id) => conditionName(id, language))
                              .join(t('common.listSeparator'))} ${t('scan.conditionMore', { n: selectedConditions.length })}`}
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
                    {/* ⚠️ 這裡原本是 truncate（單行截斷）。中文 10 個字放得下，
                        但英文較長會被切成「No product? Try a s...」——
                        寧可讓它換行，也不要顯示被截斷的句子。 */}
                    <span className="text-[16px] font-black text-slate-700 flex items-center gap-[8px] min-w-0">
                      <Lightbulb className="w-[22px] h-[22px] text-amber-600 shrink-0" />
                      <span className="text-left">{t('scan.demoTitle')}</span>
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
                      <span>{t('scan.demoRamen')}</span>
                      <span className="text-[16px] font-bold px-[8px] py-[3px] rounded-[8px] bg-[#FAC775] text-[#412402] shrink-0">
                        {t('scan.demoRamenTag')}
                      </span>
                    </button>

                    <button
                      type="button"
                      id="btn-sample-oatmeal"
                      onClick={() => handleLoadSample('oatmeal')}
                      className="w-full min-h-[60px] p-[14px] rounded-[12px] border-[1.5px] border-[#3B6D11] bg-[#EAF3DE] hover:brightness-95 text-[#173404] font-black text-[18px] text-left flex items-center justify-between gap-[8px] cursor-pointer transition-all active:scale-[0.98]"
                    >
                      <span>{t('scan.demoOat')}</span>
                      <span className="text-[16px] font-bold px-[8px] py-[3px] rounded-[8px] bg-[#C0DD97] text-[#173404] shrink-0">
                        {t('scan.demoOatTag')}
                      </span>
                    </button>

                    {/* 超市訊號弱語音安撫測試按鈕（開發驗證用） */}
                    <button
                      type="button"
                      id="btn-test-weak-signal-voice"
                      onClick={() => {
                        stopSpeech();
                        speakText(t('common.weakSignalSpeech'), {
                          rate: 0.88,
                          preferLanguage: ttsLang,
                        });
                      }}
                      className="w-full min-h-[56px] p-[12px] rounded-[12px] border-[1.5px] border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800 font-black text-[18px] flex items-center justify-between gap-[8px] cursor-pointer transition-all active:scale-[0.98]"
                    >
                      <span className="flex items-center gap-[8px]">
                        <Wifi className="w-[22px] h-[22px] text-slate-600 shrink-0" />
                        <span>{t('scan.weakSignal')}</span>
                      </span>
                      <span className="text-[16px] font-black px-[8px] py-[3px] rounded-[8px] bg-slate-200 text-slate-800 shrink-0">
                        {t('scan.previewVoice')}
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
                          t('risk.unclearTitle')}
                      </h2>

                      <p
                        className={`${TYPE.body} ${WEIGHT.normal} leading-snug`}
                        style={{ color: TONES.neutral.textMuted }}
                      >
                        {t('result.noConclusion')}
                      </p>
                    </div>

                    <section
                      aria-label={t('result.retakeAdvice')}
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
                        <span>📷 {t('footer.retryScan')}</span>
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
                // ⚠️ 這裡是「AI 沒給標題」時的後備文字，所以一定要跟著語言走。
                //    只查中文表的話，英文模式在 AI 回空字串時會冒出中文標題。
                (language === 'en' ? RISK_LABEL_EN : RISK_LABEL)[analysisResult.risk_level];
              const riskSubline =
                analysisResult.risk_level === 'red'
                  ? t('risk.red')
                  : analysisResult.risk_level === 'yellow'
                  ? t('risk.yellow')
                  : t('risk.green');

              // 模組層函式只回翻譯鍵，這裡才解析成字串（見 getDailyNutritionAdvice 的說明）
              const adviceKeys = getDailyNutritionAdvice(analysisResult);
              const nutritionAdvice = {
                badge: t(adviceKeys.badgeKey),
                advice: t(adviceKeys.adviceKey),
                habit: t(adviceKeys.habitKey),
              };

              return (
                <div className="flex flex-col space-y-[16px] animate-in fade-in duration-200">
                  {/* 「直接雲端」失敗後自動降級的通知（2026-09-30）。
                      ⚠️ 一定要顯示：使用者選「直接雲端」是為了準確度，
                         悄悄降級會讓他以為照片有被用到，其實沒有。 */}
                  {autoDowngraded && (
                    <div
                      role="status"
                      className={`${CARD_BASE} p-[14px] bg-amber-50 border-amber-500 flex items-start gap-[10px]`}
                    >
                      <AlertTriangle className="w-[24px] h-[24px] text-amber-700 shrink-0 mt-[2px]" aria-hidden="true" />
                      <p className={`${TYPE.body} ${WEIGHT.normal} text-amber-900 leading-snug`}>
                        {t('result.autoDowngraded')}
                      </p>
                    </div>
                  )}

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
                    aria-label={t('result.basis')}
                    className={`${CARD_BASE} p-[16px] flex flex-col gap-[14px]`}
                  >
                    <div className="flex items-center justify-between gap-[8px] flex-wrap">
                      <h3 className={`${TYPE.title} ${WEIGHT.strong} text-slate-900 flex items-center gap-[8px]`}>
                        <BarChart3 className="w-[26px] h-[26px] text-slate-700 shrink-0" />
                        {t('result.why')}
                      </h3>

                      {/* 結果來源標示：讓使用者能分辨是雲端 AI 還是本機離線辨識 */}
                      <span
                        className={`${TYPE.body} font-black px-[8px] py-[3px] rounded-full border shrink-0 whitespace-nowrap ${
                          analysisResult.analysis_mode === 'cloud_ai'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-400'
                            : 'bg-amber-50 text-amber-800 border-amber-400'
                        }`}
                        title={
                          analysisResult.analysis_mode === 'cloud_ai'
                            ? t('mode.cloudBadgeTip')
                            : t('mode.localBadgeTip')
                        }
                      >
                        {/* 來源徽章：只區分「雲端」與「離線」兩種，用白話。
                            ⚠️ 2026-09-30 移除「（快取）」與模型名稱 tooltip ——
                               那些是寫給工程師與評審看的，一般使用者不需要，
                               而且會讓結果頁看起來像除錯畫面。 */}
                        {analysisResult.analysis_mode === 'cloud_ai'
                          ? t('mode.cloud')
                          : t('mode.localBadge')}
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
                            ? t('mode.imageUploaded')
                            : t('mode.imageLocal')}
                        </span>

                        {/* 模式切換：三模式之後不再用「二選一開關」——
                            那只涵蓋得了兩種。
                            改成把使用者帶去設定頁，那裡有完整的三模式說明
                            （每一個模式「什麼會離開裝置」都寫清楚了）。
                            ⚠️ 刻意不在這裡直接切換：使用者看不到另外兩個選項的差別。 */}
                        <button
                          type="button"
                          id="btn-result-change-mode"
                          onClick={() => {
                            stopSpeech();
                            setActiveTab('conditions');
                          }}
                          className="self-start min-h-[48px] px-[12px] rounded-[10px] bg-white border-2 border-slate-400 text-slate-800 text-[16px] font-black"
                        >
                          {t('result.changeMode')}
                        </button>
                      </div>
                    </div>

                    {/* 成分對照長條圖：把「2480 毫克」變成「佔每日上限 124%」 */}
                    <NutrientFactBars
                      facts={analysisResult.nutrient_facts}
                      profileName={localizedProfileName(
                        learnerProfile.id,
                        learnerProfile.name,
                        language
                      )}
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
                      title={t('result.tapToRead')}
                    >
                      {isSpeaking ? (
                        <>
                          <VolumeX className="w-[28px] h-[28px] shrink-0" />
                          <span>{t('result.stopReading')}</span>
                        </>
                      ) : (
                        <>
                          <Volume2 className="w-[28px] h-[28px] shrink-0" />
                          <span>{t('result.readToMe')}</span>
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
                        {/* ⚠️ 同上：英文較長，改為可換行不要截斷 */}
                        <span className="text-left">{t('result.moreInfo')}</span>
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
                          aria-label={t('result.education')}
                          className={`${CARD_BASE} p-[16px] flex flex-col gap-[12px]`}
                          style={{ background: TONES.action.bg, borderColor: TONES.action.border }}
                        >
                          <h3
                            className={`${TYPE.title} ${WEIGHT.strong} flex items-center gap-[8px]`}
                            style={{ color: TONES.action.text }}
                          >
                            <GraduationCap className="w-[26px] h-[26px] shrink-0" />
                            {t('result.learnConcept')}
                          </h3>

                          {analysisResult.knowledge_point && (
                            <div className="flex flex-col gap-[4px]">
                              <span
                                className={`${TYPE.body} font-black`}
                                style={{ color: TONES.action.text }}
                              >
                                {t('result.learnWhy')}
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
                                {t('result.learnHow')}
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
                                {t('result.learnMeaning')}
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
                                    ? t('result.speechWhy', { text: analysisResult.knowledge_point })
                                    : '',
                                  analysisResult.label_reading_tip
                                    ? t('result.speechHow', { text: analysisResult.label_reading_tip })
                                    : '',
                                  analysisResult.daily_limit_context
                                    ? t('result.speechMeaning', { text: analysisResult.daily_limit_context })
                                    : '',
                                ]
                                  .filter(Boolean)
                                  .join('。'),
                                { rate: 0.88, preferLanguage: ttsLang }
                              );
                            }}
                            className={FOOTER_CTA_SECONDARY}
                          >
                            <Volume2 className="w-[28px] h-[28px] shrink-0" />
                            <span>{t('result.readToMe')}</span>
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
                            aria-label={t('result.conditions')}
                            className={`${CARD_BASE} p-[16px] flex flex-col gap-[12px]`}
                          >
                            <h3
                              className={`${TYPE.title} ${WEIGHT.strong} text-slate-900 flex items-center gap-[8px]`}
                            >
                              <ShieldAlert className="w-[26px] h-[26px] text-slate-700 shrink-0" />
                              {t('result.conditionReminders')}
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
                            {t('result.alternatives')}
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
                        aria-label={t('result.dailyAdvice')}
                        className={`${CARD_BASE} p-[16px] flex flex-col gap-[12px]`}
                        style={{ background: TONES.caution.bg, borderColor: TONES.caution.border }}
                      >
                        <div className="flex items-center justify-between gap-[8px]">
                          <h3
                            className={`${TYPE.title} ${WEIGHT.strong} flex items-center gap-[8px]`}
                            style={{ color: TONES.caution.text }}
                          >
                            <span aria-hidden="true">💡</span>
                            {t('result.dailyAdvice')}
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
                          <span className="text-[20px] shrink-0" role="img" aria-label={t('result.habit')}>
                            🌱
                          </span>
                          <div className="flex flex-col">
                            <span className={`${TYPE.secondary} font-black`} style={{ color: TONES.caution.text }}>
                              {t('result.habits')}
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
                              t('result.speechAdvice', { advice: nutritionAdvice.advice, habit: nutritionAdvice.habit }),
                              { rate: 0.88, preferLanguage: ttsLang }
                            );
                          }}
                          className={FOOTER_CTA_SECONDARY}
                        >
                          <Volume2 className="w-[26px] h-[26px] shrink-0" />
                          <span>{t('result.readTip')}</span>
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
                            {t('result.saved')}
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
                          <span>{t('result.viewHistory')}</span>
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
            {/* 第零部分：介面語言（放在最前面，因為它影響整頁的顯示方式） */}
            <LanguagePicker />

            {/* 第一部分：學習者身分（決定 AI 的判斷基準與每日參考值） */}
            <SettingsSection
              id="settings-profile"
              icon={<UsersIcon className="w-[26px] h-[26px]" />}
              title={t('settings.profile.title')}
              /* ⚠️ 收合時顯示目前身分與稱謂 —— 這裡也要本地化，
                 否則英文介面的摺疊標題會直接露出中文身分名稱。 */
              summary={`${learnerProfile.emoji} ${localizedProfileDisplayName(
                learnerProfile.id,
                learnerProfile.name,
                language
              )} · ${t(
                gender === 'male'
                  ? 'gender.shortMale'
                  : gender === 'female'
                  ? 'gender.shortFemale'
                  : 'gender.shortNone'
              )}`}
            >
              <div className="flex flex-col gap-5">
                <LearnerProfilePicker
                  selectedId={learnerProfileId}
                  onSelect={handleChangeProfile}
                />

                {/* 稱謂性別：放在身分區塊內（2026-09-29 使用者要求「在身分的地方改性別」），
                    與引導頁共用同一個元件與同一份 localStorage 鍵。 */}
                <div className="pt-4 border-t-2 border-slate-200">
                  <GenderPicker value={gender} onChange={handleChangeGender} />
                </div>
              </div>
            </SettingsSection>

            {/* AI 分析模式（2026-09-30 新增）：三選一。
                ⚠️ 收合時顯示目前模式 —— 這是會影響隱私的設定，
                   使用者不該需要展開才知道自己選了什麼。 */}
            <SettingsSection
              id="settings-mode"
              icon={<ShieldCheck className="w-[26px] h-[26px]" />}
              title={t('settings.mode.title')}
              summary={t(MODE_LABEL_KEY[analysisMode])}
            >
              <AnalysisModePicker value={analysisMode} onChange={handleChangeAnalysisMode} />
            </SettingsSection>

            {/* 第二部分：日常生理指標量測（血壓、心跳、血糖等） */}
            <SettingsSection
              id="settings-vitals"
              icon={<ActivityIcon className="w-[26px] h-[26px]" />}
              title={t('settings.vitals.title')}
              /* 收合時顯示血壓與血糖，長者不必展開就知道自己填了什麼 */
              summary={
                physicalIndicators.systolicBp
                  ? t('settings.summary.vitals', {
                      bp: `${physicalIndicators.systolicBp}/${physicalIndicators.diastolicBp}`,
                      sugar: `${physicalIndicators.bloodSugar}`,
                    })
                  : t('settings.notSet')
              }
            >
              <VitalMetricsSection
                indicators={physicalIndicators}
                onChangeIndicators={handleUpdateIndicators}
                gender={gender}
                analysisMode={analysisMode}
              />
            </SettingsSection>

            {/* 第三部分原本是「健康問答」——
                2026-09-29 使用者要求搬到功能選單，因為它是功能不是設定。 */}

            {/* 第二部分：常見慢性病與過敏原把關清單 */}
            <SettingsSection
              id="settings-conditions"
              icon={<HeartPulse className="w-[26px] h-[26px]" />}
              title={t('settings.conditions.title')}
              summary={t('settings.selectedCount', { n: selectedConditions.length })}
            >
              <div className="flex flex-col space-y-5">
                {/* 說明文字保留（原本在內部標題下方），只移除與收合標題重複的 h2 */}
                <div className="flex flex-col gap-[4px]">
                  <p className="text-[16px] font-bold text-slate-700 leading-snug">
                    {t('settings.conditions.desc')}
                  </p>
                  <p className="text-[16px] font-black text-blue-950">
                    {t('settings.conditions.availableCount', { n: ALL_CONDITIONS.length })}
                  </p>
                </div>

              {/* ── 分類篩選膠囊 ─────────────────────────────────────
                  ⚠️ 用 flex-wrap 讓膠囊整顆換行，不要用 overflow-x-auto 水平捲動
                     ——長者看不到「右邊還有東西」，會以為只有這幾顆。 */}
              <div className="flex flex-wrap gap-[8px]" role="group" aria-label={t('conditions.filterAria')}>
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
                      {categoryPillLabel(cat, language)}
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
                    {t('conditions.selectedCount', { n: selectedConditions.length })}
                  </h3>
                  {selectedConditions.length === ALL_CONDITIONS.length && (
                    <span className="text-[16px] font-black text-blue-950 bg-blue-100 border border-blue-300 px-[10px] py-[2px] rounded-full whitespace-nowrap shrink-0">
                      {t('conditions.allSelected')}
                    </span>
                  )}
                </div>

                {selectedConditions.length === 0 ? (
                  <p className="text-[16px] font-bold text-slate-700 bg-slate-100 border border-slate-300 rounded-[12px] px-[12px] py-[10px]">
                    {t('conditions.noneHint')}
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
                                  {conditionName(cond.id, language)}
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
                              aria-label={
                                isExpanded
                                  ? t('conditions.collapseAria', {
                                      name: conditionName(cond.id, language),
                                    })
                                  : t('conditions.expandAria', {
                                      name: conditionName(cond.id, language),
                                    })
                              }
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
                                {localizedConditionDescription(cond.id, cond.description, language)}
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
                    {t('conditions.available', { n: unselectedConditions.length })}
                  </h3>
                  {activeCategory === 'allergen' && (
                    <span className="text-[16px] font-black text-white bg-[#A32D2D] px-[10px] py-[2px] rounded-full whitespace-nowrap shrink-0">
                      {t('conditions.critical')}
                    </span>
                  )}
                </div>

                {/* 過敏原區塊標頭：只在「全部」分類且清單內確實有過敏原時出現 */}
                {activeCategory === 'all' && unselectedConditions.some((c) => c.category === 'allergen') && (
                  <div className="flex items-center gap-[8px] flex-wrap bg-[#FCEBEB] border-[1.5px] border-[#A32D2D] rounded-[12px] px-[12px] py-[10px]">
                    <ShieldAlert className="w-[22px] h-[22px] text-[#A32D2D] shrink-0" />
                    <span className="text-[18px] font-black text-[#501313]">
                      {t('conditions.allergenTitle')}
                    </span>
                    <span className="text-[16px] font-bold text-[#791F1F]">
                      {t('conditions.allergenHint')}
                    </span>
                  </div>
                )}

                {unselectedConditions.length === 0 ? (
                  <p className="text-[16px] font-bold text-slate-700 bg-slate-100 border border-slate-300 rounded-[12px] px-[12px] py-[10px]">
                    {activeCategory === 'all'
                      ? t('conditions.allChosen')
                      : t('conditions.categoryAllChosen')}
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
                                    {conditionName(cond.id, language)}
                                  </span>
                                </div>
                                {/* 後果等級用文字明說，避免長者以為過敏原只是「注意一下」 */}
                                {isAllergen && (
                                  <span
                                    className={`text-[16px] font-black whitespace-nowrap ${
                                      severity === 'mild' ? 'text-[#854F0B]' : 'text-[#A32D2D]'
                                    }`}
                                  >
                                    {severity === 'mild'
                                      ? t('conditions.mildReaction')
                                      : t('conditions.severeReaction')}
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
                              aria-label={
                                isExpanded
                                  ? t('conditions.collapseAria', {
                                      name: conditionName(cond.id, language),
                                    })
                                  : t('conditions.expandAria', {
                                      name: conditionName(cond.id, language),
                                    })
                              }
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
                                {localizedConditionDescription(cond.id, cond.description, language)}
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
                    .map((id) => conditionName(id, language))
                    .join(t('common.listSeparator'));
                  const condPart =
                    selectedConditions.length === 0
                      ? t('settings.noConditionsSelected')
                      : selectedConditions.length <= 3
                      ? t('settings.conditionsPreview', { list: preview })
                      : t('settings.conditionsPreviewMore', {
                          n: selectedConditions.length,
                          list: preview,
                        });
                  const text = t('settings.speech', {
                    sys: physicalIndicators.systolicBp,
                    dia: physicalIndicators.diastolicBp,
                    hr: physicalIndicators.heartRate || 72,
                    bs: physicalIndicators.bloodSugar,
                    bsUnit:
                      physicalIndicators.bloodSugarUnit === 'mmol/L'
                        ? t('vitals.speech.unitMmol')
                        : t('vitals.speech.unitMgdl'),
                    condPart,
                  });
                  speakText(text, { preferLanguage: ttsLang });
                }}
                className="w-full min-h-[56px] py-3 px-4 rounded-2xl bg-amber-50 hover:bg-amber-100 text-amber-950 font-black text-[18px] border-3 border-amber-400 flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <Volume2 className="w-6 h-6 text-amber-700 shrink-0" />
                <span>{t('settings.readFull')}</span>
              </button>

              {/* 儲存並前往拍照按鈕 */}
              <button
                type="button"
                id="btn-save-and-scan"
                onClick={() => setActiveTab('scan')}
                className="w-full min-h-[64px] py-3.5 px-5 rounded-2xl bg-blue-900 hover:bg-blue-950 text-white font-black text-[20px] flex items-center justify-center gap-3 shadow-md cursor-pointer active:scale-95 border-3 border-blue-950"
              >
                <Camera className="w-7 h-7 text-yellow-300 shrink-0" />
                <span>{t('settings.done')}</span>
              </button>
              </div>
            </SettingsSection>

            {/* ── 設定頁最下方（2026-09-29 使用者要求）─────────────────
                ① 私隱條款與免責聲明（12px，全站唯一例外）
                ② 清除所有資料（兩級警告 → 清空 → 回引導頁）
                放在最後是因為它們是「法律告知」與「危險操作」，
                不該插在日常設定中間。 */}
            <div className="pt-4 border-t-2 border-slate-300 flex flex-col gap-5">
              <LegalNotice />
              <ClearAllDataSection />
            </div>
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

        {/* ======================================================== */}
        {/* 頁面 5：健康問答（HEALTH Q&A TAB）                        */}
        {/* 2026-09-29 從「設定」搬到功能選單 —— 它是功能，不是設定。  */}
        {/* ======================================================== */}
        {activeTab === 'qa' && (
          <div className="flex flex-col space-y-5">
            <HealthQASection
              indicators={physicalIndicators}
              gender={gender}
              analysisMode={analysisMode}
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
              {t('settings.upgradeTitle')}
            </h2>
            <p className="text-[16px] font-bold text-slate-700 leading-relaxed">
              {t('settings.upgradeBody', { n: ALL_CONDITIONS.length })}
            </p>
            <button
              type="button"
              id="btn-keep-conditions"
              onClick={keepExistingConditions}
              className="w-full min-h-[48px] px-[16px] py-[10px] rounded-[12px] bg-blue-900 hover:bg-blue-950 text-white text-[18px] font-black flex items-center justify-center gap-[8px] cursor-pointer active:scale-95 transition-all"
            >
              <Check className="w-[22px] h-[22px] shrink-0" />
              {t('settings.upgradeKeep')}
            </button>
            <button
              type="button"
              id="btn-reset-conditions"
              onClick={resetToDefaultConditions}
              className="w-full min-h-[48px] px-[16px] py-[10px] rounded-[12px] bg-white hover:bg-slate-100 text-slate-900 text-[18px] font-black border-[1.5px] border-slate-400 flex items-center justify-center gap-[8px] cursor-pointer active:scale-95 transition-all"
            >
              <RotateCcw className="w-[22px] h-[22px] shrink-0" />
              {t('settings.upgradeReselect')}
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
            {loadingPhase === 'reading' ? t('loading.reading') : t('loading.analyzing')}
          </h2>

          {/* 具體的等待預期 + 即時秒數：把「不知道還要多久」變成可掌握的進度 */}
          <p className="text-[16px] font-bold text-slate-300 leading-snug">
            {loadingPhase === 'reading' ? t('loading.localOnly') : t('loading.typical')}
            {loadingSeconds > 0 && (
              <span className="ml-[6px] text-slate-400">
                {t('loading.waited', { n: loadingSeconds })}
              </span>
            )}
          </p>

          {/* 讀取階段就把「照片沒有離開裝置」講出來 —— 這是承諾，也是事實 */}
          {loadingPhase === 'reading' ? (
            <div className="w-full max-w-sm mt-[16px] bg-slate-800 border-[3px] border-emerald-500 rounded-[16px] p-[16px] flex items-center gap-[10px]">
              <ShieldCheck className="w-[28px] h-[28px] text-emerald-400 shrink-0" />
              <p className="text-[18px] font-black text-emerald-300 leading-snug">
                {t('loading.privacyBadge')}
              </p>
            </div>
          ) : isNetworkDelayed ? (
            /* 超市弱訊號安撫卡片（醒目大字 22px，消除長者等待焦慮） */
            <div className="w-full max-w-sm mt-[16px] bg-amber-400 text-slate-950 p-[16px] rounded-[16px] border-[3px] border-yellow-200 shadow-2xl flex flex-col items-center gap-[8px]">
              <div className="flex items-center gap-[8px]">
                <Wifi className="w-[28px] h-[28px] text-slate-950 shrink-0 animate-pulse" />
                <span className="text-[20px] font-black">{t('loading.signalTitle')}</span>
              </div>
              <p className="text-[18px] font-black leading-snug">
                {t('common.weakSignalSpeech')}
              </p>
              <span className="text-[16px] font-bold text-slate-900 bg-amber-300 px-[10px] py-[3px] rounded-full">
                {t('loading.signalBadge')}
              </span>
            </div>
          ) : (
            <p className="text-[16px] font-bold text-yellow-300 mt-[8px]">
              {t('loading.signalSpeech')}
            </p>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 固定在螢幕底部的主要操作按鈕（觸控高度 ≥ 72px，符合無障礙規範） */}
      {/* ======================================================== */}
      <footer className="sticky bottom-0 left-0 right-0 z-30 w-full p-[8px] bg-white/95 backdrop-blur-md border-t-4 border-blue-900 shadow-[0_-8px_25px_rgba(0,0,0,0.2)] min-[520px]:shrink-0">
        {activeTab === 'home' ? (
          /* 主頁的主要動作與頁面中央的大按鈕一致，讓長者不用思考「該按哪一個」。
             2026-09-30 加入相簿入口，與拍照頁一致（見下方 scan 分支的說明）。 */
          <div className="flex items-stretch gap-[8px]">
            <button
              type="button"
              id="btn-home-footer-camera"
              onClick={handleTriggerCamera}
              className={`${FOOTER_CTA_CLASS} flex-1 min-w-0`}
            >
              <Camera className={FOOTER_CTA_ICON} />
              <span>📸 {t('footer.homeCamera')}</span>
            </button>
            <button
              type="button"
              id="btn-home-footer-gallery"
              onClick={handleTriggerGallery}
              aria-label={t('footer.pickFromGallery')}
              className={FOOTER_SECONDARY_CLASS}
            >
              <FileImage className={FOOTER_CTA_ICON} />
              <span>{t('footer.pickFromGallery')}</span>
            </button>
          </div>
        ) : activeTab === 'scan' ? (
          analysisResult ? (
            <button
              type="button"
              id="btn-retake-photo"
              onClick={handleResetToCamera}
              className={FOOTER_CTA_CLASS}
            >
              <RotateCcw className={FOOTER_CTA_ICON} />
              <span>📸 {t('footer.scanRetake')}</span>
            </button>
          ) : (
            /* 兩個入口並排：拍照（主要）＋ 從相簿選（次要）。
               ⚠️ 為什麼一定要有相簿：拍螢幕、拍舊包裝、或使用者已經先拍好照片的情況
                  都很常見；只有 `capture` 的 input 會強制開鏡頭，使用者無從選擇。 */
            <div className="flex items-stretch gap-[8px]">
              <button
                type="button"
                id="btn-one-click-camera"
                onClick={handleTriggerCamera}
                disabled={isLoading}
                className={`${FOOTER_CTA_CLASS} flex-1 min-w-0 disabled:opacity-60`}
              >
                <Camera className={FOOTER_CTA_ICON} />
                <span>📸 {t('footer.scanCamera')}</span>
              </button>
              <button
                type="button"
                id="btn-pick-from-gallery"
                onClick={handleTriggerGallery}
                disabled={isLoading}
                aria-label={t('footer.pickFromGallery')}
                className={`${FOOTER_SECONDARY_CLASS} disabled:opacity-60`}
              >
                <FileImage className={FOOTER_CTA_ICON} />
                <span>{t('footer.pickFromGallery')}</span>
              </button>
            </div>
          )
        ) : activeTab === 'conditions' ? (
          <button
            type="button"
            id="btn-conditions-to-scan"
            onClick={() => setActiveTab('scan')}
            className={FOOTER_CTA_CLASS}
          >
            <Camera className={FOOTER_CTA_ICON} />
            <span>📸 {t('footer.goScan')}</span>
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
            <span>📸 {t('footer.classroomTry')}</span>
          </button>
        ) : activeTab === 'qa' ? (
          <button
            type="button"
            id="btn-qa-to-scan"
            onClick={() => {
              stopSpeech();
              setActiveTab('scan');
            }}
            className={FOOTER_CTA_CLASS}
          >
            <Camera className={FOOTER_CTA_ICON} />
            <span>📸 {t('footer.qaToScan')}</span>
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
            <span>📸 {t('footer.historyScan')}</span>
          </button>
        )}
      </footer>
      </div>
    </>
  );
}
