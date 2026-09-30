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
 *   直接啟動真的伺服器，用 `localOnly: true` 打三個端點，
 *   斷言回應裡的 `analysis_mode` / `source` 必須是**本機**的標記。
 *   本機路徑完全離線，所以這支測試**不消耗任何 API 額度**。
 *
 * 用法：npx tsx scripts/check-analysis-mode.ts
 */

import { spawn, type ChildProcess } from 'node:child_process';
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

  console.log('── 1. localOnly: true 時，三個端點都不得呼叫雲端 ──');

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
