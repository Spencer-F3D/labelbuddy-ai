# LabelBuddy AI — 專案長期筆記

> **只放「規則與紅線」，每條一行**；**細節一律在 `ARCHITECTURE.md`**（不注入，可任意長）。
> 逐日 `memory/YYYY-MM-DD.md`｜UI 規則 `UI_RULES.md`｜跨 AI 溝通板 `AI_COLLAB.md`。
> ⚠️ **19.7KB 會被截斷**（2026-10-08 實測）→ **新細節請寫進 `ARCHITECTURE.md`，這裡只加一行規則。**

## 🏆 比賽（最高優先）
**截止 2026-10-09**。2026 全球青少年人工智能未來創新競賽（澳門中學生賽區）。主題 **AI 與教育**，須說明 SDG。
評審比重：**AI 技術 25%**／教育價值 20%／創意 20%／原型與測試 20%／英文 10%／倫理私隱 5%。
**四條致命規則**：① 材料**只接受英文**（含影片字幕、簡報、答辯）② **雲端真實 AI 必須是主角**
③ 須列明 AI 工具名稱／版本／用途／學生分工（隱瞞**取消資格**）④ 不得提交學生不能理解的系統。
**四份交付物**：`ProjectIntroduction`(≤2頁)／`ResearchReport`(6–12頁)／`Poster`(0.8×1.1m 直向)／
`DemoVideo`(≤5分)；檔名 `X_ProjectName.pdf`／`.mp4`，每檔 ≤50MB。三人均須參與答辯。
使用者＝**參賽學生本人（Kan Hou Fai）**｜**不花錢**（只用免費模型）。
★ 隊伍：**Whatever**／**Instituto Salesiano Macau**（**無 "de"**）／Kan Hou Fai·Lau Hei Long·
Leong Sin Hang／指導老師**暫不寫**。★ 產品名 **LabelBuddy AI** ≠ 隊名：**檔名與封面作品名不變**。
★ 必須揭露的開發期 AI：**WorkBuddy AI**（**DeepSeek-V4.1-Flash**）／**Google AI Studio**（**Gemini 3.8 Flash**）。
★ 提交包 → `Desktop/競賽提交_LabelBuddyAI/`（`1_要交的檔案/` **4 份**＝3 PDF ＋ `DemoVideo_LabelBuddyAI.mp4`）。
★ RR 有 **11 個刻意保留的中文字元**（`公克`／`酒石酸`／`花生`／`粵語（香港）`）＝技術引用，**不可刪**。

## 👤 使用者決策與節奏
1. **🚀 每次任務完成後自動部署上線**，不用問；做法 `npm run ship`。⚠️ **破壞性操作仍要先問**。
2. **🧹 死檔要刪或合併** → 刪前可達性分析＋字串搜尋雙重證明；刪後 `tsc`＋build＋檢查全過。
3. **一律先給計劃、確認後才動檔案**（第 1、2 點已預先授權）。
4. 「**Google**」常指 **Chrome 瀏覽器** → 模糊指涉先問來源。
5. 每次回覆結束前**明確告訴他下一步要做什麼**。
6. **完成播單響、要確認播雙響**（`~/.workbuddy-ai/notify/notify.py done|ask`）。
7. **★ 三管道一致**：每次改動（**含只改文件**）收尾都要 `npm run ship`；驗證不過＝任務沒完成。
   **不要用時間或檔名猜，要比建置指紋 ＋ sha256。**
8. **★★ 另一個 git worktree**（`workbuddy/main-1ba377b5`）跑同一 repo，透過 GitHub 同步，雙方都要
   `merge origin/main`。→ **不要把已追蹤的檔案移出版控**；`.workbuddy-ai/memory/` 與 `AI_COLLAB.md`
   **必須進版控**。→ `push` 被拒先看 `git status -sb`，**多半是落後不是網路問題**。

## 🛡️ 安全鐵則（違反會害到人）
★★ **顏色一律以規則引擎為準，AI 只提供文字**（實測 158/96＋血糖 8.4：規則 red、AI yellow）。
**性別絕不可影響紅黃綠**。
★★ **AI 回錯顏色時前端救不了** → 後端強制覆寫：`photo_issue` 存在一律**至少黃燈**。
★★ **評分不能只綁 `selectedConditions`**：沒勾慢性病 → riskScore 恆 0 → **永遠綠燈**
→ 任一項 >= 每日上限即**至少黃燈**並寫出哪一項；未勾時黃燈文案**不可沿用原句**（會出現「對您的身體（）」）。
★ 解析門檻：「≥3 欄位 ＋ 必須有鈉或糖」**不夠**，還要 `FOOD_CONTEXT`；關鍵字**刻意取寬**。
★★ **五類「不會報錯」的 bug**（詳表 → `ARCHITECTURE.md`）：① **對照表鍵對不上**（踩 4 次）
② **插值變數漏翻** ③ **快取鍵用錯內容來源** ④ **改了映射函式沒改呼叫端**
⑤ **後端沒產生某值，前端卻寫了分支**。★ 通則：**UI 有 if/else 的值，都要確認每個值真有生產者。**
★★ **送 API 的欄位名不能猜**：`profileId`（非 `learnerProfileId`）、`conditions`（非 `conditionNames`）、
`localOnly`（非 `analysisMode`）。**測試要驗「伺服器真的收到我要的參數」**；
★ 測試腳本自己會誤判（`/適合/` 也命中正確拒絕文案）→ 先排除明確拒絕字眼再判斷正向字眼。

## 🔒 隱私架構與 AI 三模式 → `ARCHITECTURE.md`
`cloud_image` 照片上傳／`cloud_text` 只送 OCR 文字／`local_only` **零網路請求**。
★ 文案一律**逐模式陳述**（「照片永遠不離開裝置」已不是通則）。
★★ **「上傳」一律指「送到 AI 供應商」**（`/api/privacy` 的 `providerBoundaryNote`）。
★ **`local_only` 自 2026-10-07 起真的零網路請求** → **不要再寫「它仍會打自己的 Worker」**（舊狀態）。
★★ **送到 AI 供應商的只有「由病症換算出的成分約束」，不是病名**（`conditionNutrients.ts`）。
⚠️ **例外：自行填寫的病症查不到對應成分，會以原文送出**（`unmapped`）—— 隱私文案**不可漏這個例外**。
★★ **任何「會呼叫雲端」的功能都要有同意閘門**（**兩道防線**：前端傳 `localOnly`、後端真的檢查）
—— 現有 analyze-label／ask-health-question／fitness-report。**新增雲端端點時回頭檢查。**
★ `localOnly` **一律由 `analysisMode` 推導**，呼叫端不能自己傳。
★ 舊鍵遷移 `true`→`cloud_text`／`false`→`local_only`，**不可蓋成新預設值**；判斷模式看**欄位是否存在**。

## 🚀 部署與「三管道一致」（每次任務完成**自動**執行）→ `ARCHITECTURE.md`
★★ **收尾唯一正確動作：`npm run ship`**（＝`scripts/ship-all.mjs`／「一鍵同步.bat」）。
⚠️⚠️ **`git commit` 只是本機動作** —— 不上 GitHub、更不上線。**`ship` 不會幫你 commit。**
★ `git add` 只加自己改的檔案（**不要 `git add -A`**）。
★★ **判「一致」＝比建置指紋 ＋ bundle sha256**（`dist/index.html` 的 `<meta name="x-build-id">`）；
**不比檔名、不比時間**。★ 內容／sha256 不同或 `-dirty` → **失敗**；只有 commit 不同 → **警告**。
★ **驗有沒有推上去要看 `origin/main`，不要只看結束碼**。

## 📦 APK 建置（`npm run apk`／建立APK.bat）→ `ARCHITECTURE.md`
★ 應用名稱與桌面檔名都是 **營養放大鏡**；**打包網頁進 APK**（不用 `server.url`）→
WebView origin 是 `https://localhost` → API 一律走 `src/utils/apiBase.ts` 的 `apiUrl()`。
★★ **`gradlew.bat` 不能直接 `spawnSync`**（`EINVAL errno:-4071`）→ 走 `cmd.exe /d /s /c`。
★ JDK **21**；檔名日期用**本機時區**；驗章用 `apksigner verify`。簽章檔**不進版控**。

## 📷 本機 OCR（`cloud_text` / `local_only` 的命脈）→ `ARCHITECTURE.md`
★★ **`warmUpBrowserOcr()` 必須在完成引導頁後就呼叫**（否則按下快門才下載 → 失敗 →
使用者一直重拍而照片從來沒問題）。
★★ **OCR 的唯一來源是 `lastPhotoFileRef`**（`runBrowserOcr()` 從它重新編碼）→
**任何不經過 `<input type=file>` 的圖片來源都要設它**，否則 OCR **靜默不跑**、一律回「請重拍」。
（2026-10-08：示範標籤漏設，躲很久 —— `cloud_image` 不做 OCR 所以看不出來。）
★★ **`chi_tra` 會吃掉全部小數點**（`6.80`→`680`）→ **兩輪各用一組語言模型**：
第一輪 `chi_tra+eng`、第二輪 `chi_tra`。⚠️ worker 快取以**語言組合為鍵**。
★ **`tessdata_best` 實測是退步 → 不採用**（**不要重跑**）。
★★ **診斷鐵則：要測 App 真正在跑的那份程式碼**（探針載 UMD 版會繞過 ESM 路徑）→
起 Vite dev server，頁面裡 `await import('/src/ocr/ocrBrowser.ts')`。
★ 失敗要分「引擎」與「照片」（`errorKind`）；**引擎失敗不要叫使用者重拍**。

## 🔊 語音朗讀（TTS）
★★ **三條靜默失敗**（按了沒反應、零錯誤）：① **非長者身分預設音量 0**（`ttsSettings.ts`）
② 裝置沒有該語言語音時 `speak()` 不觸發 `onstart` 也不觸發 `onerror`
③ `outcome:'no-voice'` 曾是**死值**（型別有、UI 有分支、**沒有生產者**）。
→ 現在 `'no-voice'` 與 `'silent'` 都有生產者 ＋ 1500ms watchdog（門檻別調低，網路語音可達 700ms）。
★★ **`speakText()` 的回傳值是有意義的**（`false` ＝根本沒送出去）→ 呼叫端**一定要看**。
★★ **音量 0 不可以靜默跳過** —— 要說出原因（設定頁有 `#tts-test-voice`）。
★ **唯一的中文粵語語音常是「網路語音」**（`localService:false`）→ 離線時完全沒聲音。
★ 朗讀語言由**文字字集**決定（含 CJK → 中文；純拉丁 → 英文），**不是**介面語言。
★ 「設定 → 朗讀音量」與**手機／系統音量是兩件事**（文案必須講清楚）。
★ 工具：`npm run probe:tts`／`npm run check:tts`。

## ⚠️ AI 供應商與模型鏈（會變動，失敗時先重查）→ `ARCHITECTURE.md`
輪替鏈 `orderedProviders(hasClientKey, hasImage)` = **nvidia → gemini → openrouter**；
`DEFAULT_MODEL_CHAIN` **上限 3 個**。
★ **NIM 是文字模型、收不下圖片** → 含圖請求必須跳過它（否則會把這個「沒有上限」的供應商冷卻）。
★ **免費模型會變動** → 先查 `GET /api/v1/models`（`pricing.prompt == 0` ＋ `input_modalities` 含 `image`）。
⚠️ 多開金鑰／帳號**無效**（違反條款）。
★ **改供應商清單要同步改 `/api/ai-status` 的 providers 迴圈**（漏了不會報錯）。
★ 現役 `NVIDIA_MODEL_CHAIN` **只有 `openai/gpt-oss-20b`**；**會逾時的模型比沒有備援更糟**。
⛔ **Gemini 區域封鎖（已定案，不必重查）**：支援區域**不含中國澳門／香港／大陸**，三把金鑰皆回
`400 FAILED_PRECONDITION` → **換帳號無用**。用 VPN 或謊報地區繞過屬服務條款問題，**不做**。

## 🎓 8 身分（`LearnerProfileId`）→ `ARCHITECTURE.md`
`senior`／`child`／`teen`／`fitness`／`young`／`middle`／`student`／`pregnant`。
定義集中 `src/data/learnerProfiles.ts`，**前後端共用** → 必須**純資料**。
★★ **孕婦與其他七個性質不同**：別人是「數字低一點」，孕婦多了「**成分絕對不能有**」——
**酒精 0.5 公克不會讓任何數字超標**，但對胎兒就是風險 → `PREGNANCY_HAZARDS` 成分層級把關
（酒精／生食未殺菌／高汞魚＝紅燈；咖啡因＝至少黃燈）。⚠️ 關鍵字避開「同字不同物」：
`酒` 排除 `酒石酸`；`生` **不能單獨比對**。
★ 名稱不得含評價性字眼。★ **改 id 一定要同時寫遷移**（`LEGACY_PROFILE_IDS`），否則**靜默退回長者**。
★ 「中年」＝**一般成人上限**，重點在三高**長期累積**。
⚠️ **快取鍵必須含身分**；`targets[].target` 是給人看的字串，**不能做數學運算**。

## 🗣️ 稱謂（**性別功能 2026-10-02 已整套移除**）
★★ **但 `core.ts` 的 `ADDRESS_RULE` 絕對不能跟著刪** ——「不可用阿公／阿伯／爺爺／奶奶等稱呼」
＋「你一律寫成您」；原本綁在性別分支裡，刪掉模型會叫 13 歲使用者「阿公」，**要等輸出才發現**。
★ 健身 BMR **需要**生理性別（生理事實）→ 由使用者在該頁自己填。

## 🏋️ 健身專區（只在 `fitness` 時出現）→ `ARCHITECTURE.md`
★ 過濾寫在 **render** 裡，不是 `MENU_ITEMS` 常數（常數是模組層、看不到 state，且**不會報錯**）。
★ **課表用確定性規則、不叫 AI**；蛋白質／脂肪**以每公斤體重**計；畫面寫明**估算值（±10%）**；
不預填示範資料；不做醫療建議。

## 🚫 過敏選項用字（2026-10-02 使用者指定）
**不寫「絕對不能吃」「會呼吸困難」等後果字樣** → 過敏原靠**紅色＋三角警示圖示**識別。

## 🩺 慢性病清單（19 項）
`PHYSICAL_INDICATORS`＝**18 項病症 ＋ 1 項自填**。★ **每一項都要有真的本機規則 ＋ 專屬提醒**。
★★ `localRule: false` ＝本機不可能有規則（只有自填 `other`）→ `verify:conditions`
**只跳過「規則引擎要有反應」那一半，提醒仍要驗**。
★ 自填病症格式固定 **`其他：<自填>`**；**空字串不送**；本機模式要**明說判不了**。
★ 引導頁第 3 頁的 6 項**收在折疊區**（`#onboard-other-toggle`；**已勾過要自動展開**、
**收合要顯示「已選 N 項」**）。

## 🎨 字級縮放與版面稽核 → `ARCHITECTURE.md`
★★ **三級 ＋ 可手動選**：`compact` 14/16/17/18｜**`normal` 16/18/19/20（刻意沒有 CSS 規則）**｜
`comfortable` **19/22/23/24**。唯一入口 `src/utils/fontScale.ts` 的 `resolveDensity()`
＝**手動值 ?? 身分預設**。儲存鍵 `labelbuddy_font_scale_v1`；**`null` ＝沒選過**（不可回填預設值）。
★ **新增字級必須補 `compact` 與 `comfortable` 兩段**（`normal` 不用）；**唯一例外：12px**（`LegalNotice.tsx`）。
⚠️ 改動後**必須跑 `check:layout`**，且**一定要加 `--lang=en`**（中文乾淨**不代表**英文乾淨）
與 **`--profile=fitness`**（不加 → 報告全綠，**假通過**）。★ 該腳本**要自己先起 dev server**，
URL 必須是 `argv[2]`（`--lang` 之類寫在後面）。
★★ **「上傳：…」那一行在長者字級（19px）框寬只有 218px ＝ 上限 11 個全形字**；
12 字會折行且**末行只剩 1 字（孤行）**。`check:mode` 已寫成斷言 —— **改字前先數字數**。
★ **`min-w-0` ＋ `whitespace-nowrap` ＝保證溢出** → 單行標籤改 **`shrink-0`**；
**`truncate` 用於「狀態摘要」等於讓該設計失效**。★ **中文孤行用 `balance`**（`pretty` 對中文無效）。
★★ **稽核沒報錯 ≠ 版面沒問題**（抓不到全形括號結尾的孤行）→ 折行要看截圖。

## 🚪 首次啟動引導頁
`語言閘門` → 介紹→身分→**慢性病與過敏**→教學→AI 方式→私隱。
**頁數依身分**：長者 **8 頁**（教學分 3 頁）／其他 **6 頁**（教學 1 頁）。
★ **「不用滾動」指語言閘門**；★ **不顯示步數與進度條**。
★ **語言閘門不屬編號流程**（`languageChosen` 布林），題目**雙語**、選項用**母語名稱**。
★ 用 `StepId` 陣列而非數字；回頭改身分**必須對 step 夾取**；**先勾同意才能按「開始使用」**。

## 🔤 難字簡化（2026-09-30 使用者指定）→ `ARCHITECTURE.md`
鈉→**鹽分**、膳食纖維→**纖維**、飽和脂肪→**動物油**、添加糖→**糖**（碳水化合物不變）。
★ **單一對照表**（`src/data/bilingual.ts`）＋**進出邊界轉換**：內部鍵保持 **canonical**、
`nutrient_facts.name` 輸出 canonical（後端寫死簡化名 → **英文介面會露中文**）。
★ `simplifyNutrientWording()` 只換**片語**、**不碰單一個「鈉」字**（L-麩酸鈉／苯甲酸鈉也是「鈉」結尾）
—— **寧可漏換，不要錯換**；**不套用到 `ingredients_detected`**。
⚠️ **1mg 鈉 ≈ 2.5mg 鹽**；**改中文文案必須同步改 `localEngineEn.ts` 的鍵**（已踩 4 次）。
★ **順序：`translateLocalResult()` 先、`simplifyNutrientWording()` 後**（否則 `nutrientName()` 對不上）。

## 📊 後端數值與文字處理
★ **鐵則：模型只讀出「含量」，百分比一律由後端重算**（`normalizeNutrientFacts`）——
**三條路徑都要套用**：雲端成功／**快取命中**／本機備援。
★★ 後端正規化**必須**帶 `getNutrientDirections(profileId)`（否則纖維／蛋白質被講成「每天上限」）；
排序也要「上限類優先」。★ **飲食紀錄跟隨「標籤本身的語言」**，與介面語言無關。

## 🧪 驗證機制
`check:i18n`｜`check:cache`｜`check:diet`｜`check:mode`（閘門＋用字＋方向＋**模式選擇器文案**）｜
`check:lookup`｜`check:ui`（Chrome **17 畫面**）｜`check:layout`（**中英 × 長者/健身**）｜
`check:parity`（三方比對＋golden）｜`check:tts`｜`verify:all`。
★★★ **「假通過」比紅燈危險**：① 腳本寫死頁數 ② **不確定性**（模型不一定回 `nutrient_facts` →
長條圖不渲染 → 掃不到 → 通過但沒驗到）③ 改按鈕文字但腳本還在找舊字
④ **少傳一個參數就安靜跳過整條分支**（`check:i18n` 曾傳 `numericLimits: undefined`）。
→ **頁數用 `\d+`；要有確定性來源；要斷言「東西真的出現了」；參數要與真實呼叫端一致。**
★★★ **腳本錨點一律用穩定 id，不要用文案**（已踩三次）；★ 靜態掃描（grep）**不能當驗收**；
★ 設 localStorage 要在走完引導頁之後。
★★ **golden 比對紅燈時，先證明「只有預期的欄位變」再更新 fixture**
（`check-offline-parity.ts` 的 `valueDiff()`）；**不要直接蓋掉**。
★ **失敗訊息要含足夠資訊**（哪一組、哪個欄位、舊值→新值），否則等於每次都要重做一次診斷。

## 💾 儲存鍵
全部以 `labelbuddy` 開頭。★ 「清除所有資料」用**前綴掃描**，不是寫死清單；清完 `location.reload()`。

## 📄 關鍵文件位置
來源 `.typ`＋素材 → `Desktop/LabelBuddyAI_競賽提交_來源/`（★ 桌面根目錄另有路徑已改寫的 `.typ`
副本，**與來源版分岔**，改動前先問改哪份）；UI 規則 → `memory/UI_RULES.md`；
**架構／實作細節（不注入）** → `memory/ARCHITECTURE.md`；逐日誌 → `memory/YYYY-MM-DD.md`；
交接文件 → `docs/專案交接文件.md`；跨 AI 溝通板 → `AI_COLLAB.md`。
