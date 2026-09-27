/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ConditionCategory = 'cardio' | 'metabolic' | 'organ' | 'allergen' | 'digestive';

export interface ChronicCondition {
  id: string;
  name: string;
  category: ConditionCategory;
  description: string;
  badge: string;
  targetNutrients: string[];
  defaultChecked: boolean;
}

export type RiskLevel = 'red' | 'yellow' | 'green';

/**
 * 資料處理模式。
 *
 * 【為什麼要讓前端拿得到這個值】
 *   使用者有權知道自己剛才那張照片到底有沒有離開手機。
 *   這不是行銷文案，而是回應中實際發生的事實，因此由後端回報而非前端自行推測。
 *
 *   - `cloud`      ：照片曾傳送給 Gemini／OpenRouter 進行視覺辨識
 *   - `local_only` ：照片完全沒有離開本機，由內建離線 OCR 引擎處理
 */
export type DataHandling = 'cloud' | 'local_only';

/**
 * 單一慢性病的專屬提醒。
 *
 * 【為什麼不跟 nutrient_facts 混在一起】
 *   nutrient_facts 說的是「這一包的數字」；本結構說的是「這個病要怎麼挑」，
 *   與產品無關。兩者生命週期不同，前端也顯示在不同層級。
 */
export interface ConditionReminder {
  /** 使用者勾選的慢性病名稱（原樣回傳，方便前端對照） */
  condition: string;
  /** 圖示（三重編碼用，不能只靠顏色傳達嚴重度） */
  icon: string;
  /** 一句白話提醒，回答「那我要怎麼挑」 */
  advice: string;
}

/**
 * 單一成分的對照結果（供「佔每日上限幾 %」視覺化使用）
 *
 * 【為什麼需要這個結構】
 *   長者看到「鈉 2480 毫克」無法判斷算多還是少，
 *   但看到「佔每日上限 124%」立刻就知道超標。
 *   因此後端在分析時就把「實際值 / 每日上限」算好回傳，
 *   前端不必重複實作換算邏輯（也避免兩邊標準不一致）。
 */
export interface NutrientFact {
  /** 成分名稱，如「鈉」「添加糖」「飽和脂肪」 */
  name: string;
  /** 食品實際含量（數字） */
  value: number;
  /** 含量的單位，如「毫克」「公克」 */
  unit: string;
  /** 每日上限（數字，單位與 value 相同） */
  dailyLimit: number;
  /** 佔每日上限的百分比（整數，可超過 100） */
  percent: number;
  /** limit = 不超過；target = 至少達到 */
  direction: 'limit' | 'target';
}

export interface LabelAnalysisResult {
  risk_level: RiskLevel;
  warning_title: string;
  plain_summary: string;
  alternative_advice: string;
  /**
   * 食育教學三欄位 —— 每次掃描除了給結論，還要教一個能帶去下一包使用的觀念。
   *
   * 【為什麼要獨立這三個欄位，而不是塞進 plain_summary】
   *   1. plain_summary 會被語音朗讀，塞太多會讓朗讀又臭又長（長者會直接關掉）。
   *   2. 這三項回答的是不同問題，前端可以分層顯示：
   *      knowledge_point → 為什麼；label_reading_tip → 下次我怎麼看；
   *      daily_limit_context → 這個數字對「我」代表什麼。
   *   3. 三條路徑（雲端／快取／本機）都要提供，否則降級時教學內容會整段消失。
   */
  knowledge_point?: string;
  label_reading_tip?: string;
  daily_limit_context?: string;
  ingredients_detected?: string[];
  nutrition_concerns?: string[];
  matched_conditions?: string[];
  /**
   * 成分對照表（最多 3 項，由後端依嚴重度排序）
   * 前端據此繪製「佔每日上限幾 %」的長條圖。
   */
  nutrient_facts?: NutrientFact[];
  /** cloud_ai = 雲端視覺模型；smart_nutrition_engine / local_fallback = 本機備援規則引擎 */
  analysis_mode?: 'cloud_ai' | 'smart_nutrition_engine' | 'local_fallback';
  /**
   * 離線辨識讀不到足夠的營養欄位。
   *
   * 【為什麼要回報這個狀態而不是硬給結論】
   *   讀不到標籤數字時如果還回紅／黃／綠，長者會當真。
   *   設為 true 時前端必須改顯示「請重拍」的引導，不可顯示風險結論。
   */
  ocr_failed?: boolean;
  /** 離線 OCR 實際讀到的營養欄位數（除錯與提示用） */
  ocr_matched_fields?: number;
  /** 是否由本機離線 OCR 讀出（true = 有真的讀到標籤數字，非捏造） */
  ocr_used?: boolean;
  /**
   * 這次分析的照片去了哪裡。由後端依實際處理路徑回報。
   * `local_only` 時照片從未離開裝置，前端應據此顯示對應的隱私說明。
   */
  data_handling?: DataHandling;
  /**
   * 使用者勾選的每一項慢性病，對應一句「那我要怎麼挑」的白話提醒。
   * 與產品無關，因此**不隨快取或模型而改變**，由後端依勾選清單直接產生。
   */
  condition_reminders?: ConditionReminder[];
  /** 實際回傳結果的模型名稱（僅雲端模式會有） */
  ai_model?: string;
  /** 實際使用的供應商（僅雲端模式會有） */
  ai_provider?: 'gemini' | 'openrouter';
  /** 是否由快取回傳（true 表示這次沒有消耗 API 額度） */
  cached?: boolean;
  /** 本次辨識所依據的學習者身分（決定每日參考值） */
  learner_profile_id?: LearnerProfileId;
  /** 本次辨識所依據的學習者身分名稱（顯示用） */
  learner_profile_name?: string;
}

export interface AppSettings {
  voiceVolume: number; // 0.0 to 1.0 (e.g., 1.0 = 100%)
  voiceRate: number;   // 0.7 to 1.2 (e.g., 0.88)
  voiceLang: 'cantonese' | 'mandarin';
  autoPlaySpeech: boolean;
  fontSizeLevel: 'standard' | 'large' | 'huge'; // 20px, 24px, 28px
  contrastTheme: 'standard' | 'high_contrast_yellow'; // standard light or black-yellow high contrast
  debounceSeconds: number; // 3, 4, or 5
  customApiKey?: string;   // optional custom Gemini API Key
}

/**
 * 長者各項自填身體指標（血壓、血糖、尿酸、血脂、症狀）
 */
export interface SeniorPhysicalIndicators {
  // 1. 血壓 (Blood Pressure)
  systolicBp: number;   // 收縮壓 (上壓), e.g. 138 mmHg
  diastolicBp: number;  // 舒張壓 (下壓), e.g. 88 mmHg
  // 2. 心跳 (Heart Rate / Pulse)
  heartRate: number;    // 心跳脈搏, e.g. 72 次/分 (bpm)
  // 3. 血糖 (Blood Sugar)
  bloodSugar: number;   // 血糖數值, e.g. 7.2 (mmol/L) 或 135 (mg/dL)
  bloodSugarUnit: 'mmol/L' | 'mg/dL';
  bloodSugarTiming: 'fasting' | 'post_meal'; // 空腹 或 飯後
  // 4. 尿酸與關節
  uricAcidStatus: 'normal' | 'high' | 'gout_history'; // 正常 / 偏高 / 常痛風
  // 5. 血脂與膽固醇
  cholesterolStatus: 'normal' | 'borderline' | 'high'; // 正常 / 稍高 / 偏高
  // 6. 腎臟與水腫
  kidneyStatus: 'normal' | 'mild_edema' | 'ckd'; // 正常 / 腳部水腫 / 腎臟需特別顧
  // 7. 近期身體感覺 (簡單大白話多選)
  symptoms: string[];
  // 8. 年齡區間
  ageGroup: string;
}

/**
 * Gemini 與智慧守護引擎針對身體指標產出的大白話分析結果
 */
export interface SeniorIndicatorAnalysis {
  status_level: 'green' | 'yellow' | 'red';
  status_title: string;          // 簡單大字標題，如「阿公，您今天的血壓跟血糖稍微偏高喔！」
  simple_explanation: string;    // 100% 大白話解釋，無艱澀名詞
  supermarket_rules: {
    do_not_buy: string[];        // 超市千萬不要買（白話解釋原因）
    recommended_to_buy: string[];// 超市安心買
  };
  daily_care_tips: string[];     // 貼心生活小叮嚀（多喝溫水、睡飽覺）
  voice_summary: string;         // 專為語音合成朗讀設計的親切白話文
  linked_conditions: string[];   // 自動同步至食品標籤掃描的關注重點
  analysis_mode: 'cloud_ai' | 'smart_nutrition_engine';
}

/**
 * 長者健康問題即時解答介面
 */
export interface HealthQuestionAnswer {
  question: string;              // 長輩提問的問題
  key_takeaway: string;          // 一句話大白話結論 (例如：可以適量喝淡咖啡，但每天不超過一杯！)
  answer: string;                // 溫馨通俗大白話解說
  safe_tips: string[];           // 實用安心小叮嚀
  voice_script: string;          // 專為語音朗讀設計的台詞
  source: 'cloud_ai' | 'smart_health_qa';
}

/**
 * 長者食品掃描與健康飲食習慣追蹤紀錄
 */
export interface DietRecord {
  id: string;
  timestamp: number;
  dateString: string;
  foodName: string;
  risk_level: RiskLevel;
  warning_title: string;
  plain_summary: string;
  alternative_advice?: string;
  matched_conditions?: string[];
}

/* ============================================================================
 * 食育學堂（Food Education Classroom）
 * ----------------------------------------------------------------------------
 * 這一組型別支撐「四種學習者身分 + 知識卡 + 測驗」的教學功能。
 * 設計原則：所有內容皆為內建靜態資料，完全不需網路即可學習。
 * ==========================================================================*/

export type LearnerProfileId = 'senior' | 'child' | 'teen' | 'student' | 'fitness' | 'takeout';

/** 學習者身分定義（供 AI 提示詞組裝與教學內容篩選） */
export interface LearnerProfile {
  id: LearnerProfileId;
  /** 身分名稱，如「長者三高」 */
  name: string;
  /** 一句話說明適用對象 */
  audience: string;
  /** 顯示用圖示（emoji） */
  emoji: string;
  /** 卡片主色（Tailwind class 片段） */
  accent: string;
  /** 學習者最在意的事（用於提示詞） */
  focusSummary: string;
  /** AI 應採用的角色語氣（用於提示詞） */
  aiPersona: string;
  /** 本次必須優先比對的項目（用於提示詞） */
  aiFocus: string;
  /** 每日參考值 */
  targets: NutritionTarget[];
  /**
   * 每日參考值的「純數字」版本，供百分比換算使用。
   *
   * 為什麼要獨立一份：`targets` 的 target 欄位是給人看的字串（"2000 毫克"），
   * 無法直接做數學運算。這份結構化的數字讓後端能算出「佔每日上限幾 %」，
   * 前端也能用同一組數字驗證，避免兩邊各寫一套標準而對不起來。
   *
   * key 必須與 targets 的 nutrient 名稱對應。
   */
  numericLimits: Record<string, { value: number; unit: string }>;
  /** 學習目標（教學內容需對齊） */
  learningObjectives: string[];
  /** 推薦替代品的關鍵字（用於提示詞） */
  recommendKeywords: string[];
  /** 該身分優先顯示的知識卡主題 */
  preferredTopics: KnowledgeTopic[];
}

/** 單一營養項目的每日參考值 */
export interface NutritionTarget {
  /** 營養項目名稱，如「鈉」 */
  nutrient: string;
  /** 參考值描述，如「2000 毫克」 */
  target: string;
  /** limit = 上限越低越好；target = 目標越多越好 */
  direction: 'limit' | 'target';
  /** 簡短白話說明 */
  note: string;
}

/** 知識卡主題分類 */
export type KnowledgeTopic = 'basics' | 'dangers' | 'profiles' | 'shopping';

/** 食育知識卡 */
export interface KnowledgeCard {
  id: string;
  topic: KnowledgeTopic;
  /** 卡片標題 */
  title: string;
  /** 一句話重點（大字顯示） */
  headline: string;
  /** 白話說明，可分段 */
  body: string[];
  /** 實用口訣或叮嚀 */
  tip: string;
  /** 特別適用的身分（空陣列 = 全部適用） */
  forProfiles: LearnerProfileId[];
  /** 語音朗讀用台詞 */
  voiceScript: string;
}

/** 測驗題目 */
export interface QuizQuestion {
  id: string;
  /** 所屬主題 */
  topic: KnowledgeTopic;
  /** 題目文字 */
  question: string;
  /** 三個選項 */
  options: string[];
  /** 正確選項索引（0 起算） */
  correctIndex: number;
  /** 答題後的詳解 */
  explanation: string;
  /** 對應的知識卡 ID，方便答錯時引導回去複習 */
  relatedCardId: string;
}

/** 使用者在某次測驗的作答紀錄 */
export interface QuizAttempt {
  questionId: string;
  selectedIndex: number;
  isCorrect: boolean;
  timestamp: number;
}

/** 學習進度（儲存於 localStorage） */
export interface LearningProgress {
  /** 已讀過的知識卡 ID */
  readCardIds: string[];
  /** 歷史作答紀錄 */
  attempts: QuizAttempt[];
  /** 上次進入學堂的時間 */
  lastVisitedAt: number;
}



