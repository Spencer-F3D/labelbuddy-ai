/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 分析快取鍵回歸測試（Analysis cache key check）
 * ============================================================================
 *
 * 【為什麼一定要有這支】
 *   2026-09-29 實測抓到一個**會害人**的 bug：
 *   新流程（前端 OCR）下照片沒上傳，`imageBase64` 是空字串，
 *   而快取鍵卻是拿它算的 —— 於是「同一身分 ＋ 同一慢性病 ＋ 同一模式 ＋ 同一語言」
 *   的**所有商品共用一個快取鍵**。
 *
 *   實際後果：先掃燕麥片（鈉 2mg）→ 再掃泡麵（鈉 2350mg，應該紅燈）
 *   → 第二次回傳「✅ 非常適合長者食用」＋ `cached: true`。
 *
 *   這種 bug **不會報錯**，只會安靜地回錯商品的結論。
 *   靠人工掃兩包不同商品才可能發現 —— 所以用測試釘住。
 *
 * 用法：npx tsx scripts/check-cache-key.ts
 */

import { analysisCacheContent, makeCacheKey } from '../server/core';

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

/** 模擬 handler 組快取鍵的方式（與 handlers.ts 保持一致） */
function keyFor(opts: {
  isTextMode: boolean;
  ocrText?: string;
  imageBase64?: string;
  conditions: string[];
  profileId: string;
  mode: 'cloud' | 'local';
  lang: 'en' | 'zh';
}) {
  return makeCacheKey(
    analysisCacheContent({
      isTextMode: opts.isTextMode,
      ocrText: opts.ocrText,
      imageBase64: opts.imageBase64,
    }),
    [
      ...opts.conditions,
      `profile:${opts.profileId}`,
      `mode:${opts.mode}`,
      `lang:${opts.lang}`,
    ]
  );
}

const OATS = '營養標示 每一份量 40公克 熱量 152大卡 蛋白質 5公克 糖 1公克 鈉 2毫克 膳食纖維 4公克';
const NOODLES = '營養標示 每一份量 100公克 熱量 480大卡 蛋白質 9公克 糖 8公克 鈉 2350毫克';

const BASE = {
  isTextMode: true,
  conditions: ['高血壓'],
  profileId: 'senior',
  mode: 'cloud' as const,
  lang: 'zh' as const,
};

console.log('── 1. analysisCacheContent ──');
check(
  '文字模式用 ocrText',
  analysisCacheContent({ isTextMode: true, ocrText: 'ABC', imageBase64: '' }) === 'text:ABC'
);
check(
  '圖片模式用 base64',
  analysisCacheContent({ isTextMode: false, imageBase64: 'ZZZ', ocrText: '' }) === 'img:ZZZ'
);
check(
  '文字模式下不同文字 → 不同內容',
  analysisCacheContent({ isTextMode: true, ocrText: OATS }) !==
    analysisCacheContent({ isTextMode: true, ocrText: NOODLES })
);
check(
  '★ 文字模式不會因為沒有圖片就全部相同（原本的 bug）',
  analysisCacheContent({ isTextMode: true, ocrText: OATS, imageBase64: '' }) !==
    analysisCacheContent({ isTextMode: true, ocrText: NOODLES, imageBase64: '' })
);

console.log('── 2. 不同商品必須產生不同快取鍵（核心回歸）──');
const kOats = keyFor({ ...BASE, ocrText: OATS });
const kNoodles = keyFor({ ...BASE, ocrText: NOODLES });
check('★ 燕麥片與泡麵的快取鍵不同', kOats !== kNoodles);

console.log('── 3. 相同輸入必須命中同一鍵（快取要有效）──');
check('同一文字 → 同鍵', keyFor({ ...BASE, ocrText: OATS }) === kOats);
check(
  '慢性病順序不影響鍵',
  keyFor({ ...BASE, ocrText: OATS, conditions: ['糖尿病', '高血壓'] }) ===
    keyFor({ ...BASE, ocrText: OATS, conditions: ['高血壓', '糖尿病'] })
);

console.log('── 4. 該分開的維度必須分開 ──');
check('不同身分 → 不同鍵', keyFor({ ...BASE, ocrText: OATS, profileId: 'fitness' }) !== kOats);
check('不同語言 → 不同鍵', keyFor({ ...BASE, ocrText: OATS, lang: 'en' }) !== kOats);
check('不同模式 → 不同鍵', keyFor({ ...BASE, ocrText: OATS, mode: 'local' }) !== kOats);
check(
  '不同慢性病 → 不同鍵',
  keyFor({ ...BASE, ocrText: OATS, conditions: ['糖尿病'] }) !== kOats
);
// 性別刻意**不在**鍵裡：快取存的是中性文字，稱謂是在讀出結果的最後一步才插上去的。
// 所以同一張圖的快取可以同時服務先生／小姐／不指定，不必存三份。
// （稱謂本身的正確性由 check-honorific.ts 守住。）

console.log(`\n結果：${pass} 通過 / ${fail} 失敗`);
process.exit(fail > 0 ? 1 : 0);
