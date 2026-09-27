/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// 為了讓長者或測試者即使手邊沒有實體食品，也能一鍵體驗「超市食品放大鏡」的功能，
// 我們提供三種真實超市常見食品的標籤範例（含真實食品營養成分表）。

export interface SampleFood {
  id: string;
  name: string;
  category: string;
  tag: string;
  tagColor: string;
  dataUrl: string;
}

// 產生清晰的模擬食品營養成分表圖片（透過 Canvas 繪製成 DataURL）
export function generateSampleLabelDataUrl(title: string, details: {
  serving: string;
  calories: string;
  sodium: string;
  sugar: string;
  carbs: string;
  allergens: string;
  ingredients: string;
}): string {
  if (typeof document === 'undefined') return '';

  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 700;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // 白色底卡
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, 600, 700);

  // 灰色邊框
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 4;
  ctx.strokeRect(16, 16, 568, 668);

  // 標題
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText(title, 36, 64);

  // 營養標示大字
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 38px sans-serif';
  ctx.fillText('Nutrition Facts 營養標示', 36, 120);

  // 粗黑分隔線
  ctx.fillRect(36, 136, 528, 8);

  ctx.font = '22px sans-serif';
  ctx.fillText(`每一份量：${details.serving}`, 36, 175);
  ctx.fillRect(36, 190, 528, 2);

  ctx.font = 'bold 24px sans-serif';
  ctx.fillText('每份熱量', 36, 225);
  ctx.fillText(details.calories, 420, 225);
  ctx.fillRect(36, 240, 528, 4);

  // 各項指標
  const rows = [
    { label: '碳水化合物 (Carbohydrate)', val: details.carbs, bold: false },
    { label: '  其中 糖 (Sugars)', val: details.sugar, bold: true },
    { label: '鈉 (Sodium)', val: details.sodium, bold: true },
  ];

  let y = 280;
  for (const r of rows) {
    ctx.font = r.bold ? 'bold 24px sans-serif' : '22px sans-serif';
    ctx.fillText(r.label, 36, y);
    ctx.fillText(r.val, 420, y);
    y += 18;
    ctx.fillRect(36, y, 528, 1);
    y += 36;
  }

  // 成分說明
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('主要成分：', 36, y + 10);
  ctx.font = '18px sans-serif';
  const ingLines = wrapText(ctx, details.ingredients, 528);
  let ingY = y + 40;
  for (const line of ingLines) {
    ctx.fillText(line, 36, ingY);
    ingY += 24;
  }

  // 過敏原警示
  ctx.fillStyle = '#B91C1C';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(`⚠️ 過敏原標示：${details.allergens}`, 36, ingY + 25);

  return canvas.toDataURL('image/jpeg', 0.9);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split('');
  const lines: string[] = [];
  let currentLine = '';

  for (let i = 0; i < words.length; i++) {
    const testLine = currentLine + words[i];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && i > 0) {
      lines.push(currentLine);
      currentLine = words[i];
    } else {
      currentLine = testLine;
    }
  }
  lines.push(currentLine);
  return lines;
}
