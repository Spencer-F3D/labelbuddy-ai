/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 離線 OCR 實測腳本（OCR smoke test）
 * ============================================================================
 * 【為什麼需要這支腳本】
 *   離線辨識的準確率與延遲**只能用真實圖片量測**，不能靠推論。
 *   交接文件已明文規定：不實測不能宣稱完成。
 *
 * 用法：
 *   npx tsx scripts/ocr-smoke.ts <圖片路徑> [更多圖片...]
 *   npm run ocr:smoke -- <圖片路徑>
 *
 * 輸出：每張圖的辨識欄位、數值、耗時，以及解析失敗的原因。
 */

import fs from 'fs';
import path from 'path';
import { recognizeNutritionFromImage, shutdownOcrWorker } from '../server/ocrLabel';

async function runOne(filePath: string): Promise<void> {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    console.log(`❌ 找不到檔案：${abs}`);
    return;
  }

  const base64 = fs.readFileSync(abs).toString('base64');
  const sizeKb = Math.round((base64.length * 3) / 4 / 1024);

  console.log('─'.repeat(72));
  console.log(`📷 ${path.basename(abs)}  (${sizeKb} KB)`);

  const t0 = Date.now();
  const result = await recognizeNutritionFromImage(base64);
  const elapsed = Date.now() - t0;

  if (!result.ok || !result.profile) {
    console.log(`❌ 未通過誠實門檻：只讀到 ${result.matchedFields} 個欄位`);
    console.log(`   原因：${result.error}`);
    console.log(`   耗時：${elapsed} ms`);
    if (process.env.SHOW_OCR_TEXT === '1') {
      console.log('   ── OCR 原始文字 ──');
      console.log(result.rawText);
    }
    return;
  }

  const p = result.profile;
  console.log(`✅ 讀到 ${result.matchedFields} 個核心欄位（耗時 ${elapsed} ms）`);
  console.log(`   品名    ：${p.foodName}`);
  console.log(`   鈉      ：${p.sodiumMg} 毫克`);
  console.log(`   糖      ：${p.sugarG} 公克`);
  console.log(`   碳水    ：${p.carbsG} 公克`);
  console.log(`   飽和脂肪：${p.saturatedFatG} 公克`);
  console.log(`   反式脂肪：${p.transFatG} 公克`);
  console.log(`   熱量    ：${p.calories} 大卡`);
  console.log(`   普林    ：${p.purineLevel}　磷酸鹽：${p.hasPhosphates}　高鉀：${p.hasHighPotassium}`);
  console.log(`   過敏原  ：${p.allergens.length > 0 ? p.allergens.join('、') : '（未偵測到）'}`);
  console.log(`   成分行數：${p.ingredients.length}`);

  if (process.env.SHOW_OCR_TEXT === '1') {
    console.log('   ── OCR 原始文字 ──');
    console.log(result.rawText);
  }
}

async function main(): Promise<void> {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.log('用法：npm run ocr:smoke -- <圖片路徑> [更多圖片...]');
    console.log('（設 SHOW_OCR_TEXT=1 可印出 OCR 原始文字）');
    process.exitCode = 1;
    return;
  }

  for (const f of files) {
    await runOne(f);
  }
  console.log('─'.repeat(72));
}

main()
  .catch((err) => {
    console.error('腳本執行失敗:', err);
    process.exitCode = 1;
  })
  // ⚠️ 一定要關掉 worker：tesseract 的 worker 執行緒會讓行程永遠不結束
  .finally(() => shutdownOcrWorker());
