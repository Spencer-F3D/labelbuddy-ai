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



