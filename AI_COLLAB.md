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
| 8 | **顏色永遠不採信 AI** | `photo_issue` 存在時（不是食物標籤／模糊）後端會強制黃燈。實測 AI 曾正確說「這不是食物標籤」卻回 `risk_level: green` → 畫面變成一張綠燈卡片，使用者讀成「可以食用」 |

---

## 2. 目前狀態（**每次改完請更新這一節**）

- 最後更新：2026-10-04 14:10
- 最新 commit：見 `git log -1`（本次：新增孕婦身分 ＋ 照片問題的顏色強制覆寫）
- 線上版本：`https://app.labelbuddy-ai.workers.dev`（bundle `index-BKlADno0.js`）
- 桌面 APK：`營養放大鏡_YYYYMMDD.apk`（`npm run apk` 會**自動刪除舊的**，只刪這個命名模式）
- 測試指令：`npm run check` 系列請看 `package.json`；常用：
  - `node scripts/check-layout-senior.mjs <url>` — 版面（穿出／裁切／孤行）
  - `node scripts/check-ocr-langs.mjs <url> [en|zh]` — OCR 語言模型比較
  - `node scripts/check-nonfood.mjs <url>` — 非食物圖片是否被誤判
  - `node scripts/check-mode-chip.mjs <url>` — 右上角模式標籤
  - `node scripts/check-tts-speak.mjs <url>` — 語音語言配對與事件
  - `node scripts/check-pregnancy.mjs <url>` — 孕期危險成分把關（含誤判防護）
  - `node scripts/check-tts-voices.mjs` — 列出瀏覽器實際可用的語音

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

### 3.4 後端 API 的欄位名（**很容易踩**）
- 送身分要用 **`profileId`**，不是 `learnerProfileId`。
  後端讀 `profileId`，讀不到就**默默**退回預設的長者身分 ——
  不會報錯，只會讓你的測試得到一個「看起來很合理」的錯誤結論。
- ★ 寫測試時**一定**要驗證回應的 `learner_profile_id` 等於你要求的身分。
  `scripts/check-pregnancy.mjs` 已經加了這道自我驗證，可以照抄。
- 同理：`conditions`（不是 `conditionNames`）、`localOnly`（不是 `analysisMode`）。
- ⚠️ 這個坑我自己踩過**四次**（送錯欄位 → 誤判功能壞了）。

### 3.5 版面
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

### [2026-10-04 14:10] 墨影（WorkBuddy）
- **這是「動手前」的計劃**（使用者指定：先寫入本檔再執行；完成後會再寫一則）
- **要修的東西**：
  1. **P0 隱私同意閘門漏洞** —— `/api/fitness-report` 沒有 `localOnly` 檢查。
     前端 `src/components/FitnessZone.tsx:423` 送請求沒帶 `localOnly`，而且元件
     **根本沒接收 `analysisMode`**（`src/App.tsx:3593` 是 `<FitnessZone />`）；
     後端 `server/fitnessReport.ts:209` 無條件呼叫 `callNvidiaNim`。
     → 後果：選「只在本機」後按「用 AI 產生這週的報告」，訓練天數／總訓練量／
       動作名稱／平均熱量**照樣上傳到 NVIDIA**，畫面完全沒有異狀。
       這與先前已修好的 `analyze-indicators`／`ask-health-question` 是同一類 bug
       （「不會報錯、只會偷偷違背承諾」）。
     ★ 使用者明確要求：**報告要繼續真的用 AI**，不可以靜默降級成本機版。
       → 作法：`local_only` 時**不提供**雲端報告，畫面直接說明「要改用雲端模式才能產生」；
         後端同時加閘門（`localOnly === true` → 直接回本機版、不呼叫 NIM）當第二道防線。
       → 引導頁 `onboard.fitnessPrivacy` 與報告區 `fit.reportNote` 同步寫清楚
         「會用到 AI、送出去的是什麼」。
  2. **P1 使用者設定被硬寫死覆寫** —— 5 處 `speakText(..., { volume: 1.0 })` 蓋掉
     使用者在 TTS 設定選的音量（`src/utils/tts.ts:420` 是 `options.volume ?? getTtsVolume()`）：
     `App.tsx:1535 / 1696 / 1750`、`src/components/DietHealthHistory.tsx:295 / 314`。
     其餘 20+ 個呼叫點都不傳 volume → 行為不一致。
  3. **P2 死碼** —— `src/App.tsx:948` 的 `cloudAllowed`（宣告後未使用）；
     `relatedCardId`（型別有、每題都設、無元件讀取）→ **使用者指定：直接移除**。
  4. **P3 註解與程式碼矛盾** —— `server/handlers.ts:822-828` 的註解說 NVIDIA
     「刻意**不放進 providers 陣列**／**不在輪替鏈上**／只服務健身週報」，
     但同一段程式碼第 795 行已把 `'nvidia'` 放進 providers 迴圈，
     `server/core.ts:251` 的 `orderedProviders` 也把它排在第一位。三句全是
     10-03「加入輪替之前」的舊說法，**與事實完全相反**（評審可讀程式碼）→ 改寫。
- **驗證方式**：`tsc --noEmit`；重跑 `check:mode`（會啟伺服器測閘門）／`check:i18n`／
  `check:cache`／`check:diet`／`check:lookup`／`verify:conditions`；
  P0 另用實際 HTTP 請求確認 `localOnly:true` 回 `source:'local'` 且不觸發任何 NIM 請求。
- **還沒做／有疑問**：
  - 第 3.3 節寫「`z-ai/glm-5.3-flash` 已從鏈上移除」→ 我確認 `NVIDIA_MODEL_CHAIN`
    現在只有 `openai/gpt-oss-20b`（**3.3 節是對的**）。但 `MEMORY.md` 還寫著
    glm-5.3-flash 13.5s 在鏈上 → 我會一併修正 `MEMORY.md`。
  - 上一則留下的「非食物誤判重現不出來」我這次**不動**（沒有那張照片無法重現）。

### [2026-10-04 14:10] 墨影（WorkBuddy）
- **動了什麼**：
  - `src/types.ts` / `src/data/learnerProfiles.ts` / `src/data/bilingualContent.ts` /
    `src/components/LearnerProfilePicker.tsx` — 新增第 8 個身分「孕婦 `pregnant`」
  - `server/smartNutritionAnalyzer.ts` — 新增 `PREGNANCY_HAZARDS`（孕期危險**成分**把關）
    ＋ 簽章加上 `profileId`
  - `server/handlers.ts` — 傳入身分；**`photo_issue` 存在時強制 `risk_level = 'yellow'`**
  - `scripts/check-pregnancy.mjs` — 新工具（16 項，含誤判防護）
- **為什麼**：
  1. 使用者指定新增孕婦身分。★ 它與其他七個**性質不同**：別人是「數字低一點」，
     孕婦多了「**成分絕對不能有**」——酒精 0.5 公克不會讓任何數字超標，
     但對胎兒就是風險，靠營養上限永遠抓不到。
     → 成分層級把關：酒精／生食未殺菌／高汞魚＝紅燈；咖啡因＝至少黃燈。
  2. ★★ **找到使用者原始問題的真正原因**：他回報「不是食物的東西也說可以食用」。
     實測雲端路徑時發現 AI 正確判斷「這不是食物標籤」，**但回了 `risk_level: green`**
     → 畫面上是一張**綠燈卡片**（綠色在這個 App 就是「可以吃」）。
     前端只把 `photo_issue` 用在按鈕文字，**沒有任何地方用它修正顏色**。
     → 後端強制覆寫：`photo_issue` 存在時一律黃燈。
- **驗證方式**：
  - `node scripts/check-pregnancy.mjs http://127.0.0.1:3100`
    → **16/16 通過**（7 個該紅的紅、1 個該黃的黃、
      4 個誤判防護〔酒石酸／花生／生菜／安全食品〕、
      4 個「非孕婦身分不該提到孕期」）
  - `node scripts/check-nonfood.mjs` → 兩種模式 × 9 情境全過
  - `tsc`｜i18n｜cache 11｜diet 15｜lookup 9｜mode 26｜check:layout 25 畫面 0 筆
- **還沒做／有疑問**：
  - ⚠️ **孕婦身分只做了規則引擎與資料，還沒做教學內容與題庫**
    （`preferredTopics` 已指到既有主題，但沒有孕期專屬的知識卡／題目）。
  - 咖啡因**只靠成分關鍵字**抓，解析器沒有「咖啡因含量」欄位 →
    標示「咖啡因 150 毫克」但成分沒寫咖啡的產品抓不到。要做就要擴充解析器。
  - `learnerProfiles.ts` 的 `accent: 'rose'` 只在選擇器的對照表用到，
    其他元件若也需要配色要記得同步。

---

## 5. 相關文件（不要重複造輪子）

| 檔案 | 內容 |
| --- | --- |
| `.workbuddy-ai/memory/MEMORY.md` | 專案長期規則與踩坑（**最重要**） |
| `.workbuddy-ai/memory/YYYY-MM-DD.md` | 逐日工作日誌，含實測數據 |
| `ARCHITECTURE.md` | 隱私架構、資料流（若存在） |
| `UI_RULES.md` | 字級與版面規則（若存在） |
| `scripts/` | 各種檢查腳本，**改完請跑對應的** |
