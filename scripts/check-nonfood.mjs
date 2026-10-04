/**
 * 測試「非食物」的圖片在**本機模式**下會得到什麼結論（2026-10-04）。
 *
 * 【為什麼要這支】
 *   使用者回報：「本機模式時會把不是食物但沒有任何成分的東西（如紙）也說可以食用」
 *
 *   這是**安全教育 App 最不該犯的錯**：使用者拿一張紙去掃，
 *   App 說「可以安心食用」—— 如果他當真，那是會出事的。
 *
 *   程式碼上看，伺服器有一道守門：
 *     if (!ocr.ok || !ocr.profile) → buildOcrFailedResult（黃燈、「看不清楚」）
 *   而 ocr.ok 要求「至少 3 個欄位且必須有鈉或糖」。
 *   所以理論上不該發生 —— 但**理論不等於實測**。
 *   這支用多種「絕對不是食物」的文字去打真實的 API，看實際回什麼。
 *
 * 用法：node scripts/check-nonfood.mjs http://127.0.0.1:3100
 */

const BASE = process.argv[2] ?? 'http://127.0.0.1:3100';

/** 各種「絕對不是食品標籤」的 OCR 文字（模擬本機 OCR 對這些東西的輸出） */
const CASES = [
  { name: '白紙／空白', text: '' },
  { name: '空白紙上的零星字', text: '備 註 頁 次 第 3 頁' },
  { name: 'A4 講義', text: '2026 全球青少年人工智能未來創新競賽 參賽者手冊 第一章 競賽宗旨 本競賽旨在鼓勵學生運用人工智能技術解決真實問題' },
  { name: '名片', text: 'LabelBuddy Limited 陳大文 產品經理 電話 6612 3456 電郵 info@example.com' },
  { name: '發票／收據', text: '發票號碼 AB12345678 日期 2026-10-04 數量 2 單價 15.00 總計 30.00 謝謝惠顧' },
  { name: '書本內頁', text: '第三章 營養學概論 本章將介紹人體所需的六大營養素 包括碳水化合物 蛋白質 脂肪 維生素 礦物質與水' },
  { name: '產品包裝但無營養表', text: '洗髮精 深層滋潤配方 500 毫升 使用方法 取適量塗抹於濕髮上 按摩後以清水沖淨' },
  { name: '只有數字的表格（無營養字樣）', text: '項目 數量 金額 A 12 340 B 25 780 C 7 120 合計 1240' },
  { name: '牆壁／木紋（OCR 亂碼）', text: '『 〝 一 乙 二 丁 厂 匚 卜 人 儿 兀 匕 几 卩 刀 力 勹 匕 匚 匸' },
];

/**
 * ★★ 2026-10-04：**兩種本機模式都要測**。
 *   原本只測 local_only，全部正確 → 證明那條路是安全的。
 *   但使用者說「會說可以食用」，所以嫌疑落在另一條：
 *   `cloud_text`（只送文字）—— 本機 OCR 讀出亂碼後，**把亂碼文字丟給雲端 AI**。
 *   雲端 AI 被要求「分析這份標籤」，面對一段沒有意義的文字，
 *   有可能**編出一份食品**然後說可以吃。
 */
const MODES = [
  { key: false, label: '只送文字(雲端)' },
  { key: true, label: '只在本機' },
];

let bad = 0;
for (const mode of MODES) {
  console.log(`\n══════ ${mode.label} ══════`);
  console.log('情境                              風險     OCR失敗  欄位  標題');
  console.log('─'.repeat(96));
  for (const c of CASES) {
  try {
    const res = await fetch(`${BASE}/api/analyze-label`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ocrText: c.text,
        language: 'zh-TW',
        learnerProfileId: 'senior',
        conditions: [],
        localOnly: mode.key,
      }),
    });
    const json = await res.json();
    const d = json?.data ?? {};
    /**
     * ★ 判定「有沒有說可以吃」：綠燈，或標題／摘要出現正向字眼。
     *   這裡刻意用寬鬆的比對 —— 只要有一句像「可以吃」，就是事故。
     */
    /**
     * ⚠️ 2026-10-04 修正檢查腳本自己的誤判：
     *   原本只比對「適合」二字 → 但**正確拒絕**的文案裡也有「適合」：
     *     「…才能幫您分析是否【適合】長者食用」
     *   於是「📷 這不是食物標籤」被判成「說了可以食用」——
     *   **是我的量測錯了，不是被測物錯了。**
     *   → 先排除「明確拒絕」的標題，再判斷是否有正向字眼。
     */
    const rejected = /不是食物|看不清楚|無法判斷|不能判斷|重拍|not a food|can't read|cannot read/i.test(
      `${d.warning_title} ${d.plain_summary}`
    );
    const positive =
      !rejected &&
      /綠燈|可以放心|安心吃|很適合您|放心吃|沒有太鹹|safe to eat|suitable for you/i.test(
        `${d.warning_title} ${d.plain_summary}`
      );
    const isGreen = d.risk_level === 'green';
    const flagged = positive || isGreen;
    if (flagged) bad += 1;
    console.log(
        `${c.name.padEnd(33)}${String(d.risk_level).padEnd(8)}` +
          `${String(d.ocr_failed ?? false).padEnd(9)}${String(d.ocr_matched_fields ?? '-').padEnd(6)}` +
          `${(flagged ? '❌ ' : '✅ ') + String(d.warning_title ?? '').slice(0, 30)}`
      );
      if (flagged) {
        console.log(`     ↳ mode=${d.analysis_mode} provider=${d.ai_provider ?? '—'}`);
        console.log(`     ↳ ${String(d.plain_summary ?? '').slice(0, 90)}`);
      }
    } catch (e) {
      console.log(`${c.name.padEnd(33)}請求失敗: ${String(e.message).slice(0, 40)}`);
    }
  }
}

console.log('');
console.log(bad === 0 ? '✅ 沒有任何非食物被判成「可以食用」' : `❌ 有 ${bad} 個案例說了「可以食用」—— 這是必須修的安全問題`);
