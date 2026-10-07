/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 對照表「孤兒鍵」靜態檢查（Orphan lookup-key check）
 * ============================================================================
 *
 * 【這支要抓的 bug】
 *   本專案已經踩過 **4 次**同一型的 bug：
 *     拿「一句中文」當對照表的鍵 → 有人改了那句中文 → 鍵對不上 →
 *     查表失敗 → **靜默退回中文**（英文介面冒出中文），或**靜默少一個警示**。
 *
 *   這種錯不會報錯、不會當機、TypeScript 也檢查不到 ——
 *   因為兩邊都只是字串。唯一的防線就是「改的時候記得改另一邊」，
 *   而人一定會忘。
 *
 * 【這支怎麼驗】
 *   把每一張對照表的鍵抽出來，回頭到「生產者檔案」裡搜尋那個字串。
 *   找不到 → 那個鍵已經沒有生產者了 → **孤兒鍵**，幾乎一定是漏改。
 *
 * ⚠️ 反過來（生產者改了、對照表沒改）也會被抓到：
 *     因為舊鍵會變成孤兒。
 *
 * 用法：npx tsx scripts/check-lookup-keys.ts
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
/**
 * 附加檢查（2026-10-07）需要**實際執行**對照表，不能只做字串掃描 ——
 * 因為 `EN_TO_CANONICAL` 是反轉產生的，原始碼裡沒有它的字面鍵。
 */
import {
  NUTRIENT_NAME_EN,
  NUTRIENT_NAME_SIMPLE,
  EN_TO_CANONICAL,
  canonicalNutrientName,
} from '../src/data/bilingual';

const ROOT = path.resolve('.');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

/**
 * 從 `const NAME ... = { ... }` 區塊抽出所有 `'key':` 的鍵。
 * 用大括號配對找區塊結尾，避免多行字串把解析弄亂。
 */
type KeyStyle = 'quoted' | 'chinese' | 'identifier';

function extractKeys(source: string, constName: string, style: KeyStyle): string[] {
  const startRe = new RegExp(
    String.raw`(?:export\s+)?const\s+${constName}\s*(?::[^=]+)?=\s*\{`
  );
  const m = startRe.exec(source);
  if (!m) return [];

  let depth = 0;
  let i = m.index + m[0].length - 1; // 指向開頭的 '{'
  const start = i;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  const block = source.slice(start, i + 1);

  const keys: string[] = [];

  /**
   * ⚠️ 只抓「行首（可含縮排）的鍵」—— 那才是鍵，值裡的字串不會在行首。
   *    三種寫法依表而異，由呼叫端指定 style，避免互相誤抓：
   *      quoted     '有引號的鍵': ...
   *      chinese    中文識別字: ...     （不寫引號）
   *      identifier asciiId: ...        （身分／疾病 id）
   */
  const PATTERNS: Record<KeyStyle, RegExp> = {
    quoted: /^\s*'((?:[^'\\]|\\.)*)'\s*:/gm,
    chinese: /^\s*([\u4e00-\u9fff]+)\s*:/gm,
    identifier: /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/gm,
  };
  const re = PATTERNS[style];
  let k: RegExpExecArray | null;
  while ((k = re.exec(block)) !== null) {
    keys.push(style === 'quoted' ? k[1].replace(/\\(['\\])/g, '$1') : k[1]);
  }

  return [...new Set(keys)];
}

interface TableSpec {
  /** 對照表名稱（報告用） */
  name: string;
  /** 對照表所在的檔案 */
  file: string;
  /** 生產者檔案：鍵應該在這些檔案裡被產生出來 */
  producers: string[];
  /** 鍵的寫法 */
  style: KeyStyle;
  /** 說明 */
  note: string;
}

const TABLES: TableSpec[] = [
  {
    name: 'LOCAL_TEXT_EN',
    style: 'quoted',
    file: 'server/localEngineEn.ts',
    producers: [
      'server/smartNutritionAnalyzer.ts',
      'server/smartIndicatorAnalyzer.ts',
      'server/smartHealthQA.ts',
      'server/conditionAdvice.ts',
      'server/localEngineEn.ts',
    ],
    note: '本機引擎的英文對照（改引擎中文就要同步改這裡）',
  },
  {
    name: 'FOOD_NAME_EN',
    style: 'quoted',
    file: 'server/localEngineEn.ts',
    producers: ['server/localEngineEn.ts', 'src/data/demoLabels.ts', 'server/smartNutritionAnalyzer.ts'],
    note: '示範食品名稱的英文對照',
  },
  {
    name: 'STATIC_EN',
    style: 'quoted',
    file: 'server/smartIndicatorAnalyzer.ts',
    producers: ['server/smartIndicatorAnalyzer.ts'],
    note: '生理指標引擎的英文對照',
  },
  {
    name: 'LOCAL_KNOWLEDGE_POINTS',
    style: 'chinese',
    file: 'server/smartNutritionAnalyzer.ts',
    producers: ['src/data/learnerProfiles.ts', 'server/smartNutritionAnalyzer.ts'],
    note: '食育教學點（鍵是 canonical 營養素名稱）',
  },
  {
    name: 'TARGET_TEXT_EN',
    style: 'quoted',
    file: 'src/data/bilingualContent.ts',
    producers: ['src/data/learnerProfiles.ts'],
    note: '身分每日參考值的英文對照',
  },
  {
    name: 'TARGET_NOTE_EN',
    style: 'quoted',
    file: 'src/data/bilingualContent.ts',
    producers: ['src/data/learnerProfiles.ts'],
    note: '身分參考值備註的英文對照',
  },
  {
    name: 'CONDITION_DESCRIPTION_EN',
    style: 'identifier',
    file: 'src/data/bilingualContent.ts',
    producers: ['src/data/conditions.ts'],
    note: '慢性病說明的英文對照',
  },
  {
    name: 'NUTRIENT_NAME_EN',
    style: 'chinese',
    file: 'src/data/bilingual.ts',
    producers: ['src/data/learnerProfiles.ts'],
    note: '營養素名稱的英文對照（鍵必須涵蓋所有 numericLimits 的鍵）',
  },
  {
    name: 'UNIT_EN',
    style: 'chinese',
    file: 'src/data/bilingual.ts',
    producers: ['src/data/learnerProfiles.ts', 'src/data/conditions.ts'],
    note: '單位的英文對照',
  },
];

let pass = 0;
let fail = 0;
const allOrphans: Array<{ table: string; key: string }> = [];

console.log('=== 對照表孤兒鍵檢查 ===\n');

for (const spec of TABLES) {
  let source: string;
  try {
    source = read(spec.file);
  } catch {
    console.log(`⚠️  找不到 ${spec.file}，略過 ${spec.name}`);
    continue;
  }

  const keys = extractKeys(source, spec.name, spec.style);
  if (keys.length === 0) {
    console.log(`⚠️  ${spec.name}：抽不到鍵（表名或格式變了嗎？）`);
    fail++;
    continue;
  }

  const producerText = spec.producers
    .map((p) => {
      try {
        return read(p);
      } catch {
        return '';
      }
    })
    .join('\n');

  const orphans = keys.filter((k) => {
    // 用「去掉引號與空白後的核心片段」比對，避免排版差異造成假警報
    const probe = k.replace(/[「」『』"'\s]/g, '');
    if (!probe) return false;
    const hay = producerText.replace(/[「」『』"'\s]/g, '');
    return !hay.includes(probe);
  });

  if (orphans.length === 0) {
    console.log(`✅ ${spec.name}（${keys.length} 個鍵）— 全部都有生產者`);
    pass++;
  } else {
    console.log(`❌ ${spec.name}（${keys.length} 個鍵）— ${orphans.length} 個孤兒鍵`);
    console.log(`   ${spec.note}`);
    for (const o of orphans) {
      console.log(`   • ${o.slice(0, 70)}${o.length > 70 ? '…' : ''}`);
      allOrphans.push({ table: spec.name, key: o });
    }
    fail++;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 * 附加檢查：`EN_TO_CANONICAL` 的推導是否真的可用（2026-10-07 新增）
 * --------------------------------------------------------------------------
 * 【為什麼不能只靠上面的「孤兒鍵」檢查】
 *   `EN_TO_CANONICAL` 是由 `NUTRIENT_NAME_EN` **反轉產生**的，
 *   原始碼裡不會出現 `sodium: '鈉'` 這種字面鍵 ——
 *   所以孤兒鍵檢查對它沒有意義（它不可能漂移）。
 *
 *   真正會壞的是「推導本身」：例如有人把某個英文名改成重複的值，
 *   `Object.fromEntries` 會**靜默覆蓋**，於是某個 canonical 名稱永遠還原不回來。
 *   而那個後果是本專案最怕的形狀：**不報錯，只是少一個警示**。
 *
 *   → 所以這裡改用「行為斷言」：拿英文名去還原，必須回到正確的 canonical。
 * ══════════════════════════════════════════════════════════════════════════ */
console.log('\n' + '='.repeat(60));
console.log('附加檢查：EN_TO_CANONICAL 推導');
console.log('='.repeat(60));

{
  const enKeys = Object.keys(NUTRIENT_NAME_EN);
  const reverseKeys = Object.keys(EN_TO_CANONICAL);

  // ① 反轉後不得少於原表 —— 少於就代表有兩個 canonical 共用同一個英文名（靜默覆蓋）
  if (reverseKeys.length !== enKeys.length) {
    fail++;
    console.log(
      `❌ EN_TO_CANONICAL 只有 ${reverseKeys.length} 個鍵，` +
        `但 NUTRIENT_NAME_EN 有 ${enKeys.length} 個 —— 有英文名重複，反轉時被靜默覆蓋。`
    );
  } else {
    console.log(`✅ 反轉無碰撞（${reverseKeys.length} 個鍵）`);
    pass++;
  }

  // ② 行為斷言：每個 canonical 都要能從「英文名」還原回來
  const bad: string[] = [];
  for (const canonical of enKeys) {
    const en = NUTRIENT_NAME_EN[canonical];
    if (canonicalNutrientName(en) !== canonical) {
      bad.push(`${en} → ${canonicalNutrientName(en)}（應為 ${canonical}）`);
    }
    // 大小寫都要吃得下（模型可能寫 'sodium' 或 'SODIUM'）
    if (canonicalNutrientName(en.toLowerCase()) !== canonical) {
      bad.push(`${en.toLowerCase()} → ${canonicalNutrientName(en.toLowerCase())}（應為 ${canonical}）`);
    }
  }
  // ③ 中文簡化名的舊行為不能壞
  for (const canonical of Object.keys(NUTRIENT_NAME_SIMPLE)) {
    const simple = NUTRIENT_NAME_SIMPLE[canonical];
    if (canonicalNutrientName(simple) !== canonical) {
      bad.push(`${simple} → ${canonicalNutrientName(simple)}（應為 ${canonical}）`);
    }
  }

  if (bad.length === 0) {
    console.log('✅ 英文名與中文簡化名都能正確還原成 canonical');
    pass++;
  } else {
    fail++;
    console.log(`❌ ${bad.length} 個名稱還原失敗（會導致該營養素被靜默略過）：`);
    for (const b of bad) console.log(`   • ${b}`);
  }
}

console.log('\n' + '='.repeat(60));
// ⚠️ 用「項」不是「張表」—— 後面的附加檢查不是對照表，混在一起講會誤導
console.log(`結果：${pass} 項通過 / ${fail} 項有問題`);
if (allOrphans.length > 0) {
  console.log(
    `\n⚠️ 共 ${allOrphans.length} 個孤兒鍵。\n` +
      `   孤兒鍵 = 對照表還留著、但生產者已經不產生那個字串了。\n` +
      `   幾乎一定是「改了中文卻忘了改對照表」—— 後果是英文模式靜默回中文。`
  );
}
process.exit(fail > 0 ? 1 : 0);
