# AI_COLLAB.md — 多個 AI 一起改這個專案時的溝通板

> **這個檔案是給「同時在這個專案上工作的 AI」看的。**
> 建立於 2026-10-04，起因：使用者說「我一會會加一個 AI 一起改這個檔，
> 你可以建立一個位置讓你 2 個溝通」。
>
> 人類使用者（Spencer）不需要看這裡的細節，他的需求會在對話裡直接給。

---

## 0. 怎麼用這個檔案

1. **動手前先讀**：第 1 節（硬規則）、第 3 節（別人已經試過、失敗或已有結論的事）。
2. **動手後要寫**：在第 4 節「訊息」**追加**一則，格式見下方。
3. **只追加、不覆寫**別人的訊息（除非是修正自己上一則的事實錯誤）。
4. **改檔前先看第 2 節的「目前狀態」**，確認你改的基準是新的。

訊息格式：

```
### [YYYY-MM-DD HH:MM] <你的名字>
- 動了什麼：（檔案路徑 + 一句話）
- 為什麼：（根因，不要只寫「優化」）
- 驗證方式：（跑了什麼指令、看到什麼數字）
- 還沒做／有疑問：（留給下一個人的線索）
```

---

## 1. 硬規則（違反會害到人，不是風格問題）

| # | 規則 | 為什麼 |
| --- | --- | --- |
| 1 | **顏色（紅／黃／綠）一律以規則引擎為準，AI 只提供文字** | 實測血壓 158/96 ＋ 空腹血糖 8.4，規則判 red、雲端 AI 判 yellow。該紅卻報黃比誤報更危險 |
| 2 | **性別絕不可影響紅黃綠** | 稱謂機制已整套移除，但 `ADDRESS_RULE` 必須保留 |
| 3 | **沒讀到足夠資料就不准給結論** | 寧可說「看不清楚請重拍」，也不要用預設值湊出「很適合您」 |
| 4 | **隱私承諾要逐模式陳述** | 「照片永遠不離開裝置」已不是通則。`cloud_image` 會上傳、`cloud_text` 只送文字、`local_only` 完全不連網 |
| 5 | **不准用 `shell: true` 跑 `.bat`** | Node 18.20.2+ 的 CVE-2024-27980 修正會回 EINVAL。要 `cmd.exe /d /s /c` |
| 6 | **交付前必須實際驗證** | 本專案反覆吃過「說了完成但其實沒過」的虧。至少要 tsc ＋ 相關檢查腳本 |
| 7 | **動使用者的檔案前先問** | 特別是桌面上的檔案。刪檔要先列出清單 |

---

## 2. 目前狀態（**每次改完請更新這一節**）

- 最後更新：2026-10-04 13:30
- 最新 commit：`7896340`
- 線上版本：`https://app.labelbuddy-ai.workers.dev`（bundle `index-BKlADno0.js`）
- 桌面 APK：`營養放大鏡_YYYYMMDD.apk`（`npm run apk` 會**自動刪除舊的**，只刪這個命名模式）
- 測試指令：`npm run check` 系列請看 `package.json`；常用：
  - `node scripts/check-layout-senior.mjs <url>` — 版面（穿出／裁切／孤行）
  - `node scripts/check-ocr-langs.mjs <url> [en|zh]` — OCR 語言模型比較
  - `node scripts/check-nonfood.mjs <url>` — 非食物圖片是否被誤判
  - `node scripts/check-mode-chip.mjs <url>` — 右上角模式標籤
  - `node scripts/check-tts-speak.mjs <url>` — 語音語言配對與事件

### 使用者的原始需求（會變，以對話為準）
比賽：2026 全球青少年人工智能未來創新競賽（澳門中學生賽區），**截止 2026-10-09**，
所有材料**只接受英文**。App 是「AI 食育學習平台」，7 種學習者身分、三種分析模式。

---

## 3. 已經有結論的事（**動手前先讀，能省你幾小時**）

### 3.1 本機 OCR（tesseract.js）
- ★ **診斷鐵則：要測 App 真正在跑的那份程式碼。**
  用探針頁載入 tesseract.js 的 UMD 版會繞過 App 的 ESM 路徑 →
  「探針說可以、使用者說不行」。正確做法是跑 Vite dev server，
  在頁面裡 `await import('/src/ocr/ocrBrowser.ts')`。
- 語言模型**兩輪各用一組**：`chi_tra+eng`（英文／中英混排）→ `chi_tra`（中文救援）。
  實測：純 chi_tra 會**弄丟所有小數點**（6.80 → 680）；加上 eng 後正確，
  但 eng 會讓中文的「公克」讀成「公交」→ 所以需要兩輪。
- ⚠️ **不要換 `tessdata_best`**。實測退步：英文輸出逐字相同、中文欄位較少（5→4）、
  慢 2.35 倍、大小 4.4 倍，而且需要強制 SIMD 核心（會犧牲舊手機）。
- 商標／圖案被當成中文字猜的問題**換語言模型救不了**，只有 ML Kit 那類
  有區域偵測的引擎能解（但 ML Kit 只支援 Android）。
- 引擎失敗 vs 照片問題要分開講（`errorKind`）。引擎失敗**不要叫使用者重拍**。

### 3.2 語音（TTS）
- ★ **APK 是 Capacitor 的 Android WebView，不實作 Web Speech 合成 API**。
  舊版只有 Web Speech → 每次靜默回傳 false，不拋錯、畫面無異狀。
  → 原生走 `@capacitor-community/text-to-speech`。
- **只裝 npm 套件不算生效**，要驗三件事：① `capacitor.build.gradle` 有相依
  ② APK 內 `capacitor.plugins.json` 有插件 ③ 合併後的 AndroidManifest 有
  `<queries><intent><action TTS_SERVICE>`（Android 11+ 套件可見性，少了它
  引擎找不到**且不會報錯**）。
- **發音語言由「要唸的文字」決定，不是介面語言**（`resolveLanguageForText`）：
  含中日韓 → 中文語音；純拉丁 → 英文語音。
- 手機只說普通話 = 該裝置沒裝粵語語音，Android 會退回預設語言。
  設定頁已會主動檢查並用 `isLanguageSupported` 告訴使用者。
- 設定頁試聽用**該語言自己的示範句** ＋ `forceLanguage: true`
  （否則中文示範句會被改寫成中文語音，按 English 卻聽到粵語）。

### 3.3 AI 供應商
- 三家輪替：`nvidia` / `gemini` / `openrouter`。排序＝使用率低者優先。
- ★ **NIM 是文字模型，收不下圖片** → 含圖片的請求必須跳過它
  （`orderedProviders(hasClientKey, hasImage)`）。
- NIM 加速關鍵：`reasoning_effort: 'low'`（6.67s → 2.71s）。
  `z-ai/glm-5.3-flash` 要 33 秒，已從鏈上移除。
- **Gemini 在中國澳門被區域封鎖**（已定案，換帳號無用，不要重查）。

### 3.4 版面
- 長者字級下標題列只需約 9 個全形字的餘裕，塞長文字會溢出。
- 溢出**設在容器層級**（`[overflow-wrap:anywhere]` 是繼承屬性）；
  逐元素補 `break-all` 註定會漏（已經漏過一次）。
- 中文的孤行要用 `text-wrap: balance`，**`pretty` 對中文無效**
  （它是為「詞」設計的，中文沒有詞邊界）。

---

## 4. 訊息（追加式，最新在下面）

### [2026-10-04 13:30] 墨影（WorkBuddy）
- **動了什麼**：
  - `server/labelParser.ts` — 新增「食品情境」守門（`FOOD_CONTEXT`）
  - `src/utils/tts.ts` — `forceLanguage` 選項、`isLanguageAvailable()`、
    `listAvailableLanguages()`、`resolveLanguageForText()`
  - `src/components/TtsSettingsSection.tsx` — 每個語言自己的示範句、
    原生語言支援檢查與提示
  - `scripts/check-nonfood.mjs` — 新工具（非食物圖片誤判檢測）
- **為什麼**：
  1. 使用者回報「本機模式會把紙說成可以食用」。**我重現不出來** ——
     實測 9 種非食物 × 2 種本機模式**全部正確拒絕**。
     但現有門檻（3 欄位 ＋ 有鈉或糖）確實不夠硬：只要 OCR 把不相干的文字
     誤讀成「鈉 800 毫克」，就會通過 → 規則引擎看到數值正常的資料 → 綠燈。
     → 加第二道門檻：文字裡必須出現食品情境詞。
  2. 使用者回報「網頁的英文說的話仍是粵語」→ 設定頁試聽唸的是**介面語言**
     那句示範句，中文介面按 English 時唸的還是中文。
  3. 使用者回報「有的手機只說普通話」→ 該裝置沒裝粵語語音。
- **驗證方式**：
  - `node scripts/check-nonfood.mjs http://127.0.0.1:3100`
    → 兩種模式 × 9 情境，全部 `✅ 沒有任何非食物被判成「可以食用」`
  - `tsc --noEmit` 通過
  - ⚠️ 我**還沒跑** `check:layout` 與 `check-tts-speak`
- **還沒做／有疑問**：
  - ★ **非食物誤判我重現不出來**。如果使用者能提供那張「紙」的照片
    或開發者面板的「上次標籤原文」，就能確定是哪一種情況。
  - `src/App.tsx` 的 `cloudAllowed` 是**宣告了但沒用到的死變數**，尚未清掉。
  - `relatedCardId` 在題庫裡是**死欄位**（型別有、每題都設，沒有元件讀它）。

---

## 5. 相關文件（不要重複造輪子）

| 檔案 | 內容 |
| --- | --- |
| `.workbuddy-ai/memory/MEMORY.md` | 專案長期規則與踩坑（**最重要**） |
| `.workbuddy-ai/memory/YYYY-MM-DD.md` | 逐日工作日誌，含實測數據 |
| `ARCHITECTURE.md` | 隱私架構、資料流（若存在） |
| `UI_RULES.md` | 字級與版面規則（若存在） |
| `scripts/` | 各種檢查腳本，**改完請跑對應的** |
