/**
 * 孕期危險成分把關測試（2026-10-04 新增「孕婦」身分）。
 *
 * 【為什麼一定要有這支】
 *   孕婦是本專案**最不能出錯**的身分：一份含酒精或生食的食品，
 *   營養數字可能完全正常（酒精 0.5 公克不會讓任何項目超標），
 *   用「數字上限」永遠抓不到 —— 只有成分層級的把關能抓。
 *   而這種把關一旦失效，**不會報錯，只會靜靜放行**。
 *
 * 這支同時檢查兩個方向：
 *   ① 該紅的要紅（含酒精／生食／高汞魚）
 *   ② 不該紅的不要紅（安全食品；以及**非孕婦身分不該被孕期規則影響**）
 *      ② 很重要 —— 過度觸發會讓使用者學會忽略紅燈。
 *
 * 用法：node scripts/check-pregnancy.mjs http://127.0.0.1:3100
 */

const BASE = process.argv[2] ?? 'http://127.0.0.1:3100';

/**
 * 每個案例都有「完整的營養數字」（讓它通過解析門檻），
 * 差別只在**成分**與**食品名**。
 * 這樣才測得到「數字正常但成分危險」的情境。
 */
const BASE_LABEL =
  '營養標示 每一份量 100 公克 熱量 200 大卡 蛋白質 5 公克 脂肪 3 公克 ' +
  '飽和脂肪 1 公克 碳水化合物 20 公克 糖 2 公克 鈉 300 毫克';

const CASES = [
  // ── 應該紅燈（hard hazard）──
  { name: '含米酒（料理酒也是酒）', ing: '成分：糯米、米酒、鹽、糖', want: 'red' },
  { name: '含紹興酒', ing: '成分：豬肉、紹興酒、醬油', want: 'red' },
  { name: '含酒精（英文）', ing: 'Ingredients: water, alcohol, sugar', want: 'red' },
  { name: '生魚片', ing: '成分：生魚片、醋飯、海苔', want: 'red' },
  { name: '未殺菌乳酪', ing: '成分：未殺菌牛乳、鹽、凝乳酶', want: 'red' },
  { name: '高汞魚（劍魚）', ing: '成分：劍魚、橄欖油、鹽', want: 'red' },
  { name: '高汞魚（英文 shark）', ing: 'Ingredients: shark meat, salt', want: 'red' },

  // ── 應該至少黃燈（soft hazard）──
  { name: '含咖啡因', ing: '成分：水、咖啡萃取液、糖', want: 'yellow' },

  // ── 不該紅（安全食品）──
  { name: '一般餅乾（安全）', ing: '成分：小麥粉、植物油、鹽、糖', want: 'not-red' },
  { name: '含「酒石酸」但無酒精', ing: '成分：小麥粉、膨脹劑（酒石酸氫鉀）、鹽', want: 'not-red' },
  { name: '含「花生」不該誤判生食', ing: '成分：花生、糖、植物油', want: 'not-red' },
  { name: '含「生菜」不該誤判生食', ing: '成分：生菜、雞胸肉、沙拉醬', want: 'not-red' },
];

const RANK = { green: 0, yellow: 1, red: 2 };

/**
 * ⚠️⚠️ 欄位名一定要用 `profileId`。
 *
 * 我第一版寫成 `learnerProfileId`（前端顯示用的名字），後端讀的是 `profileId`，
 * 於是後端**默默忽略**這個欄位、退回預設的長者身分 →
 * 孕期把關根本沒執行 → 測試全部失敗，看起來像「功能壞了」。
 * 實際上壞的是**我的測試**。
 *
 * ★ 所以這裡加了一道**自我驗證**：送出後檢查回應裡的
 *   `learner_profile_id` 是否真的等於我要求的身分。
 *   不符就直接拋錯 —— 讓「送錯欄位」這種事當場爆掉，
 *   而不是變成一個看起來很合理的錯誤結論。
 */
async function ask(text, profileId) {
  const res = await fetch(`${BASE}/api/analyze-label`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ocrText: text,
      language: 'zh-TW',
      profileId, // ← 後端讀的是這個名字
      conditions: [],
      localOnly: true,
    }),
  });
  const j = await res.json();
  const data = j?.data ?? {};
  if (data.learner_profile_id && data.learner_profile_id !== profileId) {
    throw new Error(
      `後端用的身分是「${data.learner_profile_id}」，不是我要的「${profileId}」—— ` +
        '欄位名可能送錯了（後端讀 profileId）'
    );
  }
  return data;
}

console.log('【A】孕婦身分：該紅的要紅、不該紅的不要紅');
console.log('案例                          判定      期望        結果  標題');
console.log('─'.repeat(100));

let pass = 0;
let fail = 0;
for (const c of CASES) {
  const text = `${c.name.startsWith('含「') ? '' : c.ing}\n${BASE_LABEL}\n${c.ing}`;
  const d = await ask(text, 'pregnant');
  const got = d.risk_level;
  let ok;
  if (c.want === 'red') ok = got === 'red';
  else if (c.want === 'yellow') ok = RANK[got] >= 1;
  else ok = got !== 'red';
  ok ? pass++ : fail++;
  console.log(
    `${c.name.padEnd(30)}${String(got).padEnd(10)}${c.want.padEnd(12)}` +
      `${(ok ? '✅' : '❌').padEnd(6)}${String(d.warning_title ?? '').slice(0, 26)}`
  );
  if (!ok) {
    console.log(`     ↳ 摘要：${String(d.plain_summary ?? '').slice(0, 100)}`);
    console.log(`     ↳ 關注項：${JSON.stringify(d.nutrition_concerns ?? [])}`);
  }
}

/* ── B：非孕婦身分不該被孕期規則影響 ─────────────────────── */
console.log('\n【B】同一份含酒精食品，對非孕婦身分不該因「酒精」判紅');
console.log('身分        判定      期望        結果');
console.log('─'.repeat(52));
const alcoholLabel = `成分：糯米、米酒、鹽\n${BASE_LABEL}\n成分：糯米、米酒、鹽`;
for (const pid of ['young', 'senior', 'middle', 'fitness']) {
  const d = await ask(alcoholLabel, pid);
  // 這些身分仍可能因為鈉／糖等數字判紅，但**不該出現「孕期」字樣**
  const mentionsPregnancy = /孕期|孕婦/.test(
    JSON.stringify([d.warning_title, d.plain_summary, d.matched_conditions])
  );
  mentionsPregnancy ? fail++ : pass++;
  console.log(
    `${pid.padEnd(12)}${String(d.risk_level).padEnd(10)}${'不該提到孕期'.padEnd(12)}` +
      `${mentionsPregnancy ? '❌ 提到了' : '✅'}`
  );
}

console.log('');
console.log(fail === 0 ? `✅ 全部通過（${pass} 項）` : `❌ ${fail} 項失敗（通過 ${pass} 項）`);
process.exitCode = fail === 0 ? 0 : 1;
