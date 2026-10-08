/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 分析模式同意閘門回歸測試（Analysis mode / consent gate check）
 * ============================================================================
 *
 * 【為什麼一定要有這支】
 *   2026-09-30 發現：`/api/analyze-indicators` 與 `/api/ask-health-question`
 *   **無條件呼叫雲端** —— 使用者選了「只在本機」，血壓、心跳、血糖、
 *   自覺症狀、以及他打的健康問題照樣會被送到 OpenRouter。
 *   引導頁與私隱條款卻寫著「不會上傳」。
 *
 *   這是最糟的一種 bug：**不會報錯、不會當機，只是偷偷違背承諾**。
 *   而且它不是前端忘記帶旗標就會出現，是後端根本沒有檢查。
 *
 * 【這一支怎麼驗】
 *   直接啟動真的伺服器，用 `localOnly: true` 打**四個**端點
 *   （analyze-indicators／ask-health-question／analyze-label／fitness-report），
 *   斷言回應裡的 `analysis_mode` / `source` 必須是**本機**的標記。
 *   本機路徑完全離線，所以這支測試**不消耗任何 API 額度**
 *   （fitness-report 那項另外用「耗時」證明它沒去碰雲端，理由見該段註解）。
 *
 * 用法：npx tsx scripts/check-analysis-mode.ts
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name} ${extra}`);
  }
}

const PORT = 3219;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function post(pathname: string, body: unknown): Promise<any> {
  const res = await fetch(`${BASE}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

/** 同 `post`，但一併回傳耗時（毫秒）。用來判斷「有沒有真的去碰雲端」（見健身週報那段）。 */
async function postTimed(pathname: string, body: unknown): Promise<{ json: any; ms: number }> {
  const t0 = Date.now();
  const json = await post(pathname, body);
  return { json, ms: Date.now() - t0 };
}

const INDICATORS = {
  systolicBp: 158,
  diastolicBp: 96,
  heartRate: 78,
  bloodSugar: 8.4,
  bloodSugarUnit: 'mmol/L',
  bloodSugarTiming: 'fasting',
  uricAcidStatus: 'normal',
  cholesterolStatus: 'normal',
  kidneyStatus: 'normal',
  symptoms: [],
  ageGroup: '40-49歲',
};

const LABEL_TEXT =
  '營養標示 每一份量 100公克 熱量 480大卡 蛋白質 9公克 糖 8公克 鈉 2350毫克';

let server: ChildProcess | null = null;

try {
  console.log('啟動測試用伺服器…');
  server = spawn(
    process.execPath,
    [path.resolve('node_modules/tsx/dist/cli.mjs'), 'server.ts'],
    {
      env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production' },
      stdio: 'ignore',
    }
  );

  // 等它起來（最多 30 秒）
  let ready = false;
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    try {
      const r = await fetch(`${BASE}/api/privacy`);
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
  }
  if (!ready) throw new Error('伺服器沒有在時限內啟動');
  console.log('伺服器就緒\n');

  console.log('── 1. localOnly: true 時，四個端點都不得呼叫雲端 ──');

  const vitals = await post('/api/analyze-indicators', {
    indicators: INDICATORS,
    language: 'zh-TW',
    localOnly: true,
  });
  check(
    '生理指標：走本機引擎（不是 cloud_ai）',
    vitals?.data?.analysis_mode === 'smart_nutrition_engine',
    `→ ${vitals?.data?.analysis_mode}`
  );
  check(
    '生理指標：★ 顏色仍由規則引擎決定（安全鐵則）',
    vitals?.data?.status_level === 'red',
    `→ ${vitals?.data?.status_level}`
  );

  const qa = await post('/api/ask-health-question', {
    question: '高血壓可以喝咖啡嗎',
    indicators: INDICATORS,
    language: 'zh-TW',
    localOnly: true,
  });
  check(
    '健康問答：走本機引擎（不是 cloud_ai）',
    qa?.data?.source === 'smart_health_qa',
    `→ ${qa?.data?.source}`
  );
  check('健康問答：仍有回答內容', !!qa?.data?.answer);

  /**
   * ★★ 2026-10-07 新增：**沒有血壓值時，不可以講「您的血壓」。**
   *
   * 【為什麼要驗這一條】
   *   本機問答引擎原本寫 `const systolic = indicators?.systolicBp || 135;` ——
   *   沒有資料時會變成 135，而 135 < 140 → 走到「您的血壓目前維持得還不錯」。
   *
   *   但問答區從 2026-09-30 起就**不再送出生理指標**，
   *   所以每一位「只在本機」的使用者問咖啡問題，
   *   都會被告知「您的血壓維持得還不錯」——
   *   **一個我們完全沒有資料、憑預設值編出來的健康評估。**
   *
   *   這比不回答更危險：使用者會把它當成事實。
   *   這一條斷言同時守住「不要把 `|| 135` 加回去」。
   */
  const qaNoVitals = await post('/api/ask-health-question', {
    question: '我有高血壓，喝咖啡可以嗎',
    language: 'zh-TW',
    localOnly: true,
    // ⚠️ 刻意**不帶 indicators** —— 模擬問答區真實的請求
  });
  const noVitalsAnswer = String(qaNoVitals?.data?.answer ?? '');
  check(
    '★★ 沒有血壓值時不得宣稱「您的血壓…」（那是捏造的健康評估）',
    !/您的血壓/.test(noVitalsAnswer) && !/量到的上壓/.test(noVitalsAnswer),
    `→ ${noVitalsAnswer.slice(0, 60)}`
  );
  check(
    '沒有血壓值時仍要給得出咖啡的建議（不能因為缺資料就不回答）',
    /咖啡/.test(noVitalsAnswer),
    `→ ${noVitalsAnswer.slice(0, 60)}`
  );

  const qaNoVitalsEn = await post('/api/ask-health-question', {
    question: 'I have high blood pressure, can I drink coffee',
    language: 'en',
    localOnly: true,
  });
  const noVitalsEn = String(qaNoVitalsEn?.data?.answer ?? '');
  check(
    '★★ 英文版同理：不得宣稱 "your blood pressure"',
    !/your blood pressure/i.test(noVitalsEn),
    `→ ${noVitalsEn.slice(0, 60)}`
  );

  /**
   * ★★ 2026-10-07 新增：**後備文案不可以說「連不上 AI」**。
   *
   * 【為什麼要驗這一條】
   *   本機問答引擎原本一律假設自己是「連不上 AI 的後備」，
   *   所以通用回覆寫著「我目前連不上 AI 服務」。
   *
   *   但 `localOnly: true` 的使用者是**主動選擇**不把問題送給 AI ——
   *   他是有連線的。告訴他「連不上 AI」是**假的**，
   *   而且會讓他以為「網路好一點就能得到 AI 回答」，事實並非如此。
   *
   *   這一條用一個**不在內建知識庫裡**的問題（知識庫只涵蓋咖啡／香蕉／
   *   豆腐／柚子／紅酒／水腫），強制走到通用後備，才驗得到那段文案。
   *   （用已知問題會走到專屬規則，根本碰不到後備 —— 那是「假通過」。）
   */
  const qaUnknown = await post('/api/ask-health-question', {
    question: '我可以吃人參嗎',
    language: 'zh-TW',
    localOnly: true,
  });
  const unknownAnswer = String(qaUnknown?.data?.answer ?? '');
  check(
    '★ 本機問答後備不得說「連不上 AI」（使用者是主動選擇離線）',
    !/連不上/.test(unknownAnswer),
    `→ ${unknownAnswer.slice(0, 60)}`
  );
  check(
    '★ 本機問答後備要說明「您選擇了只在本機」',
    /只在本機/.test(unknownAnswer),
    `→ ${unknownAnswer.slice(0, 60)}`
  );
  check(
    '★ 本機問答後備要承認「這一題不在內建知識庫裡」（不可假裝答了）',
    /不在內建知識庫/.test(unknownAnswer),
    `→ ${unknownAnswer.slice(0, 60)}`
  );

  const qaUnknownEn = await post('/api/ask-health-question', {
    question: 'Can I take ginseng',
    language: 'en',
    localOnly: true,
  });
  const unknownEn = String(qaUnknownEn?.data?.answer ?? '');
  check(
    '★ 英文後備也不得說 "reach the AI"',
    !/reach the AI/i.test(unknownEn),
    `→ ${unknownEn.slice(0, 60)}`
  );
  check('★ 英文後備零中文殘留', !/[\u4e00-\u9fff]/.test(unknownEn), `→ ${unknownEn.slice(0, 60)}`);

  const label = await post('/api/analyze-label', {
    ocrText: LABEL_TEXT,
    conditions: ['高血壓'],
    profileId: 'senior',
    language: 'zh-TW',
    localOnly: true,
  });
  check(
    '標籤分析：走本機引擎（不是 cloud_ai）',
    label?.data?.analysis_mode === 'local_fallback',
    `→ ${label?.data?.analysis_mode}`
  );
  check('標籤分析：data_handling 標為 local_only', label?.data?.data_handling === 'local_only');

  // ── 健身週報的同意閘門（2026-10-04 補上）──────────────────────────────
  // ⚠️ 這裡為什麼用「耗時」當判準，而不是用回應內容：
  //    `server/fitnessReport.ts` 的 `generateFitnessReport()` 在 `localOnly === true`
  //    時會**在呼叫 `callNvidiaNim()` 之前**就 return，所以它不該有任何網路往返。
  //    但「回應是 source:'local'」**不能**當證據 —— NIM 失敗時（沒金鑰、逾時、
  //    冷啟動）AI 路徑也會退回 `buildLocalFitnessReport()`，一樣回 'local'。
  //    而 `callNvidiaNim()` **不更新** `providerState`（那是 `callAiModel` 才做的），
  //    所以 `/api/ai-status` 的 usedToday／lastLatencyMs 也看不出差別。
  //    → 唯一能分辨「沒去碰雲端」與「碰了但失敗」的訊號就是**耗時**。
  //    實測（2026-10-04 線上）：有閘門 0.185s／無閘門 12.1s（NIM 逾時）。
  //    閘門路徑是純 CPU 的本機報告，本機伺服器下遠低於 50ms；
  //    而任何一次真的 NIM 呼叫最快也要 0.76s（實測）。
  //    ⚠️ 這是**時間**判準，不是狀態判準。若日後在慢機器上看到它不穩，
  //       正解是讓 `callNvidiaNim()` 也更新 `providerState`，再改判那個計數器。
  const fitBody = {
    language: 'zh-TW',
    goal: 'muscle',
    daysPerWeek: 3,
    trainedDays: 3,
    totalVolume: 1200,
    exercises: ['深蹲'],
    avgKcal: 2000,
    avgProteinG: 90,
    targetKcal: 2400,
    targetProteinG: 120,
    daysInWindow: 7,
  };
  const fit = await postTimed('/api/fitness-report', { ...fitBody, localOnly: true });
  check(
    '健身週報：★ localOnly: true 時在碰雲端「之前」就返回（< 500ms）',
    fit.ms < 500,
    `→ ${fit.ms}ms（真的呼叫 NIM 最快也要 0.76s，逾時則是 12s）`
  );
  check(
    '健身週報：走本機版（source = local）',
    fit.json?.data?.source === 'local',
    `→ ${fit.json?.data?.source}`
  );

  // ── 出題端點的同意閘門（2026-10-07 補上）────────────────────────────
  // ⚠️ 這裡用兩個判準，缺一不可：
  //    ① 耗時 —— 分辨「沒去碰雲端」與「碰了但失敗」。
  //       本機路徑是純 CPU 的 `pickBuiltinFallback()`，遠低於 500ms；
  //       而真的呼叫 AI 最快也要好幾秒（實測免費模型 13.5s）。
  //    ② `source !== 'ai'` —— 這一道擋的是**另一種失敗**：
  //       就算閘門漏了、AI 真的被呼叫，只要它失敗退回內建題，
  //       回應看起來仍與「有閘門」一模一樣（source 都是 'builtin'）。
  //       → 所以兩個一起看：快 ＋ 不是 AI 題。
  const quiz = await postTimed('/api/quiz-question', {
    labelKeys: ['鈉'],
    labelContext: { name: '鈉', value: 1980, unit: '毫克', dailyLimit: 2000, percent: 99 },
    language: 'zh-TW',
    profileId: 'senior',
    excludeIds: [],
    localOnly: true,
  });
  check(
    '出題：★ localOnly: true 時在碰雲端「之前」就返回（< 500ms）',
    quiz.ms < 500,
    `→ ${quiz.ms}ms（真的呼叫 AI 要數秒）`
  );
  check(
    '出題：★ localOnly 時不得回 AI 題（source 必須是 builtin）',
    quiz.json?.data?.source === 'builtin',
    `→ ${quiz.json?.data?.source}`
  );
  check(
    '出題：localOnly 時仍要回得出題目（卡片不能空著）',
    typeof quiz.json?.data?.question === 'string' && quiz.json?.data?.question.length > 0
  );

  console.log('\n── 2. /api/privacy 必須誠實描述三模式 ──');
  const privacy = await (await fetch(`${BASE}/api/privacy`)).json();
  const modes = privacy?.modes ?? {};
  check('列出三種模式', ['cloud_image', 'cloud_text', 'local_only'].every((m) => modes[m]));
  check('★ cloud_image 誠實標示會上傳照片', modes.cloud_image?.uploadsImage === true);
  check('cloud_text 標示不上傳照片', modes.cloud_text?.uploadsImage === false);
  check('cloud_text 標示會上傳文字', modes.cloud_text?.uploadsOcrText === true);
  check(
    '★ local_only 三項全 false（照片／文字／健康資訊都不上傳）',
    modes.local_only?.uploadsImage === false &&
      modes.local_only?.uploadsOcrText === false &&
      modes.local_only?.uploadsHealthInfo === false
  );
  check(
    '★ 不再有概括的 imageNeverLeavesDevice 保證（它對 cloud_image 不成立）',
    privacy?.imageNeverLeavesDevice === undefined
  );

  /**
   * ★★ 2026-10-07 新增：模式**名稱**不得宣稱「完全不連網」。
   *
   * 【當時為什麼要驗這一條】
   *   那一天上午實測發現 `local_only` 仍會發兩個請求到**我們自己的 Worker**
   *   （`/api/ai-status` 與 `/api/analyze-label`，後者帶 `localOnly: true`）。
   *   兩者都不轉送到 AI 供應商 —— 隱私承諾本身成立 ——
   *   但「完全不上網」是**可被實測推翻的敘述**，而評審真的會去驗。
   *
   * 【同一天稍後的變化】
   *   規則引擎被抽成前後端共用的純函式之後，那個模式**真的零網路請求**了。
   *   → 名稱維持「只在本機」（現在是字面事實）。
   *
   * ⚠️ 這條斷言**刻意保留**：名稱仍然不該寫「完全不上網」。
   *    「只在本機」講的是**資料在哪裡處理**，那是這個模式真正的定義；
   *    「完全不上網」講的是**網路行為**，是實作細節 ——
   *    哪天為了某個理由（例如遠端更新題庫）需要連一次網，
   *    寫在名稱裡的那句話就會變成謊言。名稱要描述承諾，不是描述實作。
   */
  const localName = String(modes.local_only?.name ?? '');
  const localDesc = String(modes.local_only?.description ?? '');
  check(
    '★ local_only 的名稱不再宣稱「完全不上網」',
    !/完全不上網|完全不上網|no internet at all/i.test(localName),
    `→ ${localName}`
  );
  check(
    '★ local_only 的描述不再宣稱「照片與文字都留在裝置上」',
    !/照片與文字都留在裝置上/.test(localDesc),
    `→ ${localDesc.slice(0, 60)}`
  );
  check(
    '★ /api/privacy 有 providerBoundaryNote（說清「上傳」指送到 AI 供應商）',
    typeof privacy?.providerBoundaryNote === 'string' &&
      /AI 供應商/.test(privacy.providerBoundaryNote),
    `→ ${String(privacy?.providerBoundaryNote ?? '').slice(0, 50)}`
  );

  /* ══════════════════════════════════════════════════════════════════════
   * 2b. App 內的「私隱條款」也必須與實際行為一致（2026-10-07 新增）
   * ══════════════════════════════════════════════════════════════════════
   * 【為什麼要驗這一條 —— 這是一個真實發生過的漂移】
   *   2026-10-07 把送給雲端的提示詞從「病名」改成「要盯緊的成分」
   *   （見 `conditionNutrients.ts`）。程式改了，但**私隱條款沒改** ——
   *   它仍然寫著「雲端模式只會把標籤內容與**慢性病史**送去判斷」。
   *
   *   那句話在使用者眼中是「我的病歷被上傳了」，而它已經不成立。
   *   ★ 這正是本專案反覆踩到的「改了 A 忘了 B」：**而且不會報錯**。
   *
   * 【為什麼驗翻譯表而不是驗畫面】
   *   條款是純文字，行為是程式；兩者最容易漂移。
   *   驗翻譯表可以在**幾毫秒內**抓到，不必開瀏覽器。
   */
  console.log('\n── 2b. 私隱條款文字必須與實際行為一致 ──');
  const { TRANSLATIONS } = await import('../src/i18n/translations');
  const privacyText = (lang: 'zh-TW' | 'en') =>
    [1, 2, 3, 4, 5]
      .map((n) => String((TRANSLATIONS[lang] as Record<string, string>)[`legal.privacy.${n}`] ?? ''))
      .join(' ');

  const zhPrivacy = privacyText('zh-TW');
  const enPrivacy = privacyText('en');

  /**
   * ★ 條款不得聲稱病名／慢性病史會被送到 AI。
   *   現在送的是「成分約束」，病名不離開裝置。
   */
  check(
    '★★ 私隱條款（中）不得聲稱「慢性病史／病名」會送給 AI',
    !/(慢性病史|病名)[^。；]{0,12}(送|傳|上傳)/.test(zhPrivacy),
    '條款若這樣寫，就與 conditionNutrients.ts 的實際行為不符'
  );
  check(
    '★★ 私隱條款（英）不得聲稱 conditions 會送給 AI 判斷',
    !/your conditions for judgement/i.test(enPrivacy),
    'the cloud prompt carries ingredient constraints, not conditions'
  );

  /** ★ 條款要正面說出「只在本機＝完全不發出網路請求」（這是現在的事實） */
  check(
    '★ 私隱條款（中）寫明「只在本機」完全不發出網路請求',
    /只在本機/.test(zhPrivacy) && /完全不發出網路請求/.test(zhPrivacy),
    `→ ${zhPrivacy.slice(0, 60)}…`
  );
  check(
    '★ 私隱條款（英）寫明 On-device 模式 no network requests',
    /On-device mode/i.test(enPrivacy) && /no network requests at all/i.test(enPrivacy),
    `→ ${enPrivacy.slice(0, 80)}…`
  );

  /**
   * ★ 條款要說明雲端送的是「成分」而不是病名 —— 這句是**主動澄清**，
   *   不是被動免責。少了它，使用者無從知道邊界在哪。
   *
   * ⚠️ 2026-10-08：原本這條要求出現「不會送出病名」。那句話本身**不夠精確**
   *   —— 病症名稱確實會離開手機（送到我們自己的伺服器用來換算成分），
   *   只是不轉送給 AI 供應商。條款改成講「兩段邊界」，
   *   所以斷言跟著改成驗「不會傳給供應商」。
   */
  check(
    '★ 私隱條款（中）說明雲端送的是「要盯緊的成分」',
    /要盯緊的成分/.test(zhPrivacy) && /不會傳給供應商/.test(zhPrivacy),
    `→ ${zhPrivacy.slice(0, 60)}…`
  );
  check(
    '★ 私隱條款（英）說明雲端送的是 ingredients to watch for',
    /ingredients to watch for/i.test(enPrivacy) && /never sent to the provider/i.test(enPrivacy),
    `→ ${enPrivacy.slice(0, 80)}…`
  );

  /**
   * ⚠️ 反向斷言：**不得**再出現「完全不上網」以外的舊敘述。
   *    這裡驗的是「照片與文字都留在裝置上」這種**對雲端模式不成立**的概括保證
   *    （它會讓 cloud_image 的使用者誤以為照片沒上傳）。
   */
  check(
    '★ 私隱條款不得概括保證「照片永遠不離開裝置」',
    !/照片永遠不離開裝置/.test(zhPrivacy) && !/the photo never leaves/i.test(enPrivacy),
    '那對 cloud_image 模式不成立'
  );

  /* ══════════════════════════════════════════════════════════════════
   * 2c. 模式選擇器文案必須與條款指向同一個邊界（2026-10-08 新增）
   * ══════════════════════════════════════════════════════════════════
   *
   * 【為什麼要新增這一節】
   *   評分審查抓到一個 2b 守不到的洞：模式選擇器寫「上傳：照片與病史」，
   *   而 legal.privacy.3 寫「不會送出病名」——**同一個 App 內兩句話打架**。
   *   評審只要滑到模式選擇頁、再翻私隱條款，就會看到。
   *   2b 只驗了「條款本身」，沒有驗「選擇器」。
   *
   * 【為什麼驗翻譯表而不是驗畫面】
   *   選擇器（AnalysisModePicker.tsx）那三行文字的**唯一來源**就是
   *   `mode.*Data` 這三個鍵（見 src/data/analysisModes.ts 的 MODE_DATA_KEY）。
   *   驗翻譯表等於驗畫面，而且幾毫秒就跑完，不必開瀏覽器。
   *
   * ★ 判準來自本專案自己的定義：**「上傳」一律指「送到 AI 供應商」**
   *   （見 server/handlers.ts 的 providerBoundaryNote）。
   */
  console.log('\n── 2c. 模式選擇器文案必須與條款指向同一個邊界 ──');

  const modeDataText = (lang: 'zh-TW' | 'en') =>
    ['cloudImage', 'cloudText', 'localOnly']
      .map((m) => String((TRANSLATIONS[lang] as Record<string, string>)[`mode.${m}Data`] ?? ''))
      .join(' ');

  const zhModeData = modeDataText('zh-TW');
  const enModeData = modeDataText('en');

  check(
    '★★ 模式選擇器（中）不得再寫「上傳：…病史」',
    !/病史/.test(zhModeData),
    `「上傳」指送到 AI 供應商，而送到供應商的是成分不是病名 → ${zhModeData.slice(0, 50)}…`
  );
  check(
    '★★ 模式選擇器（英）不得再寫 health info',
    !/health info/i.test(enModeData),
    `→ ${enModeData.slice(0, 80)}…`
  );
  /**
   * ⚠️ 這裡驗的是「指向同一個邊界」，不是「同一句話」。
   *   選擇器那一行的框寬在**長者字級（19px）下只有 218px** ——
   *   也就是**上限 11 個全形字**。所以它只能用較短的「把關的成分」；
   *   條款不受寬度限制，用較精確的「要盯緊的成分」。
   *   兩者指的都是**成分約束**而不是病名，那才是這一節要守的東西。
   *   （2026-10-08 實測：寫成「要盯緊的成分」共 12 字 → 折行後末行只剩 1 個字。）
   */
  check(
    '★ 模式選擇器（中）與條款指向同一個邊界（都要講「成分」而不是病名）',
    /成分/.test(zhModeData) && /要盯緊的成分/.test(zhPrivacy),
    `選擇器：${zhModeData.slice(0, 50)}…`
  );
  /**
   * ★★ 把版面約束寫進回歸測試（2026-10-08）。
   *   這一條不是「美感偏好」——超過 11 個全形字就會在長者字級下折行並留下孤行，
   *   而孤行對長者等於要多掃一次那 1～2 個字。
   *   放在這裡是因為它**幾毫秒就跑完**，不必開瀏覽器等 check:layout。
   */
  check(
    '★ 雲端模式的「上傳：…」每一行都塞得進長者字級框寬（≤ 11 個全形字）',
    ['cloudImage', 'cloudText'].every((m) => {
      const s = String((TRANSLATIONS['zh-TW'] as Record<string, string>)[`mode.${m}Data`] ?? '');
      return s.length > 0 && s.length <= 11;
    }),
    '超過 11 個全形字會在 19px 下折行並留下孤行'
  );
  check(
    '★ 模式選擇器（英）與條款指向同一個邊界（兩邊都要說 watch）',
    /watch/i.test(enModeData) && /ingredients to watch for/i.test(enPrivacy),
    `→ ${enModeData.slice(0, 80)}…`
  );
  check(
    '★ 條款（中）要寫明病症名稱不傳給供應商，並點出自填例外',
    /不會傳給供應商/.test(zhPrivacy) && /自行填寫/.test(zhPrivacy),
    `→ ${zhPrivacy.slice(0, 60)}…`
  );
  check(
    '★ 條款（英）要寫明 conditions 不傳給供應商，並點出自填例外',
    /never sent to the provider/i.test(enPrivacy) && /typed in yourself/i.test(enPrivacy),
    `→ ${enPrivacy.slice(0, 80)}…`
  );

  /**
   * ★★ `/api/privacy` 端點的描述也是**使用者／評審看得到的文案** ——
   *   打開那個網址就會讀到。它曾經寫著「同時傳送您勾選的慢性病史」，
   *   與條款直接矛盾，而且不會有任何測試紅燈。
   *
   * 【為什麼切片驗而不是整檔 grep】
   *   `handlers.ts` 有兩處**合法**的「慢性病史」：
   *     · 檔頭註解在說明「以前那一行提示詞長什麼樣」
   *     · `localData.items` 說「健康設定與慢性病史」存在**裝置上**（那是對的）
   *   整檔 grep 會誤殺。所以只切出三個模式描述所在的那一段來驗。
   */
  const handlersSrc = readFileSync(new URL('../server/handlers.ts', import.meta.url), 'utf8');
  const modesBlock = (() => {
    const start = handlersSrc.indexOf('modes: {');
    const end = handlersSrc.indexOf('providerBoundaryNote');
    return start >= 0 && end > start ? handlersSrc.slice(start, end) : '';
  })();
  /**
   * ⚠️ **一定要先剝掉註解再驗**。
   *   那裡有一段註解在說明「原本寫的是什麼」（`原本寫「…慢性病史」`），
   *   直接 grep 會把那段說明當成違規 —— 但註解不是使用者看得到的文案，
   *   而且刻意保留舊字串才看得出「改了什麼、為什麼改」。
   */
  const stripComments = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const modesCode = stripComments(modesBlock);

  check(
    '★★ /api/privacy 的三模式描述不得出現「病史」',
    modesCode.length > 0 && !/病史/.test(modesCode),
    modesBlock.length === 0
      ? '切不出 modes 區塊（handlers.ts 結構變了？請更新這支腳本的切片錨點）'
      : '雲端模式的 description 仍聲稱傳送「慢性病史」，與條款矛盾'
  );
  check(
    '★ /api/privacy 的雲端模式描述要說出送的是「要盯緊的成分」',
    (modesCode.match(/要盯緊的成分/g) ?? []).length >= 2,
    'cloud_image 與 cloud_text 兩段都要講清楚送的是成分'
  );

  console.log('\n── 3. 難字簡化：片語要換，化學名稱不能動 ──');
  const { simplifyNutrientWording } = await import('../src/data/bilingual');

  check('鈉含量 → 鹽分含量', simplifyNutrientWording('鈉含量高達 2350 毫克') === '鹽分含量高達 2350 毫克');
  check('高鈉 → 高鹽分', simplifyNutrientWording('高鈉泡麵') === '高鹽分泡麵');
  check('膳食纖維 → 纖維', simplifyNutrientWording('膳食纖維不足') === '纖維不足');
  check('飽和脂肪 → 動物油', simplifyNutrientWording('飽和脂肪偏高') === '動物油偏高');
  check('添加糖 → 糖', simplifyNutrientWording('添加糖過多') === '糖過多');

  /**
   * ⚠️ 這三條是**最重要的**：這些是化學名稱，不是「鈉」這個營養素。
   *    把 L-麩酸鈉（味精）寫成「L-麩酸鹽分」就是事實錯誤。
   *    所以後處理只換片語，不碰單一個「鈉」字。
   */
  check('★ L-麩酸鈉（味精）不能被改', simplifyNutrientWording('含 L-麩酸鈉') === '含 L-麩酸鈉');
  check('★ 苯甲酸鈉（防腐劑）不能被改', simplifyNutrientWording('苯甲酸鈉') === '苯甲酸鈉');
  check('★ 碳酸鈉不能被改', simplifyNutrientWording('碳酸鈉') === '碳酸鈉');
  check('★ 單獨一個「鈉」字不改（寧可漏換，不要錯換）', simplifyNutrientWording('鈉 2350 毫克') === '鈉 2350 毫克');
  check('英文不受影響', simplifyNutrientWording('High sodium content') === 'High sodium content');

  console.log('\n── 4. 營養素方向：上限 vs 目標（2026-09-30 修掉的 bug）──');
  const { normalizeNutrientFacts } = await import('../server/core');
  const { getLearnerProfile, getNutrientDirections } = await import('../src/data/learnerProfiles');

  const norm = (profileId: string, raw: unknown[]) => {
    const p = getLearnerProfile(profileId);
    return normalizeNutrientFacts(raw, p.numericLimits, getNutrientDirections(profileId));
  };

  /**
   * ⚠️ 這一組是**核心**：`numericLimits` 混了「上限」與「目標」兩種性質。
   *    原本 `normalizeNutrientFacts` 把全部寫成 'limit'，於是
   *    「膳食纖維」與「蛋白質」被講成「每天上限」——
   *    對健身族來說，那等於把「你該吃到的量」說成「你超標了」。
   *    而且前端的 `factTone` / `factLabel` 早就寫好了 target 分支，
   *    只是後端從來沒產生過 —— 那是一段**從未執行過的死路**。
   */
  const fibre = norm('senior', [{ name: '膳食纖維', value: 8, unit: '公克' }]);
  check('★ 膳食纖維是「目標」不是「上限」', fibre[0]?.direction === 'target', `→ ${fibre[0]?.direction}`);

  const protein = norm('fitness', [{ name: '蛋白質', value: 80, unit: '公克' }]);
  check('★ 蛋白質是「目標」不是「上限」', protein[0]?.direction === 'target', `→ ${protein[0]?.direction}`);

  const sodium = norm('senior', [{ name: '鈉', value: 2350, unit: '毫克' }]);
  check('鈉仍然是「上限」', sodium[0]?.direction === 'limit', `→ ${sodium[0]?.direction}`);

  // 排序：目標類百分比再高，也不能把上限類擠到後面
  const mixed = norm('senior', [
    { name: '膳食纖維', value: 30, unit: '公克' }, // 120%（好事）
    { name: '鈉', value: 2350, unit: '毫克' }, // 118%（壞事）
  ]);
  check(
    '★ 排序：上限類排在目標類前面（紅色不能被綠色擠下去）',
    mixed[0]?.name === '鈉' && mixed[1]?.name === '膳食纖維',
    `→ ${mixed.map((f) => f.name).join(' > ')}`
  );
} catch (e: any) {
  console.error('測試執行失敗:', e?.message ?? e);
  fail++;
} finally {
  try {
    server?.kill();
  } catch {}
  await sleep(600);
}

console.log(`\n結果：${pass} 通過 / ${fail} 失敗`);
process.exit(fail > 0 ? 1 : 0);
