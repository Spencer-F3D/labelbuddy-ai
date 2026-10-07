/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 提示詞隱私檢查（Prompt privacy guard）
 * ============================================================================
 * 【這支要抓的 bug】
 *   送給 AI 供應商的提示詞，原本有一行 `【使用者的慢性病史】高血壓、糖尿病`。
 *   改成「中性成分約束」（鈉、添加糖…）之後，有兩種**不會報錯**的失敗方式：
 *
 *     ① **病名又跑回提示詞裡** —— 例如有人「順手」把舊那一行加回去，
 *        或把條件名稱塞進成分清單。使用者完全看不出來，但隱私承諾已經破了。
 *     ② **某個條件展開不出成分** —— 資料改名、`targetNutrients` 被刪、
 *        或新條件忘了填 → 該條件**從提示詞裡消失**，AI 不再盯它。
 *        畫面上也不會報錯（提醒仍在，但 AI 的判斷少了依據）。
 *        這是安全回歸，比 ① 更危險。
 *
 * 【怎麼驗】
 *   直接呼叫**執行期真正在用的那兩個函式**（不是檢查腳本裡另寫的複本）：
 *     · `expandConditionsToNutrients()`
 *     · `buildUserConstraintLine()`
 *   然後斷言「展開結果不含病名」「每個內建條件都展開得出東西」。
 *
 * 用法：npm run check:privacy
 * 退出碼 0 = 全部通過；1 = 有問題
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PHYSICAL_INDICATORS } from '../src/data/conditions';
import {
  expandConditionsToNutrients,
  parseTargetNutrient,
} from '../src/data/conditionNutrients';
import { buildUserConstraintLine } from '../server/conditionConstraint';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    pass++;
    console.log(`✅ ${name}`);
  } else {
    fail++;
    console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('='.repeat(72));
console.log('提示詞隱私檢查（送給 AI 的是中性成分，不是病名）');
console.log('='.repeat(72));

/* ── 0. 資料來源不為空（防假通過）──────────────────────────────────── */
console.log('\n── 0. 資料來源不為空 ──');
check(
  `PHYSICAL_INDICATORS 有條件（實際 ${PHYSICAL_INDICATORS.length} 項）`,
  PHYSICAL_INDICATORS.length > 0
);

/* ── 1. parseTargetNutrient ────────────────────────────────────────── */
console.log('\n── 1. parseTargetNutrient（中英拆解）──');
{
  const a = parseTargetNutrient('鈉 (Sodium)');
  check('「鈉 (Sodium)」→ zh=鈉 / en=Sodium', a.zh === '鈉' && a.en === 'Sodium', JSON.stringify(a));

  const b = parseTargetNutrient('食鹽');
  check('沒有括號的「食鹽」→ 中英同名', b.zh === '食鹽' && b.en === '食鹽', JSON.stringify(b));

  const c = parseTargetNutrient('核桃/腰果/杏仁 (Tree Nuts)');
  check(
    '含斜線的名稱也拆得開',
    c.zh === '核桃/腰果/杏仁' && c.en === 'Tree Nuts',
    JSON.stringify(c)
  );
}

/* ── 2. ★ 每個內建條件都要展開得出成分 ────────────────────────────── */
console.log('\n── 2. ★ 每個內建條件都要展開得出成分（否則該條件被靜默丟掉）──');
{
  /**
   * ⚠️ 排除 `localRule === false` 的項目 —— 目前只有「其他（自行填寫）」。
   *
   *   它本來就**不可能**有 `targetNutrients`（內容是使用者自己打的字），
   *   所以「展開不出成分」對它是正常的，不是 bug。
   *   它該走的是 `unmapped` 那條路（第 6 節會驗）。
   *
   *   這個判準與 `verify-condition-keywords.ts`、`check-quiz-bank.ts` 一致 ——
   *   本專案統一用 `localRule` 表示「這一項本機／內建規則能不能處理」。
   */
  const ruleBased = PHYSICAL_INDICATORS.filter((c) => c.localRule !== false);
  const empty: string[] = [];
  for (const cond of ruleBased) {
    const { nutrients, unmapped } = expandConditionsToNutrients([cond.id], 'zh-TW');
    if (nutrients.length === 0 || unmapped.length > 0) {
      empty.push(`${cond.name}(${cond.id})`);
    }
  }
  check(
    `${ruleBased.length} 項有內建規則的條件全部展開出成分`,
    empty.length === 0,
    empty.length ? `展開不出來的：${empty.join('、')}` : ''
  );
  console.log(
    `   ℹ️  例：高血壓 → ${expandConditionsToNutrients(['高血壓'], 'zh-TW').nutrients.join('、')}`
  );
  const selfTyped = PHYSICAL_INDICATORS.filter((c) => c.localRule === false);
  console.log(
    `   ℹ️  刻意排除 ${selfTyped.length} 項無內建規則者：${selfTyped.map((c) => c.name).join('、')}` +
      '（走 unmapped，第 6 節驗）'
  );
}

/* ── 3. ★★ 展開結果不得含任何病名 ────────────────────────────────── */
console.log('\n── 3. ★★ 展開結果不得含任何病名（這是本功能的目的）──');
{
  const leaked: string[] = [];
  for (const cond of PHYSICAL_INDICATORS) {
    const { nutrients } = expandConditionsToNutrients([cond.id], 'zh-TW');
    const joined = nutrients.join('、');
    if (joined.includes(cond.name)) leaked.push(`${cond.name} → ${joined}`);
  }
  check('沒有任何條件的名稱出現在成分清單裡', leaked.length === 0, leaked.slice(0, 4).join(' / '));

  // 混合多個條件（真實情境）
  const mixed = expandConditionsToNutrients(['高血壓', '糖尿病', '花生過敏'], 'zh-TW');
  const mixedText = mixed.nutrients.join('、');
  console.log(`   ℹ️  高血壓＋糖尿病＋花生過敏 → ${mixedText}`);
  const diseaseWords = ['高血壓', '糖尿病', '過敏', '腎臟病', '心臟衰竭', '骨質疏鬆'];
  const found = diseaseWords.filter((w) => mixedText.includes(w));
  check('混合條件展開後不含任何病名', found.length === 0, found.join('、'));
  check(
    '展開後仍然含有該盯的成分（鈉／添加糖／花生）',
    mixed.nutrients.includes('鈉') &&
      mixed.nutrients.includes('添加糖') &&
      mixed.nutrients.some((n) => n.includes('花生')),
    mixedText
  );
}

/* ── 4. 英文模式取英文名 ───────────────────────────────────────────── */
console.log('\n── 4. 英文模式取英文名 ──');
{
  const en = expandConditionsToNutrients(['hypertension', 'peanut_allergy'], 'en');
  const text = en.nutrients.join(', ');
  check('英文模式展開出 Sodium', en.nutrients.includes('Sodium'), text);
  check('英文模式展開出 Peanuts', en.nutrients.some((n) => /Peanuts/i.test(n)), text);
  check('英文模式不含中文病名', !/高血壓|花生過敏/.test(text), text);

  /**
   * ★★ 英文模式**不得漏出任何中文**。
   *
   * 【為什麼要驗這一條】
   *   `targetNutrients` 的格式是 `'中文 (English)'`，但原本**有 31 個項目沒有英文** ——
   *   那些項目在英文模式下會原樣輸出中文（例如 `食鹽`、`小蘇打`、`高鈉醬油`）。
   *
   *   中文進了提示詞，AI 就可能把它抄進輸出欄位
   *   → 英文介面出現中文 → 而競賽章程明訂「未使用英文可不予評審」。
   *   `check:i18n` 測不到這一條（它掃的是輸出，而 AI 不一定每次都抄）。
   *
   *   已把 31 項全部補上英文名；這一條斷言防止後人新增條件時又漏掉。
   */
  const allEn = expandConditionsToNutrients(
    PHYSICAL_INDICATORS.filter((c) => c.localRule !== false).map((c) => c.id),
    'en'
  );
  const cjk = allEn.nutrients.filter((n) => /[\u4e00-\u9fff]/.test(n));
  check(
    '★★ 英文模式下全部 19 項條件展開後零中文',
    cjk.length === 0,
    cjk.length ? `漏中文的：${cjk.slice(0, 6).join('、')}` : ''
  );
  console.log(`   ℹ️  英文模式展開筆數：${allEn.nutrients.length}`);
}

/* ── 5. ★ buildUserConstraintLine：真正送進提示詞的那一行 ──────────── */
console.log('\n── 5. ★ 提示詞那一行（執行期真正在用的函式）──');
{
  const line = buildUserConstraintLine(['高血壓', '糖尿病'], 'zh-TW');
  console.log(`   ℹ️  高血壓＋糖尿病 → ${JSON.stringify(line)}`);
  check('不含「高血壓」', !line.includes('高血壓'), line);
  check('不含「糖尿病」', !line.includes('糖尿病'), line);
  check('含有「鈉」與「添加糖」', line.includes('鈉') && line.includes('添加糖'), line);

  const enLine = buildUserConstraintLine(['hypertension', 'diabetes'], 'en');
  console.log(`   ℹ️  en → ${JSON.stringify(enLine)}`);
  check('英文行不含病名', !/hypertension|diabetes/i.test(enLine), enLine);
  check('英文行含 Sodium', /Sodium/.test(enLine), enLine);

  const none = buildUserConstraintLine([], 'zh-TW');
  check('沒有勾任何條件時有明確說明（不是空字串）', none.trim().length > 0, none);
}

/* ── 6. 自填病症：原樣保留，且標示「無內建規則」────────────────────── */
console.log('\n── 6. 自填病症（無法展開）必須原樣保留，不可靜默丟掉 ──');
{
  const custom = '其他：甲狀腺亢進';
  const { nutrients, unmapped } = expandConditionsToNutrients([custom], 'zh-TW');
  check('自填病症落在 unmapped（有回報，不是被吃掉）', unmapped.includes(custom), JSON.stringify(unmapped));
  check('自填病症不會產生任何成分', nutrients.length === 0, nutrients.join('、'));

  const line = buildUserConstraintLine(['高血壓', custom], 'zh-TW');
  console.log(`   ℹ️  高血壓＋自填 → ${JSON.stringify(line)}`);
  check('提示詞那一行仍包含自填內容（使用者填了就必須被考慮）', line.includes('甲狀腺亢進'), line);
  check('且標示了「沒有內建規則」', /沒有內建規則/.test(line), line);
  check('但沒有把「高血壓」也一起寫出來', !line.includes('高血壓'), line);
}

/* ── 7. 防回歸：原始碼裡不得再有舊的病史那一行 ────────────────────── */
console.log('\n── 7. 防回歸：原始碼不得再有「使用者的慢性病史」那一行 ──');
{
  /**
   * ⚠️ 這是**字串掃描**，比前面的行為斷言弱 —— 它的用途只是
   *    「如果有人把舊那一行貼回去，這裡會亮紅燈」。
   *    真正的保證是第 3～6 節的行為斷言。
   *
   * ⚠️⚠️ **掃描前一定要先去掉註解。**
   *   第一次跑這支腳本時它誤報了 —— 因為 `handlers.ts` 的註解裡
   *   **引用**了舊那一行來解釋「這段被移除了」。
   *   不去註解的話，**把程式碼修好並寫清楚原因，反而會讓檢查失敗** ——
   *   那會訓練出「不要寫註解」的錯誤行為。
   */
  const stripComments = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const src = stripComments(readFileSync(path.resolve('server/handlers.ts'), 'utf8'));

  check('handlers.ts 的程式碼不含「使用者的慢性病史」', !src.includes('使用者的慢性病史'));
  check("handlers.ts 的程式碼不含 \"[User's medical conditions]\"", !src.includes("[User's medical conditions]"));
  check('handlers.ts 有使用 buildUserConstraintLine', src.includes('buildUserConstraintLine'));
}

/* ── 總結 ───────────────────────────────────────────────────────────── */
console.log('\n' + '='.repeat(72));
console.log(`結果：${pass} 項通過 / ${fail} 項有問題`);
if (fail > 0) {
  console.log('\n❌ 驗證失敗。上面每一項都會導致「隱私承諾破洞」或「條件被靜默丟掉」。');
}
process.exit(fail > 0 ? 1 : 0);
