/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * LabelBuddy AI 核心邏輯（平台無關）
 * ============================================================================
 * 【為什麼要把邏輯從 server.ts 抽出來】
 *   同一個後端要跑在兩個地方：
 *     1. Node / Express（本機開發、`啟動網頁.bat`）
 *     2. Cloudflare Workers（正式部署，免費邊緣運算）
 *   兩者只差「怎麼接收請求」，商業邏輯完全一樣。
 *   把邏輯集中在這裡，兩邊各自寫一層薄薄的轉接層就好，
 *   不必維護兩份會逐漸漂移的實作。
 *
 * 【Worker 相容性】
 *   這個檔案只使用：fetch、node:crypto（createHash）、process.env。
 *   Workers 開啟 nodejs_compat 後三者都支援。
 *   ⚠️ **絕對不要在這裡 import Node 專屬模組**（fs／path／os），
 *      或 tesseract.js —— Worker 沒有這些東西，打包會直接失敗。
 *      伺服器端 OCR 改由呼叫端以 `deps.recognizeImage` 注入（見 CoreDeps）。
 */

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

import { createHash } from 'node:crypto';
import dotenv from 'dotenv';
import { analyzeNutritionWithIndicators, buildEducationFields } from './smartNutritionAnalyzer';
import { buildRecognitionResult, type OcrRecognitionResult } from './labelParser';
import { analyzeSeniorPhysicalIndicators } from './smartIndicatorAnalyzer';
import { answerSeniorHealthQuestion } from './smartHealthQA';
import { buildConditionReminders } from './conditionAdvice';
// 本機引擎的英文對照表。公開 translateLocalText 是為了讓「食育欄位備援」
// 也能用同一份對照，而不是在 core.ts 另維護一份（兩份遲早會漂移）。
// ⚠️ localEngineEn.ts 不 import 任何 Node 模組，所以 Worker 也能安全使用。
import { translateLocalText } from './localEngineEn';
import {
  SeniorPhysicalIndicators,
  NutrientFact,
  NutrientBasis,
  LabelAnalysisResult,
  DataHandling,
  LearnerProfile,
} from '../src/types';
import { getLearnerProfile, getNutrientDirections } from '../src/data/learnerProfiles';
// 雙語對照（2026-09-28）：提示詞的營養素名稱是封閉清單，
// 若清單是中文，模型輸出的 nutrient_facts.name 就會是中文。
// 難字簡化（2026-09-30）：提示詞給模型看的是「鹽分／纖維／動物油／糖」，
// 但內部鍵仍是 canonical（鈉／膳食纖維…），所以進邊界要還原。
import {
  nutrientName,
  unitName,
  profileName,
  canonicalNutrientName,
  simplifyNutrientWording,
  simplifyNutrientWordingInFields,
} from '../src/data/bilingual';

/* ---------------------------------------------------------------------------
 * 平台無關的型別
 *
 * 【為什麼要自己定義，而不是用 express.Request】
 *   同一個後端要跑在 Express 與 Cloudflare Workers 兩邊。
 *   這裡只需要 body 與 headers 兩樣東西，自己定義比綁死 Express 型別乾淨，
 *   也讓 Worker 那側不必為了型別而引入 express。
 * ------------------------------------------------------------------------- */

/** 平台無關的請求（Express 與 Workers 都能輕易提供） */
export interface PlatformRequest {
  body: any;
  headers: Record<string, string | string[] | undefined>;
}

/** 平台無關的回應（由各平台的轉接層負責送出） */
export interface ApiResult {
  status: number;
  json: any;
}

/**
 * 注入給 handler 的平台相依能力。
 *
 * 【為什麼用注入而不是直接 import】
 *   伺服器端 OCR 需要 tesseract.js 與 Node 的 fs／path／os，
 *   這些在 Cloudflare Worker 都不存在。直接 import 會讓 Worker 打包失敗。
 *   改由呼叫端注入：Node 提供真的實作，Worker 不提供（走文字模式即可）。
 */
export interface CoreDeps {
  /** 伺服器端 OCR。Worker 不提供；未提供時圖片模式會回錯誤。 */
  recognizeImage?: (cleanBase64: string) => Promise<OcrRecognitionResult>;
}

dotenv.config();

// 允許以環境變數覆寫埠號（雲端平台如 Cloud Run 會要求監聽 $PORT）
const PORT = Number(process.env.PORT) || 3000;

// 允許處理較大的壓縮圖片 Base64 載荷 (設定為 20MB)

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
export function getModelChain(): string[] {
  const custom = (process.env.OPENROUTER_MODEL || '').trim();
  const chain = custom ? [custom] : DEFAULT_MODEL_CHAIN;
  return chain.slice(0, MAX_MODEL_CHAIN);
}

export type ProviderName = 'gemini' | 'openrouter';

/** 各家免費層的每日上限，僅用於輪替權重（非硬性擋阻） */
export const DAILY_QUOTA: Record<ProviderName, number> = {
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

export const providerState: Record<ProviderName, ProviderState> = {
  gemini: { failures: 0, disabledUntil: 0, usedToday: 0, lastError: '' },
  openrouter: { failures: 0, disabledUntil: 0, usedToday: 0, lastError: '' },
};

let stateDate = new Date().toDateString();

/** 跨日時重置計數 */
export function rollDateIfNeeded(): void {
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

export function providerKeys(): Record<ProviderName, string> {
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
function resolveClientKey(req: PlatformRequest): string {
  const fromClient = (req.headers['x-gemini-key'] as string) || req.body?.apiKey;
  return String(fromClient || '').trim();
}

export function isValidKey(key: string): boolean {
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

export async function getOpenRouterQuota(): Promise<OpenRouterQuota | null> {
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

  // 2026-09-27 補充：實測雲端模型輸出仍會出現這些簡體字。
  // 刻意不收「面」（麵/面）與「发」（發/髮）—— 一對多，改了反而可能出錯。
  与: '與', 个: '個', 为: '為', 么: '麼', 云: '雲', 几: '幾', 壳: '殼', 将: '將',
  录: '錄', 总: '總', 暂: '暫', 来: '來', 纲: '綱', 肾: '腎', 脉: '脈', 讯: '訊',
  败: '敗', 铬: '鉻', 锁: '鎖', 锅: '鍋', 际: '際', 陈: '陳', 韩: '韓', 页: '頁',
  颗: '顆', 飘: '飄', 马: '馬', 骤: '驟', 齐: '齊',
  于: '於', 辈: '輩',
};

/** 只轉換對照表中「無歧義」的簡體字，其餘原樣保留 */
export function toTraditionalChinese(text: string): string {
  if (!text) return text;
  return text.replace(/[\u4e00-\u9fff]/g, (ch) => SIMPLIFIED_TO_TRADITIONAL[ch] || ch);
}

/** 遞迴轉換物件內所有字串欄位 */
export function deepToTraditionalChinese(value: any): any {
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

export const analysisCache = new Map<string, CacheEntry>();

/**
 * 決定「這次請求要用什麼當快取鍵的內容來源」。
 *
 * ⚠️⚠️ **文字模式必須用 `ocrText`，絕對不能沿用 `imageBase64`。**
 *
 *   【為什麼】
 *     新流程（前端 OCR）下照片從來沒上傳，`imageBase64` 是**空字串**。
 *     若拿它當鍵，那麼「同一身分 ＋ 同一組慢性病 ＋ 同一模式 ＋ 同一語言」
 *     的**所有商品會共用同一個快取鍵**。
 *
 *   【實際後果（2026-09-29 實測）】
 *     先掃燕麥片（鈉 2mg）→ 再掃泡麵（鈉 2350mg，應該紅燈）
 *     → 第二次回傳「✅ 非常適合長者食用」＋ `cached: true`。
 *     這是**會害人的 bug**（該紅卻報綠），不是效能問題。
 *
 *   【為什麼要把這行抽成函式】
 *     原本它散在 handler 裡，寫錯不會報錯、只會安靜地回錯商品。
 *     抽出來才能被 `scripts/check-cache-key.ts` 釘住。
 */
export function analysisCacheContent(input: {
  isTextMode: boolean;
  ocrText?: string;
  imageBase64?: string;
}): string {
  if (input.isTextMode) return `text:${input.ocrText ?? ''}`;
  return `img:${input.imageBase64 ?? ''}`;
}

/**
 * 產生快取鍵。
 *
 * @param content 這次請求的**唯一內容來源** —— 文字模式是 OCR 文字，
 *                圖片模式是圖片的 base64。由 `analysisCacheContent()` 決定。
 * @param conditions 使用者勾選的慢性病清單（會排序，順序不影響鍵值）。
 */
export function makeCacheKey(content: string, conditions: string[]): string {
  return createHash('sha256')
    .update(content)
    .update('|')
    .update([...conditions].sort().join(','))
    .digest('hex');
}

export function readCache(key: string): CacheEntry | null {
  const hit = analysisCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    analysisCache.delete(key);
    return null;
  }
  return hit;
}

export function writeCache(key: string, data: any, model: string, provider: ProviderName): void {
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

export interface AiCallOptions {
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

export type ProviderResult =
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
export async function callAiModel(
  req: PlatformRequest,
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
//     讓同一個模型在「長者」與「健身增肌」兩種情境下給出不同的判斷基準。
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
4. 【照片有問題時 —— 兩種情況必須分開，不可以混為一談】
   ⚠️ 2026-10-02 使用者實測回報：拍了一張「不是標籤」的東西，
      App 卻說「標籤不夠清楚」，於是他以為是自己手震，
      **反覆重拍同一個根本不是標籤的東西**。錯誤訊息讓他做出更糟的行為。

   (a) 照片**根本不是食品營養標籤**（拍到風景、人臉、商品正面包裝圖、
       其他文件、室內環境…）：
       - photo_issue = "not_food_label"
       - risk_level = "yellow"
       - warning_title = "📷 這不是食物標籤"
       - plain_summary：先用一句話說明你看到什麼（例如「這張照片裡是一面牆」），
         再告訴他要拍什麼：「請拍包裝背面或側面的營養標示表格。」
       - ★ 重點是叫他**換東西拍**，不是叫他重拍同一張。

   (b) 照片**是標籤**，但模糊／反光／角度太斜／字太小而讀不出數字：
       - photo_issue = "blurry"
       - risk_level = "yellow"
       - warning_title = "⚠️ 標籤不夠清楚"
       - plain_summary：溫和地請他**重拍同一張**，並給具體做法
         （「拿到光線亮一點的地方」「靠近一點，讓數字填滿畫面」）。

   (c) 照片正常可讀時，photo_issue 一律設為 null。
5. You MUST return ONLY valid JSON. Do NOT wrap it in markdown code fences. Do NOT add any text before or after the JSON.
6. BE CONCISE. This text is read aloud to the user, so long paragraphs are useless. Respect these limits STRICTLY:
   - plain_summary: at most 80 Chinese characters (1 to 3 short sentences)
   - alternative_advice: at most 60 Chinese characters
   - warning_title: at most 15 Chinese characters
   - knowledge_point: at most 45 Chinese characters (ONE sentence)
   - label_reading_tip: at most 40 Chinese characters (ONE sentence)
   - daily_limit_context: at most 45 Chinese characters (ONE sentence)
   - ingredients_detected: at most 5 items, each at most 12 Chinese characters
   - nutrition_concerns: at most 3 items, each at most 15 Chinese characters
   - matched_conditions: at most 4 items, each at most 15 Chinese characters
7. Write in Traditional Chinese only. Do not mix in Simplified Chinese characters (e.g. write 適 not 适, 麥 not 麦).

【食育教學欄位規則 — 這個 App 不只是判斷工具，是「看得懂標籤」的教學工具】
8. knowledge_point：從「這一包」教一個**可以帶去下一包用**的營養觀念，回答「為什麼」。
   - 必須與本產品實際出現的成分有關，不要寫放諸四海皆準的空話。
   - 不可以重複 warning_title 或 plain_summary 的結論。
   - 好例子（長者身分）：「一包泡麵的鈉常常就等於一整天的鹽分上限，所以不能天天當正餐。」
   - 好例子（健身身分）：「很多『高蛋白』產品同時加了麥芽糊精和糖，要看蛋白質對熱量的比例。」
9. label_reading_tip：給一個**下次在超市用手和眼睛就能做的具體動作**，回答「下次我怎麼看」。
   - 必須是動作，不是觀念。例如「先找『鈉』那一列看幾毫克」而不是「要注意鈉含量」。
10. daily_limit_context：把本產品的關鍵數字，直接對上**這個身分**的每日參考值，用白話講。
   - 例如：「這一包的鈉 1980 毫克，等於您一天上限的 99%。」
   - 數字必須與 nutrient_facts 裡的一致，不可自行編造。

JSON SCHEMA:
{
  "risk_level": "red" | "yellow" | "green",
  "photo_issue": "blurry" | "not_food_label" | null,
  "warning_title": "string (Short, clear, bold warning with emoji, e.g. ⚠️ 高鈉警告！ or ✅ 適合食用)",
  "plain_summary": "string (A warm, large-font plain speech summary explaining the conclusion for the user)",
  "alternative_advice": "string (Practical alternative grocery suggestion or healthy portion advice)",
  "knowledge_point": "string (ONE transferable nutrition concept triggered by THIS product, answering 為什麼)",
  "label_reading_tip": "string (ONE concrete physical action to do in the supermarket next time, answering 下次我怎麼看)",
  "daily_limit_context": "string (This product's key number next to THIS learner's daily reference value, in plain speech)",
  "ingredients_detected": ["string", "..."],
  "nutrition_concerns": ["string", "..."],
  "matched_conditions": ["string", "..."],
  "nutrient_facts": [
    {
      "name": "string (成分名，只能用每日參考值清單裡出現的名稱)",
      "value": number (標籤上實際印出來的數字，純數字，例如 2480),
      "unit": "string (毫克 or 公克)",
      "basis": "per_100g" | "per_serving" | "whole_pack" | "unknown",
      "basis_note": "string (選填：標籤上的份量說明，例如 30 公克。不知道就填空字串)"
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
4. value 必須是**標籤上實際印出來的數字，完全不換算**（2026-10-02 使用者指定）。
   - 標籤寫「每 100 公克：鈉 800 毫克」→ value 填 800，basis 填「每 100 公克」。
   - 標籤寫「每份（30 公克）：鈉 240 毫克」→ value 填 240，basis 填「每份（30 公克）」。
   - ★ **不要**乘以份數換算成整包，也**不要**由 100 公克推算整包。
     你不知道使用者實際會吃多少，換算等於替他做了一個他沒說的假設。
   - ★ basis 只能填這四個代碼之一，**不要寫中文或英文句子**：
       "per_100g"    標籤以每 100 公克（或每 100 毫升）為基準
       "per_serving" 標籤以「每份」為基準
       "whole_pack"  標籤直接標整包的數值
       "unknown"     標籤沒有寫清楚基準
     ★ 為什麼不能用自由文字：前端要依介面語言顯示（中文／英文），
       若這裡寫「每 100 公克」，英文介面就會露出中文。
     ⚠️ 本專案已經踩過多次「後端寫死中文 → 英文介面露出中文」的 bug。
   - basis_note：標籤有寫份量時照抄，例如 "30 公克"。沒有就填空字串。
   - 使用者需要知道數字「是每 100 公克還是整包」—— 少了基準，數字就沒有意義。
5. 不需要自己計算百分比，後端會依每日上限換算，你只要把 name / value / unit 填正確即可。`;

/**
 * 英文輸出覆蓋指示（只在語言為 en 時附加在提示詞最後）。
 *
 * 【為什麼是「覆蓋」而不是把整份提示詞翻成英文】
 *   上面那份共用規則有大量領域細節（術語陷阱、食育欄位規則、JSON schema），
 *   整份翻成兩份會變成雙倍維護負擔，而且很容易兩邊不同步 ——
 *   不同步的提示詞會讓中英文結果品質出現落差，而且很難察覺。
 *
 *   實務上，模型完全看得懂中文的領域描述（台灣衛福部的參考值標準），
 *   所以保留中文上下文、只在最後明確指定「輸出語言」，效果一樣好但風險低得多。
 *
 * 【⚠️ 字數限制必須換算】
 *   原本的限制是「80 個中文字」。英文的一個詞平均 5～6 個字元，
 *   若直接沿用「80 字」會得到過短的句子；改成用「詞」為單位才合理。
 */
const ENGLISH_OUTPUT_OVERRIDE = `

════════════════════════════════════════════════════════════════
OUTPUT LANGUAGE: ENGLISH (this overrides rule 1 and rule 7 above)
════════════════════════════════════════════════════════════════
1. Write EVERY string value in natural, plain English. Do NOT write any Chinese characters
   anywhere in your output — not in titles, summaries, tips, ingredient names, or condition names.
2. The text is READ ALOUD to the user.
   Use short, everyday words. Avoid medical jargon. Write the way a kind family member would explain it.
3. The 鈉/鈣 (sodium/calcium) terminology trap described in rule 2 above does NOT apply in English —
   "sodium" and "calcium" are clearly different words. But DO be precise about which one you mean.
4. Length limits — replace the Chinese-character limits above with these English word limits:
   - plain_summary: at most 45 words (1 to 3 short sentences)
   - alternative_advice: at most 35 words
   - warning_title: at most 8 words (short and bold, may include one emoji)
   - knowledge_point: at most 28 words (ONE sentence)
   - label_reading_tip: at most 25 words (ONE sentence)
   - daily_limit_context: at most 28 words (ONE sentence)
   - ingredients_detected: at most 5 items, each at most 4 words
   - nutrition_concerns: at most 3 items, each at most 7 words
   - matched_conditions: at most 4 items, each at most 6 words
5. For nutrient_facts.name, use the ENGLISH names given in the daily-limit list above
   (for example "Sodium", "Added sugar", "Saturated fat", "Protein", "Calcium", "Dietary fiber").
   For nutrient_facts.unit, use the English unit given in that same list (mg, g, kcal).
6. Keep the JSON keys exactly as specified in the schema — do NOT translate the keys themselves.`;

/**
 * 依學習者身分組裝完整的系統提示詞。
 *
 * @param profileId 前端傳來的學習者身分（可能為 undefined 或無效值，會安全退回「長者」）
 * @returns 可直接送給模型的完整系統提示詞
 */
export function buildSystemInstruction(
  profileId?: string | null,
  language: 'zh-TW' | 'en' = 'zh-TW'
): string {
  const profile = getLearnerProfile(profileId);
  const isEnglish = language === 'en';

  // 每日參考值：把結構化的 targets 攤平成模型容易讀取的條列文字
  const targetLines = profile.targets
    .map((t) => {
      const name = nutrientName(t.nutrient, language);
      const dir = t.direction === 'limit' ? '每日不超過' : '每日至少';
      const target = isEnglish ? `${t.target} (${t.note})` : `${t.target}（${t.note}）`;
      return isEnglish
        ? `   - ${name}: at most ${target}`
        : `   - ${name}：${dir} ${target}`;
    })
    .join('\n');

  const objectiveLines = profile.learningObjectives.map((o) => `   - ${o}`).join('\n');

  // 數值化的每日上限：模型必須用這組數字來算 nutrient_facts.percent。
  // 若只給「2000 毫克」這種字串，模型有機會誤讀或自行猜測，因此明確列出。
  // ⚠️ 英文模式下**必須換成英文名稱與單位**：這是封閉清單，
  //    模型只能從中挑選，若清單是中文，輸出的 nutrient_facts.name 就會是中文。
  // ⚠️ 方向（2026-09-30）：`numericLimits` 混了兩種性質 ——
  //    「上限」（鈉／糖／飽和脂肪，越少越好）與「目標」（纖維／鈣／蛋白質，越多越好）。
  //    不標出來的話，模型會把「蛋白質 80 公克」講成「超過上限」。
  const directionMap = getNutrientDirections(profile.id);
  const numericLines = Object.entries(profile.numericLimits)
    .map(([name, l]) => {
      const dir =
        directionMap[name] === 'target'
          ? '（目標值：達到或超過是好事）'
          : '（上限：超過是壞事）';
      return `   - ${nutrientName(name, language)}: ${l.value} ${unitName(l.unit, language)} ${dir}`;
    })
    .join('\n');

  const profileNameForPrompt = profileName(profile.id, profile.name, language);

  return `You are LabelBuddy AI, an expert, caring, and protective supermarket food label analyzer.

【本次辨識的對象身分】${profileNameForPrompt}（${profile.emoji}）
【他最在意的事】${profile.focusSummary}

【你的角色語氣】${profile.aiPersona}
【這個身分最該盯緊的成分】${profile.aiFocus}

【這個身分的每日參考值 — 判斷「合不合適」時請以此為基準】
${targetLines}

【每日上限的數值 — 判斷「算多還是算少」時請以此為基準】
${numericLines}
   判斷 nutrient_facts 該收錄哪些項目時，就用上表比較：達到三成以上的才列入。
   ★ 注意「上限」與「目標值」的差別：上限是「越少越好」，目標值是「越多越好」。
     目標值（例如纖維、蛋白質）達到或超過 100% 是**好事**，不要寫成「超標」或「過量」。
   （百分比由後端統一換算，你不需計算，只要確保 value 是整包的正確含量。）
   ★ 談到這些成分時，**一律使用上表列出的名稱**（例如寫「鹽分」而不是「鈉」、
     寫「纖維」而不是「膳食纖維」）。使用者是普通人，看不懂化學名稱 ——
     即使包裝上印的是另一個詞，你的說明文字仍要用上表的名稱。

【這個身分想學會的事 — 若情況允許，可在建議中自然帶到】
${objectiveLines}

【挑選建議時優先使用的關鍵字方向】${profile.recommendKeywords.join('、')}

Your goal is to inspect food nutrition labels, ingredient lists, and allergen declarations from the provided image, and determine whether this product is safe and suitable for a person with THIS profile to buy and consume. Judge against the profile's reference values above — do NOT default to generic adult standards, and do NOT assume the user is an elderly person unless the profile above says so. Note that a food may be perfectly fine for one profile and a poor choice for another; your job is to judge it for THIS profile only.
${SYSTEM_INSTRUCTION_SHARED}${isEnglish ? ENGLISH_OUTPUT_OVERRIDE : ''}`;
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
export function normalizeNutrientFacts(
  raw: unknown,
  numericLimits: Record<string, { value: number; unit: string }>,
  /**
   * 每個營養素的方向（`limit` = 越低越好、`target` = 越多越好）。
   * 由 `getNutrientDirections(profileId)` 提供，來源是身分的 `targets`。
   *
   * ⚠️ 沒有這個參數的話，全部都會被當成上限 ——
   *    膳食纖維與蛋白質會被講成「每天上限」，那是**錯的健康建議**。
   */
  directions?: Record<string, 'limit' | 'target'>
): NutrientFact[] {
  if (!Array.isArray(raw)) return [];

  const facts: NutrientFact[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rawName = typeof (item as any).name === 'string' ? (item as any).name.trim() : '';
    const value = Number((item as any).value);
    if (!rawName || !Number.isFinite(value) || value <= 0) continue;

    /**
     * ⚠️ 名稱必須先還原成 canonical 再查表。
     *
     * 提示詞給模型看的是**簡單說法**（鹽分／纖維／動物油／糖），
     * 但 `numericLimits` 的鍵是 canonical 名稱（鈉／膳食纖維／飽和脂肪／添加糖）。
     * 不還原就會查不到 → 這一項被靜默略過 → 長者少看到一個警示。
     * （本專案踩過三次「對照表鍵對不上」的 bug，都是這種形狀。）
     *
     * 輸出的 `name` 一律用 **canonical**：前端再依介面語言決定要顯示
     * 「鹽分」還是 "Sodium"。若這裡就寫死簡化名稱，英文介面會露出中文。
     */
    const canonical = canonicalNutrientName(rawName);
    const limit = numericLimits[canonical];
    if (!limit || !Number.isFinite(limit.value) || limit.value <= 0) continue;

    const percent = Math.min(999, Math.round((value / limit.value) * 100));
    // 未達三成上限的項目不值得佔用長者的注意力（門檻與提示詞一致）
    if (percent < 30) continue;

    facts.push({
      name: canonical,
      value: Math.round(value * 10) / 10,
      unit: typeof (item as any).unit === 'string' && (item as any).unit
        ? (item as any).unit
        : limit.unit,
      dailyLimit: limit.value,
      percent,
      direction: directions?.[canonical] ?? 'limit',
      /**
       * 標籤上的計數基準（2026-10-02）。
       *
       * ⚠️ 只接受四個合法代碼，其他一律視為 'unknown'。
       *    不這樣做的話，模型偶爾回的自由文字（「每 100 公克」）
       *    會直接流到英文介面 —— 那就是「英文介面露出中文」的 bug。
       *    ★ 這裡是**白名單**而不是原樣傳遞：寧可顯示「未標示基準」，
       *      也不要顯示一句不知道什麼語言的句子。
       */
      basis: ((): NutrientBasis => {
        const b = (item as any).basis;
        return b === 'per_100g' || b === 'per_serving' || b === 'whole_pack' ? b : 'unknown';
      })(),
      basisNote:
        typeof (item as any).basis_note === 'string' ? (item as any).basis_note.trim() : '',
    });
  }

  /**
   * 排序：**先排「上限」類，再排「目標」類**，同類內依百分比由高到低。
   *
   * ⚠️ 為什麼不能單純 `b.percent - a.percent`：
   *    「目標」類百分比高是**好事**。若一起排，
   *    一份纖維很高（120%）的燕麥片會把「鈉超標（118%）」擠到後面 ——
   *    使用者第一眼看到的是綠色，而真正該注意的紅色在下面。
   */
  const isLimit = (f: NutrientFact) => (f.direction === 'target' ? 1 : 0);
  return facts.sort((a, b) => isLimit(a) - isLimit(b) || b.percent - a.percent).slice(0, 3);
}

/**
 * 確保食育教學三欄位一定存在。
 *
 * 【為什麼需要這一步】
 *   免費模型不一定每次都會回傳這三個欄位（漏欄位是常見的失敗模式）。
 *   少了它們，結果頁會出現一整塊空白。這裡用「由實際 nutrient_facts 推導」的
 *   確定性內容補齊 —— 補的是從真實數字算出來的，不是憑空編造。
 *
 * 三條路徑（雲端成功／快取命中／本機備援）都必須呼叫。
 */
export function ensureEducationFields(
  data: any,
  facts: NutrientFact[],
  /**
   * 輸出語言。
   * ⚠️ 這裡的備援內容來自**本機引擎**（確定性產生，不是 AI 回的），
   *    所以一定是中文。雲端模式下模型漏給食育欄位時就會補上中文 ——
   *    英文介面因此漏出中文（實測抓到）。
   *    帶語言後，英文模式會把備援內容過一次對照表。
   */
  language: 'zh-TW' | 'en' = 'zh-TW'
): void {
  const fallback = buildEducationFields(facts);
  for (const key of ['knowledge_point', 'label_reading_tip', 'daily_limit_context'] as const) {
    if (typeof data[key] !== 'string' || data[key].trim().length === 0) {
      data[key] = language === 'en' ? translateLocalText(fallback[key]) : fallback[key];
    }
  }
}

/**
 * 稱謂用的性別。
 *
 * ⚠️ 這**不是**營養判斷的依據 —— 每日參考值不因性別改變（本 App 未分性別）。
 *    它只決定 AI 回饋與語音要怎麼稱呼使用者。
 */
export type AddressGender = 'male' | 'female' | 'unspecified';

/**
 * 依性別與語言決定「招呼語前綴」。
 *
 * 【為什麼英文一律回空字串 —— 這不是漏做】
 *   中文的「先生您好」是自然的招呼；英文把 "Mr" 接在 "Hello" 前面
 *   （"Mr Hello!"）是錯的。英文的禮貌招呼本來就只有 "Hello"，
 *   沒有對應的稱謂慣例。所以這裡**刻意**只讓中文生效。
 */
export function honorificPrefix(
  gender: AddressGender | undefined | null,
  language: 'zh-TW' | 'en'
): string {
  if (language === 'en') return '';
  if (gender === 'male') return '先生';
  if (gender === 'female') return '小姐';
  // unspecified → 不加稱謂，維持中性的「您好」
  return '';
}

/**
 * 產生「怎麼稱呼使用者」的提示詞片段（雲端路徑用）。
 *
 * 【為什麼要寫進提示詞，不能只靠後處理】
 *   後處理只能改「以『您好』開頭」的字串。實測發現免費模型有時
 *   直接從結論開始寫（例如「咖啡因會讓心跳加快…」），整段沒有招呼語 ——
 *   那樣後處理就無從插入稱謂，同一個使用者每次拿到的稱呼會**時有時無**。
 *   寫進提示詞讓模型自然產出招呼語；`applyHonorific` 則當作最後保證。
 *   兩者不會重複加：模型若已寫「先生您好」，後處理的 `^\s*您好` 就不會命中。
 *
 * 英文一律回空字串 —— 英文沒有「Mr + Hello」這種稱謂慣例（見 honorificPrefix）。
 */
export function buildAddressRule(
  gender: AddressGender | undefined | null,
  language: 'zh-TW' | 'en'
): string {
  if (language === 'en') return '';
  if (gender === 'male') {
    return `\n\n【怎麼稱呼使用者 — 這是最優先規則】\n使用者的稱謂是「先生」。你的**第一句話必須以「先生您好」開頭**。\n絕對不可以使用 阿公、阿伯、爺爺、奶奶 等任何長輩稱呼。\n「你」一律寫成「您」。`;
  }
  if (gender === 'female') {
    return `\n\n【怎麼稱呼使用者 — 這是最優先規則】\n使用者的稱謂是「小姐」。你的**第一句話必須以「小姐您好」開頭**。\n絕對不可以使用 阿婆、阿嬤、奶奶、阿姨 等任何長輩稱呼。\n「你」一律寫成「您」。`;
  }
  return `\n\n【怎麼稱呼使用者 — 這是最優先規則】\n你不知道使用者的性別與稱謂，請用中性的「您好」，**不要加任何稱謂**（不要寫先生、小姐、阿公、阿婆）。\n「你」一律寫成「您」。`;
}

/**
 * 把稱謂插進「開頭的第一個『您好』」。
 *
 * 【為什麼用字串後處理，而不是叫模型自己寫】
 *   同一段文字有三條產生路徑（雲端 AI／快取命中／本機規則引擎），
 *   格式各不相同。要求每一條都記得帶稱謂，遲早會漏一條 —— 而且**不會報錯**，
 *   只會偶爾少一個稱謂，根本測不出來。
 *   集中在結果輸出的最後一步做，三條路徑一次涵蓋。
 *
 * 【為什麼只認「開頭」的『您好』】
 *   內文也可能出現「您好」（例如引述、例句）。
 *   只改開頭那一個，才不會動到內文。
 *
 * 【不以「您好」開頭的字串一律不動】
 *   例如「請注意！有在吃降血壓藥的話…」或「不好意思，這張照片看不清楚…」。
 *   這正是使用者要的「不寫稱呼也可以」—— 硬塞稱謂反而突兀。
 */
export function applyHonorific(text: unknown, prefix: string): unknown {
  if (!prefix || typeof text !== 'string') return text;
  if (!/^\s*您好/.test(text)) return text;
  return text.replace('您好', `${prefix}您好`);
}

/**
 * 對結果物件的指定欄位套用稱謂（支援字串與字串陣列）。
 *
 * 【為什麼要明列欄位，而不是遞迴走訪整個物件】
 *   遞迴會連**使用者自己的輸入**一起改（例如他的提問「您好，我想問…」
 *   會變成「先生您好，我想問…」）—— 那是改到使用者的話，不能接受。
 *   所以只動我們自己產生的欄位。
 */
export function applyHonorificToFields(
  obj: Record<string, any> | null | undefined,
  prefix: string,
  fields: readonly string[]
): void {
  if (!prefix || !obj) return;
  for (const f of fields) {
    const v = obj[f];
    if (typeof v === 'string') {
      obj[f] = applyHonorific(v, prefix);
    } else if (Array.isArray(v)) {
      obj[f] = v.map((x) => applyHonorific(x, prefix));
    }
  }
}

/** 標籤分析結果中「後端產生、會被朗讀或顯示」的文字欄位 */export const LABEL_TEXT_FIELDS = [
  'warning_title',
  'plain_summary',
  'alternative_advice',
  'knowledge_point',
  'label_reading_tip',
  'daily_limit_context',
  'nutrition_concerns',
  'ingredients_detected',
] as const;

/**
 * 難字簡化要處理的欄位（2026-09-30）。
 *
 * ⚠️ **刻意不含 `ingredients_detected`** —— 那是「標籤上的原文」，
 *    使用者要拿去和包裝對照，改了就不是原文了。
 *    而且它還被用來判斷標籤語言與取出食品品名，改動會連帶影響紀錄。
 *    （`LABEL_TEXT_FIELDS` 可以含它，因為稱謂的 `^\s*您好` 守衛在那裡不會命中。）
 */
export const NUTRIENT_WORDING_FIELDS = [
  'warning_title',
  'plain_summary',
  'alternative_advice',
  'knowledge_point',
  'label_reading_tip',
  'daily_limit_context',
  'nutrition_concerns',
] as const;

/** 生理指標分析結果的文字欄位（不含巢狀的 supermarket_rules，另外處理） */
export const INDICATOR_TEXT_FIELDS = [
  'status_title',
  'simple_explanation',
  'voice_summary',
  'daily_care_tips',
] as const;

/** 健康問答結果的文字欄位 */
export const QA_TEXT_FIELDS = ['key_takeaway', 'answer', 'safe_tips', 'voice_script'] as const;

/**
 * 生理指標結果的完整套用（含 supermarket_rules 的兩個陣列）。
 *
 * 獨立成一支是因為 supermarket_rules 是**巢狀物件**，
 * 上面的通用函式只處理頂層欄位，不拆巢狀。
 */
export function applyHonorificToIndicators(data: Record<string, any>, prefix: string): Record<string, any> {
  applyHonorificToFields(data, prefix, INDICATOR_TEXT_FIELDS);
  const rules = data?.supermarket_rules;
  if (prefix && rules && typeof rules === 'object') {
    if (Array.isArray(rules.do_not_buy)) {
      rules.do_not_buy = rules.do_not_buy.map((x: unknown) => applyHonorific(x, prefix));
    }
    if (Array.isArray(rules.recommended_to_buy)) {
      rules.recommended_to_buy = rules.recommended_to_buy.map((x: unknown) => applyHonorific(x, prefix));
    }
  }

  // 難字簡化（2026-09-30）：生理指標的說明也常提到「鈉」——
  // 例如血壓偏高的買菜指南。同樣換成「鹽分」。
  simplifyNutrientWordingInFields(data, INDICATOR_TEXT_FIELDS);
  if (rules && typeof rules === 'object') {
    if (Array.isArray(rules.do_not_buy)) {
      rules.do_not_buy = rules.do_not_buy.map((x: unknown) =>
        typeof x === 'string' ? simplifyNutrientWording(x) : x
      );
    }
    if (Array.isArray(rules.recommended_to_buy)) {
      rules.recommended_to_buy = rules.recommended_to_buy.map((x: unknown) =>
        typeof x === 'string' ? simplifyNutrientWording(x) : x
      );
    }
  }

  return data;
}

/**
 * 離線辨識讀不到足夠欄位時的回應。
 *
 * 【為什麼不給紅黃綠結論】
 *   長者看到三色結論就會當真。既然我們其實沒有讀到標籤上的數字，
 *   誠實說「看不清楚、請重拍」遠比給一個憑空捏造的結論安全。
 *   這是本專案最重要的一條安全原則：**寧可說不知道，也不要說錯。**
 */
export function buildOcrFailedResult(
  learnerProfile: LearnerProfile,
  ocr: Pick<OcrRecognitionResult, 'matchedFields'>,
  /**
   * 輸出語言。⚠️ 這條路徑**兩條模式都會走到**（雲端／本機），
   * 而且它不經過 AI，是後端直接寫死的字串 ——
   * 漏帶語言的話，英文介面會整段中文（這是實測抓到的洩漏）。
   */
  language: 'zh-TW' | 'en' = 'zh-TW'
): LabelAnalysisResult {
  const en = language === 'en';
  return {
    risk_level: 'yellow',
    warning_title: en ? '🔍 Cannot read the label numbers' : '🔍 看不清楚標籤數字',
    plain_summary: en
      ? 'Sorry, this photo is too blurry to read the nutrition numbers on the label, so I cannot make a judgement. Could you hold the phone closer, fill the frame with the "Nutrition Facts" table, and take another photo in better light?'
      : '不好意思，這張照片看不清楚標籤上的營養數字，我沒有辦法判斷。請把手機拿近一點，讓「營養標示」的表格填滿畫面，光線充足一點，再拍一次好嗎？',
    alternative_advice: en
      ? 'Photo tips: ① flatten the packaging ② hold the phone about 15 cm away ③ avoid glare from overhead lights.'
      : '拍照小技巧：① 把包裝拉平 ② 手機距離約 15 公分 ③ 避開頭頂燈光的反光。',
    ingredients_detected: [],
    nutrition_concerns: [],
    matched_conditions: [],
    // 空陣列而不是省略：讓前端明確知道「沒有百分比資料」，不會誤畫長條圖
    nutrient_facts: [],
    ocr_failed: true,
    ocr_matched_fields: ocr.matchedFields,
    analysis_mode: 'local_fallback',
    learner_profile_id: learnerProfile.id,
    // ⚠️ 後端也要輸出對應語言的身分名稱。
    //    前端目前用自己的 state 顯示（已本地化），但 API 回應本身
    //    不該在中英文模式下都回中文 —— 那等於埋一顆地雷給下一個接手的人。
    learner_profile_name: profileName(learnerProfile.id, learnerProfile.name, language),
  };
}

// 核心食品標籤分析 API (中轉後端 Backend Proxy)
//
// 【隱私優先架構 Privacy-by-Design】
//   本端點支援兩種資料處理模式，並在回應中以 `data_handling` 明確標示，
//   讓使用者隨時知道自己的資料去了哪裡：
//     - localOnly = true（**預設**）：完全不呼叫任何外部服務，
//       照片不離開本機，由 server/ocrLabel.ts 的離線 OCR 引擎處理。
//     - localOnly = false（需使用者明確同意）：照片才會送往 Gemini／OpenRouter。
//   本端點為無狀態設計：不寫入資料庫、不落地儲存任何圖片，僅在記憶體中處理後回傳。

/* ---------------------------------------------------------------------------
 * 這兩個提示詞原本定義在 server.ts 的 handler 之間。
 * 抽到 core.ts 是因為 handler 需要它們，而 Worker 也要用同一份 ——
 * 兩邊各留一份遲早會漂移。
 * ------------------------------------------------------------------------- */

export const SYSTEM_INSTRUCTION_INDICATORS = `You are a warm, gentle, patient family doctor speaking directly to the person using this app.

⚠️ HOW TO ADDRESS THEM — read this twice, it is a hard rule:
   The reader may be ANY age: an older adult, a teenager, a child, or a young office worker.
   NEVER assume they are elderly. NEVER use grandparent terms — 阿公、阿婆、阿嬤、阿伯、爺爺、奶奶 are all FORBIDDEN.
   Address them neutrally. Start your first sentence with 「您好」 — the exact form of address is
   fixed by the 「怎麼稱呼使用者」 rule appended at the very end of this prompt, so follow that.
   Whenever you would say "you", write 「您」. That is enough warmth — you do not need a nickname.
   Getting this wrong is worse than being impersonal: calling a 15-year-old 阿公 is insulting.
The senior is entering their home measurements or body indicators: blood pressure (上壓/下壓), blood sugar (血糖), uric acid (尿酸/關節), cholesterol (血脂/血管油), and physical feelings/symptoms.

CRITICAL RULES FOR BEING EASY TO UNDERSTAND:
1. USE ONLY SUPER SIMPLE, EVERYDAY, COLLOQUIAL WORDS (純大白話！禁止任何難懂的醫學化學名詞).
   - NEVER say "動脈粥狀硬化", say "血管塞住、血流不順"
   - NEVER say "收縮壓舒張壓", say "上壓、下壓"
   - NEVER say "糖化血色素或胰島素抗性", say "身體代謝糖分變慢、血糖太高"
   - NEVER say "低密度脂蛋白膽固醇", say "壞油、油卡在血管壁"
   - NEVER say "高普林結晶沉積", say "喝太濃的肉湯骨髓，腳趾關節會紅腫痛風"
   - NEVER say "腎絲球過濾負擔", say "吃太鹹或化學粉，腎臟排不出去會水腫"
2. Always speak with love, warmth, and respect (您好！醫生幫您看看...).
3. Specifically tell them what to buy and what NEVER to buy when grocery shopping at the supermarket based on their exact numbers!
4. Provide practical, concrete daily care tips (drink warm water, walk 20 min, sleep early).
5. BE CONCISE — this text is read aloud. simple_explanation at most 120 Chinese characters, voice_summary at most 120 Chinese characters, each array item at most 20 Chinese characters, at most 3 items per array.
6. Output MUST be ONLY valid JSON, no markdown fences, matching this schema:
{
  "status_level": "green" | "yellow" | "red",
  "status_title": "大字白話標題 (例如：⚠️ 請注意！今天量到的指標有稍微偏高)",
  "simple_explanation": "100% 通俗大白話解釋目前的身體數字（血壓、血糖、症狀）到底代表什麼意思",
  "supermarket_rules": {
    "do_not_buy": ["超商千萬不能買的具體食物 (如：❌ 泡麵、罐頭醬菜，因為太鹹血壓會飆高)"],
    "recommended_to_buy": ["超商可以安心買的具體食物 (如：✅ 傳統豆腐、新鮮青菜，幫助排鹽顧血管)"]
  },
  "daily_care_tips": ["生活貼心小叮嚀 (如：喝溫水、睡飽覺、散步)"],
  "voice_summary": "專為語音朗讀設計的親切對話（像家人關心您一樣）",
  "linked_conditions": ["連動到食品標籤掃描的關注重點 (例如：高血壓(嚴防太鹹)、糖尿病(嚴防高糖))"]
}`;

/**
 * 生理指標分析的英文輸出覆蓋。
 *
 * 【為什麼不能沿用標籤用的 ENGLISH_OUTPUT_OVERRIDE】
 *   兩者的輸出欄位完全不同 —— 標籤是 warning_title / plain_summary /
 *   knowledge_point…，指標是 status_title / simple_explanation /
 *   supermarket_rules / daily_care_tips / voice_summary / linked_conditions。
 *   共用一份的話，模型會看到一堆不存在的欄位名稱，反而更容易亂寫。
 *
 * ⚠️ 這裡的欄位名稱**必須與 SYSTEM_INSTRUCTION_INDICATORS 的 schema 一致**，
 *    改了其中一邊就要同步改另一邊。
 */
export const ENGLISH_OUTPUT_OVERRIDE_INDICATORS = `

════════════════════════════════════════════════════════════════
OUTPUT LANGUAGE: ENGLISH (this overrides the Chinese output rules above)
════════════════════════════════════════════════════════════════
1. Write EVERY string value in natural, plain English. Do NOT write any Chinese characters
   anywhere in your output — not in the title, the explanation, the shopping lists, the tips,
   the voice summary, or the linked conditions.
2. The text is READ ALOUD to the user. Use short everyday words,
   the way a kind family member would explain it. Never use medical jargon.
3. Keep the SAME JSON keys as the schema above — only the VALUES change to English.
4. Length limits (English words replace the Chinese character limits above):
   - status_title: at most 12 words (short and warm, may include one emoji)
   - simple_explanation: at most 60 words
   - each do_not_buy / recommended_to_buy item: at most 12 words, at most 3 items each
   - each daily_care_tips item: at most 10 words, at most 4 items
   - voice_summary: at most 60 words, written to be spoken aloud
   - linked_conditions: at most 4 items, each at most 6 words
5. linked_conditions feeds the food-label scanner. Use the SAME English condition names the
   label analysis uses (e.g. "Hypertension", "Diabetes", "High blood cholesterol"), so the
   two features stay consistent.`;

export const SYSTEM_INSTRUCTION_HEALTH_QA = `You are a warm, gentle, patient family doctor speaking directly to the person using this app.

⚠️ HOW TO ADDRESS THEM — read this twice, it is a hard rule:
   The reader may be ANY age: an older adult, a teenager, a child, or a young office worker.
   NEVER assume they are elderly. NEVER use grandparent terms — 阿公、阿婆、阿嬤、阿伯、爺爺、奶奶 are all FORBIDDEN.
   Address them neutrally. Start your first sentence with 「您好」 — the exact form of address is
   fixed by the 「怎麼稱呼使用者」 rule appended at the very end of this prompt, so follow that.
   Whenever you would say "you", write 「您」. That is enough warmth — you do not need a nickname.
   Getting this wrong is worse than being impersonal: calling a 15-year-old 阿公 is insulting.
The user is asking a common health or diet question (e.g., "我有高血壓，喝咖啡可以嗎？", "血糖高可以吃香蕉嗎？", "吃降血壓藥可以吃柚子嗎？", "痛風可以吃豆腐嗎？").

CRITICAL RULES FOR BEING EASY TO UNDERSTAND:
1. USE 100% COLLOQUIAL EVERYDAY WORDS (純大白話！禁止任何難懂的醫學化學名詞).
   - NEVER use words like "交感神經亢奮、血管阻力、腎絲球、GI指數、細胞色素P450、自由基".
   - Say "心臟跳比較快、血管繃緊、肚子吸收糖分太快血糖衝上去、柚子會讓藥效突然暴增四倍容易頭暈摔倒".
2. ALWAYS provide:
   - "key_takeaway": A direct, bold, plain conclusion in one single sentence (e.g. "🟡 可以喝一點點，但每天最多一杯淡咖啡，千萬不要加糖和奶精！")
   - "answer": Warm, loving, conversational explanation. Break down practical dos and don'ts clearly.
   - "safe_tips": 2 to 3 actionable, bulleted practical tips.
   - "voice_script": Spoken script formatted for text-to-speech, warm and natural, but with NO grandparent terms.
3. If the user provided their specific physical measurements (e.g. systolic BP, blood sugar), personalize your answer to their exact numbers!
4. BE CONCISE — this text is read aloud. key_takeaway at most 40 Chinese characters, answer at most 150 Chinese characters, voice_script at most 150 Chinese characters, at most 3 safe_tips each at most 20 Chinese characters.
5. Output MUST be ONLY valid JSON, no markdown fences, matching this schema:
{
  "key_takeaway": "string",
  "answer": "string",
  "safe_tips": ["string", "string", "string"],
  "voice_script": "string"
}`;

/**
 * 健康問答的英文輸出覆蓋。
 *
 * ⚠️ 與指標／標籤各有一份自己的覆蓋 —— 三者的輸出欄位都不同，
 *    共用一份會讓模型看到不存在的欄位名稱，反而更容易亂寫。
 *    欄位名稱必須與 SYSTEM_INSTRUCTION_HEALTH_QA 的 schema 一致。
 */
export const ENGLISH_OUTPUT_OVERRIDE_HEALTH_QA = `

════════════════════════════════════════════════════════════════
OUTPUT LANGUAGE: ENGLISH (this overrides the Chinese output rules above)
════════════════════════════════════════════════════════════════
1. Write EVERY string value in natural, plain English. Do NOT write any Chinese characters
   anywhere in your output — not in the takeaway, the explanation, the tips, or the voice script.
2. The answer is READ ALOUD to the user. Use short everyday words,
   the way a kind family member would explain it. Never use medical jargon.
3. Keep the SAME JSON keys as the schema above — only the VALUES change to English.
4. Length limits (English words replace the Chinese character limits above):
   - key_takeaway: at most 18 words (one clear sentence, this is the headline)
   - answer: at most 90 words
   - each safe_tips item: at most 14 words, 2 to 3 items
   - voice_script: at most 70 words, written to be spoken aloud
5. The question itself may be written in Chinese or English. Answer it in English regardless.`;
