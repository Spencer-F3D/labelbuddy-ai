/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 稱謂機制回歸測試（Honorific check）
 * ============================================================================
 * 驗證「性別 → 稱謂」的確定性後處理：
 *   - male → 先生您好／female → 小姐您好／unspecified → 您好
 *   - 英文一律不加稱謂（英文沒有「Mr + Hello」這種慣例，這是刻意的）
 *   - 只動**開頭**的「您好」，內文或使用者自己的提問都不動
 *
 * 【為什麼一定要有這支】
 *   稱謂是在結果輸出的最後一步用字串後處理插上去的。
 *   這種改動**不會報錯**，只會「偶爾少一個稱謂」或「改到使用者的話」，
 *   靠人工看畫面根本測不出來。所以用測試把邊界釘死。
 *
 * 【它同時守住的第二件事】
 *   性別**絕對不可以影響紅黃綠**。這是本專案的安全鐵則
 *   （見 handlers.ts 的「安全覆蓋」段落）—— 這裡也一併斷言。
 *
 * 用法：npx tsx scripts/check-honorific.ts
 */
import {
  honorificPrefix,
  applyHonorific,
  applyHonorificToFields,
  applyHonorificToIndicators,
  buildAddressRule,
  LABEL_TEXT_FIELDS,
  QA_TEXT_FIELDS,
} from '../server/core';
import { analyzeSeniorPhysicalIndicators } from '../server/smartIndicatorAnalyzer';
import { answerSeniorHealthQuestion } from '../server/smartHealthQA';

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

console.log('── 1. honorificPrefix ──');
check("male + zh → 先生", honorificPrefix('male', 'zh-TW') === '先生');
check("female + zh → 小姐", honorificPrefix('female', 'zh-TW') === '小姐');
check("unspecified + zh → ''", honorificPrefix('unspecified', 'zh-TW') === '');
check("undefined + zh → ''", honorificPrefix(undefined, 'zh-TW') === '');
check("male + en → '' (英文無此慣例)", honorificPrefix('male', 'en') === '');
check("female + en → ''", honorificPrefix('female', 'en') === '');

console.log('── 2. applyHonorific 邊界 ──');
check('開頭您好 → 加稱謂', applyHonorific('您好！今天血壓偏高。', '先生') === '先生您好！今天血壓偏高。');
check('前有空白仍命中', applyHonorific('  您好！', '小姐') === '  小姐您好！');
check('不以您好開頭 → 不動', applyHonorific('請注意！不能吃柚子。', '先生') === '請注意！不能吃柚子。');
check('內文您好 → 不動', applyHonorific('這包很鹹。您好自為之。', '先生') === '這包很鹹。您好自為之。');
check('prefix 空 → 原樣', applyHonorific('您好！', '') === '您好！');
check('非字串 → 原樣', applyHonorific(123, '先生') === 123);
check('undefined → 原樣', applyHonorific(undefined, '先生') === undefined);

console.log('── 3. 生理指標引擎（本機後備）──');
const indicators = {
  systolicBp: 158,
  diastolicBp: 96,
  heartRate: 78,
  bloodSugar: 8.4,
  bloodSugarUnit: 'mmol/L' as const,
  bloodSugarTiming: 'fasting' as const,
  uricAcidStatus: 'normal' as const,
  cholesterolStatus: 'normal' as const,
  kidneyStatus: 'normal' as const,
  symptoms: [],
  ageGroup: '40-49歲',
};
const male = applyHonorificToIndicators(
  JSON.parse(JSON.stringify(analyzeSeniorPhysicalIndicators(indicators, 'zh-TW'))),
  honorificPrefix('male', 'zh-TW')
);
const female = applyHonorificToIndicators(
  JSON.parse(JSON.stringify(analyzeSeniorPhysicalIndicators(indicators, 'zh-TW'))),
  honorificPrefix('female', 'zh-TW')
);
const none = applyHonorificToIndicators(
  JSON.parse(JSON.stringify(analyzeSeniorPhysicalIndicators(indicators, 'zh-TW'))),
  honorificPrefix('unspecified', 'zh-TW')
);
console.log('   male  voice_summary:', male.voice_summary?.slice(0, 40));
console.log('   female voice_summary:', female.voice_summary?.slice(0, 40));
console.log('   none  voice_summary:', none.voice_summary?.slice(0, 40));
check('male 含「先生您好」', /先生您好/.test(male.voice_summary ?? ''));
check('female 含「小姐您好」', /小姐您好/.test(female.voice_summary ?? ''));
check('none 不含「先生」也不含「小姐」', !/先生|小姐/.test(none.voice_summary ?? ''));
check('顏色不受性別影響（安全鐵則）', male.status_level === female.status_level && male.status_level === none.status_level);
check('巢狀 supermarket_rules 也套用', JSON.stringify(male.supermarket_rules ?? {}).includes('先生您好') || !JSON.stringify(male.supermarket_rules ?? {}).includes('您好'));

console.log('── 4. 健康問答引擎（本機後備）──');
const qaMale = JSON.parse(JSON.stringify(answerSeniorHealthQuestion('高血壓可以喝咖啡嗎', undefined, 'zh-TW')));
applyHonorificToFields(qaMale, honorificPrefix('male', 'zh-TW'), QA_TEXT_FIELDS);
console.log('   answer:', qaMale.answer?.slice(0, 40));
check('answer 含「先生您好」', /先生您好/.test(qaMale.answer ?? ''));
check('question 未被改動（使用者自己的話）', qaMale.question === '高血壓可以喝咖啡嗎');

const qaF = JSON.parse(JSON.stringify(answerSeniorHealthQuestion('高血壓可以喝咖啡嗎', undefined, 'zh-TW')));
applyHonorificToFields(qaF, honorificPrefix('female', 'zh-TW'), QA_TEXT_FIELDS);
check('voice_script 含「小姐您好」', /小姐您好/.test(qaF.voice_script ?? ''));

console.log('── 5. 標籤分析欄位清單不含使用者輸入 ──');
check('LABEL_TEXT_FIELDS 不含 question', !(LABEL_TEXT_FIELDS as readonly string[]).includes('question'));

console.log('── 6. 提示詞規則（雲端路徑）──');
const ruleM = buildAddressRule('male', 'zh-TW');
const ruleF = buildAddressRule('female', 'zh-TW');
const ruleN = buildAddressRule('unspecified', 'zh-TW');
check('male 規則要求「先生您好」開頭', ruleM.includes('先生您好'));
check('female 規則要求「小姐您好」開頭', ruleF.includes('小姐您好'));
check('male 規則禁用長輩稱呼', /阿公|阿伯|爺爺|奶奶/.test(ruleM) && ruleM.includes('絕對不可以使用'));
check('female 規則禁用長輩稱呼', /阿婆|阿嬤|奶奶/.test(ruleF));
check('unspecified 規則要求中性您好', ruleN.includes('您好') && !ruleN.includes('先生您好') && !ruleN.includes('小姐您好'));
check('英文一律回空字串（模型不受影響）', buildAddressRule('male', 'en') === '' && buildAddressRule('female', 'en') === '');

console.log('── 7. 模型沒寫招呼語時，後處理不亂加 ──');
const noGreeting = { simple_explanation: '咖啡因會讓心跳加快、血管收縮。', voice_summary: '血壓偏高的話，每天最多一杯。' };
applyHonorificToFields(noGreeting, '先生', ['simple_explanation', 'voice_summary']);
check('沒有招呼語 → 原樣不動（不硬塞稱謂）', noGreeting.simple_explanation.startsWith('咖啡因') && noGreeting.voice_summary.startsWith('血壓'));

console.log(`\n結果：${pass} 通過 / ${fail} 失敗`);
process.exit(fail > 0 ? 1 : 0);
