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
