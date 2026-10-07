/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * API 處理函式（平台無關）
 * ============================================================================
 * 【為什麼長這樣】
 *   原本這些程式碼是直接寫在 `app.post('/api/...', async (req, res) => {...})`
 *   裡面的，與 Express 綁死。為了讓同一份邏輯也能跑在 Cloudflare Workers，
 *   這裡用一個極薄的相容層（`makeRes()`）包住：
 *     - `req.body`  → 傳入的 body 參數
 *     - `res.json(x)` / `res.status(s).json(x)` → 回傳 { status, json }
 *   這樣**原本的 handler 程式碼幾乎不用改**，轉換風險降到最低，
 *   也讓 diff 可以清楚看出「哪些是搬移、哪些是真的改邏輯」。
 *
 * ⚠️ `res.json()` 刻意回傳「結果物件」而不是 res 本身：
 *    原本的寫法是 `return res.json(...)`，讓 json() 直接回傳結果，
 *    那些 return 就能原封不動地運作。
 */

import {
  analysisCache,
  analysisCacheContent,
  ADDRESS_RULE,
  NUTRIENT_WORDING_FIELDS,
  applyIndicatorPostprocessing,
  buildOcrFailedResult,
  buildSystemInstruction,
  callAiModel,
  DAILY_QUOTA,
  ensureEducationFields,
  getModelChain,
  getOpenRouterQuota,
  isValidKey,
  makeCacheKey,
  normalizeNutrientFacts,
  providerKeys,
  providerState,
  QA_TEXT_FIELDS,
  readCache,
  rollDateIfNeeded,
  SYSTEM_INSTRUCTION_HEALTH_QA,
  SYSTEM_INSTRUCTION_INDICATORS,
  ENGLISH_OUTPUT_OVERRIDE_INDICATORS,
  ENGLISH_OUTPUT_OVERRIDE_HEALTH_QA,
  writeCache,
  type ApiResult,
  type CoreDeps,
  type ProviderName,
  NVIDIA_MODEL_CHAIN_FOR_STATUS,
} from './core';
// ⚠️ 2026-10-07：`buildRecognitionResult`（labelParser）與
//    `analyzeNutritionWithIndicators`（smartNutritionAnalyzer）的匯入已移除 ——
//    它們原本只服務本機路徑，而那條路徑現在由 `./localAnalysis` 統一呼叫。
//    直接匯入會變成「兩份實作入口」，正是這次要消除的東西。
import { analyzeSeniorPhysicalIndicators } from './smartIndicatorAnalyzer';
// ⚠️ 2026-10-07：`answerSeniorHealthQuestion` 的直接匯入已移除 ——
//    本機路徑改由 `./localAnalysis` 的 `answerHealthQuestionLocally()` 統一呼叫
//    （前端也匯入同一支，才能零網路）。雲端路徑不需要它。
import { buildConditionReminders } from './conditionAdvice';
// ★ 2026-10-07：送給 AI 的是**中性成分約束**，不是病名（見 handleAnalyzeLabel 的說明）。
import { buildUserConstraintLine } from './conditionConstraint';
// 出題（2026-10-07）：「學一個小知識」的 AI 生成路徑。
// ⚠️ 這是**會呼叫雲端**的功能，所以 handler 內必須有同意閘門（見 handleQuizQuestion）。
import { SYSTEM_INSTRUCTION_QUIZ, buildQuizPrompt } from './quizPrompt';
import { normalizeQuizQuestion, pickBuiltinFallback } from './quizValidate';
// 線上題庫（2026-10-07 第二階段）：只認介面，不認 KV（見 server/quizBank.ts）
import { findBankMatch, listQuestionsSince, writeQuestionsToBank } from './quizBank';
// 離線分析路徑（2026-10-07）：與前端**共用同一支純函式**。
// ⚠️ 這個模組不含任何 Node 依賴，所以前端也能打包它 —— 那正是它能被共用的原因。
import { analyzeLabelLocally, answerHealthQuestionLocally } from './localAnalysis';
import { isLabelKey } from '../src/data/labelKeys';
import { getLearnerProfile, getNutrientDirections } from '../src/data/learnerProfiles';
// 雙語對照（2026-09-28）：提示詞與本機引擎都要依語言輸出正確的名稱。
// ⚠️ 2026-10-07：`conditionName` 已不再需要 —— 提示詞裡不再出現病名
//    （改送中性成分約束，見 `conditionConstraint.ts`）。
import { nutrientName, profileName } from '../src/data/bilingual';
// 難字簡化（2026-09-30）：把說明文字裡的「鈉含量」換成「鹽分含量」等。
// 這是最後一道後處理 —— 補的是「模型沒照提示詞用簡化名稱」的情況。
import { simplifyNutrientWordingInFields } from '../src/data/bilingual';
// ⚠️ 2026-10-07：`PHYSICAL_INDICATORS` 的匯入已移除 ——
//    它原本只用於「把病名轉成提示詞那一行」，那段已由
//    `expandConditionsToNutrients()` 取代（展開成中性成分）。
// ⚠️ 2026-10-07：`translateLocalResult` 的匯入已移除（同上，改由 ./localAnalysis 呼叫）。
import type { DataHandling, SeniorPhysicalIndicators } from '../src/types';

/** 極薄的 Express 相容層。只實作 handler 實際用到的兩個方法。 */
function makeRes() {
  const r: any = {
    _status: 200,
    _payload: undefined as any,
    status(code: number) {
      r._status = code;
      return r;
    },
    json(payload: any) {
      r._payload = payload;
      return { status: r._status, json: payload } as ApiResult;
    },
    result(): ApiResult {
      return { status: r._status, json: r._payload };
    },
  };
  return r;
}

/** 對應 `/api/analyze-label` */
export async function handleAnalyzeLabel(body: any, headers: Headers, deps: CoreDeps): Promise<ApiResult> {
  // 相容層：把平台請求包成 handler 認得的 req / res
  const req: any = { body, headers: Object.fromEntries(headers) };
  const res: any = makeRes();
  const handlerStart = Date.now();
  try {
    const {
      imageBase64,
      ocrText,
      ocrError,
      conditions = [],
      vitals,
      profileId,
      localOnly = true,
      /**
       * 介面語言（2026-09-28 新增）。
       *
       * 【為什麼後端要知道語言】
       *   分析結果（warning_title / plain_summary / knowledge_point…）是**後端產生**的。
       *   前端切成英文後，如果這裡不跟著換，使用者會看到英文介面配中文結論。
       *
       * 【為什麼預設 zh-TW】
       *   舊版客戶端不會帶這個欄位。預設成繁體中文，行為與改動前完全一致，
       *   不會因為這次改動讓既有使用者看到不同語言。
       */
      language = 'zh-TW',
    } = req.body;
    // 只有明確等於 'en' 才走英文，其餘（含 undefined、亂填）一律當繁體中文
    const isEnglish = language === 'en';
    /** 中文才附加稱呼規則；英文沒有「Mr + Hello」這種慣例（見 core.ts 的 ADDRESS_RULE）。 */
    const addressRule = isEnglish ? '' : ADDRESS_RULE;
    /**
     * ★ 2026-10-02：性別與稱謂機制已移除（使用者指定）。
     *   舊客戶端仍可能帶 `gender`，這裡**直接忽略**即可 ——
     *   不需要報錯，也不影響任何判斷（稱謂本來就不進快取鍵）。
     */
    console.log(`[LabelBuddy AI] 收到辨識請求（body 解析完成，耗時 ${Date.now() - handlerStart}ms）`);

    // ══════════════════════════════════════════════════════════════════
    // 兩種輸入模式
    //   【新】ocrText  —— 前端已在瀏覽器端讀出標籤文字，**照片從來沒有離開裝置**。
    //                    這是預設路徑，也是隱私承諾的核心。
    //   【舊】imageBase64 —— 伺服器端 OCR。保留相容（舊版客戶端），
    //                    也是 `npm run ocr:smoke` 在命令列實測時走的路。
    //
    // ⚠️ 判斷「哪一種模式」要看**欄位是否存在**，不是看內容是否為空。
    //    前端 OCR 失敗時會送 `ocrText: ''`，那仍然是文字模式，
    //    應該回「請重拍」而不是 400 —— 送 400 會讓前端顯示網路錯誤，
    //    使用者看到的是「系統壞了」，而不是「照片沒拍好」。
    // ══════════════════════════════════════════════════════════════════
    const isTextMode = typeof ocrText === 'string';
    const hasOcrText = isTextMode && ocrText.trim().length > 0;
    const hasImage = typeof imageBase64 === 'string' && imageBase64.length > 0;

    if (!isTextMode && !hasImage) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: '未收到食品標籤內容，請重新拍照或上傳。',
      });
    }

    // 前端 OCR 失敗時只留紀錄，不打擾使用者 —— 下面會走「請重拍」路徑。
    // 不把 ocrError 直接顯示給長者看：那是技術訊息，對他們沒有幫助。
    if (isTextMode && !hasOcrText && ocrError) {
      console.log(`[LabelBuddy AI] 前端 OCR 未讀到文字：${ocrError}`);
    }

    // 只有前端明確帶 localOnly:false（使用者按下了「允許上傳雲端」）才允許呼叫雲端。
    // 預設值刻意設為「不允許」，避免任何未預期的上傳。
    const allowCloud = localOnly === false;
    const dataHandling: DataHandling = allowCloud ? 'cloud' : 'local_only';

    // 去除 base64 前綴 (如 data:image/jpeg;base64,)。
    // 走文字模式時完全不會用到圖片，這裡刻意留空，避免任何機會誤傳。
    const cleanBase64 = hasImage ? imageBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, '') : '';
    const mimeTypeMatch = hasImage ? imageBase64.match(/^data:(image\/[a-zA-Z]+);base64,/) : null;
    const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/jpeg';

    // 學習者身分：決定 AI 的判斷基準（每日參考值）。
    // 傳入無效值時 getLearnerProfile 會安全退回「長者」，因此這裡不需額外防護。
    const learnerProfile = getLearnerProfile(profileId);
    // 營養素方向（上限 vs 目標）：`numericLimits` 本身沒有方向資訊，
    // 必須另外從 targets 攤平。漏掉的話膳食纖維／蛋白質會被當成「上限」。
    const nutrientDirections = getNutrientDirections(profileId);

    /**
     * ★★ 2026-10-07：**病名不再進入提示詞**（使用者指定）。
     *
     * 【原本這裡做什麼】
     *   把 `conditions`（前端送來的中文病名）轉成提示詞的一行：
     *     `【使用者的慢性病史】高血壓、糖尿病`
     *   （2026-10-06 還修過一個 bug：英文模式會拿到中文病名。）
     *
     * 【為什麼整段拿掉】
     *   那一行是**本 App 對 AI 供應商揭露最多的一筆健康資訊**，
     *   但它其實不是必要的 —— AI 需要知道的是「要盯哪些成分」。
     *   改用 `buildUserConstraintLine()`：由 `conditions.ts` 現成的
     *   `targetNutrients` 展開成中性成分清單（鈉、添加糖、花生…），
     *   AI 仍然知道要盯什麼，但不知道使用者有什麼病。
     *
     * ⚠️ 這裡**不是把 2026-10-06 的修正 revert 掉** ——
     *    是那一整段（含那個 bug）都不再需要了：
     *    提示詞裡已經沒有任何病名要翻譯。
     *
     * ⚠️ 使用者看到的提醒**不受影響**：`condition_reminders` 仍由
     *    `buildConditionReminders(conditions, language)` 在後端產生、含真病名，
     *    與送給 AI 的內容完全無關（見下方 `attachReminders`）。
     */

    /**
     * 附加慢性病專屬提醒。
     *
     * 【為什麼不寫進快取】
     *   提醒只跟「使用者勾了哪些病」有關，與照片內容無關，
     *   而且是由後端確定性產生的，不需要（也不該）佔用快取空間。
     *   每條回應路徑都直接算一次，成本近乎為零。
     *
     * ⚠️ 這裡**必須帶語言**：提醒是後端規則產生的，不經過 AI，
     *    所以兩條路徑（雲端／本機）都會用到它。
     *    漏帶的話英文介面會夾著中文病名與中文建議。
     */
    const attachReminders = (data: any) => ({
      ...data,
      condition_reminders: buildConditionReminders(conditions, language),
    });

    // ══════════════════════════════════════════════════════════════════
    // 文字模式但一個字都沒讀到 → 直接回「請重拍」，**不查快取也不呼叫雲端**。
    //
    // 【為什麼要提早擋掉】
    //   把空字串送給語言模型只會得到幻覺 —— 它會「根據標籤文字」講出一段
    //   根本不存在的內容，還白白消耗免費額度。這正是本專案最想避免的失敗模式：
    //   錯了不會報錯，只會很肯定地給錯答案。
    // ══════════════════════════════════════════════════════════════════
    if (isTextMode && !hasOcrText) {
      console.log('[LabelBuddy AI] 文字模式但沒有讀到任何字，直接請使用者重拍');
      return res.json({
        success: true,
        data: attachReminders({
          ...buildOcrFailedResult(learnerProfile, { matchedFields: 0 }, language),
          data_handling: dataHandling,
        }),
      });
    }

    let vitalText = '';
    if (vitals && vitals.systolicBp) {
      const timing = vitals.bloodSugarTiming === 'fasting'
        ? (isEnglish ? 'fasting' : '空腹')
        : (isEnglish ? 'after meal' : '飯後');
      vitalText = isEnglish
        ? `[Measured vitals] Blood pressure: ${vitals.systolicBp}/${vitals.diastolicBp} mmHg, heart rate: ${vitals.heartRate || 72} bpm, blood sugar: ${vitals.bloodSugar} ${vitals.bloodSugarUnit || 'mmol/L'} (${timing}).`
        : `【長者量測指標】血壓: ${vitals.systolicBp}/${vitals.diastolicBp} mmHg，心跳: ${vitals.heartRate || 72} bpm，血糖: ${vitals.bloodSugar} ${vitals.bloodSugarUnit || 'mmol/L'} (${timing})。`;
    }

    /**
     * 兩種輸入模式共用的情境說明。
     *
     * 抽出來的理由：提示詞裡「標籤內容」那一段必須隨模式不同（文字 vs 圖片），
     * 但其餘（病史、身分、每日參考值、慢性病清單）完全一樣。
     * 分成兩份遲早會漂移，所以只留一份。
     */
    const promptContext = isEnglish
      ? `
[Ingredients to watch for] ${buildUserConstraintLine(conditions, language)}
${vitalText}

[★ Important] The list above is derived from the user's health settings. Judge ONLY these
ingredients. Do NOT guess or name any disease or medical condition, and never write a
condition name in any output field.

[Judge specifically from this profile's angle]
- Key ingredients for this profile: ${learnerProfile.aiFocus}
- Daily reference values: ${learnerProfile.targets
          .map(
            (t) =>
              `${nutrientName(t.nutrient, language)} ${t.direction === 'limit' ? 'at most' : 'at least'} ${t.target}`
          )
          .join(', ')}

[General condition checklist] Hypertension (sodium), high blood sugar / diabetes (sugar and refined carbs), heart and cardiovascular (trans fats and high caffeine), high cholesterol (saturated and trans fats), gout (purines and fructose), kidney disease (sodium, potassium, phosphorus), acid reflux (spicy, acidic, irritating foods), osteoporosis (phosphates and heavy salt), fatty liver (sugar, fructose, saturated fat), heart failure (strict sodium limit), iron-deficiency anaemia (tannins and calcium block iron), constipation (too little fibre), insomnia (caffeine), migraine (MSG and tyramine), plus food allergens (peanuts, tree nuts, seafood, dairy, wheat gluten).
If the user added their own condition (shown as "其他：<name>" / "Other: <name>"), judge it too, using general nutrition principles — and say plainly that this item was not checked against a built-in rule.`
      : `
【要盯緊的成分】${buildUserConstraintLine(conditions, language)}
${vitalText}

【★ 重要】上面這份清單是從使用者的健康設定推導出來的。**只針對這些成分判斷**，
不要推測使用者有什麼疾病，也不要在任何輸出欄位裡寫出病名。

【請以此身分的角度特別比對】
- 這個身分的關鍵成分：${learnerProfile.aiFocus}
- 每日參考值：${learnerProfile.targets
          .map((t) => `${t.nutrient}${t.direction === 'limit' ? '不超過' : '至少'}${t.target}`)
          .join('、')}

【通用慢性病比對清單】高血壓(鈉含量)、高血糖/糖尿病(糖分與精製碳水)、心跳與心血管(反式油脂與高咖啡因)、高血脂(飽和脂肪與反式脂肪)、痛風(普林與果糖)、腎臟病(鈉鉀磷)、胃食道逆流(刺激辛辣酸)、骨質疏鬆(磷酸與重鹽)、脂肪肝(糖與飽和脂肪)、心臟衰竭(嚴格限鈉)、缺鐵性貧血(單寧酸與鈣妨礙鐵吸收)、便秘(纖維不足)、失眠(咖啡因)、偏頭痛(味精與酪胺酸)，以及食物過敏原(花生、堅果、海鮮、乳製品、小麥麩質)。
若使用者自行填寫了病症（會以「其他：病名」的形式出現），也請一併用一般營養原則判斷，並坦白說明這一項沒有內建規則可比對。`;

    const userPromptText = isEnglish
      ? hasOcrText
        ? `Below is text read from a food label photo by OCR on the user's own device — **the photo itself was never uploaded**.
Judge ONLY from this text whether the product is suitable for: ${profileName(learnerProfile.id, learnerProfile.name, language)}.

[LABEL TEXT START]
${ocrText}
[LABEL TEXT END]
${promptContext}`
        : `Analyze this food label and judge whether it is suitable for: ${profileName(learnerProfile.id, learnerProfile.name, language)}.
${promptContext}`
      : hasOcrText
        ? `以下是從食品標籤照片上讀出的文字，由使用者的裝置以 OCR 產生 —— **照片本身沒有上傳**。
請只根據這些文字判斷是否適合「${learnerProfile.name}」購買。

【標籤文字開始】
${ocrText}
【標籤文字結束】
${promptContext}`
        : `請分析這張食品標籤，判斷是否適合「${learnerProfile.name}」購買。
${promptContext}`;

    // 先查快取：同一張圖 + 同一組慢性病 + 同一個身分在 TTL 內不重複呼叫 API，
    // 這是節省免費額度最有效的手段。
    // 身分必須納入鍵值：同一包高蛋白粉，對健身族與腎臟病患者結論完全不同。
    // 處理模式也要納入鍵值：本機結果不該被拿去回答「已同意上傳」的請求，反之亦然。
    // ⚠️ 語言也必須納入鍵值（2026-09-28）：
    //    分析結果的文字是後端產生的，中英文快取若共用同一個鍵，
    //    切換語言後會拿到另一種語言的舊結果 —— 而且**不會報錯**，
    //    使用者只會覺得「切了語言怎麼沒變」。這是最難察覺的一種 bug。
    // ⚠️⚠️ 內容來源見 `analysisCacheContent()` —— 文字模式一定要用 ocrText，
    //     否則所有商品會共用一個鍵（實測會把泡麵判成「非常適合長者食用」）。
    const cacheKey = makeCacheKey(
      analysisCacheContent({ isTextMode, ocrText, imageBase64: cleanBase64 }),
      [
        ...conditions,
        `profile:${learnerProfile.id}`,
        `mode:${allowCloud ? 'cloud' : 'local'}`,
        `lang:${isEnglish ? 'en' : 'zh'}`,
      ]
    );

    if (allowCloud) {
      const cached = readCache(cacheKey);
      if (cached) {
        console.log(`[LabelBuddy AI] 命中快取，未消耗任何 API 額度（來源：${cached.provider}）`);
        // 快取存的可能是舊格式，出快取時再正規化一次，確保欄位齊全
        const cachedFacts = normalizeNutrientFacts(
          cached.data?.nutrient_facts,
          learnerProfile.numericLimits,
          nutrientDirections
        );
        const cachedData: any = {
          ...cached.data,
          nutrient_facts: cachedFacts,
          analysis_mode: 'cloud_ai',
          ai_model: cached.model,
          ai_provider: cached.provider,
          cached: true,
          data_handling: 'cloud' as DataHandling,
          learner_profile_id: learnerProfile.id,
          learner_profile_name: profileName(learnerProfile.id, learnerProfile.name, language),
        };
        // 舊快取可能沒有食育欄位，這裡一併補齊
        ensureEducationFields(cachedData, cachedFacts, language);
        simplifyNutrientWordingInFields(cachedData, NUTRIENT_WORDING_FIELDS);
        return res.json({ success: true, data: attachReminders(cachedData) });
      }
    } else {
      console.log('[LabelBuddy AI] 使用者未同意雲端分析（localOnly），照片不會離開本機');
    }

    // 首選：雲端視覺 AI（依使用率在 Gemini 與 OpenRouter 之間輪替）
    // 只有使用者明確同意（allowCloud）才會走到這裡。
    if (allowCloud) {
      const aiResult = await callAiModel(req, {
        systemInstruction:
          buildSystemInstruction(
            learnerProfile.id,
            isEnglish ? 'en' : 'zh-TW'
          ) + addressRule,
        userPrompt: userPromptText,
        // ⚠️ 文字模式下**絕對不傳圖片** —— 這是隱私承諾的核心：
        //    照片從來沒有離開使用者的裝置，雲端只看得到文字。
        //    兩個供應商的圖片參數本來就是選填的（`if (options.image)`），
        //    所以傳 undefined 就會走純文字模式，不需要改供應商程式碼。
        image: isTextMode ? undefined : { base64: cleanBase64, mimeType },
        temperature: 0.2,
      });

      if (aiResult) {
        // 用每日上限重算百分比，覆蓋模型自己算的數字（模型算術不可靠）
        const cloudFacts = normalizeNutrientFacts(
          aiResult.data.nutrient_facts,
          learnerProfile.numericLimits,
          nutrientDirections
        );
        aiResult.data.nutrient_facts = cloudFacts;
        aiResult.data.analysis_mode = 'cloud_ai';
        aiResult.data.ai_model = aiResult.model;
        aiResult.data.ai_provider = aiResult.provider;
        /**
         * 開發者面板要看的「AI 原始回傳」（2026-10-03 使用者要求）。
         * ⚠️ 截斷 2000 字元 —— 原始文字可能包含模型多餘的說明，
         *    全部塞進回應會讓 payload 變大（照片模式的回應本來就不小）。
         * 這是使用者自己的資料，不會外洩給第三方。
         */
        aiResult.data.ai_raw_text = String(aiResult.rawText || '').slice(0, 2000);
        aiResult.data.data_handling = 'cloud';
        aiResult.data.learner_profile_id = learnerProfile.id;
        aiResult.data.learner_profile_name = profileName(learnerProfile.id, learnerProfile.name, language);

        /**
         * ★★ 2026-10-04：**顏色一律不採信 AI** —— 照片有問題時強制改掉綠燈。
         *
         * 【問題】使用者回報「本機模式會把不是食物、沒有任何成分的東西（如紙）
         *   也說可以食用」。實測找到真正的原因在**雲端路徑**：
         *   AI 正確地判斷「這不是食物標籤」，但同時回了 `risk_level: "green"`。
         *   於是畫面上是一張**綠燈卡片**（綠色在這個 App 就是「可以吃」），
         *   標題卻寫「這不是食物標籤」—— 使用者看到的就是「說可以食用」。
         *
         * 【為什麼這一定要在後端擋】
         *   `photo_issue` 在前端只用來決定「重拍按鈕的文字」，
         *   沒有任何地方用它修正顏色。也就是說 AI 一旦回錯顏色，
         *   前端完全沒有能力救 —— 而這件事已經發生過。
         *
         * 【修法】把 AI 的顏色當成建議，`photo_issue` 存在時一律至少黃燈：
         *   不是食物標籤 / 照片模糊 → 不可能有「可以放心吃」的結論，
         *   因為**根本沒有讀到這份食品的資料**。
         *   ★ 這與本專案的核心原則一致：顏色以確定性規則為準，AI 只提供文字。
         */
        if (aiResult.data.photo_issue) {
          const before = aiResult.data.risk_level;
          aiResult.data.risk_level = 'yellow';
          console.log(
            `[LabelBuddy AI] 照片問題 ${aiResult.data.photo_issue}：` +
              `顏色由 ${before} 強制改為 yellow（沒有讀到食品資料，不能給綠燈）`
          );
        }

        // 模型漏給食育欄位時用確定性內容補上（由真實 nutrient_facts 推導）
        ensureEducationFields(aiResult.data, cloudFacts, language);
        writeCache(cacheKey, aiResult.data, aiResult.model, aiResult.provider);
        simplifyNutrientWordingInFields(aiResult.data, NUTRIENT_WORDING_FIELDS);
        console.log(`[LabelBuddy AI] 雲端辨識完成（${aiResult.provider}），處理器總耗時 ${Date.now() - handlerStart}ms`);
        return res.json({
          success: true,
          data: attachReminders(aiResult.data),
        });
      }
    }

    // ======================================================================
    // 降級：本機離線引擎（未同意雲端、無金鑰，或雲端連續失敗時）
    //
    // 【為什麼要先做 OCR】
    //   舊版本直接呼叫 extractNutritionProfile()，那是「依圖片位元組長度」
    //   在三組寫死的營養資料之間輪替 —— 與照片內容完全無關。
    //   也就是說離線時系統會捏造一份看起來很肯定的紅／黃／綠結論。
    //   現在改成先在本機用 tesseract.js 讀出真實數字；
    //   讀不到就誠實請使用者重拍，絕不用預設值湊出結論。
    // ======================================================================
    console.log('[LabelBuddy AI] 啟動本機離線辨識引擎');
    /**
     * ★ 2026-10-07：本機路徑改為呼叫**共用**的 `analyzeLabelLocally()`。
     *
     * 【為什麼要共用同一支函式】
     *   「只在本機」模式現在在前端**直接呼叫它**（零網路請求、斷網可用）。
     *   如果後端自己留一份實作，兩份遲早會分岔 —— 而且分岔時**不會報錯**，
     *   只會變成「同一張標籤，線上和離線得到不同結論」。
     *   有一條 parity 檢查（`check-offline-parity.ts`）在逐欄位比對兩條路徑。
     *
     * 【為什麼這裡還需要伺服器端 OCR】
     *   舊客戶端會直接送圖片，命令列實測也會。但 Worker 沒有 tesseract.js，
     *   所以只有 Node（本機 `server.ts`）提供 `deps.recognizeImage`。
     *   Worker 拿不到時明確回 OCR_NOT_AVAILABLE —— 明確回報比默默失敗好。
     *
     * ⚠️ 圖片模式要先拿到**原始文字**再交給共用函式（它會自己重新解析）。
     *    `OcrRecognitionResult.rawText` 就是為此保留的。
     */
    let localOcrText: string = ocrText;
    if (!isTextMode) {
      if (!deps.recognizeImage) {
        // Cloudflare Worker 沒有 tesseract.js，也不該有 —— OCR 已經在瀏覽器做完了。
        // 走到這裡代表客戶端太舊（送圖片）或有人直接呼叫 API，明確回報比默默失敗好。
        return {
          status: 400,
          json: {
            error: 'OCR_NOT_AVAILABLE',
            message: '此伺服器不接受圖片，請使用支援前端辨識的版本。',
          },
        };
      }
      const recognized = await deps.recognizeImage(cleanBase64);
      localOcrText = recognized.rawText;
      console.log(
        `[LabelBuddy AI] 離線 OCR：讀到 ${recognized.matchedFields} 個營養欄位` +
          (recognized.ok ? '（採用）' : `（不足，${recognized.error}）`)
      );
    }

    return res.json({
      success: true,
      data: analyzeLabelLocally({
        ocrText: localOcrText,
        conditions,
        profileId: learnerProfile.id,
        language,
        // ⚠️ 一定要傳 —— 這個值是閘門（allowCloud）算出來的，
        //    讓共用函式自己猜會變成「回應的隱私標記與閘門的實際判斷不一致」。
        dataHandling,
      }),
    });
  } catch (error: any) {
    // 例外時不再回傳捏造的結果：直接告訴使用者系統忙碌，請他重試。
    // （舊版會用 extractNutritionProfile('') 生出一份泡麵報告，等於誤導。）
    console.error('API 處理異常:', error);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: '系統忙碌中，請稍後再試一次。',
    });
  }
  // 走到這裡代表 handler 沒有提早 return（例如 GET 端點直接 res.json）
  return res.result();
}

/** 對應 `/api/analyze-indicators` */
export async function handleAnalyzeIndicators(body: any, headers: Headers, deps: CoreDeps): Promise<ApiResult> {
  // 相容層：把平台請求包成 handler 認得的 req / res
  const req: any = { body, headers: Object.fromEntries(headers) };
  const res: any = makeRes();
  try {
    const indicators: SeniorPhysicalIndicators = req.body.indicators;
    if (!indicators) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: '未收到長者身體指標數據。',
      });
    }

    // 介面語言（與標籤分析同一套規則：只有明確 'en' 才走英文）
    const language: 'zh-TW' | 'en' = req.body.language === 'en' ? 'en' : 'zh-TW';
    const isEnglish = language === 'en';
    /** 中文才附加稱呼規則；英文沒有「Mr + Hello」這種慣例（見 core.ts 的 ADDRESS_RULE）。 */
    const addressRule = isEnglish ? '' : ADDRESS_RULE;
    // 稱謂（只影響怎麼稱呼；舊客戶端不帶 → 中性）

    const sugarDisplay = indicators.bloodSugarUnit === 'mg/dL'
      ? `${indicators.bloodSugar} mg/dL`
      : `${indicators.bloodSugar} mmol/L (度)`;

    const promptText = `請幫這位使用者分析他今天量到的身體健康指標：
- 年齡區間：${indicators.ageGroup || '未提供'}
- 血壓：上壓 ${indicators.systolicBp} mmHg，下壓 ${indicators.diastolicBp} mmHg
- 血糖：${sugarDisplay}（狀態：${indicators.bloodSugarTiming === 'fasting' ? '早晨空腹' : '吃飽飯後'}）
- 尿酸/關節狀況：${indicators.uricAcidStatus}
- 血脂/膽固醇狀況：${indicators.cholesterolStatus}
- 腎臟/腳部水腫狀況：${indicators.kidneyStatus}
- 使用者自覺症狀感受：${(indicators.symptoms || []).join('、') || '無特別不舒服'}

請用最通俗、最溫暖的「大白話」，清楚告訴他現在身體狀況如何，並給出超實用的「超市買菜指南（什麼不能買、什麼可以買）」與語音朗讀摘要。`;

    /**
     * ⚠️ 同意閘門（2026-09-30 補上）。
     *
     * 【為什麼現在才補】
     *   先前這個端點**無條件呼叫雲端** —— 使用者選「只在本機」時，
     *   血壓、心跳、血糖、自覺症狀照樣會被送到 OpenRouter。
     *   引導頁與私隱條款卻寫著「身體指標不會上傳」，兩者不符。
     *   這不是效能問題，是**對使用者的承諾不成立**。
     */
    const localOnly = req.body?.localOnly === true;

    const aiResult = localOnly
      ? null
      : await callAiModel(req, {
          systemInstruction:
            (isEnglish
              ? SYSTEM_INSTRUCTION_INDICATORS + ENGLISH_OUTPUT_OVERRIDE_INDICATORS
              : SYSTEM_INSTRUCTION_INDICATORS) + addressRule,
          userPrompt: promptText,
          temperature: 0.3,
          maxTokens: 1200,
        });

    if (aiResult) {
      aiResult.data.analysis_mode = 'cloud_ai';

      /* ── 安全覆蓋：顏色一律以「規則引擎」為準 ─────────────────────
       * 實測發現：血壓 158/96、空腹血糖 8.4（兩項都超過紅燈門檻）
       * 規則引擎判 red，但雲端模型回 yellow。
       *
       * 對健康 App 來說，**低估警告（該紅卻報黃）比誤報更危險** ——
       * 使用者看到黃色就會覺得「還好」，可能延誤就醫。
       * 模型的文字解釋可以採用（它比規則引擎細膩），
       * 但「紅黃綠」這個安全訊號必須由可預測的門檻決定。
       */
      const ruleLevel = analyzeSeniorPhysicalIndicators(indicators, language).status_level;
      const order: Record<string, number> = { green: 0, yellow: 1, red: 2 };
      const aiLevel = String(aiResult.data.status_level ?? 'green');
      // 只在「規則比 AI 更嚴重」時升級；AI 判得比規則重就保留（寧可保守）
      if ((order[ruleLevel] ?? 0) > (order[aiLevel] ?? 0)) {
        aiResult.data.status_level = ruleLevel;
      }

      return res.json({
        success: true,
        data: applyIndicatorPostprocessing(aiResult.data),
      });
    }

    // 降級：本機備援智慧指標分析引擎 (100% 大白話守護)
    console.log('[LabelBuddy AI] 指標分析啟動本機守護引擎');
    const smartAnalysis = analyzeSeniorPhysicalIndicators(indicators, language);
    return res.json({
      success: true,
      data: applyIndicatorPostprocessing(smartAnalysis),
    });
  } catch (error: any) {
    console.error('身體指標處理異常:', error);
    // ⚠️ `language` 宣告在 try 區塊內，catch 取不到 → 這裡重新算一次。
    //    不能只寫死 'zh-TW'，否則英文模式遇到例外會突然冒出中文。
    const fallbackLanguage: 'zh-TW' | 'en' = req.body?.language === 'en' ? 'en' : 'zh-TW';
    const fallback = analyzeSeniorPhysicalIndicators(req.body?.indicators || {
      systolicBp: 130,
      diastolicBp: 82,
      bloodSugar: 6.2,
      bloodSugarUnit: 'mmol/L',
      bloodSugarTiming: 'fasting',
      uricAcidStatus: 'normal',
      cholesterolStatus: 'normal',
      kidneyStatus: 'normal',
      symptoms: [],
      ageGroup: '70-79歲',
    }, fallbackLanguage);
    return res.json({
      success: true,
      data: applyIndicatorPostprocessing(fallback),
    });
  }
  // 走到這裡代表 handler 沒有提早 return（例如 GET 端點直接 res.json）
  return res.result();
}

/** 對應 `/api/ask-health-question` */
export async function handleAskHealthQuestion(body: any, headers: Headers, deps: CoreDeps): Promise<ApiResult> {
  // 相容層：把平台請求包成 handler 認得的 req / res
  const req: any = { body, headers: Object.fromEntries(headers) };
  const res: any = makeRes();
  try {
    const { question, indicators } = req.body;
    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: '請輸入您想問的健康問題喔！',
      });
    }

    const cleanQuestion = question.trim();

    // 介面語言（與標籤／指標同一套規則：只有明確 'en' 才走英文）
    const language: 'zh-TW' | 'en' = req.body.language === 'en' ? 'en' : 'zh-TW';
    const isEnglish = language === 'en';
    /** 中文才附加稱呼規則；英文沒有「Mr + Hello」這種慣例（見 core.ts 的 ADDRESS_RULE）。 */
    const addressRule = isEnglish ? '' : ADDRESS_RULE;
    // 稱謂（只影響怎麼稱呼；舊客戶端不帶 → 中性）

    let contextInfo = '';
    if (indicators) {
      contextInfo = `使用者目前量到的身體指標背景：
- 血壓：上壓 ${indicators.systolicBp || 130} mmHg，下壓 ${indicators.diastolicBp || 80} mmHg
- 血糖：${indicators.bloodSugar || 6.0} ${indicators.bloodSugarUnit || 'mmol/L'}（${indicators.bloodSugarTiming === 'fasting' ? '空腹' : '飯後'}）
- 尿酸痛風：${indicators.uricAcidStatus || '正常'}
- 血管膽固醇：${indicators.cholesterolStatus || '正常'}
- 自覺症狀：${(indicators.symptoms || []).join('、') || '無特殊不適'}`;
    }

    const promptText = `使用者的問題是：「${cleanQuestion}」

${contextInfo}

${contextInfo
  ? '請針對使用者的提問與其體況數字，以 100% 通俗大白話、親切但不過度裝熟的口吻回答他。'
  : '使用者沒有提供任何身體數字（本 App 已不再收集血壓／心跳／血糖），所以請不要假設或編造任何數值，改用他勾選的慢性病當背景。'}

請以 100% 通俗大白話、親切但不過度裝熟的口吻回答他。清楚說明到底「能不能吃/能不能做」、「為什麼」、「該怎麼吃才安全」，並提供一句話結論與語音朗讀文稿。`;

    /**
     * ⚠️ 同意閘門（2026-09-30 補上）。
     *
     * 【為什麼現在才補】
     *   先前這個端點**無條件呼叫雲端** —— 使用者選「只在本機」時，
     *   他打的健康問題（以及當時的身體指標）照樣會送到 OpenRouter。
     *   使用者的提問往往比標籤文字更私密（例如「我這樣是不是快中風了」），
     *   所以這個閘門比標籤那邊更需要。
     */
    const localOnly = req.body?.localOnly === true;

    const aiResult = localOnly
      ? null
      : await callAiModel(req, {
          systemInstruction:
            (isEnglish
              ? SYSTEM_INSTRUCTION_HEALTH_QA + ENGLISH_OUTPUT_OVERRIDE_HEALTH_QA
              : SYSTEM_INSTRUCTION_HEALTH_QA) + addressRule,
          userPrompt: promptText,
          temperature: 0.3,
          maxTokens: 1000,
        });

    if (aiResult) {
      const parsed = aiResult.data;
      const qaData: any = {
        question: cleanQuestion,
        key_takeaway: parsed.key_takeaway,
        answer: parsed.answer,
        safe_tips: parsed.safe_tips || [],
        voice_script: parsed.voice_script || parsed.answer,
        source: 'cloud_ai',
      };
      simplifyNutrientWordingInFields(qaData, QA_TEXT_FIELDS);
      return res.json({
        success: true,
        data: qaData,
      });
    }

    // 降級：備用大白話長者問答引擎
    console.log('[LabelBuddy AI] 健康問答啟動本機守護引擎');
    /**
     * ★ 2026-10-07：要告訴引擎「為什麼」走到這條路。
     *   只在本機模式的使用者是**主動選擇**不送給 AI（他是有連線的），
     *   回覆寫「連不上 AI」是假的，也會讓他以為「網路好一點就有 AI 回答」。
     */
    // ★ 2026-10-07：改呼叫**共用**的離線函式（前端也匯入它）。
    //   這樣「只在本機」時前端能直接算出同一份答案，不必發這個請求。
    const fallbackAnswer = answerHealthQuestionLocally({
      question: cleanQuestion,
      indicators,
      language,
      reason: localOnly ? 'user_choice' : 'unreachable',
    });
    return res.json({
      success: true,
      data: fallbackAnswer,
    });
  } catch (error: any) {
    console.error('處理健康問題時發生錯誤:', error);
    // ⚠️ language 宣告在 try 內，catch 取不到 → 這裡重算，否則英文模式遇到例外會冒中文
    const qaFallbackLanguage: 'zh-TW' | 'en' = req.body?.language === 'en' ? 'en' : 'zh-TW';
    // ⚠️ localOnly 同理（也在 try 內宣告）→ 重算，否則後備文案會把「使用者選擇」講成「連不上」
    const qaLocalOnly = req.body?.localOnly === true;
    const fallbackAnswer = answerHealthQuestionLocally({
      question: req.body?.question || '常見健康保養',
      indicators: req.body?.indicators,
      language: qaFallbackLanguage,
      reason: qaLocalOnly ? 'user_choice' : 'unreachable',
    });
    return res.json({
      success: true,
      data: fallbackAnswer,
    });
  }
  // 走到這裡代表 handler 沒有提早 return（例如 GET 端點直接 res.json）
  return res.result();
}

/**
 * 對應 `/api/quiz-question`
 *
 * 「學一個小知識」的測驗題來源。流程：
 *   ① 同意閘門（`localOnly`）→ 只在本機時**絕不連雲端**，回確定性內建題
 *   ② 呼叫雲端 AI 生成一題
 *   ③ 嚴格驗證；不合格就整題丟棄
 *   ④ 失敗／不合格 → 退回內建題（**卡片永遠有內容，絕不留空白**）
 *
 * ⚠️ 永遠回 HTTP 200 + `{success:true}`，連例外也一樣 ——
 *    這是本專案既有慣例（見 `handleAskHealthQuestion`）：
 *    回 500 會讓前端顯示「系統壞了」，而使用者其實只是拿不到一道題。
 *
 * ⚠️ 這裡是**唯一**會把「這張標籤的營養數字」送給 AI 的地方。
 *    所以前端必須依 `analysisMode` 決定要不要帶 `localOnly: false`
 *    （見 `LearnFromScanCard`），後端這裡是第二道防線。
 */
export async function handleQuizQuestion(body: any, headers: Headers, deps: CoreDeps): Promise<ApiResult> {
  // 相容層：把平台請求包成 handler 認得的 req / res
  const req: any = { body, headers: Object.fromEntries(headers) };
  const res: any = makeRes();
  try {
    // ── 入參驗證（不合格就 400，不要浪費 AI 額度）──────────────────
    const rawKeys = Array.isArray(req.body?.labelKeys) ? req.body.labelKeys : [];
    const labelKeys = rawKeys.filter((k: unknown) => isLabelKey(k));
    const ctx = req.body?.labelContext;
    if (
      labelKeys.length === 0 ||
      !ctx ||
      typeof ctx.name !== 'string' ||
      !Number.isFinite(Number(ctx.value))
    ) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: '缺少標籤資訊，無法出題。',
      });
    }

    const excludeIds: string[] = (Array.isArray(req.body?.excludeIds) ? req.body.excludeIds : [])
      .filter((x: unknown): x is string => typeof x === 'string')
      .slice(0, 60);

    // ── ★ 同意閘門（第二道防線）────────────────────────────────────
    // 前端在 local_only 時不會送這個請求；這裡再擋一次，
    // 確保「就算有人直接打這個 API」也不會把標籤數字送到雲端。
    const localOnly = req.body?.localOnly === true;
    if (localOnly) {
      console.log('[LabelBuddy AI] 出題：只在本機模式 → 回內建題，不呼叫任何外部服務');
      return res.json({
        success: true,
        data: pickBuiltinFallback(labelKeys, excludeIds),
        fromBank: false,
        localOnly: true,
      });
    }

    // ── ★ 先查線上題庫（2026-10-07 第二階段）──────────────────────
    //   命中就**完全不呼叫 AI** —— 這是省額度最主要的手段。
    //   ⚠️ 只有「labelKeys 有交集」才算命中（見 findBankMatch 的說明）；
    //      通用題不算，否則 AI 生成永遠不會被觸發。
    if (deps.quizBank) {
      try {
        const hit = await findBankMatch(deps.quizBank, labelKeys, excludeIds);
        if (hit) {
          console.log('[LabelBuddy AI] 出題：命中線上題庫，未消耗任何 API 額度');
          return res.json({ success: true, data: hit, fromBank: true });
        }
      } catch (e) {
        // 題庫查詢失敗不該讓出題失敗 —— 繼續往下走 AI 那條路
        console.warn('[LabelBuddy AI] 查詢線上題庫失敗，改用 AI 生成:', e);
      }
    }

    // ── 呼叫雲端 AI 生成 ─────────────────────────────────────────
    const aiResult = await callAiModel(req, {
      systemInstruction: SYSTEM_INSTRUCTION_QUIZ,
      userPrompt: buildQuizPrompt({
        labelKeys,
        context: {
          name: ctx.name,
          value: Number(ctx.value),
          unit: typeof ctx.unit === 'string' ? ctx.unit : '',
          dailyLimit: Number.isFinite(Number(ctx.dailyLimit)) ? Number(ctx.dailyLimit) : undefined,
          percent: Number.isFinite(Number(ctx.percent)) ? Number(ctx.percent) : undefined,
        },
        excludeIds,
      }),
      // 溫度稍高（0.5）是刻意的：題目要有一點變化，
      // 不像安全結論那樣必須完全確定（那是規則引擎的職責，不是 AI 的）。
      temperature: 0.5,
      maxTokens: 900,
    });

    const candidate = aiResult ? normalizeQuizQuestion(aiResult.data, labelKeys) : null;
    if (candidate) {
      /**
       * ★ 寫進線上題庫（第二階段）。
       *
       * 【為什麼「不等寫完就回」】
       *   KV 是**最終一致性**（跨 PoP 最多約 60 秒）。
       *   如果等它寫完才回，使用者要為一個「別台裝置才會用到」的動作多等。
       *   → 先把題目 inline 回給本次使用者（前端立刻 merge 進本機題庫，
       *     同一台裝置馬上就能再用到），寫 KV 只是順便。
       *
       * ⚠️ 但仍然 **await**（不是 fire-and-forget）：
       *    Worker 的 isolate 在回應送出後可能被凍結，
       *    沒有 await 的 Promise 會**無聲無息地不完成** ——
       *    題目永遠不會進題庫，而且沒有任何錯誤訊息。
       */
      if (deps.quizBank) {
        try {
          await writeQuestionsToBank(deps.quizBank, [candidate]);
        } catch (e) {
          console.warn('[LabelBuddy AI] 寫入線上題庫失敗（不影響本次出題）:', e);
        }
      }
      return res.json({ success: true, data: candidate, fromBank: false });
    }

    // ── 降級：AI 不可用或輸出不合格 → 退回內建題 ──────────────────
    console.log('[LabelBuddy AI] 出題：AI 不可用或輸出不合格，退回內建題');
    return res.json({
      success: true,
      data: pickBuiltinFallback(labelKeys, excludeIds),
      fromBank: false,
    });
  } catch (error: any) {
    console.error('產生小知識題目時發生錯誤:', error);
    // ⚠️ 連例外都要回一份可用的東西，不要讓畫面的卡片空著
    try {
      return res.json({ success: true, data: pickBuiltinFallback([], []) });
    } catch {
      return res.json({ success: true, data: null });
    }
  }
}

/**
 * 對應 `/api/quiz-bank`（GET `?since=<ms>`）—— 線上題庫同步（2026-10-07 第二階段）。
 *
 * 【為什麼沒有同意閘門】
 *   同意閘門的規則是「**會把使用者的資料送到 AI 供應商**的功能都要有兩道防線」。
 *   這個端點：
 *     · 不呼叫任何 AI 供應商
 *     · 不帶任何個人資料（沒有標籤、沒有病史、沒有照片）
 *     · 回傳的是**大家共用的公開題庫**
 *   → 所以不需要閘門。前端的同步 effect 在 `local_only` 時仍然會跳過它，
 *     那是「少發一個請求」的額外好處，不是安全性要求。
 *
 * ⚠️ **但如果哪天這個端點開始帶上個人化的參數（例如帶著使用者的 labelKeys
 *    去查），就必須回頭補上同意閘門。** 這一條寫在這裡，是為了讓那個人看到。
 *
 * 【`since` 的語意】
 *   用戶端**上次成功合併**的時間（毫秒）。
 *   ⚠️ 用戶端必須「先合併、成功後才推進 since」——
 *      先推進再合併的話，中途失敗會永久漏掉那一段題目，而且不會報錯。
 */
export async function handleQuizBank(body: any, headers: Headers, deps: CoreDeps): Promise<ApiResult> {
  const req: any = { body, headers: Object.fromEntries(headers) };
  const res: any = makeRes();

  const rawSince = Number(req.body?.since);
  const since = Number.isFinite(rawSince) && rawSince > 0 ? rawSince : 0;

  // ── 沒有綁 KV（本機 Node、或 binding 被拿掉）→ 回空題庫，不要報錯 ──
  //    ⚠️ 回 200 而不是 4xx/5xx：對用戶端來說「題庫是空的」與
  //       「這個部署沒有題庫」要做的事完全一樣（什麼都不必合併）。
  //       回錯誤只會讓前端多一個要處理的分支，而且會蓋掉真正該注意的錯誤。
  if (!deps.quizBank) {
    return res.json({
      success: true,
      data: { questions: [], version: 0, updatedAt: 0 },
      bankAvailable: false,
    });
  }

  try {
    const { questions, version, updatedAt } = await listQuestionsSince(deps.quizBank, since);
    return res.json({
      success: true,
      data: { questions, version, updatedAt },
      bankAvailable: true,
    });
  } catch (error: any) {
    console.error('[LabelBuddy AI] 讀取線上題庫失敗:', error);
    // 題庫讀不到不該讓任何主流程壞掉 —— 回空題庫，前端照常運作
    return res.json({
      success: true,
      data: { questions: [], version: 0, updatedAt: 0 },
      bankAvailable: false,
    });
  }
}

/** 對應 `/api/privacy` */
export async function handlePrivacy(body: any, headers: Headers, deps: CoreDeps): Promise<ApiResult> {
  // 相容層：把平台請求包成 handler 認得的 req / res
  const req: any = { body, headers: Object.fromEntries(headers) };
  const res: any = makeRes();
  const keys = providerKeys();
  const cloudAvailable = isValidKey(keys.gemini) || isValidKey(keys.openrouter);

  res.json({
    status: 'ok',
    /**
     * 預設模式。
     *
     * ⚠️ 2026-09-30 起改為三模式。這裡回報的是**引導頁的預設選項**，
     *    不是「伺服器強制」—— 使用者可以選任何一種，伺服器只照著做。
     */
    defaultMode: 'cloud_image',
    /**
     * ⚠️ 舊版這裡寫 `imageNeverLeavesDevice: true`，那是**對的**（當時只有 OCR 文字模式）。
     *    加入「直接雲端」模式之後這句話不再成立，所以改成逐模式列出，
     *    不再給一個概括的保證 —— 概括的保證在模式增加時最容易變成謊言。
     */
    modes: {
      cloud_image: {
        id: 'cloud_image',
        name: '直接雲端（照片上傳）',
        uploadsImage: true,
        uploadsOcrText: false,
        uploadsHealthInfo: true,
        requiresConsent: true,
        available: cloudAvailable,
        providers: ['Google Gemini', 'OpenRouter'],
        description:
          '照片會直接上傳給雲端視覺模型判讀（不經過本機 OCR），同時傳送您勾選的慢性病史。準確度最高，因為模型看得到標籤的實際版面。伺服器不落地儲存照片。',
      },
      cloud_text: {
        id: 'cloud_text',
        name: '本機 OCR ＋ 雲端 AI',
        uploadsImage: false,
        uploadsOcrText: true,
        uploadsHealthInfo: true,
        requiresConsent: true,
        available: cloudAvailable,
        providers: ['Google Gemini', 'OpenRouter'],
        description:
          '照片在您的手機上就以離線 OCR 讀成文字，只有文字與您勾選的慢性病史會傳送給雲端文字模型。照片本身不會上傳。',
      },
      local_only: {
        id: 'local_only',
        name: '只在本機（不送到 AI 供應商）',
        uploadsImage: false,
        uploadsOcrText: false,
        uploadsHealthInfo: false,
        requiresConsent: false,
        engine: '瀏覽器內建 OCR（tesseract.js）+ 本機食育規則引擎',
        // ★ 2026-10-07：這一句現在是**字面事實**（在那之前不是，見下方說明）。
        description:
          '照片不會離開裝置，讀出的文字也在同一支手機上由規則引擎判斷。這個模式不會發出任何網路請求 —— 在沒有訊號的地方（例如超市地下室）也能使用。身體指標與健康問答同樣完全在本機處理。',
      },
    },
    /**
     * ★ 2026-10-07：「上傳」這個詞的邊界，一次講清楚。
     *
     * 【為什麼一定要寫這一段】
     *   上面三個 `uploads*` 旗標指的是「有沒有送到 **AI 供應商**」，
     *   **不是**「有沒有離開裝置」。把兩者混為一談，就會寫出
     *   「完全不上網」這種聽起來很強、但一實測就破的保證。
     *
     * 【這一天發生了兩件事，順序很重要】
     *   ① 上午：發現 `local_only` 其實仍會發兩個請求到**我們自己的伺服器**
     *      （`/api/ai-status` 與 `/api/analyze-label`）→ 先把文案改準，
     *      寫成「不送到 AI 供應商」，而不是急著宣稱「不上網」。
     *   ② 稍後：把規則引擎抽成前後端共用的純函式，前端直接呼叫
     *      → 那個模式**真的零網路請求**了，「只在本機」成為字面事實。
     *
     *   ⚠️ 教訓：**先把話改準，再把事做對。** 反過來做，
     *      中間那段時間留下的就是可被評審當場推翻的文案。
     */
    providerBoundaryNote:
      '本頁的「上傳」一律指**送到 AI 供應商**（Gemini／OpenRouter）。雲端模式的請求會經過本服務的伺服器；「只在本機」模式則完全不發出網路請求 —— 照片與文字都在您的裝置上處理，不經過本服務，也不經過任何 AI 供應商。',
    serverPolicy: {
      storesImages: false,
      storesResults: false,
      stateless: true,
      note: '本服務為無狀態設計：不寫入資料庫、不保存任何圖片，僅在記憶體中即時處理後回傳。雲端模式的辨識結果會在記憶體中快取 24 小時以節省 API 額度，重啟即清除。',
    },
    localData: {
      storedOnDevice: true,
      storage: 'localStorage',
      items: ['學習者身分設定', '健康設定與慢性病史', '飲食與把關紀錄'],
      note: '所有紀錄僅儲存在您的瀏覽器本機，不會上傳。您可隨時於介面上清除。',
    },
  });
  // 走到這裡代表 handler 沒有提早 return（例如 GET 端點直接 res.json）
  return res.result();
}

/** 對應 `/api/ai-status` */
export async function handleAiStatus(body: any, headers: Headers, deps: CoreDeps): Promise<ApiResult> {
  // 相容層：把平台請求包成 handler 認得的 req / res
  const req: any = { body, headers: Object.fromEntries(headers) };
  const res: any = makeRes();
  rollDateIfNeeded();
  const keys = providerKeys();
  const now = Date.now();

  /**
   * ⚠️ 這裡必須與 `orderedProviders` 的候選清單一致。
   *    2026-10-03 加入 NVIDIA 後，如果這裡忘了加，
   *    開發者面板就會顯示成「只有兩家在輪替」——**與事實不符**，
   *    而且不會有任何錯誤訊息（本專案最常犯的那種 bug）。
   */
  const providers = (['nvidia', 'gemini', 'openrouter'] as ProviderName[]).map((name) => {
    const st = providerState[name];
    const configured = isValidKey(keys[name]);
    const coolingDown = st.disabledUntil > now;
    return {
      name,
      configured,
      available: configured && !coolingDown,
      usedToday: st.usedToday,
      dailyQuota: DAILY_QUOTA[name],
      // 最後一次耗時（毫秒，-1 = 還沒跑過）。使用者反映「API 過慢」，
      // 有了數字才能判斷是冷啟動、模型慢，還是鏈裡有拖油瓶。
      lastLatencyMs: st.lastLatencyMs,
      coolingDownUntil: coolingDown ? new Date(st.disabledUntil).toISOString() : null,
      lastError: st.lastError || null,
    };
  });

  const available = providers.filter((p) => p.available);
  const hasKey = available.length > 0;

  res.json({
    status: 'ok',
    hasKey,
    providers,
    models: getModelChain(),
    /**
     * NVIDIA NIM 的補充狀態（模型清單）。
     *
     * ⚠️ NIM **已經在輪替鏈上** —— 見上方第 826 行的 providers 迴圈，
     *    以及 `core.ts` 的 `orderedProviders`（順序 nvidia → gemini → openrouter）。
     *    這個區塊**不是**「它不在鏈上」的意思，只是把它的模型清單另外回報一份，
     *    讓開發者面板不必從 providers 裡再撈一次。
     *
     * ★ 2026-10-04 更正：這裡原本寫著「刻意不放進 providers 陣列／NIM 不在鏈上／
     *   只服務健身週報」——那是 2026-10-03 把它加入輪替**之前**的舊說法，
     *   三句話都與同一個檔案裡第 826 行的程式碼**完全相反**。
     *   這種註解比沒有註解更糟：讀的人會以為自己看懂了，其實被誤導。
     * ★ 含圖片的請求會跳過 NIM（它是純文字模型），見 `orderedProviders`。
     */
    nvidia: {
      configured: isValidKey(process.env.NVIDIA_API_KEY || ''),
      models: NVIDIA_MODEL_CHAIN_FOR_STATUS,
    },
    cacheEntries: analysisCache.size,
    openrouterQuota: await getOpenRouterQuota(),
    mode: hasKey ? 'cloud_ai' : 'ready_with_fallback',
    message: hasKey
      ? `雲端 AI 已就緒（可用供應商：${available.map((p) => p.name).join('、')}）`
      : '已啟用本機備援引擎（請於 .env 設定至少一組 API 金鑰）',
  });
  // 走到這裡代表 handler 沒有提早 return（例如 GET 端點直接 res.json）
  return res.result();
}

/** 對應 `/api/health` */
export async function handleHealth(body: any, headers: Headers, deps: CoreDeps): Promise<ApiResult> {
  // 相容層：把平台請求包成 handler 認得的 req / res
  const req: any = { body, headers: Object.fromEntries(headers) };
  const res: any = makeRes();
  res.json({ status: 'ok', service: 'LabelBuddy AI Backend Proxy' });
  // 走到這裡代表 handler 沒有提早 return（例如 GET 端點直接 res.json）
  return res.result();
}
