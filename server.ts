/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 【重要安全提示】
 * 絕對不能將 API Key 寫死在前端瀏覽器程式碼中！
 * 本專案採中轉後端（Backend Proxy，即此 Express 伺服器），
 * 由後端安全讀取環境變數中的金鑰，避免金鑰外洩或遭人惡意濫用。
 *
 * 【AI 供應商：雙供應商輪替】
 * 同時支援 Google Gemini 與 OpenRouter，依「今日使用率」輪替呼叫，
 * 讓兩邊的免費額度平均消耗，不會很快把單一家的額度用完。
 * 另有分析結果快取（同一張圖 + 同一組慢性病在 TTL 內不重複呼叫 API）。
 *
 * ⚠️ 已知限制：Gemini API 的官方支援區域不含中國澳門。從該地呼叫會得到
 *   400 FAILED_PRECONDITION: User location is not supported for the API use.
 * 這是服務區域限制而非金鑰或程式問題。程式會自動偵測並將 Gemini 長時間冷卻跳過，
 * 實際運作會落在 OpenRouter 上。
 */

import express from 'express';
import path from 'path';
import { createHash } from 'node:crypto';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { extractNutritionProfile, analyzeNutritionWithIndicators } from './server/smartNutritionAnalyzer';
import { analyzeSeniorPhysicalIndicators } from './server/smartIndicatorAnalyzer';
import { answerSeniorHealthQuestion } from './server/smartHealthQA';
import { SeniorPhysicalIndicators, NutrientFact } from './src/types';
import { getLearnerProfile } from './src/data/learnerProfiles';

dotenv.config();

const app = express();
// 允許以環境變數覆寫埠號（雲端平台如 Cloud Run 會要求監聽 $PORT）
const PORT = Number(process.env.PORT) || 3000;

// 允許處理較大的壓縮圖片 Base64 載荷 (設定為 20MB)
app.use(express.json({ limit: '20mb' }));

// ===========================================================================
// AI 供應商池：Google Gemini + OpenRouter 輪替
// ===========================================================================
// 目的：兩邊都有免費額度，輪替使用可延緩單一額度被用盡。
//   Gemini     : 5 次/分、1500 次/日
//   OpenRouter : 免費層約 50 次/日
// 實際可用性由執行期健康檢查決定——某家連續失敗會自動進入冷卻並被跳過。
// ===========================================================================
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const GEMINI_BASE_URL = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

/** 單次 AI 請求的逾時上限（毫秒）。長者不會願意在貨架前等太久。 */
const REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS) || 45000;

/**
 * OpenRouter 免費視覺模型優先序。
 * 免費模型經常被上游限流（429），交給 OpenRouter 依序嘗試比綁定單一模型可靠。
 *
 * ⚠️ 2026-09-24 更新：`inclusionai/ling-3.0-flash-vl:free` 已下架轉為付費
 *   （呼叫會回 404「This model is unavailable for free」）。
 *   其餘 ling 免費版（-sante、-fin）為純文字模型，不支援圖像，不可用。
 *
 * 2026-09-24 實測結果（同一張高鈉泡麵標籤，皆 cost=0）：
 *   dots-studio/dots-3-note-preview:free              → 1.6 秒，286 tokens，紅燈
 *        品質最佳：正確讀出鈉 1980mg 並換算成「約等於 4.9 克鹽」
 *   nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free → 0.6 秒，241 tokens，紅燈
 *        最快，敘述較精簡
 *   nex-agi/nex-n2.5-pro:free                         → HTTP 522（供應商故障）
 *   google/gemma-4-31b-it:free、qwen/qwen3.8-27b:free → 持續 429
 */
/**
 * ⚠️ OpenRouter 的 `models` 降級陣列**最多只能 3 個**，
 *    超過會直接回 400「'models' array must have 3 items or fewer.」。
 *    因此這裡只放 3 個，getModelChain() 另有 slice 防護。
 */
const DEFAULT_MODEL_CHAIN = [
  'dots-studio/dots-3-note-preview:free',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
  'qwen/qwen3.8-27b:free',
];

/** OpenRouter 硬性限制：models 陣列上限 3 個 */
const MAX_MODEL_CHAIN = 3;

/** 若設定了 OPENROUTER_MODEL，就只使用該模型（方便日後換付費模型） */
function getModelChain(): string[] {
  const custom = (process.env.OPENROUTER_MODEL || '').trim();
  const chain = custom ? [custom] : DEFAULT_MODEL_CHAIN;
  return chain.slice(0, MAX_MODEL_CHAIN);
}

type ProviderName = 'gemini' | 'openrouter';

/** 各家免費層的每日上限，僅用於輪替權重（非硬性擋阻） */
const DAILY_QUOTA: Record<ProviderName, number> = {
  gemini: 1500,
  openrouter: 50,
};

/** 一般失敗的冷卻時間；區域封鎖屬永久性，冷卻 6 小時避免白費額度 */
const COOLDOWN_MS = 10 * 60 * 1000;
const REGION_BLOCK_COOLDOWN_MS = 6 * 60 * 60 * 1000;

interface ProviderState {
  failures: number;
  disabledUntil: number;
  usedToday: number;
  lastError: string;
}

const providerState: Record<ProviderName, ProviderState> = {
  gemini: { failures: 0, disabledUntil: 0, usedToday: 0, lastError: '' },
  openrouter: { failures: 0, disabledUntil: 0, usedToday: 0, lastError: '' },
};

let stateDate = new Date().toDateString();

/** 跨日時重置計數 */
function rollDateIfNeeded(): void {
  const today = new Date().toDateString();
  if (today === stateDate) return;
  stateDate = today;
  (Object.keys(providerState) as ProviderName[]).forEach((name) => {
    providerState[name].usedToday = 0;
    providerState[name].failures = 0;
    providerState[name].disabledUntil = 0;
    providerState[name].lastError = '';
  });
  console.log('[LabelBuddy AI] 已跨日，重置供應商使用計數');
}

function providerKeys(): Record<ProviderName, string> {
  return {
    gemini: (process.env.GEMINI_API_KEY || '').trim(),
    openrouter: (process.env.OPENROUTER_API_KEY || '').trim(),
  };
}

/**
 * 依「今日使用率」排序可用的供應商，使用率低者優先。
 * 這是「兩家一起用、不會很快用完一家」的核心：
 * 例如 Gemini 用了 1/1500、OpenRouter 用了 1/50，下一輪會優先選 Gemini。
 */
function orderedProviders(hasClientKey: boolean): ProviderName[] {
  rollDateIfNeeded();
  const keys = providerKeys();
  const now = Date.now();

  return (['gemini', 'openrouter'] as ProviderName[])
    .filter((name) => {
      // 前端自備金鑰一律走 OpenRouter（避免使用伺服器端的 Gemini 額度）
      if (hasClientKey && name === 'gemini') return false;
      if (!hasClientKey && !isValidKey(keys[name])) return false;
      if (providerState[name].disabledUntil > now) return false;
      return true;
    })
    .sort(
      (a, b) =>
        providerState[a].usedToday / DAILY_QUOTA[a] - providerState[b].usedToday / DAILY_QUOTA[b]
    );
}

/**
 * 取得前端自備的金鑰。
 * 註：`x-gemini-key` 是舊命名，因既有元件仍在使用而保留相容。
 */
function resolveClientKey(req: express.Request): string {
  const fromClient = (req.headers['x-gemini-key'] as string) || req.body?.apiKey;
  return String(fromClient || '').trim();
}

function isValidKey(key: string): boolean {
  return key.length > 15 && !key.includes('MY_GEMINI_API_KEY') && !key.includes('MY_OPENROUTER_API_KEY');
}

// ---------------------------------------------------------------------------
// OpenRouter 免費額度查詢
// ---------------------------------------------------------------------------
// 重要：OpenRouter 的免費模型每日上限是「全域治理」的，不是 per-key。
// 官方文件明確寫道：
//   "Making additional accounts or API keys will not affect your rate limits,
//    as we govern capacity globally."
// 也就是說多開幾把金鑰（或多開帳號）都不會提高上限。
//
// 額度分級（依「累計購買點數」決定）：
//   未購買點數：20 次/分、50 次/日
//   累計 ≥ 10 點數：20 次/分、1000 次/日
//
// 查詢端點 GET /api/v1/key 本身不消耗免費額度，結果快取 60 秒。
// ---------------------------------------------------------------------------
const QUOTA_CACHE_MS = 60 * 1000;
let quotaCache: { at: number; data: OpenRouterQuota } | null = null;

interface OpenRouterQuota {
  used: number;
  limit: number;
  remaining: number;
  isFreeTier: boolean | null;
  creditsPurchased: number | null;
}

async function getOpenRouterQuota(): Promise<OpenRouterQuota | null> {
  const key = (process.env.OPENROUTER_API_KEY || '').trim();
  if (!isValidKey(key)) return null;
  if (quotaCache && Date.now() - quotaCache.at < QUOTA_CACHE_MS) return quotaCache.data;

  try {
    const res = await fetch(`${OPENROUTER_BASE_URL}/key`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const json: any = await res.json();
    const fm = json?.data?.free_model_daily_requests;
    if (!fm) return null;

    const data: OpenRouterQuota = {
      used: fm.used,
      limit: fm.limit,
      remaining: fm.remaining,
      isFreeTier: json?.data?.is_free_tier ?? null,
      creditsPurchased: json?.data?.usage ?? null,
    };
    quotaCache = { at: Date.now(), data };
    return data;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 簡體 → 繁體 後處理
// ---------------------------------------------------------------------------
// 免費的小型模型偶爾會混入簡體字（實測出現「过敏」而非「過敏」）。
// 這裡只轉換「簡繁一對一且無歧義」的字；像 后/後、干/乾、里/裡、面/麵、
// 只/隻、发/發/髮 這類有歧義的一律不列入，避免把正確的字改壞。
// ---------------------------------------------------------------------------
const SIMPLIFIED_TO_TRADITIONAL: Record<string, string> = {
  钠: '鈉', 钙: '鈣', 盐: '鹽', 钾: '鉀', 铁: '鐵', 锌: '鋅', 铜: '銅', 镁: '鎂',
  维: '維', 养: '養', 营: '營', 质: '質', 麦: '麥', 麸: '麩', 胆: '膽', 压: '壓',
  药: '藥', 医: '醫', 体: '體', 时: '時', 间: '間', 说: '說', 请: '請', 问: '問',
  买: '買', 卖: '賣', 货: '貨', 车: '車', 东: '東', 长: '長', 门: '門', 见: '見',
  现: '現', 边: '邊', 进: '進', 远: '遠', 连: '連', 达: '達', 关: '關', 开: '開',
  无: '無', 处: '處', 备: '備', 单: '單', 华: '華', 图: '圖', 团: '團', 场: '場',
  报: '報', 换: '換', 据: '據', 检: '檢', 样: '樣', 气: '氣', 汉: '漢', 汤: '湯',
  减: '減', 剂: '劑', 办: '辦', 动: '動', 务: '務', 区: '區', 历: '歷', 厌: '厭',
  厂: '廠', 厅: '廳', 变: '變', 号: '號', 习: '習', 乡: '鄉', 书: '書', 写: '寫',
  读: '讀', 认: '認', 识: '識', 语: '語', 词: '詞', 试: '試', 论: '論', 调: '調',
  谈: '談', 让: '讓', 记: '記', 许: '許', 计: '計', 训: '訓', 议: '議', 讨: '討',
  护: '護', 担: '擔', 择: '擇', 挥: '揮', 损: '損', 摄: '攝', 数: '數', 断: '斷',
  显: '顯', 术: '術', 机: '機', 构: '構', 极: '極', 标: '標', 权: '權', 欢: '歡',
  残: '殘', 汇: '匯', 没: '沒', 泽: '澤', 洁: '潔', 浓: '濃', 测: '測', 济: '濟',
  浅: '淺', 涨: '漲', 渐: '漸', 温: '溫', 湿: '濕', 满: '滿', 滤: '濾', 炼: '煉',
  烟: '煙', 烦: '煩', 热: '熱', 爱: '愛', 状: '狀', 独: '獨', 环: '環', 疗: '療',
  盖: '蓋', 盘: '盤', 碱: '鹼', 确: '確', 碍: '礙', 础: '礎', 礼: '禮', 积: '積',
  称: '稱', 稳: '穩', 穷: '窮', 竞: '競', 笔: '筆', 简: '簡', 类: '類', 粮: '糧',
  红: '紅', 纤: '纖', 纯: '純', 纸: '紙', 线: '線', 练: '練', 织: '織', 终: '終',
  经: '經', 结: '結', 给: '給', 络: '絡', 统: '統', 继: '繼', 续: '續', 缩: '縮',
  网: '網', 罗: '羅', 义: '義', 职: '職', 联: '聯', 肃: '肅', 肠: '腸', 肤: '膚',
  肿: '腫', 胀: '脹', 脑: '腦', 脸: '臉', 脏: '臟', 节: '節', 荐: '薦', 苏: '蘇',
  苹: '蘋', 范: '範', 获: '獲', 萝: '蘿', 葱: '蔥', 蓝: '藍', 蚁: '蟻', 补: '補',
  装: '裝', 观: '觀', 规: '規', 视: '視', 览: '覽', 觉: '覺', 讲: '講', 设: '設',
  访: '訪', 证: '證', 评: '評', 诉: '訴', 译: '譯', 话: '話', 详: '詳', 误: '誤',
  课: '課', 谊: '誼', 谋: '謀', 谢: '謝', 谨: '謹', 谱: '譜', 贝: '貝', 负: '負',
  贡: '貢', 财: '財', 责: '責', 贴: '貼', 费: '費', 资: '資', 赏: '賞', 赔: '賠',
  赚: '賺', 赢: '贏', 转: '轉', 轮: '輪', 软: '軟', 轻: '輕', 载: '載', 较: '較',
  辅: '輔', 辆: '輛', 输: '輸', 运: '運', 还: '還', 这: '這', 违: '違', 迟: '遲',
  适: '適', 选: '選', 递: '遞', 逻: '邏', 遗: '遺', 邮: '郵', 针: '針', 钉: '釘',
  钟: '鐘', 钢: '鋼', 钱: '錢', 铃: '鈴', 错: '錯', 银: '銀', 铺: '鋪', 链: '鏈',
  镜: '鏡', 闭: '閉', 闻: '聞', 阁: '閣', 阅: '閱', 阵: '陣', 阶: '階',
  阴: '陰', 阳: '陽', 随: '隨', 险: '險', 隐: '隱', 难: '難', 雾: '霧', 静: '靜',
  顶: '頂', 项: '項', 顺: '順', 须: '須', 顾: '顧', 预: '預', 领: '領', 频: '頻',
  题: '題', 颜: '顏', 额: '額', 风: '風', 飞: '飛', 饭: '飯', 饮: '飲', 饰: '飾',
  饱: '飽', 饿: '餓', 饼: '餅', 馆: '館', 馒: '饅', 驳: '駁', 驱: '驅', 验: '驗',
  骑: '騎', 鲜: '鮮', 鸟: '鳥', 鸡: '雞', 鸭: '鴨', 鹅: '鵝',
  黄: '黃', 齿: '齒', 龄: '齡', 龙: '龍', 龟: '龜',
  // 2026-09-25 補：實測結果頁仍出現「购買」「过敏」「嚴重」等簡體字，
  // 原因是這批高頻字原本不在表內。以下皆為簡繁一對一、無歧義的字。
  过: '過', 购: '購', 头: '頭', 岁: '歲', 儿: '兒', 学: '學', 参: '參', 严: '嚴',
  强: '強', 应: '應', 该: '該', 员: '員', 师: '師', 举: '舉', 乐: '樂', 别: '別',
  内: '內', 两: '兩', 并: '並', 从: '從', 众: '眾', 会: '會', 传: '傳', 伤: '傷',
  价: '價', 仅: '僅', 们: '們', 优: '優', 划: '劃', 则: '則', 刚: '剛', 创: '創',
  劳: '勞', 势: '勢', 协: '協', 卫: '衛', 厉: '厲', 县: '縣', 听: '聽', 启: '啟',
  响: '響', 园: '園', 围: '圍', 圣: '聖', 坏: '壞', 块: '塊', 坚: '堅', 够: '夠',
  夺: '奪', 奖: '獎', 妇: '婦', 妈: '媽', 娱: '娛', 婴: '嬰', 宁: '寧', 宝: '寶',
  实: '實', 审: '審', 宫: '宮', 宽: '寬', 宾: '賓', 对: '對', 导: '導', 层: '層',
  岗: '崗', 岛: '島', 岭: '嶺', 峡: '峽', 带: '帶', 帮: '幫', 广: '廣', 庄: '莊',
  庆: '慶', 库: '庫', 废: '廢', 厢: '廂', 厦: '廈', 厨: '廚', 双: '雙', 猪: '豬',
  鱼: '魚', 虾: '蝦', 酱: '醬', 净: '淨', 冻: '凍', 万: '萬', 产: '產', 矿: '礦',
  准: '準', 兴: '興', 军: '軍', 农: '農', 剧: '劇', 劝: '勸', 胜: '勝', 励: '勵',
  劲: '勁', 勋: '勳', 仓: '倉', 仪: '儀', 偿: '償', 储: '儲', 党: '黨',
  兰: '蘭', 冲: '衝', 决: '決', 况: '況', 凤: '鳳', 凭: '憑', 击: '擊', 刘: '劉',
};

/** 只轉換對照表中「無歧義」的簡體字，其餘原樣保留 */
function toTraditionalChinese(text: string): string {
  if (!text) return text;
  return text.replace(/[\u4e00-\u9fff]/g, (ch) => SIMPLIFIED_TO_TRADITIONAL[ch] || ch);
}

/** 遞迴轉換物件內所有字串欄位 */
function deepToTraditionalChinese(value: any): any {
  if (typeof value === 'string') return toTraditionalChinese(value);
  if (Array.isArray(value)) return value.map(deepToTraditionalChinese);
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const k of Object.keys(value)) out[k] = deepToTraditionalChinese(value[k]);
    return out;
  }
  return value;
}

// ---------------------------------------------------------------------------
// 分析結果快取
// ---------------------------------------------------------------------------
// 節省免費額度最有效的手段：長者常會重複掃描同一件商品，
// 同一張圖 + 同一組慢性病在 TTL 內直接回傳上次結果，完全不呼叫 API。
// ---------------------------------------------------------------------------
const CACHE_TTL_MS = Number(process.env.AI_CACHE_TTL_MS) || 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;

interface CacheEntry {
  at: number;
  data: any;
  model: string;
  provider: ProviderName;
}

const analysisCache = new Map<string, CacheEntry>();

function makeCacheKey(imageBase64: string, conditions: string[]): string {
  return createHash('sha256')
    .update(imageBase64)
    .update('|')
    .update([...conditions].sort().join(','))
    .digest('hex');
}

function readCache(key: string): CacheEntry | null {
  const hit = analysisCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    analysisCache.delete(key);
    return null;
  }
  return hit;
}

function writeCache(key: string, data: any, model: string, provider: ProviderName): void {
  if (analysisCache.size >= CACHE_MAX_ENTRIES) {
    // 簡單的 FIFO 淘汰，避免記憶體無限成長
    const oldest = analysisCache.keys().next().value;
    if (oldest) analysisCache.delete(oldest);
  }
  analysisCache.set(key, { at: Date.now(), data, model, provider });
}

/**
 * 寬鬆 JSON 解析：免費模型不一定支援 response_format，
 * 因此一律靠提示詞約束，再容忍 markdown 圍欄與前後雜訊。
 */
function parseJsonLoose(text: string): any | null {
  if (!text) return null;
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    /* 繼續嘗試抽取 */
  }
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {
      /* 放棄 */
    }
  }
  return null;
}

interface AiCallOptions {
  systemInstruction: string;
  userPrompt: string;
  image?: { base64: string; mimeType: string };
  temperature?: number;
  /**
   * 推理型模型（如 ling-3.0-flash-vl）會先產生思考 token，
   * 額度給太小會導致正式回答被截斷（finish_reason=length），
   * 實測需要 3000 以上才能穩定產出完整 JSON。
   */
  maxTokens?: number;
}

type ProviderResult =
  | { ok: true; data: any; model: string; provider: ProviderName }
  | { ok: false; permanent: boolean; error: string };

/**
 * 呼叫 Google Gemini。
 *
 * ⚠️ 區域限制：Gemini API 官方支援區域不含中國澳門。從該地呼叫會得到
 *   400 FAILED_PRECONDITION: User location is not supported for the API use.
 * 這類錯誤標記為 permanent，會進入 6 小時冷卻，避免每次掃描都白費一次往返。
 */
async function callGemini(key: string, options: AiCallOptions): Promise<ProviderResult> {
  const parts: any[] = [];
  if (options.image) {
    parts.push({ inlineData: { mimeType: options.image.mimeType, data: options.image.base64 } });
  }
  parts.push({ text: options.userPrompt });

  const body = {
    systemInstruction: { parts: [{ text: options.systemInstruction }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: options.temperature ?? 0.2,
      maxOutputTokens: options.maxTokens ?? 900,
      responseMimeType: 'application/json',
    },
  };

  const start = Date.now();
  try {
    const res = await fetch(
      `${GEMINI_BASE_URL}/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }
    );
    const elapsed = Date.now() - start;
    const raw = await res.text();

    if (!res.ok) {
      const permanent = raw.includes('User location is not supported');
      console.log(`[LabelBuddy AI] Gemini 失敗 HTTP ${res.status}（${elapsed}ms）${raw.slice(0, 180)}`);
      return { ok: false, permanent, error: `HTTP ${res.status}` };
    }

    const json = JSON.parse(raw);
    const content: string =
      json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).filter(Boolean).join('') ?? '';
    const parsed = parseJsonLoose(content);

    console.log(`[LabelBuddy AI] Gemini 成功（${elapsed}ms）解析=${parsed ? 'OK' : '失敗'}`);

    if (!parsed) return { ok: false, permanent: false, error: 'JSON 解析失敗' };
    return { ok: true, data: parsed, model: GEMINI_MODEL, provider: 'gemini' };
  } catch (error: any) {
    console.log(`[LabelBuddy AI] Gemini 例外（${Date.now() - start}ms）${String(error?.message).slice(0, 150)}`);
    return { ok: false, permanent: false, error: String(error?.message).slice(0, 120) };
  }
}

/**
 * 呼叫 OpenRouter。
 * 免費模型常被上游限流（429），因此內建 3 次嘗試與指數退避。
 */
async function callOpenRouter(key: string, options: AiCallOptions): Promise<ProviderResult> {
  const content: any[] = [];
  if (options.image) {
    content.push({
      type: 'image_url',
      image_url: { url: `data:${options.image.mimeType};base64,${options.image.base64}` },
    });
  }
  content.push({ type: 'text', text: options.userPrompt });

  const payload = {
    models: getModelChain(),
    messages: [
      { role: 'system', content: options.systemInstruction },
      { role: 'user', content },
    ],
    temperature: options.temperature ?? 0.2,
    max_tokens: options.maxTokens ?? 900,
    /**
     * 【關鍵】必須關閉推理模式。
     * ling-3.0-flash-vl 等推理型模型會先產生大量思考 token（實測 766~1804 個），
     * 導致兩個後果：
     *   1. 正式回答的 token 額度被吃光，JSON 被截斷（finish_reason=length）
     *   2. 單次請求超過 45 秒，長者在貨架前等不下去
     * 實測關閉推理後，同一張標籤圖的回應時間由 45 秒以上降到約 1.8 秒。
     * 本任務只需要簡短結論，不需要長鏈推理。
     */
    reasoning: { enabled: false },
  };

  const backoffMs = [0, 1500, 3500];
  let lastError = '';

  for (let attempt = 0; attempt < backoffMs.length; attempt++) {
    if (backoffMs[attempt] > 0) {
      await new Promise((resolve) => setTimeout(resolve, backoffMs[attempt]));
    }

    const attemptStart = Date.now();

    try {
      const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
          'X-Title': 'LabelBuddy AI',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const elapsed = Date.now() - attemptStart;

      if (response.status === 429) {
        lastError = '429 限流';
        console.log(`[LabelBuddy AI] OpenRouter 第 ${attempt + 1} 次嘗試：429 限流（${elapsed}ms）`);
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        lastError = `HTTP ${response.status}`;
        console.log(`[LabelBuddy AI] OpenRouter 第 ${attempt + 1} 次嘗試：HTTP ${response.status}（${elapsed}ms）${errText.slice(0, 160)}`);
        continue;
      }

      const json: any = await response.json();
      const text: string = json?.choices?.[0]?.message?.content ?? '';
      const parsed = parseJsonLoose(text);

      console.log(
        `[LabelBuddy AI] OpenRouter 第 ${attempt + 1} 次嘗試：成功（${elapsed}ms）` +
          ` 模型=${json?.model} 輸出=${json?.usage?.completion_tokens ?? '?'} tokens` +
          ` 解析=${parsed ? 'OK' : '失敗'}`
      );

      if (parsed) {
        return { ok: true, data: parsed, model: json?.model || 'unknown', provider: 'openrouter' };
      }
      lastError = 'JSON 解析失敗';
    } catch (error: any) {
      lastError = String(error?.message).slice(0, 120);
      console.log(
        `[LabelBuddy AI] OpenRouter 第 ${attempt + 1} 次嘗試：例外（${Date.now() - attemptStart}ms）` +
          ` ${String(error?.message).slice(0, 150)}`
      );
    }
  }

  return { ok: false, permanent: false, error: lastError || '全部嘗試失敗' };
}

/**
 * 依使用率輪替呼叫供應商。
 *
 * 成功 → 累計該家今日用量，並清除失敗計數。
 * 失敗 → 累計失敗次數；連續 2 次失敗或遇到永久性錯誤即進入冷卻被跳過。
 *
 * 全部失敗時回傳 null，由呼叫端決定降級行為。
 */
async function callAiModel(
  req: express.Request,
  options: AiCallOptions
): Promise<{ data: any; model: string; provider: ProviderName } | null> {
  const clientKey = resolveClientKey(req);
  const keys = providerKeys();
  const order = orderedProviders(!!clientKey);

  if (order.length === 0) {
    console.log('[LabelBuddy AI] 沒有可用的 AI 供應商（金鑰未設定，或全部在冷卻中）');
    return null;
  }

  for (const name of order) {
    // OpenRouter 免費額度用盡時直接跳過，省下一次註定失敗的往返
    if (name === 'openrouter' && !clientKey) {
      const quota = await getOpenRouterQuota();
      if (quota && quota.remaining <= 0) {
        console.log(
          `[LabelBuddy AI] OpenRouter 今日免費額度已用盡（${quota.used}/${quota.limit}），跳過此供應商`
        );
        continue;
      }
    }

    const key = name === 'openrouter' && clientKey ? clientKey : keys[name];
    const result =
      name === 'gemini' ? await callGemini(key, options) : await callOpenRouter(key, options);

    if (result.ok) {
      providerState[name].failures = 0;
      providerState[name].lastError = '';
      providerState[name].usedToday++;
      console.log(
        `[LabelBuddy AI] 供應商=${name} 完成，今日已用 ${providerState[name].usedToday}/${DAILY_QUOTA[name]}`
      );
      // 統一輸出為繁體中文，修正模型偶爾混入的簡體字
      return {
        data: deepToTraditionalChinese(result.data),
        model: result.model,
        provider: result.provider,
      };
    }

    providerState[name].failures++;
    providerState[name].lastError = result.error;

    // 永久性錯誤（如區域封鎖）立即冷卻；一般錯誤需連續失敗 2 次才冷卻
    if (result.permanent || providerState[name].failures >= 2) {
      const cooldown = result.permanent ? REGION_BLOCK_COOLDOWN_MS : COOLDOWN_MS;
      providerState[name].disabledUntil = Date.now() + cooldown;
      console.log(
        `[LabelBuddy AI] 供應商=${name} 進入冷卻 ${cooldown / 60000} 分鐘` +
          `（原因：${result.error}${result.permanent ? '，永久性' : ''}）`
      );
    } else {
      console.log(`[LabelBuddy AI] 供應商=${name} 失敗（${result.error}），改用下一家`);
    }
  }

  return null;
}

// ===========================================================================
// 系統提示詞
// ===========================================================================

// 系統提示詞：要求 LabelBuddy AI 依使用者身分分析食品成分，並輸出標準 JSON
//
// 【設計說明】提示詞拆成「共用規則」與「身分段落」兩部分：
//   - 共用規則（術語、字數上限、JSON schema、繁簡規範）與身分無關，全長共用一份。
//   - 身分段落則由 buildSystemInstruction(profileId) 動態注入，
//     讓同一個模型在「長者三高」與「健身增肌」兩種情境下給出不同的判斷基準。
//   這樣做的好處是新增身分時只要改 src/data/learnerProfiles.ts，提示詞自動跟上。

/** 所有身分共用的規則段落（術語、語氣、長度限制、輸出格式） */
const SYSTEM_INSTRUCTION_SHARED = `
CRITICAL TONE AND COMMUNICATION RULES:
1. Speak in warm, respectful, caring Traditional Chinese (繁體中文).
2. 【TERMINOLOGY — 這是最容易出錯的地方，請務必遵守】
   鈉 (sodium) 和 鈣 (calcium) 是兩個完全不同的東西，絕對不可以混用。
   - 鹽分／鹹味／血壓相關的營養素一律寫「鈉」。例如：「鈉含量 1980 毫克」「低鈉」「高鈉」。
   - 只有在講骨骼、補鈣、乳製品時才寫「鈣」。例如：「含碳酸鈣」「高鈣豆漿」。
   - 錯誤示範：「這包麵鈣含量超高（1980毫克）」← 錯！應該寫「鈉含量超高」。
   - 錯誤示範：「這杯豆漿無糖低鈣」← 錯！應該寫「低鈉」。
   - 檢查方法：如果你寫的「鈣」是在講鹹度、鹽分或血壓，那一定是寫錯了，請改成「鈉」。
3. Avoid dense medical jargon or raw chemical numbers; translate them into everyday vernacular (白話文) that the user can immediately understand.
4. If image is blurry or cannot be recognized as a food label, set risk_level to "yellow", warning_title to "⚠️ 標籤不夠清楚", and guide them gently to retake the photo with better lighting or closer angle.
5. You MUST return ONLY valid JSON. Do NOT wrap it in markdown code fences. Do NOT add any text before or after the JSON.
6. BE CONCISE. This text is read aloud to the user, so long paragraphs are useless. Respect these limits STRICTLY:
   - plain_summary: at most 80 Chinese characters (1 to 3 short sentences)
   - alternative_advice: at most 60 Chinese characters
   - warning_title: at most 15 Chinese characters
   - ingredients_detected: at most 5 items, each at most 12 Chinese characters
   - nutrition_concerns: at most 3 items, each at most 15 Chinese characters
   - matched_conditions: at most 4 items, each at most 15 Chinese characters
7. Write in Traditional Chinese only. Do not mix in Simplified Chinese characters (e.g. write 適 not 适, 麥 not 麦).

JSON SCHEMA:
{
  "risk_level": "red" | "yellow" | "green",
  "warning_title": "string (Short, clear, bold warning with emoji, e.g. ⚠️ 高鈉警告！ or ✅ 適合食用)",
  "plain_summary": "string (A warm, large-font plain speech summary explaining the conclusion for the user)",
  "alternative_advice": "string (Practical alternative grocery suggestion or healthy portion advice)",
  "ingredients_detected": ["string", "..."],
  "nutrition_concerns": ["string", "..."],
  "matched_conditions": ["string", "..."],
  "nutrient_facts": [
    {
      "name": "string (成分名，只能用每日參考值清單裡出現的名稱)",
      "value": number (食品實際含量，純數字，例如 2480),
      "unit": "string (毫克 or 公克)"
    }
  ]
}

【nutrient_facts 規則 — 這是最重要的一項輸出】
1. 最多 3 項，依「超出每日上限的程度」由高到低排序（最嚴重的放第一）。
2. 只列出實際含量「達到每日上限 30% 以上」的成分。若一個都沒有，就給空陣列 []。
   （門檻訂在 30% 而非 50%：實測 50% 常讓對照表只剩一項，
     但長者需要看到「哪些還好、哪些快滿了」的相對關係，才判斷得出輕重。）
3. name 必須使用該身分每日參考值清單裡的原始名稱（例如「鈉」「添加糖」「飽和脂肪」「蛋白質」「鈣」），
   不要自創名稱、不要寫「鹽分」「糖分」。
4. value 必須是這包食品「整包」的實際含量，不可自己編造。
   若標示只寫「每份」的數值，請先換算成整包的數值再填，並在 plain_summary 說明這一點。
5. 不需要自己計算百分比，後端會依每日上限換算，你只要把 name / value / unit 填正確即可。`;

/**
 * 依學習者身分組裝完整的系統提示詞。
 *
 * @param profileId 前端傳來的學習者身分（可能為 undefined 或無效值，會安全退回「長者三高」）
 * @returns 可直接送給模型的完整系統提示詞
 */
function buildSystemInstruction(profileId?: string | null): string {
  const profile = getLearnerProfile(profileId);

  // 每日參考值：把結構化的 targets 攤平成模型容易讀取的條列文字
  const targetLines = profile.targets
    .map(
      (t) =>
        `   - ${t.nutrient}：${t.direction === 'limit' ? '每日不超過' : '每日至少'} ${t.target}（${t.note}）`
    )
    .join('\n');

  const objectiveLines = profile.learningObjectives.map((o) => `   - ${o}`).join('\n');

  // 數值化的每日上限：模型必須用這組數字來算 nutrient_facts.percent。
  // 若只給「2000 毫克」這種字串，模型有機會誤讀或自行猜測，因此明確列出。
  const numericLines = Object.entries(profile.numericLimits)
    .map(([name, l]) => `   - ${name}：${l.value} ${l.unit}`)
    .join('\n');

  return `You are LabelBuddy AI, an expert, caring, and protective supermarket food label analyzer.

【本次辨識的對象身分】${profile.name}（${profile.emoji}）
【這個身分是誰】${profile.audience}
【他最在意的事】${profile.focusSummary}

【你的角色語氣】${profile.aiPersona}
【這個身分最該盯緊的成分】${profile.aiFocus}

【這個身分的每日參考值 — 判斷「合不合適」時請以此為基準】
${targetLines}

【每日上限的數值 — 判斷「算多還是算少」時請以此為基準】
${numericLines}
   判斷 nutrient_facts 該收錄哪些項目時，就用上表比較：達到三成以上的才列入。
   （百分比由後端統一換算，你不需計算，只要確保 value 是整包的正確含量。）

【這個身分想學會的事 — 若情況允許，可在建議中自然帶到】
${objectiveLines}

【挑選建議時優先使用的關鍵字方向】${profile.recommendKeywords.join('、')}

Your goal is to inspect food nutrition labels, ingredient lists, and allergen declarations from the provided image, and determine whether this product is safe and suitable for a person with THIS profile to buy and consume. Judge against the profile's reference values above — do NOT default to generic adult standards, and do NOT assume the user is an elderly person unless the profile above says so. Note that a food may be perfectly fine for one profile and a poor choice for another; your job is to judge it for THIS profile only.
${SYSTEM_INSTRUCTION_SHARED}`;
}

/* ---------------------------------------------------------------------------
 * nutrient_facts 正規化
 *
 * 【為什麼不直接相信模型算好的百分比】
 *   大型語言模型做算術並不可靠，2480 ÷ 2000 × 100 這種題目也可能算成 112 或 150。
 *   既然每日上限本來就在我們手上（profile.numericLimits），
 *   就由後端用確定性的程式碼重算，模型只負責「讀出實際含量」這件它擅長的事。
 *
 * 同時補上模型不該負責的欄位（dailyLimit、direction），
 * 並統一過濾規則：最多 3 項、只留 ≥ 30% 上限、依嚴重度排序。
 * ------------------------------------------------------------------------- */
function normalizeNutrientFacts(
  raw: unknown,
  numericLimits: Record<string, { value: number; unit: string }>
): NutrientFact[] {
  if (!Array.isArray(raw)) return [];

  const facts: NutrientFact[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const name = typeof (item as any).name === 'string' ? (item as any).name.trim() : '';
    const value = Number((item as any).value);
    if (!name || !Number.isFinite(value) || value <= 0) continue;

    // 名稱必須對得上每日參考值清單，否則無法換算，直接略過
    const limit = numericLimits[name];
    if (!limit || !Number.isFinite(limit.value) || limit.value <= 0) continue;

    const percent = Math.min(999, Math.round((value / limit.value) * 100));
    // 未達三成上限的項目不值得佔用長者的注意力（門檻與提示詞一致）
    if (percent < 30) continue;

    facts.push({
      name,
      value: Math.round(value * 10) / 10,
      unit: typeof (item as any).unit === 'string' && (item as any).unit
        ? (item as any).unit
        : limit.unit,
      dailyLimit: limit.value,
      percent,
      direction: 'limit',
    });
  }

  return facts.sort((a, b) => b.percent - a.percent).slice(0, 3);
}

// 核心食品標籤分析 API (中轉後端 Backend Proxy)
app.post('/api/analyze-label', async (req, res) => {
  const handlerStart = Date.now();
  try {
    const { imageBase64, conditions = [], vitals, profileId } = req.body;
    console.log(`[LabelBuddy AI] 收到辨識請求（body 解析完成，耗時 ${Date.now() - handlerStart}ms）`);

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

    // 學習者身分：決定 AI 的判斷基準（每日參考值）。
    // 傳入無效值時 getLearnerProfile 會安全退回「長者三高」，因此這裡不需額外防護。
    const learnerProfile = getLearnerProfile(profileId);

    const conditionText = conditions.length > 0 ? conditions.join('、') : '無特殊慢性病史';

    let vitalText = '';
    if (vitals && vitals.systolicBp) {
      vitalText = `【長者量測指標】血壓: ${vitals.systolicBp}/${vitals.diastolicBp} mmHg，心跳: ${vitals.heartRate || 72} bpm，血糖: ${vitals.bloodSugar} ${vitals.bloodSugarUnit || 'mmol/L'} (${vitals.bloodSugarTiming === 'fasting' ? '空腹' : '飯後'})。`;
    }

    const userPromptText = `請分析這張食品標籤，判斷是否適合「${learnerProfile.name}」購買。

【使用者的慢性病史】${conditionText}
${vitalText}

【請以此身分的角度特別比對】
- 這個身分的關鍵成分：${learnerProfile.aiFocus}
- 每日參考值：${learnerProfile.targets
      .map((t) => `${t.nutrient}${t.direction === 'limit' ? '不超過' : '至少'}${t.target}`)
      .join('、')}

【通用慢性病比對清單】高血壓(鈉含量)、高血糖/糖尿病(糖分與精製碳水)、心跳與心血管(反式油脂與高咖啡因)、高血脂(飽和脂肪與反式脂肪)、痛風(普林與果糖)、腎臟病(鈉鉀磷)、胃食道逆流(刺激辛辣酸)、骨質疏鬆(磷酸與重鹽)，以及食物過敏原(花生、堅果、海鮮、乳製品、小麥麩質)。`;

    // 先查快取：同一張圖 + 同一組慢性病 + 同一個身分在 TTL 內不重複呼叫 API，
    // 這是節省免費額度最有效的手段（長者常重複掃描同一件商品）。
    // 身分必須納入鍵值：同一包高蛋白粉，對健身族與腎臟病患者結論完全不同。
    const cacheKey = makeCacheKey(cleanBase64, [...conditions, `profile:${learnerProfile.id}`]);
    const cached = readCache(cacheKey);
    if (cached) {
      console.log(`[LabelBuddy AI] 命中快取，未消耗任何 API 額度（來源：${cached.provider}）`);
      return res.json({
        success: true,
        data: {
          ...cached.data,
          // 快取存的可能是舊格式，出快取時再正規化一次，確保欄位齊全
          nutrient_facts: normalizeNutrientFacts(
            cached.data?.nutrient_facts,
            learnerProfile.numericLimits
          ),
          analysis_mode: 'cloud_ai',
          ai_model: cached.model,
          ai_provider: cached.provider,
          cached: true,
          learner_profile_id: learnerProfile.id,
          learner_profile_name: learnerProfile.name,
        },
      });
    }

    // 首選：雲端視覺 AI（依使用率在 Gemini 與 OpenRouter 之間輪替）
    const aiResult = await callAiModel(req, {
      systemInstruction: buildSystemInstruction(learnerProfile.id),
      userPrompt: userPromptText,
      image: { base64: cleanBase64, mimeType },
      temperature: 0.2,
    });

    if (aiResult) {
      aiResult.data.analysis_mode = 'cloud_ai';
      aiResult.data.ai_model = aiResult.model;
      aiResult.data.ai_provider = aiResult.provider;
      aiResult.data.learner_profile_id = learnerProfile.id;
      aiResult.data.learner_profile_name = learnerProfile.name;
      // 用每日上限重算百分比，覆蓋模型自己算的數字（模型算術不可靠）
      aiResult.data.nutrient_facts = normalizeNutrientFacts(
        aiResult.data.nutrient_facts,
        learnerProfile.numericLimits
      );
      writeCache(cacheKey, aiResult.data, aiResult.model, aiResult.provider);
      console.log(`[LabelBuddy AI] 雲端辨識完成（${aiResult.provider}），處理器總耗時 ${Date.now() - handlerStart}ms`);
      return res.json({
        success: true,
        data: aiResult.data,
      });
    }

    // 降級：本機備援引擎（無金鑰或雲端連續失敗時）
    console.log('[LabelBuddy AI] 雲端 AI 未就緒，啟動本機智慧守護引擎');
    const profile = extractNutritionProfile(cleanBase64);
    // 帶入該身分的每日上限，讓本機引擎也能產生 nutrient_facts（前端百分比長條圖用）
    const smartResult = analyzeNutritionWithIndicators(
      profile,
      conditions,
      learnerProfile.numericLimits
    );

    return res.json({
      success: true,
      data: {
        ...smartResult,
        analysis_mode: 'local_fallback',
        learner_profile_id: learnerProfile.id,
        learner_profile_name: learnerProfile.name,
      },
    });
  } catch (error: any) {
    console.error('API 處理異常，啟動安全保護結果:', error);
    // 例外路徑同樣要帶身分上限，否則長者會看到「有結果、沒有百分比」的不一致畫面
    const catchProfile = getLearnerProfile(req.body?.profileId);
    const fallbackResult = analyzeNutritionWithIndicators(
      extractNutritionProfile(''),
      req.body?.conditions || [],
      catchProfile.numericLimits
    );
    return res.json({
      success: true,
      data: {
        ...fallbackResult,
        analysis_mode: 'local_fallback',
        learner_profile_id: catchProfile.id,
        learner_profile_name: catchProfile.name,
      },
    });
  }
});

// 長者身體各項指標專屬提示詞 (嚴格限制通俗大白話，老人家一聽就懂)
const SYSTEM_INSTRUCTION_INDICATORS = `You are a warm, gentle, patient family doctor and loving grandchild talking directly to an elderly grandfather or grandmother (阿公/阿婆, aged 65-85).
The senior is entering their home measurements or body indicators: blood pressure (上壓/下壓), blood sugar (血糖), uric acid (尿酸/關節), cholesterol (血脂/血管油), and physical feelings/symptoms.

CRITICAL RULES FOR ELDERLY UNDERSTANDING:
1. USE ONLY SUPER SIMPLE, EVERYDAY, COLLOQUIAL WORDS (純大白話！禁止任何難懂的醫學化學名詞).
   - NEVER say "動脈粥狀硬化", say "血管塞住、血流不順"
   - NEVER say "收縮壓舒張壓", say "上壓、下壓"
   - NEVER say "糖化血色素或胰島素抗性", say "身體代謝糖分變慢、血糖太高"
   - NEVER say "低密度脂蛋白膽固醇", say "壞油、油卡在血管壁"
   - NEVER say "高普林結晶沉積", say "喝太濃的肉湯骨髓，腳趾關節會紅腫痛風"
   - NEVER say "腎絲球過濾負擔", say "吃太鹹或化學粉，老人家腰子排不出去會水腫"
2. Always speak with love, warmth, and respect (阿公、阿婆您好！孫子/醫生幫您看看...).
3. Specifically tell them what to buy and what NEVER to buy when grocery shopping at the supermarket based on their exact numbers!
4. Provide practical, concrete daily care tips (drink warm water, walk 20 min, sleep early).
5. BE CONCISE — this text is read aloud to an elder. simple_explanation at most 120 Chinese characters, voice_summary at most 120 Chinese characters, each array item at most 20 Chinese characters, at most 3 items per array.
6. Output MUST be ONLY valid JSON, no markdown fences, matching this schema:
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
4. BE CONCISE — this text is read aloud to an elder. key_takeaway at most 40 Chinese characters, answer at most 150 Chinese characters, voice_script at most 150 Chinese characters, at most 3 safe_tips each at most 20 Chinese characters.
5. Output MUST be ONLY valid JSON, no markdown fences, matching this schema:
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
});

// AI 服務狀態檢查接口
app.get('/api/ai-status', async (req, res) => {
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
