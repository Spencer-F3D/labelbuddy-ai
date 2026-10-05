/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * ZIP 讀取工具（APK 就是一個 ZIP）— 2026-10-05
 * ============================================================================
 *
 * 【為什麼自己實作，不呼叫 `unzip`／`jar`】
 *   - `unzip` 在 Windows 上不是內建指令，使用者雙擊 .bat 時不一定有。
 *   - `jar` 只能列出或解到磁碟，不能把內容印到 stdout。
 *   → 自己讀 ZIP 的 central directory 最可靠，而且沒有額外依賴。
 *
 * APK 的 assets 用 deflate 壓縮，所以要 `inflateRawSync`。
 *
 * ★★ 為什麼抽成共用模組（2026-10-05）
 *   原本 `readZipEntry()` 只存在於 `check-consistency.ts`。
 *   現在 `build-apk.mjs` 也需要讀 APK 內容（判斷 gradle 是否真的重打包），
 *   所以抽出來共用。
 *   ⚠️ **絕對不要在第二個檔案裡「再寫一份」** ——
 *      本專案已經吃過「兩個 AI 各寫一套一致性檢查」的虧
 *      （見 `ship-all.mjs` 檔頭：重複實作只會製造新的不一致）。
 */

import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

/**
 * 從 ZIP（APK 就是 ZIP）取出單一檔案的內容。
 *
 * @param {string} zipPath ZIP／APK 的絕對路徑
 * @param {string} entryName 條目名稱（用 `/` 分隔，例如 `assets/public/index.html`）
 * @returns {Buffer | null} 檔案內容；找不到或壓縮法不支援時回 `null`
 */
export function readZipEntry(zipPath, entryName) {
  const buf = readFileSync(zipPath);

  // 1. 從檔尾往前找 EOCD（End Of Central Directory，簽章 0x06054b50）
  //    ⚠️ ZIP 註解最長 65535 bytes，所以往回最多找這麼多。
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  const cdCount = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16); // central directory 的起始位移

  // 2. 走訪 central directory，找目標檔名
  for (let n = 0; n < cdCount; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) return null;
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);

    if (name === entryName) {
      // 3. 讀 local header 才能算出資料真正的起點（local 的 extra 長度可能不同）
      if (buf.readUInt32LE(localOffset) !== 0x04034b50) return null;
      const lNameLen = buf.readUInt16LE(localOffset + 26);
      const lExtraLen = buf.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + lNameLen + lExtraLen;
      const data = buf.subarray(dataStart, dataStart + compressedSize);
      if (method === 0) return Buffer.from(data); // stored
      if (method === 8) return inflateRawSync(data); // deflate
      return null; // 其他壓縮法（APK 的 assets 不會用到）
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

/**
 * 從一段 HTML 取出建置指紋。
 *
 * ★ 為什麼放在這裡而不是各檔案自己 `match()`：
 *   指紋的 meta 名稱由 `build-stamp.mjs` 定義（單一來源）。
 *   用同一個函式解析，才不會出現「一邊找 `x-build-id`、一邊找舊名稱」的情況。
 *
 * @param {string} html
 * @param {string} metaName `<meta name="…">` 的名稱（應傳 `BUILD_ID_META_NAME`）
 * @returns {string | null}
 */
export function readBuildIdFromHtml(html, metaName) {
  const m = html.match(new RegExp(`<meta\\s+name="${metaName}"\\s+content="([^"]+)"`, 'i'));
  return m ? m[1] : null;
}
