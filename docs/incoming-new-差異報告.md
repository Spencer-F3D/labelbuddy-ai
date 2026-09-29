# `incoming-new/` 差異報告

> ✅ **2026-09-29 已結案**：本報告建議的 4 項設計**全部移植完成**
> （tesseract.js OCR、隱私優先、食育欄位內嵌結果頁、慢性病提醒模組），
> traineddata 資產也已在 `public/tessdata/`。
> 依報告結論第 13 點「其餘封存或刪除」，`incoming-new/` 快照**已刪除**。
> 本文件保留作為當時的決策紀錄。

> **目的**：判斷 `incoming-new/` 這包 7.5 MB 快照該怎麼處理（合併 / 封存 / 刪除）。
> **產出時間**：2026-09-26 22:0x
> **比對基準**：主線 `C:\Users\Spencer\Downloads\labelbuddy-ai`（git 基線 `f0cf7cf`）

---

## 一、三十秒結論

| 問題 | 答案 |
| --- | --- |
| 它比主線新還是舊？ | **舊**。快照 `09-24 20:44`，主線檔案 `09-25 ~ 09-26` |
| 它是完整的專案嗎？ | **不是**。缺 `src/`、`server/`、`scripts/` 三個目錄，且**引用了不存在的檔案** |
| 它可以直接取代主線嗎？ | **不行**。它是 Gemini 單供應商，而 Gemini 在中國澳門已被區域封鎖（交接文件 §5.1） |
| 它有主線沒有的東西嗎？ | **有，5 項**，其中 1 項**正好修掉交接文件列為「未解決」的安全問題** |
| 建議 | **不合併整包**。只移植 4 項設計，其餘廢棄 |

---

## 二、兩條技術路線的定位

兩者不是「新舊版本」，而是**兩條平行路線**，各有主線沒有的能力。

| | 主線（現役） | `incoming-new` |
| --- | --- | --- |
| 最後修改 | 2026-09-26 | 2026-09-24 20:44 |
| AI 供應商 | **Gemini + OpenRouter 雙供應商輪替** | Gemini 單一（`@google/genai` SDK） |
| 額度策略 | 快取 / 輪替 / 冷卻 / 額度預檢 | 無 |
| 離線辨識 | ❌ **用 base64 長度 mod 3 猜** | ✅ **tesseract.js 真 OCR** |
| 隱私 | 無機制，一律上傳 | ✅ **預設本機、需明確同意才上傳** |
| 食育教學 | 獨立的「食育學堂」分頁 | ✅ **教學欄位直接內嵌在結果頁** |
| 慢性病 | ✅ **12 項**（`conditions.ts`） | 無前端，條件由 request 傳入 |
| 營養百分比 | ✅ 後端 `normalizeNutrientFacts` 重算 | 無 |
| 簡繁後處理 | ✅ 約 130 字對照表 | 無 |
| 身分數 | **6 種** | 4 種（README 列出） |
| 定位文案 | 「銀髮安心食守護者」 | 「食育導航：看懂標籤，自己判斷」 |

**判斷**：主線在**工程成熟度**上全面勝出（多供應商、快取、12 項慢性病、6 身分）；
`incoming-new` 在**產品設計**上有兩塊主線沒做到的價值（離線 OCR、隱私優先）。

---

## 三、⚠️ 最關鍵發現：它解決了主線的「捏造答案」問題

主線的離線備援引擎（`server/smartNutritionAnalyzer.ts:42`）長這樣：

```ts
let isNoodles    = cleanBase64.length % 3 === 0;
let isSweetSnack = cleanBase64.length % 3 === 1;
```

**用 base64 字串長度 mod 3 挑一組假資料**，然後照樣回傳紅／黃／綠結論。
對一個健康判斷 App，這是最糟的失敗模式：**錯了不會報錯，只會很肯定地給錯答案。**

`incoming-new` 的 `server.ts` 裡明確寫著這個問題與解法（第 356–358 行）：

> 【為什麼要離線 OCR】原本本機模式只用固定樣本猜測，導致「每次答案都一樣」。
> 現在改用 tesseract.js 在本機辨識標籤文字，解析出真實的鈉/糖/脂肪等數字，
> 再交給規則引擎判斷 —— 完全離線、不外傳，答案也會隨真實產品而不同。

而且它多做了一件很重要的事 —— **讀不到就誠實說讀不到**：

```ts
// 讀唔到任何數字時，誠實告知並請使用者重拍 —— 絕不捏造答案
if (!profile) {
  return res.json({ success: true, data: {
    risk_level: 'yellow',
    warning_title: '🔍 看不清楚標籤數字',
    plain_summary: '不好意思，這張照片看不清楚標籤上的營養數字。請把手機拿近一點……',
    ocr_failed: true,
    analysis_mode: 'smart_nutrition_engine',
  }});
}
```

> **這一項的價值遠高於其他所有項目。** 它同時解掉「離線捏造」與「使用者無法分辨結果來源」兩個問題。

---

## 四、值得合併的 5 項（依價值排序）

### ★★★ 1. 離線 OCR 取代「用檔長猜」

| 項目 | 內容 |
| --- | --- |
| 需要新檔 | `server/ocrLabel.ts` — `recognizeNutritionFromImage(base64)` |
| 回傳 | `{ ok, profile: NutritionProfile, matchedFields: number }` |
| 資產 | 已在快照內：`incoming-new/assets/chi_tra.traineddata`（2.3 MB）+ `eng.traineddata`（5.2 MB） |
| 依賴 | `tesseract.js@^7`（快照的 `package.json` 有，主線沒有） |
| 附帶行為 | **OCR 失敗 → 回「看不清楚，請重拍」，不捏造** |

### ★★★ 2. 隱私優先架構（預設本機、需明確同意才上傳）

- 前端傳 `localOnly`（預設 `true`）→ 後端**強制走本機引擎**，完全不呼叫雲端
- 新增 `GET /api/privacy` 端點（**程式碼完整存在於快照**，可直接移植）
- 回應新增欄位：`data_handling: 'local_only' | 'cloud'`
- 意義：對長者健康資料是實質加分，也讓「照片有沒有離開手機」變成可驗證的事

### ★★ 3. 食育教學三欄位

`incoming-new` 的提示詞要求模型多回三個欄位，主線完全沒有：

| 欄位 | 回答的問題 | 範例（來自快照註解） |
| --- | --- | --- |
| `knowledge_point` | **為什麼** | 「一包泡麵的鈉常常就等於一整天的鹽分上限」 |
| `label_reading_tip` | **下次我怎麼看** | 具體的動作：先找「鈉」那一列 |
| `daily_limit_context` | 這個數字對**我**代表什麼 | 把產品數字對上此身分的每日參考值 |

> 這正好呼應專案名稱的「食育」定位。主線目前用獨立分頁做這件事，
> 但**在結果頁當下給一個可帶走的觀念**，學習效果比事後去分頁看更好。

### ★★ 4. `condition_reminders`（慢性病專屬提醒）

| 項目 | 內容 |
| --- | --- |
| 需要新檔 | `server/conditionAdvice.ts` — `buildConditionReminders(conditions: string[])` |
| 呼叫方式 | `buildConditionReminders(conditions)`，`conditions` 是**中文名稱陣列** |
| 相容性 | ✅ 與主線 12 項慢性病的名稱格式一致（同為中文字串比對） |

### ★ 5. `traineddata` 資產

`chi_tra` + `eng` 共 7.5 MB。**只有在做離線 OCR 時才有用**，不做就不要帶。

---

## 五、明確不要合併的部分

| 項目 | 為什麼不要 |
| --- | --- |
| `@google/genai` SDK、Gemini 單供應商 | **已在中國澳門被區域封鎖**（交接文件 §5.1）。帶回來等於自斷雲端辨識 |
| 它的 `vite.config.ts` | 主線用 `import.meta.dirname`（Vite 8 正確寫法），快照用 `__dirname`（會發棄用警告） |
| 它的 `tsconfig.json` | 主線有 `"strict": true` 且已 `exclude: ["incoming-new"]`；快照沒有 |
| 它的 `index.html` viewport | 快照 `maximum-scale=1.0, user-scalable=no` **禁止縮放**，對老花長者是無障礙問題；主線刻意開放（WCAG 1.4.4） |
| 它的 `.env` | 含另一把 Gemini 金鑰，主線已有自己的設定，不需採用 |
| 它的 `package.json` 其餘依賴 | `jimp` 只在 OCR 前處理時才需要；若不做影像前處理就不必帶 |

**可參考但不急**：快照的 `metadata.json` / `index.html` 描述文案是「多族群食育」定位，
比主線的「專為 60 歲以上長者設計」更貼近現況（已有 6 身分）。但**你已指示 README 不動**，
所以這項先擱置。

---

## 六、⚠️ 遺失的檔案（合併前必須知道）

快照的 `server.ts` 引用了兩個**不在快照裡**的模組：

```ts
import { recognizeNutritionFromImage } from './server/ocrLabel';       // ❌ 不存在
import { buildConditionReminders }     from './server/conditionAdvice'; // ❌ 不存在
```

**全機搜尋 `C:\Users\Spencer` 結果：0 筆。**

```
$ find /c/Users/Spencer -iname "ocrLabel*" -o -iname "conditionAdvice*"  → (無結果)
```

也就是說：

- ✅ **設計與呼叫介面完整可考**（從 `server.ts` 的呼叫點與註解完全還原得出來）
- ✅ **OCR 資產完整**（`traineddata` 都在）
- ❌ **實作必須重寫**，無法直接複製

這是**唯一真正的工作量**，其餘都是設定與介接。

---

## 七、慢性病處理（依你的指示：一律取最多）

| 檢查項 | 結果 |
| --- | --- |
| 主線慢性病數 | **12 項**（`src/data/conditions.ts` → `PHYSICAL_INDICATORS`） |
| `incoming-new` 慢性病數 | **沒有清單**（快照無 `src/`，條件由 request body 傳入） |
| 是否會變少 | **不會**。無衝突，主線 12 項直接保留 |
| 合併時的規則 | ① 12 項為**唯一來源**，不合併任何會變少的版本<br>② 新移植的 `condition_reminders` 必須**接上這 12 項**，不得自帶一份名單<br>③ 移植後要重跑關鍵字驗證（交接文件 §3.4：後端用中文子字串比對） |

---

## 八、建議的合併計劃

### 階段 1 — 離線辨識不再捏造（最高優先，安全問題）

1. 新增 `server/ocrLabel.ts`，實作 `recognizeNutritionFromImage(base64)`
   - 用 `tesseract.js` + `chi_tra.traineddata` / `eng.traineddata`
   - 從 OCR 文字解析「鈉 / 糖 / 脂肪 / 熱量」等欄位
   - 讀到足夠欄位 → `{ ok: true, profile, matchedFields }`
   - 讀不到 → `{ ok: false, matchedFields: 0 }`
2. `server.ts` 的離線路徑改成：先 OCR → 成功才跑規則引擎；失敗就回「請重拍」
3. **移除** `cleanBase64.length % 3` 的猜測邏輯（`smartNutritionAnalyzer.ts:42-43`）
4. 結果頁在 `ocr_failed` 時顯示「請重拍」引導卡，而不是紅黃綠結論

### 階段 2 — 隱私優先

5. 移植 `GET /api/privacy`（快照程式碼可直接用）
6. `/api/analyze-label` 接受 `localOnly`（預設 `true`），回應加 `data_handling`
7. 前端加一個「允許上傳雲端以提升準確度」的同意開關（預設關）

### 階段 3 — 食育教學欄位

8. `src/types.ts` 加 `knowledge_point` / `label_reading_tip` / `daily_limit_context`
9. `server.ts` 的 `SYSTEM_INSTRUCTION_SHARED` 加這三欄位的要求與字數上限
10. 結果頁第三層（`<details>`）或第二層顯示；**注意字級仍須 16–20px**（交接文件 §3.1）

### 階段 4 — 慢性病提醒

11. 新增 `server/conditionAdvice.ts`，`buildConditionReminders(conditions: string[])`
12. 接上主線 **12 項**名稱，並跑關鍵字驗證

### 收尾

13. `incoming-new/` 保留 `assets/` 的 traineddata（或移到 `server/assets/`），其餘**封存或刪除**
14. 每一步做完就 commit（現在有 git 了）

---

## 九、風險與注意事項

1. **`tesseract.js` 是 WASM，會增加安裝體積與首次載入時間**（需下載/載入 traineddata）。
   對「在超市貨架前」的使用情境，需實測 OCR 延遲是否可接受。
2. **OCR 對中文營養標示的準確率未知**，必須用真實標籤照片實測（交接文件 §3 的原則：不實測不能宣稱）。
3. **三條路徑都要套用**新欄位：雲端成功、**快取命中**、本機備援
   （交接文件 §3.3 已踩過這個坑，漏掉快取會回傳舊格式）。
4. **快取鍵必須含身分**（§3.5），新增欄位不改變這個規則。
5. 移植後 `npm run lint`（`tsc --noEmit`）必須維持退出碼 0；目前基線是乾淨的。

---

*本報告由 WorkBuddy 產生。若據此執行合併，完成後請一併更新 `docs/專案交接文件.md`。*
