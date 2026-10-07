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
import { apiUrl } from './utils/apiBase';
import {
  Camera,
  Cloud,
  Volume2,
  Languages as LanguagesIcon,
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
  Dumbbell,
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
  // 字體大小區塊（2026-10-06）。
  // ⚠️ 必須用別名：`Type` 已經被 './theme' 的設計權杖佔用了，
  //    直接匯入會撞名（而且 tsc 會擋下來，不會靜默出錯）。
  Type as TypeIcon,
} from 'lucide-react';
import { LabelAnalysisResult, DietRecord, LearnerProfileId, AnalysisMode } from './types';
import { compressImage } from './utils/imageCompression';
// OCR 在瀏覽器端執行：照片不會離開使用者的裝置，只有讀出的文字會送到後端。
import {
  recognizeLabelTextInBrowser,
  warmUpBrowserOcr,
  preprocessDataUrlForOcr,
  OCR_LANGS_PRIMARY,
  OCR_LANGS_FALLBACK,
} from './ocr/ocrBrowser';
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
  MODE_CHIP_KEY,
  MODE_NOTE_KEY,
  MODE_DATA_KEY,
} from './data/analysisModes';
// 設定頁的可收合區塊（2026-09-28）：整頁原本超過 3 個螢幕高，收合後好找很多。
import { SettingsSection } from './components/SettingsSection';
// 字體大小控制（2026-10-06 使用者指定）：三級，可手動覆寫身分預設值。
import { FontSizeSection } from './components/FontSizeSection';
// 學一個小知識（2026-10-07 使用者指定）：結果頁的「原理 → 自我檢核」卡片。
import { LearnFromScanCard } from './components/LearnFromScanCard';
import {
  loadFontScale,
  saveFontScale,
  resolveDensity,
  defaultFontScale,
  type FontScale,
} from './utils/fontScale';
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
import { speakText, stopSpeech, ttsLanguageFor, loadNativeVoices } from './utils/tts';
import { getTtsSettings } from './utils/ttsSettings';
import { generateSampleLabelDataUrl, DEMO_LABELS } from './data/samples';
import { DietHealthHistory } from './components/DietHealthHistory';
import { HealthQASection } from './components/HealthQASection';
import { OnboardingFlow, type OnboardingResult } from './components/OnboardingFlow';
import { FoodEdClassroom } from './components/FoodEdClassroom';
import { FitnessZone } from './components/FitnessZone';
import { LearnerProfilePicker } from './components/LearnerProfilePicker';
import { LegalNotice } from './components/LegalNotice';
import { ClearAllDataSection } from './components/ClearAllDataSection';
import { AnalysisModePicker } from './components/AnalysisModePicker';
import {
  TtsVolumeSection,
  TtsVoiceLangSection,
} from './components/TtsSettingsSection';
import { DeveloperPanel } from './components/DeveloperPanel';
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
export type NavigationTab =
  | 'home'
  | 'scan'
  | 'conditions'
  | 'history'
  | 'classroom'
  | 'qa'
  /** 健身專區（2026-10-02）。只有在身分＝健身人士時才會出現在選單。 */
  | 'fitness';

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
  {
    /**
     * 健身專區（2026-10-02 使用者指定）。
     *
     * ⚠️ **只有身分＝健身人士時才顯示**（見下方 MENU_ITEMS 的過濾）。
     *    理由：對其他 6 種身分來說，「組數／次數／休息」是純噪音 ——
     *    本專案的原則之一是「不要在頁面上有不用給用戶看的字」。
     *
     * 放在最後（設定之前）是因為它與其他功能是**並列的功能**，
     * 但使用頻率低於拍照與紀錄。
     */
    tab: 'fitness',
    labelKey: 'menu.fitness',
    hintKey: 'menu.fitness.hint',
    Icon: Dumbbell,
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
/**
 * 「其他（自行填寫）」的自填病症名稱（2026-10-06 使用者指定新增）。
 *
 * 【為什麼要跟前綴一起看】
 *   送出時會組成「其他：<自填內容>」——
 *   那個前綴是**後端認得出來的記號**：
 *   `server/conditionAdvice.ts` 的 `keys: ['其他']` 靠它給出一句誠實的提醒
 *   （「這一項本機無法把關」），而不是落到通用提醒 + 每次請求都留一筆 console.warn。
 *
 * ⚠️ 空字串**不會**被送出（見下方 `conditionNames`）——
 *    勾了卻沒填字等於什麼都沒說，送「其他」給模型只會得到幻覺。
 */
const STORAGE_CUSTOM_CONDITION_KEY = 'labelbuddy_custom_condition_v1';
/** 自填病症送出時的前綴（**必須與 conditionAdvice.ts 的 keys 對得上**）。 */
const CUSTOM_CONDITION_PREFIX = '其他：';
const STORAGE_DIET_RECORDS_KEY = 'labelbuddy_diet_records_v1';
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
/**
 * OCR 模式的縮圖上限（2026-10-03 由 1024 提高到 1600）
 *
 * ★【為什麼提高】使用者回報「本機 OCR 識別完全不行」。
 *   實測比對後確認：**表格在畫面裡佔多大，比引擎參數更能決定成敗**。
 *   真實情境是「拍整個包裝」，營養表可能只佔畫面 1/4；
 *   縮到 1024px 之後，表格裡的小字只剩幾像素高 —— 那不是引擎的問題，是解析度不夠。
 *   提高之後，同樣的構圖會多出 2.4 倍像素，字才有機會被讀出來。
 *
 * ⚠️ 代價：tesseract 的時間與像素數成正比，手機上會明顯變慢。
 *    但「讀得到但慢」遠勝「快但讀不到」——
 *    更何況本機的兩個模式不上傳照片，慢不會吃任何網路費用。
 */
const IMAGE_MAX_DIM_OCR = 1600;

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
 * ★ 2026-10-02 使用者指定：**刪除性別與稱謂機制**。
 *
 * 原本這裡有一個儲存鍵 `labelbuddy_gender_v1`（先生／小姐／不指定），
 * 以及一整套對應的後處理（`applyHonorific*`、`buildAddressRule`）。
 * 全部移除，理由與代價：
 *   ① App 的核心是「這包能不能買」，問性別對這個判斷沒有任何貢獻。
 *   ② 「先生／小姐」在中文是二元假設，對不想回答的人是一種為難。
 *   ③ **代價**：AI 回饋不再有稱謂。但 neutral 的「您好」本來就是預設 ——
 *      舊使用者的體驗不會變差，只是不再出現「先生您好」。
 *   ④ 「不可用長輩稱呼」「你一律寫成您」這兩條規則**保留**
 *      （見 server/core.ts 的 ADDRESS_RULE）—— 那是安全與禮貌規則，與性別無關。
 *
 * ⚠️ 舊的 `labelbuddy_gender_v1` 不需要特別刪除 ——
 *    「清除所有資料」是前綴掃描（`startsWith('labelbuddy')`），它會被一起清掉；
 *    而程式碼已不再讀取它，留著也不會影響任何行為。
 */

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
   * ⚠️ 2026-10-02：判斷本身抽到 `ttsLanguageFor()`（`utils/tts.ts`）。
   *    原因：上一次只改了這個檔案，另外三個元件仍寫死國語，
   *    *而且不會報錯* —— 只有真的聽才會發現。集中之後就不可能漏改。
   *
   * ⚠️ 英文模式要換成英文語音，否則會用中文腔念英文句子 ——
   *    決賽的英文 Demo 影片會很難聽。
   */
  const ttsLang = ttsLanguageFor(language);

  /**
   * 0. 學習者身分：決定 AI 的判斷基準（每日參考值）與學堂內容排序。
   *    未選擇或儲存值損毀時，安全退回「長者」，與舊版行為一致。
   */
  /**
   * ★ 2026-10-02：**舊身分 id 的遷移**。
   *
   * 【為什麼一定要有這一段】
   *   身分 id 會存進使用者的裝置。2026-10-02 把 `takeout`（年輕人）
   *   改名為 `young`（青年）—— 若不做遷移，舊使用者裝置裡的 `'takeout'`
   *   會被 `isValidProfileId()` 判為無效，然後**靜默退回「長者」**：
   *   鈉上限從 2000 變成 1500、字級突然放大、教材排序也變了，
   *   而畫面上只會顯示「長者」—— 使用者不會知道為什麼。
   *   ★ 通則：**改儲存值的時候，一定要同時寫遷移。**
   */
  const LEGACY_PROFILE_IDS: Record<string, LearnerProfileId> = {
    takeout: 'young',
  };

  const [learnerProfileId, setLearnerProfileId] = useState<LearnerProfileId>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_PROFILE_KEY);
        if (saved && LEGACY_PROFILE_IDS[saved]) return LEGACY_PROFILE_IDS[saved];
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
    /**
     * ★ 身分變了，語音的**預設值**要跟著重算（2026-10-03）。
     *
     * 例：使用者本來是「青年」（預設關閉），改成「長者」之後應該自動開啟 ——
     * 否則長者會遇到「設定裡明明有語音，卻沒有聲音」。
     * ⚠️ 但**手動改過開關的人不受影響**（touched 旗標，見 ttsSettings.ts）。
     */
    setTtsSettingsState(getTtsSettings(id));
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
   * ★ 2026-10-02：`handleChangeGender` 已隨性別機制一併移除。
   *   （舊的 `labelbuddy_gender_v1` 仍可能留在使用者裝置上，
   *     但程式已不再讀寫它；「清除所有資料」的前綴掃描會一併清掉。）
   */

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
    /**
     * ⚠️ 2026-10-02 使用者指定：**預設什麼也不勾**。
     *
     * 【原本錯在哪】
     *   這裡寫死四個最常見的慢性病與過敏原
     *   （高血壓／糖尿病／腎臟病／花生過敏）。
     *   看起來像「貼心的預設值」，實際上是**替使用者做健康宣告** ——
     *   而這是錯的，而且很危險：
     *     - 使用者沒高血壓，卻被預設勾了 → 每次掃描都被用「低鈉」標準判斷，
     *       得到不屬於他的警告，久了就學會忽略警告（警告疲乏）
     *     - 使用者真的對花生過敏，卻以為那是「系統示範」而沒去確認
     *     - 長者可能根本沒注意到自己被勾了什麼
     *   慢性病與過敏是**必須由本人確認**的資訊，不能猜。
     *
     * 【改成空的之後】
     *   引導頁第 3 頁會是全部未勾選，使用者自己決定。
     *   掃描時沒有勾選任何項目 → 只做一般的營養判斷，不做個人化把關。
     */
    return [];
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
    analysisMode: chosenMode,
    conditions: chosenConditions,
  }: OnboardingResult) => {
    setLearnerProfileId(profileId);
    setAnalysisMode(chosenMode);
    setSelectedConditions(chosenConditions);
    setOnboarded(true);

    try {
      localStorage.setItem(STORAGE_PROFILE_KEY, profileId);
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

  /**
   * 「其他（自行填寫）」的自填病症名稱（2026-10-06）。
   *
   * ⚠️ 它**不進 `selectedConditions`** —— 那是一組固定的 id，
   *    存自填文字進去會讓 `VALID_CONDITION_IDS` 的舊版偵測誤判
   *    （見上方遷移邏輯：只要出現非法 id 就會跳遷移提示）。
   *    所以自填文字有自己的一個鍵。
   */
  const [customCondition, setCustomCondition] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_CUSTOM_CONDITION_KEY) ?? '';
    } catch {
      return '';
    }
  });

  /** 自填病症的輸入處理。立即寫入儲存 —— 沒有「儲存」按鈕，長者不會記得按。 */
  const handleChangeCustomCondition = (text: string) => {
    setCustomCondition(text);
    try {
      localStorage.setItem(STORAGE_CUSTOM_CONDITION_KEY, text);
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
  //
  // ⚠️ 2026-10-02 使用者指定：**整個「日常生理指標」區塊移除**。
  //
  // 移除的理由（不只是「用不到」）：
  //   ① 這是 App 裡**唯一會收集醫療數值**的地方，而它與「超市食品標籤」的
  //      核心定位無關 —— 使用者要判斷的是「這包能不能買」，不是「我的血壓多少」。
  //   ② `handleUpdateIndicators` 會**依血壓／血糖自動勾選高血壓／糖尿病**。
  //      那是替使用者做了一個他沒說的健康宣告（本專案已列為反模式）。
  //   ③ 資料流有四條（掃描請求的 vitals、健康問答的背景、設定朗讀稿、
  //      儲存鍵），刪一處留三處等於承諾與行為不一致。
  //
  // 一併移除的資料流見下方 `vitals`（掃描請求）、`settings.speech`（朗讀稿）、
  // `HealthQASection` 的 indicators prop，以及本元件的 physicalIndicators state。
  // 後端 `/api/analyze-indicators` 與其本機引擎**保留**（`check:mode` 直接測它，
  // 且它是「斷網後備」的證明），但已無前端呼叫者。

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

  /**
   * 語音朗讀設定（2026-10-03）。
   *
   * ⚠️ 這個 state 必須存在 —— 設定頁的收合摘要要顯示「開／關 ＋ 音量」，
   *    而語音有沒有聲音是使用者最需要一眼確認的事。
   */
  const [ttsSettings, setTtsSettingsState] = useState(() => getTtsSettings());

  /* ── 開發者面板的隱藏入口（2026-10-03）──────────────────────────
     連點「LabelBuddy AI」主標 7 下。
     ⚠️ 點擊計數一定要有**時間窗**（這裡 2 秒）——
        沒有時間窗的話，使用者分三天各點幾下也會打開。
     ⚠️ 用 ref 而不是 state 存計數：state 會讓每次點擊都重新渲染整個 App，
        點 7 下就是 7 次全樹重繪（畫面會閃）。 */
  const [devPanelOpen, setDevPanelOpen] = useState(false);
  const [devTapRemaining, setDevTapRemaining] = useState(0);
  const devTapRef = useRef(0);
  const devTapTimerRef = useRef<any>(null);

  const handleTitleTap = () => {
    devTapRef.current += 1;
    if (devTapTimerRef.current) clearTimeout(devTapTimerRef.current);
    // 2 秒內沒有下一點就重新算
    devTapTimerRef.current = setTimeout(() => {
      devTapRef.current = 0;
      setDevTapRemaining(0);
    }, 2000);

    const left = 7 - devTapRef.current;
    if (left <= 0) {
      devTapRef.current = 0;
      setDevTapRemaining(0);
      setDevPanelOpen(true);
      return;
    }
    // 只在剩下 3 下以內才顯示提示（避免隨手點幾下就洩漏入口）
    setDevTapRemaining(left <= 3 ? left : 0);
  };

  /**
   * 本機 OCR **引擎**載入失敗（2026-10-02）。
   *
   * ⚠️ 這跟「照片拍不好」是完全不同的兩件事，必須分開處理：
   *    引擎要下載約 6.4 MB（語言模型＋WASM），超市弱訊號下會失敗。
   *    舊版把這種情況也說成「請重拍」，使用者就一直重拍。
   *    → 這個旗標讓畫面上出現「重試」而不是「重拍」。
   */
  const [ocrEngineFailed, setOcrEngineFailed] = useState<boolean>(false);

  /**
   * 是否顯示「改用雲端讀取」的備援按鈕（2026-10-03）。
   *
   * 【為什麼要有這個】
   *   使用者實測：「我拍的照片上雲端也可以精準識別」——
   *   也就是說照片與伺服器端都沒問題，只有**手機上的本機 OCR** 讀不出來。
   *   而我在電腦瀏覽器上怎麼測都正常，無法重現。
   *
   *   在還沒找出真正原因之前，讓使用者卡在「一直重拍」是不合理的 ——
   *   給他一個**明示同意**的出路：用雲端讀這張照片。
   *   ⚠️ 這必須是使用者自己按的，而且按鈕上要寫明「照片會上傳」——
   *      本機模式的承諾就是「照片不離開裝置」，
   *      偷偷上傳就變成我們自己違背承諾（這種 bug 本專案已經踩過）。
   */
  const [cloudFallbackOffered, setCloudFallbackOffered] = useState<boolean>(false);
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
  /** 是否已走完引導頁。false 時覆蓋整個畫面。 */
  const [onboarded, setOnboarded] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_ONBOARDED_KEY) === 'true';
    } catch {
      return false;
    }
  });
  /**
   * ★ 2026-10-06：使用者**手動選的**字體大小。
   *
   * 【`null` 代表「沒選過」—— 這個區分很重要】
   *   沒選過 → 依身分自動（長者＝大、其他＝小），與改動前的行為完全一致。
   *   選過   → 就固定在使用者選的那一級，不再跟著身分跑。
   *   若這裡直接填預設值，長者一進設定頁就會被當成「已手動選過」，
   *   之後換身分字級不會跟著變 —— 那是一個不會報錯的 bug。
   *
   * ⚠️ 推導邏輯在 `utils/fontScale.ts`，不在這裡 ——
   *    寫在元件裡就沒辦法單獨驗證。
   */
  const [fontScaleManual, setFontScaleManual] = useState<FontScale | null>(loadFontScale);
  /** 目前**實際生效**的級別（給設定頁的三顆按鈕標示選中狀態）。 */
  const effectiveFontScale: FontScale = fontScaleManual ?? defaultFontScale(learnerProfileId);

  /** 使用者按下「小／中／大」。存檔與套用分開：state 立即生效，儲存只影響下次開啟。 */
  const handleChangeFontScale = (scale: FontScale) => {
    setFontScaleManual(scale);
    saveFontScale(scale);
  };

  /**
   * 套用字級：手動值優先，沒有才依身分。
   *
   * 【為什麼寫在 <html> 上而不是包一層 div】
   *   縮放規則要蓋過全 App 的字級工具類，寫在根元素最不容易漏掉
   *   （側邊選單、彈窗、引導頁都是 fixed 定位，包 div 蓋不到）。
   *   實際的 px 對應在 index.css，這裡只負責切換屬性。
   *
   * ⚠️ 這裡刻意**只看身分，不看年齡** —— 我們沒有使用者的年齡資料，
   *    而「長者」這個身分本身就代表需要大字。
   */
  useEffect(() => {
    document.documentElement.setAttribute(
      'data-density',
      resolveDensity(learnerProfileId, fontScaleManual)
    );
  }, [learnerProfileId, fontScaleManual]);
  const latencyTimerRef = useRef<NodeJS.Timeout | null>(null);
  const loadingTickRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * ★★ 2026-10-02：**預熱本機 OCR 引擎。**
   *
   * 【為什麼這一行是修好「本機兩個模式掃不到」的關鍵之一】
   *   `warmUpBrowserOcr()` 存在很久了，但**從來沒有任何地方呼叫它**
   *   （是死匯入）。後果是：引擎要下載的 6.4 MB
   *   （中文語言模型 2.37 MB ＋ WASM 核心約 4 MB ＋ worker）
   *   **在使用者按下快門的那一刻才開始下載**。
   *
   *   超市是訊號最差的地方 —— 那正是使用者要掃標籤的地方。
   *   下載失敗 → `createWorker()` 拋錯 → OCR 失敗 → App 說「請重拍」，
   *   於是使用者一直重拍，而照片從來沒問題。
   *
   * 【為什麼挑「完成引導頁之後」才預熱】
   *   引導頁是第一次使用、還不知道要不要用這個 App 的階段，
   *   那時就抓 6.4 MB 對行動網路不禮貌。
   *   走完引導頁＝已經決定要用 → 這時候預熱最合理，
   *   而且使用者在看首頁、走向貨架的時間就下載完了。
   *
   * 【為什麼只用 `hasKey` 這種條件不寫在這裡】
   *   三個模式裡有兩個需要它（只送文字／只在本機）；「直接雲端」不需要，
   *   但使用者在流程中隨時可能改模式 —— 所以一律預熱。
   */
  useEffect(() => {
    if (!onboarded) return;
    warmUpBrowserOcr();
  }, [onboarded]);

  /**
   * ★★ 2026-10-03：把「目前身分」餵給語音設定。
   *
   * 【為什麼一定要有這個 effect】
   *   語音的預設值依身分決定（長者開、其他關），但**設定模組本身不知道身分**——
   *   它只在有人帶身分呼叫它時才知道。而 App 先前只在 `handleChangeProfile`
   *   （使用者主動切換身分）時才帶身分呼叫。
   *
   *   後果：**首次載入時沒有任何呼叫帶身分** → 預設值判斷失去依據 →
   *   實測就變成「非長者也預設有聲」（使用者回報的現象）。
   *   → 這個 effect 在掛載時、以及身分每次變動時都重算一次。
   *
   * ⚠️ 不能只在 handleChangeProfile 裡做 —— 那條路只在「使用者主動切換」時走，
   *    從 localStorage 還原身分的那條路不會經過它。
   */
  useEffect(() => {
    setTtsSettingsState(getTtsSettings(learnerProfileId));
  }, [learnerProfileId]);

  // 檢查雲端 AI 服務狀態
  // 【重要】必須以 hasKey 為判斷依據：/api/ai-status 只要伺服器存活就會回 status: 'ok'，
  // 若誤用 status 判斷，會在沒有金鑰、實際走本機備援引擎時仍顯示「已連線」，對長者形成誤導。
  useEffect(() => {
    fetch(apiUrl('/api/ai-status'))
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

  /**
   * 最近一次選取／拍攝的原始檔。
   *
   * ★ 2026-10-02：本機 OCR 失敗時要「用更高解析度重試一次」，
   *   而重試必須從**原檔**重新編碼（把已縮圖的結果放大只會放大模糊）。
   */
  const lastPhotoFileRef = useRef<File | null>(null);

  /**
   * 本機 OCR 兩階段執行。
   *
   * 第一輪：1024px（快）
   * 第二輪：只在第一輪「讀到的內容明顯不足」時才跑 ——
   *         1440px ＋ 灰階對比拉伸。
   *
   * 【為什麼是「不足才跑」而不是一律高解析度】
   *   tesseract 的時間與像素數成正比，手機上很有感。
   *   常態路徑不該為少數難例付出兩倍時間。
   */
  /**
   * 本機 OCR 兩階段執行（2026-10-03 改版）。
   *
   * 第一輪：1600px ＋ 灰階對比拉伸
   * 第二輪：1600px，**不**做前處理
   *
   * ★【為什麼第二輪是「換一種處理」而不是「放大更多」】
   *   重試的價值在於「換一個會失敗的地方」。
   *   同一個解析度再放大，是拿同一條路再走一次，成功機率提升有限；
   *   而前處理對**大多數**真實照片有幫助，但對「本來對比就很夠」的照片
   *   反而可能把雜訊一起拉大 —— 所以第二輪改跑未處理的版本，
   *   讓兩輪各自涵蓋一種情況。
   */
  const runBrowserOcr = async (attempt: 1 | 2) => {
    const file = lastPhotoFileRef.current;
    if (!file) return null;
    const compressed = await compressImage(file, IMAGE_MAX_DIM_OCR, 0.9);
    const input = attempt === 1 ? await preprocessDataUrlForOcr(compressed.base64) : compressed.base64;

    /**
     * ★★ 兩輪**同時換語言模型**（2026-10-04 實測後加入）。
     *
     * 實測（模擬實拍的英文標籤）：
     *   只有 chi_tra    → `Protein` 讀成 `Protean`、小數點全部消失（6.80 → 680）
     *   chi_tra+eng     → 英文字與小數點都正確
     * 實測（模擬實拍的**中文**標籤）：
     *   只有 chi_tra    → `大卡`、`公克` 正確
     *   chi_tra+eng     → `大卡` 變 `x +`、`公克` 變 `公交`（解譯器靠這些關鍵字抓數值！）
     *
     * → 沒有一個設定全贏。所以第一輪用涵蓋中英混排的組合，
     *   第二輪換成純中文的組合 —— 讓兩輪各自有「非重複」的價值。
     */
    const langs = attempt === 1 ? OCR_LANGS_PRIMARY : OCR_LANGS_FALLBACK;
    return recognizeLabelTextInBrowser(input, langs);
  };

  /**
   * 重新分析同一張照片（2026-10-02）。
   *
   * 【為什麼需要這顆按鈕】
   *   本機 OCR 引擎載入失敗時，**正確的動作是「重試」而不是「重拍」**。
   *   引擎要下載 6.4 MB，第一次失敗很可能是當下網路不穩 ——
   *   同一張照片再試一次就有機會成功。
   *   舊版只給「重拍」的建議，等於叫使用者做一件沒有用的事。
   */
  /**
   * 改用「直接雲端」讀同一張照片並重跑（2026-10-03）。
   *
   * ⚠️ 這裡是**明確切換使用者的分析模式**，不是暫時繞過 ——
   *    因為「這一張用雲端、下一張又回到本機」會讓隱私設定變得不可預測。
   *    按鈕上已寫明會記住這個設定（見 scan.cloudFallbackHint）。
   */
  const handleUseCloudFallback = async () => {
    setCloudFallbackOffered(false);
    setOcrEngineFailed(false);
    handleChangeAnalysisMode('cloud_image');
    // handleChangeAnalysisMode 只更新 state，這裡需要等它生效後才重跑，
    // 所以直接帶著新模式往下走（重新壓縮 → 送雲端）
    const file = lastPhotoFileRef.current;
    if (!file) return;
    const compressed = await compressImage(file, IMAGE_MAX_DIM_CLOUD, 0.8);
    setPreviewImage(compressed.base64);
    // ⚠️ 不能呼叫 handleRetryAnalysis：它讀的是舊的 analysisMode state
    await sendImageForAnalysis(compressed.base64, 'cloud_image');
  };

  const handleRetryAnalysis = async () => {
    const file = lastPhotoFileRef.current;
    if (!file) return;
    // 其餘的狀態重置（isLoading／秒數計時／errorMessage…）都在
    // sendImageForAnalysis 的開頭統一處理，這裡不重複。
    setOcrEngineFailed(false);
    // 引擎可能剛剛才失敗，這裡順便再預熱一次
    warmUpBrowserOcr();
    const compressed = await compressImage(
      file,
      analysisMode === 'cloud_image' ? IMAGE_MAX_DIM_CLOUD : IMAGE_MAX_DIM_OCR,
      0.8
    );
    setPreviewImage(compressed.base64);
    await sendImageForAnalysis(compressed.base64);
  };

  /**
   * 成份表範例圖（2026-10-03）。
   *
   * ⚠️ 用 useMemo 而不是每次渲染都畫 —— canvas 繪圖是同步的，
   *    放在 render 裡會讓每次 state 變動都重畫一次（打字、計時器都會觸發）。
   * ⚠️ 語言是依賴項：切換介面語言時必須重畫，否則會出現
   *    「介面英文、範例圖中文」的不一致。
   */
  const exampleLabelImage = React.useMemo(() => {
    const demo = DEMO_LABELS[language === 'en' ? 'en' : 'zh-TW'];
    return generateSampleLabelDataUrl(
      demo.ramen.title,
      demo.ramen.details,
      language === 'en' ? 'en' : 'zh-TW'
    );
  }, [language]);

  // 處理相機拍攝或選取的相片
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 清空 input 避免重複選取同一檔案時不觸發
    event.target.value = '';

    try {
      /**
       * ★ 2026-10-02：把原始檔留下來。
       *
       * 【為什麼需要】本機 OCR 失敗時要用**更高解析度 ＋ 前處理**重試一次，
       *   而重試必須從原檔重新編碼 —— 拿已經縮到 1024px 的結果再放大，
       *   只會把模糊一起放大，沒有任何資訊上的好處。
       */
      lastPhotoFileRef.current = file;

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
  /**
   * @param modeOverride 覆寫分析模式（2026-10-03 新增）。
   *   ⚠️ 為什麼需要：`handleUseCloudFallback` 會在**同一次事件**裡
   *      先切模式、再立刻重跑分析。但 React 的 setState 是非同步的 ——
   *      此刻讀 `analysisMode` 拿到的仍是舊值，於是「明明按了改用雲端，
   *      卻還是走本機 OCR」，而且不會報錯。
   *   → 讓呼叫端明確把要用的模式帶進來，不要依賴 state 已經更新。
   */
  const sendImageForAnalysis = async (base64Data: string, modeOverride?: AnalysisMode) => {
    const mode: AnalysisMode = modeOverride ?? analysisMode;
    setActiveTab('scan');
    setIsLoading(true);
    setIsNetworkDelayed(false);
    setErrorMessage(null);
    setAnalysisResult(null);
    setAutoDowngraded(false);
    setCloudFallbackOffered(false);

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
     *
     * ★ 2026-10-06：「其他（自行填寫）」在此展開成「其他：<自填內容>」。
     *   - 有填字 → 送出去（後端會納入 AI 提示詞，並自動進入快取鍵）
     *   - 沒填字 → **整個項目不送出**。送一個空的「其他」給模型，
     *     它只會自己編一個病症出來 —— 那正是本專案最想避免的幻覺。
     */
    const conditionNames = selectedConditions.flatMap((id) => {
      if (id === 'other') {
        const typed = customCondition.trim();
        return typed ? [`${CUSTOM_CONDITION_PREFIX}${typed}`] : [];
      }
      return [conditionName(id, 'zh-TW')];
    });

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
      const response = await fetch(apiUrl('/api/analyze-label'), {
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
          // ★ 2026-10-02：不再傳 `gender`（性別與稱謂機制已移除）。
          localOnly: mode === 'local_only',
          // ⚠️ 2026-10-02：不再附帶 `vitals`（血壓／心跳／血糖）。
          //    設定頁的生理指標區塊已移除，App 不再收集醫療數值 ——
          //    若這裡還留著，就會把「預設值」當成使用者的真實數據送給模型，
          //    等於用假數字去污染判斷，而且**畫面完全看不出來**。
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
      if (mode === 'cloud_image') {
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

        ocr = await runBrowserOcr(1);

        /**
         * ★★ 2026-10-02：**引擎失敗與照片失敗要分開講。**
         *
         * 【為什麼這是本次最重要的修正】
         *   「只送文字」與「只在本機」兩個模式都必須靠瀏覽器 OCR。
         *   而它最常見的失敗原因**不是照片**，是引擎載入不了 ——
         *   語言模型 2.37 MB ＋ WASM 約 4 MB 要在當下載完。
         *   舊版遇到這種情況照樣送去後端，後端只能回
         *   「看不清楚標籤數字，請重拍」，於是使用者**一直重拍而照片從來沒問題**。
         *   這正是使用者回報的「影得多好也不行」。
         *
         *   → 引擎失敗時：**不送後端**、不叫使用者重拍，
         *     直接說「辨識引擎沒有載入成功」並給一顆重試鈕。
         */
        if (ocr && !ocr.ok && ocr.errorKind === 'engine') {
          setOcrEngineFailed(true);
          setCloudFallbackOffered(analysisMode !== 'cloud_image');
          setErrorMessage(t('scan.errEngineNotFound'));
          speakText(t('scan.errEngineNotFound'), { rate: 0.88, preferLanguage: ttsLang });
          setAnalysisResult(null);
          return;
        }

        setLoadingPhase('analyzing');
        // AI 分析狀態語音提示：「正在為您分析」
        speakText(t('scan.analyzing'), { rate: 0.88, preferLanguage: ttsLang });
        // 「只在本機」不連網，所以不需要安撫等待
        if (mode !== 'local_only') armLatencyTimer();

        // 【只送文字，不送照片】`ocrText` 是空的代表沒讀到字，
        // 後端會回「請重拍」，我們不在前端自行捏造結果。
        data = await postAnalyzeLabel({
          ocrText: ocr?.ok ? ocr.text : '',
          // OCR 失敗的原因只在瀏覽器 console 留紀錄，不打擾使用者
          ocrError: ocr?.ok ? undefined : ocr?.error,
        });

        /**
         * ★ 兩階段重試：後端說「讀到的數字不夠」時，用
         *   1440px ＋ 灰階對比拉伸再讀一次。
         *
         * 【為什麼不是一開始就用高解析度】
         *   本機模式不上傳照片，放大不吃網路，但 tesseract 的時間與像素數
         *   成正比 —— 手機上很有感。常態路徑不該為少數難例付兩倍時間。
         *
         * ⚠️ 只在「文字模式」重試。`cloud_image` 的結果是視覺模型給的，
         *    跟本機 OCR 無關，重試沒有意義。
         */
        if (data?.ocr_failed) {
          const second = await runBrowserOcr(2);
          if (second?.ok && second.text.trim().length > (ocr?.text.trim().length ?? 0)) {
            const retried = await postAnalyzeLabel({ ocrText: second.text });
            // 只有真的變好才採用（避免重試反而把結果弄差）
            if (retried && !retried.ocr_failed) {
              data = retried;
              ocr = second;
            }
          }
        }
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
        // 本機讀不到就去問使用者要不要改用雲端（不自動切換，見 cloudFallbackOffered 的說明）
        if (analysisMode !== 'cloud_image') setCloudFallbackOffered(true);
        if (data.plain_summary) {
          speakText(data.plain_summary, {
            rate: 0.88,
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
          <div className="flex flex-wrap items-center justify-between w-full gap-[8px]">
          <div className="flex items-center gap-[8px] min-w-0">
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

            {/* ⚠️ 2026-10-02：`min-w-0` 改成 `shrink-0`。
                原本是 `min-w-0`（允許被壓縮）＋ `whitespace-nowrap`（不准折行）
                —— 這兩個加起來的結果是：flex 把標題壓到 111px，
                但文字在長者字級（20px→24px）需要 159px，
                於是**文字直接溢出框外 48px**，壓到右邊的狀態標籤上。
                （實測：長者模式下每個畫面都有這一筆，共 24 個畫面。）
                ★ 通則：`min-w-0` ＋ `nowrap` ＝ 溢出。要嘛讓它折，要嘛別壓縮它。 */}
            {/* ★ 2026-10-02：加上中文副標「營養放大鏡」。
                ⚠️ 用 flex-col「疊」在標題下方，**不是並排** ——
                   並排會把標題列寬度撐爆（那正是先前溢出 48px 的原因）。
                   疊起來的話，欄寬仍由 'LabelBuddy AI' 決定（長者字級 159px），
                   副標只有 5 個字（約 95px），不會改變任何寬度。
                ⚠️ 英文模式副標是空字串，用守衛避免渲染空元素。 */}
            {/* ★ 2026-10-03：主標連點 7 下進入開發者面板（使用者指定）。
                ⚠️ 用 <h1 onClick> 而不是包一個 <button>：
                   包成按鈕會讓它變成可見的互動元素（focus ring、hover 效果、
                   讀屏軟體會念成按鈕），那就不是隱藏手勢了。
                   鍵盤使用者仍可用下面抽屜裡的入口（見 devHint）。 */}
            <div className="flex flex-col min-w-0">
              <h1
                id="app-title"
                onClick={handleTitleTap}
                className="text-[20px] font-black text-blue-950 tracking-tight whitespace-nowrap shrink-0 leading-tight select-none"
              >
                LabelBuddy AI
              </h1>
              {t('app.nameZh') && (
                <span className="text-[16px] font-black text-blue-700 leading-tight">
                  {t('app.nameZh')}
                </span>
              )}
            </div>
          </div>

          {/* 連點提示：只在已經按了 4 下之後才出現。
              這樣「不小心按到幾下」不會洩漏入口，但真的在按的人不會數錯。 */}
          {devTapRemaining > 0 && (
            <p className="text-[15px] font-bold text-blue-800 bg-blue-50 border border-blue-300 rounded-lg px-[8px] py-[2px]">
              {t('dev.tapMore', { n: devTapRemaining })}
            </p>
          )}

          {/* 目前分析模式的小標籤（右上角）
              ⚠️ 360px 寬（16:9 手機）下這裡極容易折行，故字級與內距都收斂並強制不換行
              ⚠️ 字級地板 16px：此處已是全站最小，不可再往下
              ⚠️ 2026-10-02：文案由「雲端 AI 已連線」縮成「雲端 AI」。
                 長者字級下標題需要 159px，原本的標籤要 147px，
                 兩者加起來 370px > 可用的 328px → 一定溢出。
                 縮短標籤後總寬 316px，留 12px 餘裕。

              ★★ 2026-10-04 使用者回報：這個標籤**永遠顯示「雲端 AI」**，
                 不管選了哪個模式。使用者是對的 —— 原本顯示的是
                 `geminiConnected`（連線狀態），**與分析模式完全無關**：
                   `{geminiConnected ? t('app.statusCloud') : t('app.statusLocal')}`
                 只要連得到伺服器就永遠寫「雲端 AI」，
                 連選「只在本機」也照樣顯示 —— 這對一個**隱私指示器**來說
                 是最糟的錯誤（使用者會以為照片被上傳了，或反之）。

              → 改為顯示**目前的模式**（`MODE_CHIP_KEY[analysisMode]`）。
                 ⚠️ 另外定義 `MODE_CHIP_KEY` 而不是重用 `MODE_LABEL_KEY`：
                    後者的 cloudText 是「本機圖像識別」（7 字），
                    塞不進這個只有約 9 字餘裕的標籤，會直接把標題列撐爆。
                 ⚠️ 圓點顏色改為反映**這個模式的隱私行為**：
                    只在本機＝綠、其餘＝藍；雲端模式若連不上則轉灰
                    （保留原本「離線」的訊號，但不再用它決定文字）。 */}
          <div className="flex items-center gap-[4px] px-[8px] py-[3px] rounded-full bg-slate-100 border border-slate-300 text-[16px] font-extrabold text-slate-700 whitespace-nowrap shrink-0">
            <span
              className={`w-[7px] h-[7px] rounded-full shrink-0 ${
                analysisMode === 'local_only'
                  ? 'bg-emerald-500'
                  : geminiConnected
                    ? 'bg-blue-500 animate-pulse'
                    : 'bg-slate-400'
              }`}
            />
            <span>{t(MODE_CHIP_KEY[analysisMode])}</span>
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
            </div>          </div>

          <div className="flex-1 overflow-y-auto p-[10px] flex flex-col gap-[8px]">
            {MENU_ITEMS.filter(
              /**
               * ★ 2026-10-02：健身專區只在身分＝健身人士時出現。
               *
               * 【為什麼不把條件寫進 MENU_ITEMS 常數】
               *   MENU_ITEMS 是**模組層常數**，在模組載入時算一次 ——
               *   它看不到 `learnerProfileId` 這個 state。若寫在那裡，
               *   使用者切換身分後選單不會更新（而且**不會報錯**）。
               *   放在 render 裡過濾才會跟著 state 即時重算。
               */
              (item) => item.tab !== 'fitness' || learnerProfileId === 'fitness'
            )
              /**
               * ★ 2026-10-04 使用者指定：**健身專區放在「飲食紀錄」下面**。
               *
               * （10-03 一度要求放到第一欄，10-04 改為緊接在飲食紀錄之後。
               *   這兩個版本都只改這裡、不動 MENU_ITEMS —— 因為那個常數
               *   看不到 state，且會影響所有身分的選單。）
               *
               * ★ 用「明確的位置表」而不是把 fitness 拉到最前：
               *   寫成 sort((a,b) => a.tab==='fitness' ? -1 : ...) 只能表達
               *   「放最前面」，表達不了「放在某一項之後」。
               *   位置表還額外帶來一個好處：**沒列到的項目自動留在原位**，
               *   日後新增分頁不需要回來改這裡。
               */
              .sort((a, b) => {
                const ORDER: Partial<Record<NavigationTab, number>> = {
                  home: 0,
                  scan: 1,
                  history: 2,
                  fitness: 3, // ← 緊接在飲食紀錄（history）之後
                  classroom: 4,
                  qa: 5,
                  conditions: 6,
                };
                const ai = ORDER[a.tab] ?? 99;
                const bi = ORDER[b.tab] ?? 99;
                return ai - bi;
              })
              .map(({ tab, labelKey, hintKey, Icon }) => {
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
                  <h3 className={`${TYPE.conclusion} ${WEIGHT.strong} text-[#501313] leading-tight [text-wrap:balance]`}>
                    {ocrEngineFailed ? t('scan.engineTitle') : t('scan.retakeTitle')}
                  </h3>
                  <p className={`${TYPE.body} ${WEIGHT.normal} text-[#791F1F] leading-snug`}>
                    {ocrEngineFailed ? t('scan.engineSubtitle') : t('scan.retakeSubtitle')}
                  </p>
                </div>

                {/* 失敗原因（來自後端的具體訊息） */}
                <p className={`${TYPE.secondary} ${WEIGHT.normal} text-[#501313] bg-white/70 rounded-[12px] p-[12px] text-center leading-snug border border-[#F09595]`}>
                  {errorMessage}
                </p>

                {/* ★ 2026-10-02：引擎失敗時，給的是「重試」而不是「重拍」。
                    理由見掃描流程的註解 —— 照片從來不是問題，
                    叫使用者重拍只會讓他一直做沒有用的事。 */}

                {/* ★★ 2026-10-03：本機讀不到時的雲端備援。
                    ⚠️ 放在重試／重拍按鈕**之前**，因為它是「真的能解決」的那條路
                      （使用者已實測：照片上雲端可以精準識別）。
                      但文案一定要寫明「照片會上傳」——
                      本機模式的承諾就是照片不離開裝置，
                      不講清楚就等於我們自己偷偷違背承諾。 */}
                {cloudFallbackOffered && (
                  <div className="flex flex-col gap-[8px]">
                    <p className="text-[16px] font-bold text-[#501313] bg-white/70 rounded-[12px] p-[12px] leading-snug border border-[#F09595]">
                      {t('scan.cloudFallbackHint')}
                    </p>
                    <button
                      type="button"
                      id="btn-cloud-fallback"
                      onClick={handleUseCloudFallback}
                      className="w-full min-h-[64px] rounded-2xl bg-[#185FA5] hover:bg-[#0C447C] text-white font-black text-[19px] flex items-center justify-center gap-[10px] cursor-pointer active:scale-95 border-[3px] border-[#0C447C]"
                    >
                      <Cloud className="w-[24px] h-[24px] shrink-0" aria-hidden="true" />
                      {t('scan.cloudFallback')}
                    </button>
                  </div>
                )}
                {ocrEngineFailed ? (
                  <div className="flex flex-col gap-[10px]">
                    <p className={`${TYPE.secondary} ${WEIGHT.normal} text-[#501313] bg-white/70 rounded-[12px] p-[12px] leading-snug border border-[#F09595]`}>
                      {t('scan.engineHint')}
                    </p>
                    <button
                      type="button"
                      id="btn-retry-analysis"
                      onClick={handleRetryAnalysis}
                      className="w-full min-h-[64px] rounded-2xl bg-[#A32D2D] hover:bg-[#7F1D1D] text-white font-black text-[19px] flex items-center justify-center gap-[10px] cursor-pointer active:scale-95 border-3 border-[#501313]"
                    >
                      <RefreshCw className="w-[24px] h-[24px] shrink-0" aria-hidden="true" />
                      {t('scan.engineRetry')}
                    </button>
                  </div>
                ) : (
                  <>
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
                  </>
                )}

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
                    區塊 2.5：食物成份表範例（2026-10-03 使用者指定）

                    【為什麼要放這一塊，而不是只留文字提示】
                      使用者回報「本機 OCR 識別完全不行」。實測下來，
                      最大的變數不是引擎，而是**表格在畫面裡佔多大**：
                      拍整個包裝時，營養表可能只佔畫面 1/4，
                      縮到 1024px 之後那些小字就只剩下幾像素高，誰都讀不出來。

                      → 與其一直改引擎參數，不如**讓使用者知道要拍哪一塊**。
                        一張圖勝過三行說明，而且這對三種分析模式都有幫助。
                    ══════════════════════════════════════════════════════ */}
                <section className="bg-white rounded-[16px] border-[2px] border-[#3B6D11] p-[16px] flex flex-col gap-[12px]">
                  <h3 className="text-[19px] font-black text-slate-900 leading-snug">
                    {t('scan.exampleTitle')}
                  </h3>
                  <p className="text-[16px] font-bold text-slate-700 leading-snug">
                    {t('scan.exampleBody')}
                  </p>

                  <div className="flex items-start gap-[12px]">
                    {/* 範例圖：用與示範標籤同一套繪圖程式產生，
                        所以「範例長什麼樣」與「按下去會分析什麼」永遠一致 ——
                        不會出現「範例是 A 圖、跑出來是 B 結果」這種矛盾。 */}
                    {exampleLabelImage && (
                      <img
                        src={exampleLabelImage}
                        alt={t('scan.exampleAlt')}
                        className="w-[112px] h-[112px] shrink-0 object-cover rounded-xl border-2 border-slate-300 bg-white"
                      />
                    )}
                    <ol className="flex-1 min-w-0 flex flex-col gap-[6px]">
                      {[t('scan.exampleTip1'), t('scan.exampleTip2'), t('scan.exampleTip3')].map(
                        (tip, i) => (
                          <li
                            key={tip}
                            className="text-[16px] font-bold text-slate-700 flex items-start gap-[6px] leading-snug"
                          >
                            <span className="shrink-0 w-[22px] h-[22px] rounded-full bg-[#3B6D11] text-white text-[15px] font-black flex items-center justify-center mt-[1px]">
                              {i + 1}
                            </span>
                            <span className="min-w-0">{tip}</span>
                          </li>
                        )
                      )}
                    </ol>
                  </div>

                  <button
                    type="button"
                    id="btn-example-label"
                    onClick={() => handleLoadSample('ramen')}
                    disabled={isLoading}
                    className="w-full min-h-[56px] rounded-[12px] bg-[#EAF3DE] border-[2px] border-[#3B6D11] text-[#173404] text-[18px] font-black flex items-center justify-center gap-[8px] cursor-pointer active:scale-[0.98] disabled:opacity-60"
                  >
                    <FileImage className="w-[22px] h-[22px] shrink-0" aria-hidden="true" />
                    {t('scan.exampleTry')}
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
                        className={`${TYPE.conclusion} ${WEIGHT.strong} leading-tight [text-wrap:balance]`}
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
                        {/* ⚠️ 拍到「不是食物標籤」時不能說「再拍一次」——
                            那會讓他重拍同一個不是標籤的東西（2026-10-02 使用者實測回報）。
                            這裡是 `photo_issue` 唯一的消費端。
                            ⚠️ 本機模式不會有這個欄位 → 走 undefined 分支，維持「再拍一次」。 */}
                        <span>
                          📷{' '}
                          {analysisResult.photo_issue === 'not_food_label'
                            ? t('footer.retryScanOther')
                            : t('footer.retryScan')}
                        </span>
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
                      className={`${TYPE.conclusion} ${WEIGHT.strong} leading-tight [text-wrap:balance]`}
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
                      學一個小知識（2026-10-07 使用者指定）
                      —— 把「這一包」變成「一堂微課」：原理 → 自我檢核

                      【為什麼放在第二層與第三層之間】
                        使用者剛看完「為什麼」（長條圖與白話說明），
                        正是最想知道「那到底要怎麼挑」的時刻 ——
                        在這裡給原理與一題檢核，因果最順。
                        ⚠️ 刻意**不放在結論卡正下方**：那會把「為什麼」
                          （安全相關的證據）往下一屏推。
                          （P1 規格原本建議放結論下方，使用者已否決。）

                      【三種模式都會出現，含「只在本機」】
                        原理來自已打包的知識卡、題目優先來自內建題庫 ——
                        兩者都零網路。只有「題庫真的沒有相關的題」時才呼叫 AI，
                        而那條路徑在 local_only 會自動關閉（見元件內說明）。
                      ══════════════════════════════════════════════════════ */}
                  <LearnFromScanCard
                    result={analysisResult}
                    profileId={learnerProfileId}
                    analysisMode={analysisMode}
                    selectedConditions={selectedConditions}
                  />

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
                        {/* ⚠️ 2026-10-02：加 `flex-wrap`。
                            標題 ＋ 徽章並排，英文的徽章（'Less salt, more water'）比中文長，
                            長者字級下兩者加起來超過卡片寬度 43px → 徽章被推出卡片外。
                            讓它可以換行才是正確行為（徽章是次要資訊）。 */}
                        <div className="flex flex-wrap items-center justify-between gap-[8px]">
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

            {/* 字體大小（2026-10-06 使用者指定新增）
                ★ 放在語言之後、身分之前：它和語言同性質 ——
                  都是「影響整頁看起來怎樣」的設定，而不是健康資料。
                ⚠️ 收合時的摘要必須顯示目前級別：
                   這是使用者唯一能一眼確認「現在字有多大」的地方。 */}
            <SettingsSection
              id="settings-font-size"
              icon={<TypeIcon className="w-[26px] h-[26px]" />}
              title={t('settings.fontSize.title')}
              summary={t(
                effectiveFontScale === 'small'
                  ? 'settings.fontSize.small'
                  : effectiveFontScale === 'large'
                    ? 'settings.fontSize.large'
                    : 'settings.fontSize.normal'
              )}
            >
              <FontSizeSection value={effectiveFontScale} onChange={handleChangeFontScale} />
            </SettingsSection>

            {/* 第一部分：學習者身分（決定 AI 的判斷基準與每日參考值） */}
            <SettingsSection
              id="settings-profile"
              icon={<UsersIcon className="w-[26px] h-[26px]" />}
              title={t('settings.profile.title')}
              /* ⚠️ 收合時顯示目前身分 —— 這裡也要本地化，
                 否則英文介面的摺疊標題會直接露出中文身分名稱。
                 ★ 2026-10-02：不再附帶稱謂（性別機制已移除）。 */
              summary={`${learnerProfile.emoji} ${localizedProfileDisplayName(
                learnerProfile.id,
                learnerProfile.name,
                language
              )}`}
            >
              <div className="flex flex-col gap-5">
                <LearnerProfilePicker
                  selectedId={learnerProfileId}
                  onSelect={handleChangeProfile}
                />
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

            {/* 語音朗讀（2026-10-03 新增）
                ⚠️ 收合時的摘要必須顯示「開／關 ＋ 音量」——
                   語音有沒有聲音，是使用者最需要一眼確認的事。 */}
            {/* 朗讀語言與音量（2026-10-04 使用者指定：兩者分開、各自有標題）
                ★ 原本兩者擠在同一個「語音朗讀」區塊，只剩一個標題 ——
                  要調音量的人得先看懂「朗讀語言」那三個按鈕與自己無關。
                ★ 它們其實是**不同的問題**：
                    朗讀語言 ＝ 用什麼語言發音（與介面文字語言無關）
                    音量     ＝ 要不要出聲、多大聲
                  並排在同一區會讓人以為「選了粵語就等於開啟語音」。 */}
            <SettingsSection
              id="settings-voice-lang"
              icon={<LanguagesIcon className="w-[26px] h-[26px]" />}
              title={t('settings.sound.voiceLang')}
              summary={t(
                ttsSettings.voiceLang === 'mandarin'
                  ? 'settings.sound.langMandarin'
                  : ttsSettings.voiceLang === 'english'
                    ? 'settings.sound.langEnglish'
                    : 'settings.sound.langCantonese'
              )}
            >
              <TtsVoiceLangSection key={`lang-${ttsSettings.voiceLang ?? 'auto'}`} />
            </SettingsSection>

            <SettingsSection
              id="settings-sound"
              icon={<Volume2 className="w-[26px] h-[26px]" />}
              title={t('settings.sound.volume')}
              summary={
                ttsSettings.volume > 0
                  ? t('settings.sound.summaryOn', { n: Math.round(ttsSettings.volume * 100) })
                  : t('settings.sound.summaryOff')
              }
            >
              {/* key 帶音量：使用者在滑桿放手後，區塊會以新值重建 */}
              <TtsVolumeSection key={ttsSettings.volume} />
            </SettingsSection>

            {/* 第二部分原本是「日常生理指標量測」（血壓／心跳／血糖／尿酸／血脂
                與 AI 分析）—— 2026-10-02 使用者指定整區移除，見上方 state 的說明。
                現在設定頁的順序：身分 → 分析模式 → 慢性病與過敏 → 性別 → 私隱。 */}

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

              {/* ── 自填病症輸入框（2026-10-06 使用者指定）─────────────────────
                  ★ 只在勾了「其他（自行填寫）」時才出現 —— 沒勾就完全不佔版面。
                  ★ 放在「已選擇」釘選區的正下方：使用者剛在那裡勾了「其他」，
                    輸入框就長在旁邊，不必回頭找。
                  ★★ 一定要**當面講清楚「本機模式無法把關」**：
                    「勾了卻沒有把關」是本專案最危險的失敗模式 ——
                    不報錯、不當機，使用者只會以為有人在看。
                    所以這裡寧可講得直白，也不要讓它靜默失效。 */}
              {selectedConditions.includes('other') && (
                <div className="flex flex-col gap-[8px] bg-slate-50 border-2 border-slate-300 rounded-[12px] px-[12px] py-[12px]">
                  <label
                    htmlFor="custom-condition-input"
                    className="text-[18px] font-black text-slate-900"
                  >
                    {t('conditions.customLabel')}
                  </label>
                  <input
                    id="custom-condition-input"
                    type="text"
                    value={customCondition}
                    onChange={(e) => handleChangeCustomCondition(e.target.value)}
                    /* 20 字：足夠寫下完整的病症名（最長常見者約 8 字），
                       又能避免有人貼一整段文章進來。 */
                    maxLength={20}
                    placeholder={t('conditions.customPlaceholder')}
                    className="w-full min-h-[52px] px-[12px] rounded-[10px] border-2 border-slate-400 bg-white text-[19px] font-bold text-slate-900"
                  />
                  <p className="text-[16px] font-bold text-slate-600 leading-snug">
                    {t('conditions.customHint')}
                  </p>
                  {/* 只有在真的選了「只在本機」時才提醒 —— 其他模式不需要嚇人 */}
                  {analysisMode === 'local_only' && (
                    <p className="text-[16px] font-bold text-amber-900 bg-amber-50 border-2 border-amber-300 rounded-[10px] px-[10px] py-[8px] leading-snug">
                      {t('conditions.customLocalOnly')}
                    </p>
                  )}
                </div>
              )}

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
                                  {/* ⚠️ 2026-10-02：拿掉 `whitespace-nowrap`。
                                      英文的病症名比中文長得多（'Cardiovascular disease'
                                      在長者字級要 262px，而卡片只有 262px）——
                                      加 nowrap 的結果是**直接溢出並被裁掉**。
                                      讓它折行才是正確行為。 */}
                                  <span
                                    className={`text-[20px] font-black leading-tight ${
                                      isAllergen ? 'text-[#501313]' : 'text-slate-900'
                                    }`}
                                  >
                                    {conditionName(cond.id, language)}
                                  </span>
                                </div>
                                {/* ★ 2026-10-02 使用者指定：**不要在過敏選項寫「絕對不能吃」等後果字樣。**
                                    原本這裡有一行「⚠️ 絕對不能吃，會呼吸困難」／「⚠️ 吃了會腹瀉」。
                                    移除的理由（使用者判斷）：
                                      ① 那是醫療後果的斷言，而本 App 是飲食教育工具，
                                         不是診斷工具 —— 寫得越肯定，責任越大。
                                      ② 後果因人而異（有人接觸就休克、有人只是皮膚癢），
                                         統一的說法反而可能誤導。
                                    過敏原仍然靠**顏色（紅）＋ 圖示（三角警示）**識別 ——
                                    三重編碼少了文字這一重，顏色與圖示仍在（見上方 isAllergen 分支）。 */}
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
                  // ⚠️ 2026-10-02：朗讀稿不再含血壓／心跳／血糖
                  //    （設定頁的生理指標區塊已整區移除）。
                  const text = t('settings.speech', { condPart });
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
            <HealthQASection analysisMode={analysisMode} />
          </div>
        )}

        {/* ======================================================== */}
        {/* 頁面 6：健身專區（FITNESS TAB）                           */}
        {/* 2026-10-02 新增。只有身分＝健身人士才進得來（選單已過濾）。 */}
        {/* ⚠️ 這裡再檢查一次身分：使用者可能停在這一頁之後才把身分切走， */}
        {/*    那時 activeTab 仍是 'fitness'，不擋的話會看到一個不該存在的頁面。 */}
        {/* ======================================================== */}
        {activeTab === 'fitness' && learnerProfileId === 'fitness' && (
          <div className="flex flex-col space-y-5">
            {/* ⚠️ 必須傳 analysisMode —— 健身專區的「AI 週報」是會呼叫雲端的，
                沒有這個 prop 就無法在「只在本機」模式下擋住上傳。 */}
            <FitnessZone analysisMode={analysisMode} />
          </div>
        )}

        {/* 身分被改成非健身人士時，若人還停在健身分頁 → 自動回主頁。
            ★ 這種「狀態與頁面不一致」的問題不會報錯，只會留下一頁空白，
              所以寧可多寫這幾行。 */}
        {activeTab === 'fitness' && learnerProfileId !== 'fitness' && (
          <div className="flex flex-col space-y-5">
            <p className="text-[16px] font-bold text-slate-700 bg-slate-100 border-2 border-slate-300 rounded-2xl px-[14px] py-[12px]">
              {t('fit.notForProfile')}
            </p>
            <button
              type="button"
              onClick={() => setActiveTab('home')}
              className="min-h-[60px] rounded-2xl bg-blue-900 text-white text-[18px] font-black cursor-pointer active:scale-95"
            >
              {t('fit.backHome')}
            </button>
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
            /* 保持網路安撫卡片（醒目大字，消除長者等待焦慮）
               ⚠️ 2026-10-02 使用者要求：原本標題是「超市訊號提示」，
                  改為「保持網路」；並移除「🔊 語音已為您播報，資料傳輸中」徽章。
                  理由：原本的標題講的是**系統狀態**（訊號不好），
                  不是使用者該做的事。「保持網路」是**告訴他怎麼做**。 */
            <div className="w-full max-w-sm mt-[16px] bg-amber-400 text-slate-950 p-[16px] rounded-[16px] border-[3px] border-yellow-200 shadow-2xl flex flex-col items-center gap-[8px]">
              <div className="flex items-center gap-[8px]">
                <Wifi className="w-[28px] h-[28px] text-slate-950 shrink-0 animate-pulse" />
                <span className="text-[20px] font-black">{t('loading.signalTitle')}</span>
              </div>
              <p className="text-[18px] font-black leading-snug">
                {t('common.weakSignalSpeech')}
              </p>
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
              {/* ⚠️ 2026-10-02：拿掉文字前面的 📸 emoji。
                  左邊已經有一個 28px 的相機圖示了，emoji 是重複的；
                  而長者字級下它要多佔約 30px —— 那一列只有約 170px 可用，
                  加上 emoji 就會把「拍照看標籤」擠成 3 行、最後一行只剩 1 個字。 */}
              <span>{t('footer.homeCamera')}</span>
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
                <span>{t('footer.scanCamera')}</span>
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

      {/* ── 開發者面板（2026-10-03）：連點主標 7 下才會出現 ──
          放在最外層、所有頁面之上，因為它不屬於任何一個分頁。 */}
      {devPanelOpen && (
        <DeveloperPanel
          onClose={() => setDevPanelOpen(false)}
          /**
           * 上次分析的 AI 原始回傳（2026-10-03 使用者要求）。
           * ⚠️ 從既有的 analysisResult 取，不另外發請求 —— 面板只是顯示。
           */
          lastAi={
            analysisResult
              ? {
                  provider: (analysisResult as any).ai_provider,
                  model: (analysisResult as any).ai_model,
                  rawText: (analysisResult as any).ai_raw_text,
                }
              : null
          }
          context={{
            analysisMode,
            profileId: learnerProfileId,
            language,
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
          }}
        />
      )}
    </>
  );
}
