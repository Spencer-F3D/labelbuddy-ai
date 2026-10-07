/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 慢性病分類。
 *
 * ★ `other`（2026-10-06 新增）：放「清單上原本沒有的常見病症」——
 *   脂肪肝、心臟衰竭、缺鐵性貧血、便秘、失眠、偏頭痛，
 *   以及最後那個讓使用者自行填寫的 `other` 項目。
 *   獨立成一類是刻意的：把 6 項塞進既有的 cardio／metabolic／digestive
 *   會讓那幾顆膠囊底下的清單突然變長，長者得重新找一遍。
 */
export type ConditionCategory =
  | 'cardio'
  | 'metabolic'
  | 'organ'
  | 'allergen'
  | 'digestive'
  | 'other';

export interface ChronicCondition {
  id: string;
  name: string;
  category: ConditionCategory;
  description: string;
  targetNutrients: string[];
  defaultChecked: boolean;
  /**
   * 本機規則引擎是否有對應的判斷規則（**預設 true**）。
   *
   * 【為什麼需要這個欄位】
   *   `scripts/verify-condition-keywords.ts` 會逐項驗證「每一項慢性病都能觸發
   *   本機規則引擎並產生專屬提醒」。但「其他（自行填寫）」這一項的內容是
   *   使用者自己打的字，本機引擎**不可能**預先寫好規則 ——
   *   它天生過不了那道驗證。
   *
   * ⚠️ 所以這裡不是「偷懶的跳過開關」，而是把「本機無法把關」變成
   *    **資料層的事實**：驗證腳本會跳過它，前端也會據此對使用者誠實說明
   *    （見 App.tsx 的自填提示）。若日後真的為它寫了規則，把旗標拿掉即可。
   */
  localRule?: boolean;
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
 * 分析模式（三選一，2026-09-30 起）。
 *
 * 【為什麼從「同意／不同意」變成三選一】
 *   舊版只有一個布林值 `cloudConsent`，但雲端其實有兩種截然不同的用法：
 *   「把照片傳上去讓 AI 自己看」與「只傳 OCR 讀出的文字」。
 *   這兩者的準確度與隱私代價差很多，卻被同一個開關綁在一起 ——
 *   使用者無從選擇，而我們也只能承諾最保守的那一種。
 *   拆成三模式後，每一種都能誠實說明「什麼會離開裝置」。
 *
 * | 模式 | 照片 | OCR 文字 | 慢性病史／身體指標 | 判斷引擎 |
 * | --- | --- | --- | --- | --- |
 * | `cloud_image` | **上傳** | 不需要 | 上傳 | 雲端視覺 AI |
 * | `cloud_text`  | 留在裝置 | 上傳 | 上傳 | 雲端文字 AI |
 * | `local_only`  | 留在裝置 | 留在裝置 | 留在裝置 | 本機規則引擎 |
 *
 * ⚠️ `local_only` 時**連身體指標與健康問答都不會上傳** ——
 *    這正是 2026-09-30 補上的閘門（先前那兩個端點無條件呼叫雲端）。
 */
export type AnalysisMode = 'cloud_image' | 'cloud_text' | 'local_only';

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
  /**
   * 標籤上的計數基準（2026-10-02 新增）。
   *
   * 【為什麼一定要顯示這個】
   *   使用者指定「完全不換算、只呈現標籤原樣」，所以 value 是標籤上的原始數字。
   *   但**同一個數字配上不同的基準，意義完全不同**：
   *     「鈉 800 毫克／每 100 公克」和「鈉 800 毫克／整包」是兩件不同的事。
   *   少了基準，畫面上的數字就沒有意義，甚至會誤導。
   *
   * ⚠️ 用**代碼**而不是自由文字 —— 前端要依介面語言顯示，
   *    若後端回「每 100 公克」，英文介面就會露出中文。
   */
  basis?: NutrientBasis;
  /** 標籤上的份量說明（例如 "30 公克"）；標籤沒寫就是空字串 */
  basisNote?: string;
}

/**
 * 標籤的計數基準。
 *
 * ⚠️ 由**模型輸出代碼**、後端正規化、前端依語言顯示文字 ——
 *    三段分工，任何一段自己產生文字都會造成語言不一致。
 */
export type NutrientBasis = 'per_100g' | 'per_serving' | 'whole_pack' | 'unknown';

/**
 * 照片本身的問題（2026-10-02 新增）。
 *
 * 【為什麼要區分這三種】
 *   使用者實測回報：拍了一張「不是標籤」的東西，App 卻說「標籤不夠清楚」，
 *   於是他以為是自己手震，**反覆重拍同一個根本不是標籤的東西**。
 *
 *   兩種失敗需要**不同的指示**：
 *     - `not_food_label` → 叫他**換東西拍**（拍包裝背面的營養標示）
 *     - `blurry`         → 叫他**重拍同一張**（光線亮一點、靠近一點）
 *   混在一起講，使用者就不知道該改什麼。
 *
 * ⚠️ 只有雲端 AI 模式會產生這個欄位（本機引擎沒有視覺能力，無法判斷）。
 *    所以前端**必須處理 `undefined`**（= 本機模式或舊快取）。
 */
export type PhotoIssue = 'blurry' | 'not_food_label';

export interface LabelAnalysisResult {
  risk_level: RiskLevel;
  /** 照片有問題時的原因；照片正常時為 null 或 undefined */
  photo_issue?: PhotoIssue | null;
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
  status_title: string;          // 簡單大字標題，如「您今天的血壓跟血糖稍微偏高喔！」
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
  question: string;              // 使用者提問的問題
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
  /**
   * 這筆紀錄的**標籤本身語言**（2026-09-29 新增）。
   *
   * 【為什麼紀錄要記住語言，而不是跟著介面語言變】
   *   澳門超市的包裝多數是中文。使用者在英文介面下拍一包中文餅乾時，
   *   紀錄若存成英文，就與「他實際買的那包」對不上。
   *   使用者的要求是「**照片是什麼語言，紀錄就是什麼語言**」——
   *   所以語言在建立紀錄的那一刻就固定，切換介面語言不會改動它。
   *
   * ⚠️ 舊紀錄（這個欄位出現之前建立的）沒有值 → 一律當作 `undefined`，
   *    顯示時不做任何處理，行為與改動前完全一致。
   */
  lang?: 'zh-TW' | 'en';
}

/* ============================================================================
 * 食育學堂（Food Education Classroom）
 * ----------------------------------------------------------------------------
 * 這一組型別支撐「四種學習者身分 + 知識卡 + 測驗」的教學功能。
 * 設計原則：所有內容皆為內建靜態資料，完全不需網路即可學習。
 * ==========================================================================*/

export type LearnerProfileId =
  | 'senior'
  | 'child'
  | 'teen'
  | 'fitness'
  | 'young'
  | 'middle'
  | 'student'
  /**
   * 孕婦（2026-10-04 使用者指定新增）。
   *
   * ★ 這個身分與其他七個的**性質不同**：
   *   其他身分主要是「某項數字要低一點」，孕婦除此之外還有
   *   **「某些成分絕對不能有」**（酒精、生食、未殺菌、高汞魚）。
   *   那不是「超標」，是「不該出現」—— 所以規則引擎需要一條
   *   成分層級的把關，不能只靠數字上限。
   */
  | 'pregnant';

/** 學習者身分定義（供 AI 提示詞組裝與教學內容篩選） */
export interface LearnerProfile {
  id: LearnerProfileId;
  /** 身分名稱，如「長者」 */
  name: string;
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
/**
 * 食育主題。
 * ★ 2026-10-03 新增 `reading` 與 `sodium_sugar` ——
 *   使用者要求「增加類別，每類別 ≥10 題」。
 *   原本 4 類（共 14 題）擴充為 6 類 × 10 題 = 60 題。
 */
export type KnowledgeTopic =
  | 'basics' // 讀標基本功
  | 'reading' // 數字怎麼看
  | 'dangers' // 三大危險成分
  | 'sodium_sugar' // 鈉與糖陷阱
  | 'profiles' // 我的專屬眉角
  | 'shopping'; // 聰明採買術

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

/**
 * 標籤上可能出現的營養素（**封閉值域**，2026-10-07 新增）。
 *
 * ⚠️ 必須與 `NutrientFact.name` 的 canonical 名稱一致。
 *    來源＝所有身分 `numericLimits` 鍵的聯集（實測正好這 6 個），
 *    也正好等於 `NUTRIENT_NAME_EN` 的 6 個鍵（`src/data/bilingual.ts`）。
 *    不在這個集合的名稱不會出現在 `nutrient_facts`
 *    （`normalizeNutrientFacts()` 會把查不到 `numericLimits` 的項目濾掉）。
 *
 * ★ 用途：「學一個小知識」要靠它把「這張標籤」和「知識卡／測驗題」接起來。
 *   封閉值域是刻意的 —— 本專案踩過 4 次「對照表鍵對不上」的靜默 bug，
 *   開放字串會讓那種錯再度發生（而且不會報錯）。
 */
export type LabelKey =
  | '鈉'
  | '添加糖'
  | '飽和脂肪'
  | '膳食纖維'
  | '蛋白質'
  | '鈣'
  /**
   * ⚠️ 2026-10-07 由 `scripts/check-quiz-bank.ts` 抓出來的缺口：
   *    只有**孕婦**身分的 `numericLimits` 有這一項（200 毫克／日），
   *    所以 `nutrient_facts` 真的會出現「咖啡因」。
   *    沒加進值域的話，孕婦的咖啡因永遠挑不到知識卡與題目 —— 而且不會報錯。
   */
  | '咖啡因';

/** 題目來源：內建題庫 或 AI 即時生成 */
export type QuizSource = 'builtin' | 'ai';

/**
 * 題目的「可翻譯欄位」。
 *
 * ⚠️ 原本定義在 `src/data/educationContentEn.ts`，2026-10-07 移到 `types.ts` ——
 *    因為 AI 生成的題目要**自帶英文版**（見 `QuizQuestion.en`），
 *    這個型別不再是「英文對照表專用」。
 */
export interface QuizQuestionText {
  question: string;
  options: string[];
  explanation: string;
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

  /* ── 2026-10-07 新增：支撐「學一個小知識」 ── */

  /**
   * 這題對應標籤上的哪些營養素。
   * `[]` ＝**通用題**（任何標籤都可出）。
   *
   * ⚠️ 通用題**不算**「題庫有對應的題」——
   *    只有 `labelKeys` 與本次標籤有交集，才算命中；
   *    否則 AI 生成永遠不會被觸發，功能會退化成「固定 60 題輪播」。
   */
  labelKeys: LabelKey[];
  /** 來源。內建 60 題一律 `'builtin'`；AI 生成的是 `'ai'`。 */
  source: QuizSource;
  /**
   * 英文版。
   *
   * ★ 這是解掉「AI 新題在英文介面漏中文」的關鍵：
   *   `localizeQuestion()` 原本是「以 id 查 `QUIZ_QUESTIONS_EN`」的**白名單**，
   *   AI 生成的新題沒有 id 在表裡 → **靜默退回中文**（而且不會報錯）。
   *   改成「題目自帶 `en`，查表只是內建題的後備」之後，新題天生帶雙語。
   *
   * ⚠️ 內建 60 題可留空（靠 id 查表）；AI 生成的題**必須有**，
   *    否則 `normalizeQuizQuestion()` 會把它整題丟棄。
   */
  en?: QuizQuestionText;
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



