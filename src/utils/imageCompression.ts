/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ============================================================================
 * 【前端圖片壓縮邏輯實作位置】
 * ============================================================================
 * 說明：
 * 本模組使用 HTML5 Canvas API，在長者透過手機相機拍照或選擇圖片後，
 * 於前端即時進行影像處理：
 * 1. 將圖片等比例縮放至長邊最大 1024px（保持原始寬高比不變形）。
 * 2. 透過 canvas.toDataURL('image/jpeg', 0.8) 導出品質為 0.8 的 JPEG 格式（Base64）。
 * 3. 效益：能將手機原圖由數十 MB 壓制在幾百 KB 內，極大減少網路傳輸量，
 *    並大幅加快 AI 辨識分析的回傳速度。
 * ============================================================================
 */

export interface CompressionResult {
  base64: string;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
}

export function compressImage(file: File | Blob, maxDimension: number = 1024, quality: number = 0.8): Promise<CompressionResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          let { width, height } = img;

          // 保持寬高比例，限制最大長邊為 maxDimension (1024px)
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          // 建立 HTML5 Canvas 畫布進行縮放繪製
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            return reject(new Error('無法取得 Canvas 2D 繪圖上下文'));
          }

          // 填充白色背景（防止 PNG 透明背景變黑）
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);

          // 將原圖繪製在縮小尺寸的畫布上
          ctx.drawImage(img, 0, 0, width, height);

          // 以品質 0.8 輸出為 JPEG 格式 Base64
          const base64 = canvas.toDataURL('image/jpeg', quality);

          // 計算壓縮後大小 (Base64 大約為 byte 數的 4/3)
          const head = 'data:image/jpeg;base64,';
          const compressedBytes = Math.round(((base64.length - head.length) * 3) / 4);

          resolve({
            base64,
            originalSize: file.size,
            compressedSize: compressedBytes,
            width,
            height,
          });
        } catch (err) {
          reject(err);
        }
      };

      img.onerror = () => {
        reject(new Error('圖片加載失敗，請檢查檔案格式是否正確。'));
      };

      img.src = e.target?.result as string;
    };

    reader.onerror = () => {
      reject(new Error('讀取檔案失敗，請再試一次。'));
    };

    reader.readAsDataURL(file);
  });
}
