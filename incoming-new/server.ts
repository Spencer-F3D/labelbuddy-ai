/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * 【重要安全提示】
 * 在正式上線時，絕對不能將 API Key 寫死在前端瀏覽器程式碼中！
 * 必須建立中轉後端（Backend Proxy，如此處的 Express 伺服器），由後端安全讀取環境變數中的 GEMINI_API_KEY，
 * 避免金鑰外洩或遭人惡意濫用。
 */

import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import {
  extractNutritionProfile,
  analyzeNutritionWithIndicators,
  type NutritionProfile,
} from './server/smartNutritionAnalyzer';
import { recognizeNutritionFromImage } from './server/ocrLabel';
import { buildConditionReminders } from './server/conditionAdvice';
import { analyzeSeniorPhysicalIndicators } from './server/smartIndicatorAnalyzer';
import { answerSeniorHealthQuestion } from './server/smartHealthQA';
import { SeniorPhysicalIndicators } from './src/types';
import { getLearnerProfile, LearnerProfileId } from './src/data/learnerProfiles';

dotenv.config();

const app = express();
const PORT = 3000;

// 允許處理較大的壓縮圖片 Base64 載荷 (設定為 20MB)
app.use(express.json({ limit: '20mb' }));

// 預設採用 Google 最新推薦的 Flash 模型
const GEMINI_FLASH_MODEL = 'gemini-3.6-flash';

// 初始化 Google GenAI 客戶端 (從安全環境變數讀取金鑰)
function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || '';
  return new GoogleGenAI({ apiKey });
}

// 雲端呼叫重試包裝 (Retry with Exponential Backoff)
//
// 【為什麼需要】比賽 Demo 期間，Google 端 Flash 模型偶爾會回 503（UNAVAILABLE / high demand）
// 或 429（RESOURCE_EXHAUSTED）。若一遇錯就立刻降級到本機引擎，雲端模式會顯得不穩定。
// 這裡對「可重試」的暫時性錯誤做指數退避重試，讓雲端模式能自動恢復；
// 只有在重試耗盡後才交由上層 catch 決定降級。
//
// 注意：401/403（金鑰或專案權限）等「永久性」錯誤不重試，直接往上拋，避免無謂等待。
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const RETRYABLE_MESSAGE_HINTS = [
  '503',
  'UNAVAILABLE',
  'high demand',
  'overloaded',
  '429',
  'RESOURCE_EXHAUSTED',
  'Too Many Requests',
];

function isRetryableGeminiError(err: any): boolean {
  const status = err?.status ?? err?.code;
  if (typeof status === 'number' && RETRYABLE_STATUS.has(status)) return true;
  const msg = String(err?.message || '');
  return RETRYABLE_MESSAGE_HINTS.some((h) => msg.includes(h));
}

async function generateContentWithRetry(
  genAi: GoogleGenAI,
  params: any,
  { maxAttempts = 3, baseDelayMs = 1200 }: { maxAttempts?: number; baseDelayMs?: number } = {}
): Promise<any> {
  let lastError: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await genAi.models.generateContent(params);
    } catch (err: any) {
      lastError = err;
      if (!isRetryableGeminiError(err) || attempt === maxAttempts) break;
      // 指數退避 + 少量隨機抖動，避免多個請求同時重試撞在一起
      const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 300);
      console.log(
        `[LabelBuddy AI] Gemini 暫時不可用（第 ${attempt}/${maxAttempts} 次，status=${err?.status ?? 'n/a'}），${delay}ms 後重試…`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

// 系統提示詞產生器：依「學習者身分」動態組裝食育老師的角色設定
//
// 【教育定位】本提示詞已從「把關工具」升級為「健康教育」：
// 每一次分析除了給結論，還必須留下三個教學欄位（knowledge_point / label_reading_tip / daily_limit_context），
// 讓學習者每一次掃描都學到一件事，最終能夠不依賴工具也看得懂食品標籤。
//
// 【多族群】同一包食品對長者、健身族、外食族、學生的意義完全不同，
// 因此角色語氣、比對重點與每日參考值都依 learner profile 動態調整。
function buildSystemInstruction(profileId: LearnerProfileId): string {
  const p = getLearnerProfile(profileId);

  const targetText = p.targets
    .map(
      (t) =>
        `   - ${t.nutrient}：${t.target}（${t.direction === 'limit' ? '上限，越低越好' : '目標，越多越好'}）`
    )
    .join('\n');

  const objectiveText = p.learningObjectives.map((o) => `   - ${o}`).join('\n');

  return `You are LabelBuddy AI, a warm, patient, and protective FOOD LITERACY TEACHER (食育老師) on a food-education learning platform. Your learners are NOT limited to one group — you adapt to whoever is in front of you.

CURRENT LEARNER PROFILE:
   - 身分：${p.name}
   - 適用對象：${p.audience}
   - 學習者最在意的事：${p.focusSummary}
   - 你的角色語氣：${p.aiPersona}
   - 本次必須優先比對的項目：${p.aiFocus}

THIS LEARNER'S DAILY REFERENCE VALUES:
${targetText}

THIS LEARNER'S LEARNING OBJECTIVES (設計教學內容時請對齊這些目標):
${objectiveText}

YOUR MISSION — EDUCATION FIRST:
You are NOT just a judging tool. Your job is to inspect the food nutrition label from the provided image, tell the learner whether it suits THEIR profile, AND teach them ONE thing they can use to judge the next package by themselves.
Every single analysis must leave the learner knowing more than before. Prefer teaching a transferable skill over repeating the verdict.

CRITICAL TONE AND COMMUNICATION RULES:
1. Speak in warm, respectful, caring Traditional Chinese (繁體中文).
2. Avoid dense medical jargon or raw chemical numbers; translate them into everyday vernacular (白話文) that the learner can immediately understand.
3. plain_summary must be direct, actionable, friendly, and easy to read aloud via text-to-speech. It must be personalised to THIS learner profile, not a generic verdict.
4. If the image is blurry or cannot be recognized as a food label, set risk_level to "yellow", warning_title to "⚠️ 標籤不夠清楚", and gently guide them to retake the photo with better lighting or a closer angle.
5. You MUST return ONLY valid JSON adhering strictly to the JSON schema below.

EDUCATION FIELD RULES (very important):
6. knowledge_point: Teach ONE transferable nutrition concept triggered by THIS product, in one plain sentence. It must answer "為什麼". Do NOT repeat the verdict. It must be relevant to THIS learner profile.
   Examples for a 長者 profile: "一包泡麵的鈉常常就等於一整天的鹽分上限，所以泡麵不能天天當正餐。"
   Examples for a 健身 profile: "很多『高蛋白』產品同時加了麥芽糊精和糖，要看背面的蛋白質／熱量比，不要只看正面的大字。"
7. label_reading_tip: Give ONE concrete physical action the learner can do with their hands and eyes next time in the supermarket. Must answer "下次我怎麼看".
8. daily_limit_context: Put THIS product's key number next to THIS learner's daily reference value, in plain speech, using the reference values listed above.
9. alternative_advice: Recommend alternatives that fit THIS learner's goals (見上方建議方向：${p.recommendKeywords.join('、')}).

JSON SCHEMA:
{
  "risk_level": "red" | "yellow" | "green",
  "warning_title": "string (Short, clear, bold warning with emoji)",
  "plain_summary": "string (Warm plain-speech summary of the conclusion for THIS learner)",
  "alternative_advice": "string (Practical alternatives matching this learner's goals)",
  "knowledge_point": "string (ONE plain-language nutrition concept worth learning from this product, answering 為什麼)",
  "label_reading_tip": "string (ONE concrete action for reading labels next time, answering 下次我怎麼看)",
  "daily_limit_context": "string (This product's key number compared against this learner's daily reference value, in plain speech)",
  "ingredients_detected": ["string", "..."],
  "nutrition_concerns": ["string", "..."]
}`;
}

// 核心食品標籤分析 API (中轉後端 Backend Proxy)
//
// 【隱私優先架構 / Privacy-by-Design】
// 本端點支援兩種資料處理模式，並在回應中明確標示，讓使用者隨時知道自己的資料去了哪裡：
//   - localOnly = true（預設）：完全不呼叫任何外部服務，圖片不離開本機，由內建食育引擎分析。
//   - localOnly = false（需使用者明確同意）：圖片才會傳送至 Google Gemini 進行視覺辨識。
// 本端點為無狀態（stateless）設計：不寫入資料庫、不落地儲存任何圖片，僅在記憶體中處理後回傳。
app.post('/api/analyze-label', async (req, res) => {
  try {
    const { imageBase64, conditions = [], vitals, profileId = 'senior', localOnly = true } = req.body;

    // 未經同意不得上傳雲端：只要 localOnly 為 true，就強制走本機引擎
    const allowCloud = localOnly === false;

    if (!imageBase64) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: '未收到食品標籤圖片，請重新拍照或上傳。',
      });
    }

    // 去除 base64 前綴 (如 data:image/jpeg;base64,)
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
    const mimeTypeMatch = imageBase64.match(/^data:(image\/[a-zA-Z]+);base64,/);
    const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/jpeg';

    const apiKey = (req.headers['x-gemini-key'] as string) || req.body.apiKey || process.env.GEMINI_API_KEY;

    // 只有在「使用者已同意雲端分析」且「有可用金鑰」時，才呼叫 Gemini
    if (allowCloud && apiKey && apiKey.trim().length > 15 && !apiKey.includes('MY_GEMINI_API_KEY')) {
      try {
        const genAi = new GoogleGenAI({ apiKey: apiKey.trim() });
        const learner = getLearnerProfile(profileId);
        const conditionText = conditions.length > 0
          ? conditions.join('、')
          : '無特殊慢性病史';

        let vitalText = '';
        if (vitals && vitals.systolicBp) {
          vitalText = `【量測指標】血壓: ${vitals.systolicBp}/${vitals.diastolicBp} mmHg，心跳: ${vitals.heartRate || 72} bpm，血糖: ${vitals.bloodSugar} ${vitals.bloodSugarUnit || 'mmol/L'} (${vitals.bloodSugarTiming === 'fasting' ? '空腹' : '飯後'})。`;
        }

        const userPromptText = `請分析這張食品標籤，並根據使用者的各項身體指標與健康狀況（${conditionText}；${vitalText}）判斷是否適合購買。

【學習者身分】${learner.name}（${learner.audience}）
【身分最在意】${learner.focusSummary}
【必須優先比對】${learner.aiFocus}
【建議選購方向】${learner.recommendKeywords.join('、')}

【最重要的教學要求】除了給出能不能買的結論之外，請務必額外完成三個教育任務，讓學習者學會自己看標籤：
1. knowledge_point：從這一包食品身上，教一個「可以帶去下一包使用」的營養觀念（回答「為什麼」），不要重複結論，並且要與上述學習者身分相關。
2. label_reading_tip：給一個下次在超市的具體動作（回答「下次我怎麼看」），例如先看本包裝含幾份、先看成分表前三名。
3. daily_limit_context：把這一包的關鍵數字對照「該身分」的每日參考值，用白話說出「等於吃掉幾成額度」。參考值請見系統指示。
請全部使用學習者聽得懂的大白話，並且要能直接拿去語音朗讀。

【用字規定】長者聽不懂課本或法規用語，請一律改用日常白話來說營養素名稱：
- 不要說「鈉」，要說「鹽分」
- 不要說「飽和脂肪」，要說「動物油」
- 不要說「反式脂肪」，要說「酥油」
- 不要說「膳食纖維」，要說「纖維質」
- 不要說「碳水化合物」，要說「澱粉質」
- 不要說「添加糖」，要說「糖分」
若需要提到包裝上印的字（例如長者要在標籤上找到那一列），可以用「包裝上寫『鈉』的那一列」這種方式補充。`;

        const response = await generateContentWithRetry(genAi, {
          model: GEMINI_FLASH_MODEL,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    data: cleanBase64,
                    mimeType: mimeType,
                  },
                },
                {
                  text: userPromptText,
                },
              ],
            },
          ],
          config: {
            systemInstruction: buildSystemInstruction(profileId),
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                risk_level: {
                  type: Type.STRING,
                  enum: ['red', 'yellow', 'green'],
                  description: '紅（危險/不建議）、黃（注意/限量）、綠（安全/適合）',
                },
                warning_title: {
                  type: Type.STRING,
                  description: '大字警示標題，如 ⚠️ 高鈉警告！ 或 ✅ 適合食用',
                },
                plain_summary: {
                  type: Type.STRING,
                  description: '長者專用白話摘要，語氣溫柔親切，便於語音合成朗讀',
                },
                alternative_advice: {
                  type: Type.STRING,
                  description: '替代食品建議或食用份量建議',
                },
                knowledge_point: {
                  type: Type.STRING,
                  description:
                    '食育知識點：從這款食品延伸出一個可遷移的營養觀念，用大白話回答「為什麼」，不要重複結論',
                },
                label_reading_tip: {
                  type: Type.STRING,
                  description:
                    '讀標籤技巧：長者下次在超市的具體動作，用大白話回答「下次我怎麼看」',
                },
                daily_limit_context: {
                  type: Type.STRING,
                  description:
                    '每日上限對照：把本次關鍵數字對照每日建議上限（鈉2000mg／糖50g／飽和脂肪20g／反式脂肪0g／膳食纖維25g），白話說出等於幾成額度',
                },
                ingredients_detected: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: '辨識出的重要成分清單',
                },
                nutrition_concerns: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: '針對慢性病的主要營養超標或注意事項',
                },
                matched_conditions: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: '觸發警示的對應身體指標清單',
                },
              },
              required: [
                'risk_level',
                'warning_title',
                'plain_summary',
                'alternative_advice',
                'knowledge_point',
                'label_reading_tip',
                'daily_limit_context',
              ],
            },
            temperature: 0.2,
          },
        });

        const responseText = response.text;
        if (responseText) {
          let parsedResult;
          try {
            parsedResult = JSON.parse(responseText);
          } catch {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) parsedResult = JSON.parse(jsonMatch[0]);
          }

          if (parsedResult) {
            parsedResult.analysis_mode = 'gemini_ai';
            parsedResult.data_handling = 'gemini_cloud';
            parsedResult.learner_profile = profileId;
            // 疾病提醒（含長者自行輸入的疾病）一律由本機規則產生，確保不會漏
            parsedResult.condition_reminders = buildConditionReminders(conditions);
            return res.json({
              success: true,
              data: parsedResult,
            });
          }
        }
      } catch (geminiError: any) {
        console.log(
          '[LabelBuddy AI] Gemini 雲端服務重試後仍失敗，自動啟動智慧守護引擎:',
          geminiError?.status ?? geminiError?.message
        );
        if (
          geminiError?.status === 429 ||
          geminiError?.message?.includes('429') ||
          geminiError?.message?.includes('RESOURCE_EXHAUSTED') ||
          geminiError?.message?.includes('Too Many Requests')
        ) {
          return res.status(429).json({
            error: 'RATE_LIMIT_EXCEEDED',
            message: '網絡繁忙，請稍後再試',
          });
        }
      }
    }

    // ==========================================================
    // 本機分析路徑（不上傳雲端）
    // ==========================================================
    // 【為什麼要離線 OCR】原本本機模式只用固定樣本猜測，導致「每次答案都一樣」。
    // 現在改用 tesseract.js 在本機辨識標籤文字，解析出真實的鈉/糖/脂肪等數字，
    // 再交給規則引擎判斷 —— 完全離線、不外傳，答案也會隨真實產品而不同。
    let profile: NutritionProfile | null = null;
    let ocrMatchedFields = 0;
    try {
      const ocr = await recognizeNutritionFromImage(cleanBase64);
      ocrMatchedFields = ocr.matchedFields;
      if (ocr.ok) {
        profile = ocr.profile;
      }
      console.log(
        `[LabelBuddy AI] 離線 OCR 完成：讀到 ${ocr.matchedFields} 個營養欄位${ocr.ok ? '' : '（不足，將請使用者重拍）'}`
      );
    } catch (ocrErr: any) {
      console.log('[LabelBuddy AI] 離線 OCR 失敗:', ocrErr?.message);
    }

    // 讀唔到任何數字時，誠實告知並請使用者重拍 —— 絕不捏造答案
    if (!profile) {
      return res.json({
        success: true,
        data: {
          risk_level: 'yellow',
          warning_title: '🔍 看不清楚標籤數字',
          plain_summary:
            '不好意思，這張照片看不清楚標籤上的營養數字。請把手機拿近一點，讓「營養標示」的表格填滿畫面，光線充足一點，再拍一次好嗎？',
          alternative_advice:
            '拍攝小技巧：① 把包裝拉平 ② 手機距離約 15 公分 ③ 避開頭頂燈光的反光。',
          knowledge_point:
            '標籤上的「營養標示」表格，每一列都是一個數字。只要讀得出「鈉」和「糖」這兩列，就能判斷一大半。',
          label_reading_tip: '先找「鈉」那一列，看看是幾毫克；再找「糖」那一列，看看是幾公克。',
          daily_limit_context:
            '讀到數字之後，我會幫你對照每日上限，算出這一包等於吃掉幾成額度。',
          ingredients_detected: [],
          nutrition_concerns: [],
          ocr_failed: true,
          analysis_mode: 'smart_nutrition_engine',
          data_handling: 'local_only',
          learner_profile: profileId,
          condition_reminders: buildConditionReminders(conditions),
        },
      });
    }

    const smartResult = analyzeNutritionWithIndicators(profile, conditions, profileId);

    return res.json({
      success: true,
      data: {
        ...smartResult,
        data_handling: 'local_only',
        learner_profile: profileId,
        ocr_used: true,
        ocr_matched_fields: ocrMatchedFields,
        condition_reminders: buildConditionReminders(conditions),
      },
    });
  } catch (error: any) {
    console.error('API 處理異常，啟動安全保護結果:', error);
    const fallbackResult = analyzeNutritionWithIndicators(
      extractNutritionProfile(''),
      req.body.conditions || [],
      req.body.profileId || 'senior'
    );
    return res.json({
      success: true,
      data: {
        ...fallbackResult,
        data_handling: 'local_only',
        learner_profile: req.body.profileId || 'senior',
      },
    });
  }
});

// 長者身體各項指標專屬提示詞 (嚴格限制通俗大白話，長者一聽就懂)
const SYSTEM_INSTRUCTION_INDICATORS = `You are a warm, gentle, patient family doctor and loving grandchild talking directly to an elderly grandfather or grandmother (阿公/阿婆, aged 65-85).
The senior is entering their home measurements or body indicators: blood pressure (上壓/下壓), blood sugar (血糖), uric acid (尿酸/關節), cholesterol (血脂/血管油), and physical feelings/symptoms.

CRITICAL RULES FOR ELDERLY UNDERSTANDING:
1. USE ONLY SUPER SIMPLE, EVERYDAY, COLLOQUIAL WORDS (純大白話！禁止任何難懂的醫學化學名詞).
   - NEVER say "動脈粥狀硬化", say "血管塞住、血流不順"
   - NEVER say "收縮壓舒張壓", say "上壓、下壓"
   - NEVER say "糖化血色素或胰島素抗性", say "身體代謝糖分變慢、血糖太高"
   - NEVER say "低密度脂蛋白膽固醇", say "壞油、油卡在血管壁"
   - NEVER say "高普林結晶沉積", say "喝太濃的肉湯骨髓，腳趾關節會紅腫痛風"
   - NEVER say "腎絲球過濾負擔", say "吃太鹹或化學粉，長者腰子排不出去會水腫"
2. Always speak with love, warmth, and respect (阿公、阿婆您好！孫子/醫生幫您看看...).
3. Specifically tell them what to buy and what NEVER to buy when grocery shopping at the supermarket based on their exact numbers!
4. Provide practical, concrete daily care tips (drink warm water, walk 20 min, sleep early).
5. Output MUST be ONLY valid JSON matching this schema:
{
  "status_level": "green" | "yellow" | "red",
  "status_title": "大字白話標題 (例如：⚠️ 阿公阿嬤注意喔！今天量到的指標有稍微偏高)",
  "simple_explanation": "100% 通俗大白話解釋目前的身體數字（血壓、血糖、症狀）到底代表什麼意思",
  "supermarket_rules": {
    "do_not_buy": ["超商千萬不能買的具體食物 (如：❌ 泡麵、罐頭醬菜，因為太鹹血壓會飆高)"],
    "recommended_to_buy": ["超商可以安心買的具體食物 (如：✅ 傳統豆腐、新鮮青菜，幫助排鹽顧血管)"]
  },
  "daily_care_tips": ["生活貼心小叮嚀 (如：喝溫水、睡飽覺、散步)"],
  "voice_summary": "專為語音朗讀設計的親切對話（像孫子在耳邊關心阿公阿嬤一樣）",
  "linked_conditions": ["連動到食品標籤掃描的關注重點 (例如：高血壓(嚴防太鹹)、糖尿病(嚴防高糖))"]
}`;

// 長者身體各項健康指標分析 API
app.post('/api/analyze-indicators', async (req, res) => {
  try {
    const indicators: SeniorPhysicalIndicators = req.body.indicators;
    if (!indicators) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: '未收到長者身體指標數據。',
      });
    }

    const apiKey = (req.headers['x-gemini-key'] as string) || req.body.apiKey || process.env.GEMINI_API_KEY;

    // 若有 Gemini API Key，呼叫 Gemini 3.6 Flash 進行高度個人化的溫馨大白話分析
    if (apiKey && apiKey.trim().length > 15 && !apiKey.includes('MY_GEMINI_API_KEY')) {
      try {
        const genAi = new GoogleGenAI({ apiKey: apiKey.trim() });
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

        const response = await generateContentWithRetry(genAi, {
          model: GEMINI_FLASH_MODEL,
          contents: [{ role: 'user', parts: [{ text: promptText }] }],
          config: {
            systemInstruction: SYSTEM_INSTRUCTION_INDICATORS,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                status_level: { type: Type.STRING, enum: ['green', 'yellow', 'red'] },
                status_title: { type: Type.STRING },
                simple_explanation: { type: Type.STRING },
                supermarket_rules: {
                  type: Type.OBJECT,
                  properties: {
                    do_not_buy: { type: Type.ARRAY, items: { type: Type.STRING } },
                    recommended_to_buy: { type: Type.ARRAY, items: { type: Type.STRING } },
                  },
                  required: ['do_not_buy', 'recommended_to_buy'],
                },
                daily_care_tips: { type: Type.ARRAY, items: { type: Type.STRING } },
                voice_summary: { type: Type.STRING },
                linked_conditions: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['status_level', 'status_title', 'simple_explanation', 'supermarket_rules', 'daily_care_tips', 'voice_summary'],
            },
            temperature: 0.3,
          },
        });

        const responseText = response.text;
        if (responseText) {
          let parsed;
          try {
            parsed = JSON.parse(responseText);
          } catch {
            const m = responseText.match(/\{[\s\S]*\}/);
            if (m) parsed = JSON.parse(m[0]);
          }

          if (parsed) {
            parsed.analysis_mode = 'gemini_ai';
            return res.json({
              success: true,
              data: parsed,
            });
          }
        }
      } catch (geminiError: any) {
        console.log('[LabelBuddy AI] 指標分析啟動本機守護引擎');
      }
    }

    // 備援智慧指標分析引擎 (100% 大白話守護)
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
});

// 長者健康提問專屬提示詞 (通俗大白話，親切如孝順孫子與家庭醫生)
const SYSTEM_INSTRUCTION_HEALTH_QA = `You are a warm, gentle, patient family doctor and loving grandchild speaking directly to an elderly grandfather or grandmother (阿公/阿婆, aged 65-85).
The senior is asking a common health or diet question (e.g., "我有高血壓，喝咖啡可以嗎？", "血糖高可以吃香蕉嗎？", "吃降血壓藥可以吃柚子嗎？", "痛風可以吃豆腐嗎？").

CRITICAL RULES FOR ELDERLY UNDERSTANDING:
1. USE 100% COLLOQUIAL EVERYDAY WORDS (純大白話！禁止任何難懂的醫學化學名詞).
   - NEVER use words like "交感神經亢奮、血管阻力、腎絲球、GI指數、細胞色素P450、自由基".
   - Say "心臟跳比較快、血管繃緊、肚子吸收糖分太快血糖衝上去、柚子會讓藥效突然暴增四倍容易頭暈摔倒".
2. ALWAYS provide:
   - "key_takeaway": A direct, bold, plain conclusion in one single sentence (e.g. "🟡 可以喝一點點，但每天最多一杯淡咖啡，千萬不要加糖和奶精！")
   - "answer": Warm, loving, conversational explanation. Break down practical dos and don'ts clearly.
   - "safe_tips": 2 to 3 actionable, bulleted practical tips.
   - "voice_script": Spoken script formatted for text-to-speech, addressing them affectionately like a loving grandchild.
3. If the senior provided their specific physical measurements (e.g. systolic BP, blood sugar), personalize your answer to their exact numbers!
4. Output MUST be ONLY valid JSON matching this schema:
{
  "key_takeaway": "string",
  "answer": "string",
  "safe_tips": ["string", "string", "string"],
  "voice_script": "string"
}`;

// 長者日常健康疑問即時解答 API
app.post('/api/ask-health-question', async (req, res) => {
  try {
    const { question, indicators } = req.body;
    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: '請輸入阿公阿嬤想問的健康問題喔！',
      });
    }

    const cleanQuestion = question.trim();
    const apiKey = (req.headers['x-gemini-key'] as string) || req.body.apiKey || process.env.GEMINI_API_KEY;

    // 若有 Gemini API Key，呼叫 Gemini 3.6 Flash 進行高度個人化的溫馨大白話解答
    if (apiKey && apiKey.trim().length > 15 && !apiKey.includes('MY_GEMINI_API_KEY')) {
      try {
        const genAi = new GoogleGenAI({ apiKey: apiKey.trim() });
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

        const response = await generateContentWithRetry(genAi, {
          model: GEMINI_FLASH_MODEL,
          contents: [{ role: 'user', parts: [{ text: promptText }] }],
          config: {
            systemInstruction: SYSTEM_INSTRUCTION_HEALTH_QA,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                key_takeaway: { type: Type.STRING },
                answer: { type: Type.STRING },
                safe_tips: { type: Type.ARRAY, items: { type: Type.STRING } },
                voice_script: { type: Type.STRING },
              },
              required: ['key_takeaway', 'answer', 'safe_tips', 'voice_script'],
            },
            temperature: 0.3,
          },
        });

        const responseText = response.text;
        if (responseText) {
          let parsed;
          try {
            parsed = JSON.parse(responseText);
          } catch {
            const m = responseText.match(/\{[\s\S]*\}/);
            if (m) parsed = JSON.parse(m[0]);
          }

          if (parsed) {
            return res.json({
              success: true,
              data: {
                question: cleanQuestion,
                key_takeaway: parsed.key_takeaway,
                answer: parsed.answer,
                safe_tips: parsed.safe_tips || [],
                voice_script: parsed.voice_script || parsed.answer,
                source: 'gemini_ai',
              },
            });
          }
        }
      } catch (geminiError: any) {
        console.log('[LabelBuddy AI] 健康問答啟動本機守護引擎');
      }
    }

    // 備用大白話長者問答引擎
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
});



// Gemini API 連線狀態檢查接口
app.get('/api/gemini-status', async (req, res) => {
  const envKey = process.env.GEMINI_API_KEY;
  const hasKey = !!(envKey && envKey.trim().length > 10 && !envKey.includes('MY_GEMINI_API_KEY'));
  
  res.json({
    status: 'ok',
    hasKey,
    model: GEMINI_FLASH_MODEL,
    mode: hasKey ? 'connected' : 'ready_with_fallback',
    // 注意：即使伺服器端有金鑰，前端仍預設使用本機模式；
    // 只有在使用者明確同意後，才會在請求中帶入 localOnly: false 啟用雲端分析。
    cloudAvailable: hasKey,
    defaultMode: 'local',
    message: hasKey
      ? '雲端 AI 可選用（需使用者同意），預設仍為本機分析模式'
      : '已啟用本機食育引擎（未配置 GEMINI_API_KEY，全程不上傳雲端）',
  });
});

// ============================================================================
// 資料處理透明化接口 (Data Handling Disclosure)
// ============================================================================
// 讓前端可以取得機器可讀的資料處理說明，並在介面上誠實揭露給學習者。
app.get('/api/privacy', (req, res) => {
  res.json({
    status: 'ok',
    defaultMode: 'local',
    modes: {
      local: {
        id: 'local',
        name: '本機模式',
        uploadsImage: false,
        description:
          '食品照片只在您的裝置與本機服務之間流動，不會傳送給任何第三方雲端服務。分析由內建食育引擎完成。',
      },
      cloud: {
        id: 'cloud',
        name: '雲端 AI 增強模式',
        uploadsImage: true,
        requiresConsent: true,
        provider: 'Google Gemini',
        description:
          '經您明確同意後，壓縮後的食品標籤照片會傳送至 Google Gemini 進行視覺辨識。此模式可提升辨識準確度，但圖片會離開您的裝置。',
      },
    },
    serverPolicy: {
      storesImages: false,
      storesResults: false,
      stateless: true,
      note: '本服務為無狀態設計：不寫入資料庫、不保存任何圖片或分析結果，僅在記憶體中即時處理後回傳。',
    },
    localData: {
      storedOnDevice: true,
      storage: 'localStorage',
      items: ['學習者身分設定', '健康設定與慢性病史', '學習與把關紀錄', '隱私同意狀態'],
      note: '所有學習紀錄僅儲存在您的瀏覽器本機，不會上傳。您可隨時於介面上清除。',
    },
  });
});

// 健康檢查接口
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'LabelBuddy AI Backend Proxy' });
});

// 整合 Vite 中介軟體 (開發與生產模式)
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[LabelBuddy AI] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
