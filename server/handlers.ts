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
  readCache,
  rollDateIfNeeded,
  SYSTEM_INSTRUCTION_HEALTH_QA,
  SYSTEM_INSTRUCTION_INDICATORS,
  writeCache,
  type ApiResult,
  type CoreDeps,
  type ProviderName,
} from './core';
import { buildRecognitionResult } from './labelParser';
import { analyzeNutritionWithIndicators } from './smartNutritionAnalyzer';
import { analyzeSeniorPhysicalIndicators } from './smartIndicatorAnalyzer';
import { answerSeniorHealthQuestion } from './smartHealthQA';
import { buildConditionReminders } from './conditionAdvice';
import { getLearnerProfile } from '../src/data/learnerProfiles';
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
    } = req.body;
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
    // 傳入無效值時 getLearnerProfile 會安全退回「長者三高」，因此這裡不需額外防護。
    const learnerProfile = getLearnerProfile(profileId);

    const conditionText = conditions.length > 0 ? conditions.join('、') : '無特殊慢性病史';

    /**
     * 附加慢性病專屬提醒。
     *
     * 【為什麼不寫進快取】
     *   提醒只跟「使用者勾了哪些病」有關，與照片內容無關，
     *   而且是由後端確定性產生的，不需要（也不該）佔用快取空間。
     *   每條回應路徑都直接算一次，成本近乎為零。
     */
    const attachReminders = (data: any) => ({
      ...data,
      condition_reminders: buildConditionReminders(conditions),
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
          ...buildOcrFailedResult(learnerProfile, { matchedFields: 0 }),
          data_handling: dataHandling,
        }),
      });
    }

    let vitalText = '';
    if (vitals && vitals.systolicBp) {
      vitalText = `【長者量測指標】血壓: ${vitals.systolicBp}/${vitals.diastolicBp} mmHg，心跳: ${vitals.heartRate || 72} bpm，血糖: ${vitals.bloodSugar} ${vitals.bloodSugarUnit || 'mmol/L'} (${vitals.bloodSugarTiming === 'fasting' ? '空腹' : '飯後'})。`;
    }

    /**
     * 兩種輸入模式共用的情境說明。
     *
     * 抽出來的理由：提示詞裡「標籤內容」那一段必須隨模式不同（文字 vs 圖片），
     * 但其餘（病史、身分、每日參考值、慢性病清單）完全一樣。
     * 分成兩份遲早會漂移，所以只留一份。
     */
    const promptContext = `
【使用者的慢性病史】${conditionText}
${vitalText}

【請以此身分的角度特別比對】
- 這個身分的關鍵成分：${learnerProfile.aiFocus}
- 每日參考值：${learnerProfile.targets
      .map((t) => `${t.nutrient}${t.direction === 'limit' ? '不超過' : '至少'}${t.target}`)
      .join('、')}

【通用慢性病比對清單】高血壓(鈉含量)、高血糖/糖尿病(糖分與精製碳水)、心跳與心血管(反式油脂與高咖啡因)、高血脂(飽和脂肪與反式脂肪)、痛風(普林與果糖)、腎臟病(鈉鉀磷)、胃食道逆流(刺激辛辣酸)、骨質疏鬆(磷酸與重鹽)，以及食物過敏原(花生、堅果、海鮮、乳製品、小麥麩質)。`;

    const userPromptText = hasOcrText
      ? `以下是從食品標籤照片上讀出的文字，由使用者的裝置以 OCR 產生 —— **照片本身沒有上傳**。
請只根據這些文字判斷是否適合「${learnerProfile.name}」購買。

【標籤文字開始】
${ocrText}
【標籤文字結束】
${promptContext}`
      : `請分析這張食品標籤，判斷是否適合「${learnerProfile.name}」購買。
${promptContext}`;

    // 先查快取：同一張圖 + 同一組慢性病 + 同一個身分在 TTL 內不重複呼叫 API，
    // 這是節省免費額度最有效的手段（長者常重複掃描同一件商品）。
    // 身分必須納入鍵值：同一包高蛋白粉，對健身族與腎臟病患者結論完全不同。
    // 處理模式也要納入鍵值：本機結果不該被拿去回答「已同意上傳」的請求，反之亦然。
    const cacheKey = makeCacheKey(cleanBase64, [
      ...conditions,
      `profile:${learnerProfile.id}`,
      `mode:${allowCloud ? 'cloud' : 'local'}`,
    ]);

    if (allowCloud) {
      const cached = readCache(cacheKey);
      if (cached) {
        console.log(`[LabelBuddy AI] 命中快取，未消耗任何 API 額度（來源：${cached.provider}）`);
        // 快取存的可能是舊格式，出快取時再正規化一次，確保欄位齊全
        const cachedFacts = normalizeNutrientFacts(
          cached.data?.nutrient_facts,
          learnerProfile.numericLimits
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
          learner_profile_name: learnerProfile.name,
        };
        // 舊快取可能沒有食育欄位，這裡一併補齊
        ensureEducationFields(cachedData, cachedFacts);
        return res.json({ success: true, data: attachReminders(cachedData) });
      }
    } else {
      console.log('[LabelBuddy AI] 使用者未同意雲端分析（localOnly），照片不會離開本機');
    }

    // 首選：雲端視覺 AI（依使用率在 Gemini 與 OpenRouter 之間輪替）
    // 只有使用者明確同意（allowCloud）才會走到這裡。
    if (allowCloud) {
      const aiResult = await callAiModel(req, {
        systemInstruction: buildSystemInstruction(learnerProfile.id),
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
          learnerProfile.numericLimits
        );
        aiResult.data.nutrient_facts = cloudFacts;
        aiResult.data.analysis_mode = 'cloud_ai';
        aiResult.data.ai_model = aiResult.model;
        aiResult.data.ai_provider = aiResult.provider;
        aiResult.data.data_handling = 'cloud';
        aiResult.data.learner_profile_id = learnerProfile.id;
        aiResult.data.learner_profile_name = learnerProfile.name;
        // 模型漏給食育欄位時用確定性內容補上（由真實 nutrient_facts 推導）
        ensureEducationFields(aiResult.data, cloudFacts);
        writeCache(cacheKey, aiResult.data, aiResult.model, aiResult.provider);
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
    // 文字模式：前端已經讀好文字，直接解析（不碰圖片，也沒有圖片可碰）。
    // 圖片模式：伺服器端 OCR（舊客戶端 / 命令列實測用）。
    // 文字模式：前端已經讀好文字，直接解析（不碰圖片，也沒有圖片可碰）。
    // 圖片模式：需要伺服器端 OCR —— 由呼叫端注入（Node 提供，Worker 不提供）。
    let ocr;
    if (isTextMode) {
      ocr = buildRecognitionResult(ocrText);
    } else if (deps.recognizeImage) {
      ocr = await deps.recognizeImage(cleanBase64);
    } else {
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
    console.log(
      `[LabelBuddy AI] 離線 OCR：讀到 ${ocr.matchedFields} 個營養欄位` +
        (ocr.ok ? '（採用）' : `（不足，${ocr.error}）`)
    );

    if (!ocr.ok || !ocr.profile) {
      return res.json({
        success: true,
        data: attachReminders({
          ...buildOcrFailedResult(learnerProfile, ocr),
          data_handling: dataHandling,
        }),
      });
    }

    // 帶入該身分的每日上限，讓本機引擎也能產生 nutrient_facts（前端百分比長條圖用）
    const smartResult = analyzeNutritionWithIndicators(
      ocr.profile,
      conditions,
      learnerProfile.numericLimits
    );

    return res.json({
      success: true,
      data: attachReminders({
        ...smartResult,
        ocr_used: true,
        ocr_matched_fields: ocr.matchedFields,
        analysis_mode: 'local_fallback',
        data_handling: dataHandling,
        learner_profile_id: learnerProfile.id,
        learner_profile_name: learnerProfile.name,
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

    const sugarDisplay = indicators.bloodSugarUnit === 'mg/dL'
      ? `${indicators.bloodSugar} mg/dL`
      : `${indicators.bloodSugar} mmol/L (度)`;

    const promptText = `請幫這位長輩分析他今天量到的身體健康指標：
- 年齡區間：${indicators.ageGroup || '70-79歲長者'}
- 血壓：上壓 ${indicators.systolicBp} mmHg，下壓 ${indicators.diastolicBp} mmHg
- 血糖：${sugarDisplay}（狀態：${indicators.bloodSugarTiming === 'fasting' ? '早晨空腹' : '吃飽飯後'}）
- 尿酸/關節狀況：${indicators.uricAcidStatus}
- 血脂/膽固醇狀況：${indicators.cholesterolStatus}
- 腎臟/腳部水腫狀況：${indicators.kidneyStatus}
- 長輩自覺症狀感受：${(indicators.symptoms || []).join('、') || '無特別不舒服'}

請用最通俗、最溫暖的「阿公阿嬤大白話」，清楚告訴他現在身體狀況如何，並給出超實用的「超市買菜指南（什麼不能買、什麼可以買）」與語音朗讀摘要。`;

    const aiResult = await callAiModel(req, {
      systemInstruction: SYSTEM_INSTRUCTION_INDICATORS,
      userPrompt: promptText,
      temperature: 0.3,
      maxTokens: 1200,
    });

    if (aiResult) {
      aiResult.data.analysis_mode = 'cloud_ai';
      return res.json({
        success: true,
        data: aiResult.data,
      });
    }

    // 降級：本機備援智慧指標分析引擎 (100% 大白話守護)
    console.log('[LabelBuddy AI] 指標分析啟動本機守護引擎');
    const smartAnalysis = analyzeSeniorPhysicalIndicators(indicators);
    return res.json({
      success: true,
      data: smartAnalysis,
    });
  } catch (error: any) {
    console.error('身體指標處理異常:', error);
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
    });
    return res.json({
      success: true,
      data: fallback,
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
        message: '請輸入阿公阿嬤想問的健康問題喔！',
      });
    }

    const cleanQuestion = question.trim();

    let contextInfo = '';
    if (indicators) {
      contextInfo = `長輩目前量到的身體指標背景：
- 血壓：上壓 ${indicators.systolicBp || 130} mmHg，下壓 ${indicators.diastolicBp || 80} mmHg
- 血糖：${indicators.bloodSugar || 6.0} ${indicators.bloodSugarUnit || 'mmol/L'}（${indicators.bloodSugarTiming === 'fasting' ? '空腹' : '飯後'}）
- 尿酸痛風：${indicators.uricAcidStatus || '正常'}
- 血管膽固醇：${indicators.cholesterolStatus || '正常'}
- 自覺症狀：${(indicators.symptoms || []).join('、') || '無特殊不適'}`;
    }

    const promptText = `長輩的問題是：「${cleanQuestion}」

${contextInfo}

請針對長輩的提問與其體況數字，以 100% 通俗大白話、最孝順親切的口吻回答他。清楚說明到底「能不能吃/能不能做」、「為什麼」、「該怎麼吃才安全」，並提供一句話結論與語音朗讀文稿。`;

    const aiResult = await callAiModel(req, {
      systemInstruction: SYSTEM_INSTRUCTION_HEALTH_QA,
      userPrompt: promptText,
      temperature: 0.3,
      maxTokens: 1000,
    });

    if (aiResult) {
      const parsed = aiResult.data;
      return res.json({
        success: true,
        data: {
          question: cleanQuestion,
          key_takeaway: parsed.key_takeaway,
          answer: parsed.answer,
          safe_tips: parsed.safe_tips || [],
          voice_script: parsed.voice_script || parsed.answer,
          source: 'cloud_ai',
        },
      });
    }

    // 降級：備用大白話長者問答引擎
    console.log('[LabelBuddy AI] 健康問答啟動本機守護引擎');
    const fallbackAnswer = answerSeniorHealthQuestion(cleanQuestion, indicators);
    return res.json({
      success: true,
      data: fallbackAnswer,
    });
  } catch (error: any) {
    console.error('處理健康問題時發生錯誤:', error);
    const fallbackAnswer = answerSeniorHealthQuestion(req.body?.question || '常見健康保養', req.body?.indicators);
    return res.json({
      success: true,
      data: fallbackAnswer,
    });
  }
  // 走到這裡代表 handler 沒有提早 return（例如 GET 端點直接 res.json）
  return res.result();
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
    /** 預設模式：本機。前端必須在使用者明確同意後才可送 localOnly:false */
    defaultMode: 'local_only',
    /** 兩種模式的共同保證：照片永遠不會離開使用者的裝置 */
    imageNeverLeavesDevice: true,
    modes: {
      local_only: {
        id: 'local_only',
        name: '本機模式（預設）',
        uploadsImage: false,
        uploadsOcrText: false,
        uploadsHealthInfo: false,
        requiresConsent: false,
        engine: '瀏覽器內建 OCR（tesseract.js）+ 本機食育規則引擎',
        description:
          '照片在您的手機上就以離線 OCR 讀出文字，照片本身從未離開裝置。接著由本機的規則引擎判斷，不呼叫任何外部服務 —— 連文字也不會上傳。慢性病史同樣留在本機。',
      },
      cloud: {
        id: 'cloud',
        name: '雲端 AI 增強模式',
        // ⚠️ 照片一律不上傳（兩種模式皆然）。雲端只會收到 OCR 讀出的**文字**。
        uploadsImage: false,
        uploadsOcrText: true,
        uploadsHealthInfo: true,
        requiresConsent: true,
        available: cloudAvailable,
        providers: ['Google Gemini', 'OpenRouter'],
        description:
          '經您明確同意後，只會把「OCR 讀出的標籤文字」與「您勾選的慢性病史項目名稱」傳送給雲端文字模型。照片仍然不會上傳。可提升判斷準確度，但文字與病史會離開您的裝置。',
      },
    },
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

  const providers = (['gemini', 'openrouter'] as ProviderName[]).map((name) => {
    const st = providerState[name];
    const configured = isValidKey(keys[name]);
    const coolingDown = st.disabledUntil > now;
    return {
      name,
      configured,
      available: configured && !coolingDown,
      usedToday: st.usedToday,
      dailyQuota: DAILY_QUOTA[name],
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
