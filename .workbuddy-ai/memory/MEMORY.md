# LabelBuddy AI — 專案長期筆記

> 逐日細節 `memory/YYYY-MM-DD.md`｜UI 規則 `UI_RULES.md`｜架構與踩坑 `ARCHITECTURE.md`。
> **本檔只放「規則與指標」；實作細節一律放 `ARCHITECTURE.md`** —— 超過注入上限會被截斷。
> **最後整理：2026-10-04**

## 品牌與介面原則
主標 **LabelBuddy AI** ＋ 中文副標 **營養放大鏡**（`app.nameZh`）。
★ 英文模式的 `app.nameZh` **刻意留空**（否則「一個 App 兩個英文名」）→ 畫面用 `{t(...) && ...}` 守衛。
★ 副標 **flex-col 疊在主標下方**（並排會撐爆標題列）。**不加進語言閘門**（品牌區須語言中立）。
★ **為普通人而寫**：「不要在頁面上有不用給用戶看的字」→ 不出現 OCR／規則引擎／快取／模型名稱／
  備援／技術狀態。按鈕用「拍／看」，不用「辨識／掃描」。
★ **翻譯字串是純文字，不要寫 Markdown**（`**粗體**` 會原樣顯示星號）。

## 🏆 比賽（最高優先）
2026 全球青少年人工智能未來創新競賽（澳門中學生賽區）｜**截止 2026-10-09**｜複評 11-01~11-16｜
決賽 11-26 澳門線下。主題 **AI for Education**，定位「AI 食育學習平台」，SDG 3/4/12。
評審比重：教育 20%／創意 20%／**AI 技術 25%**／原型 20%／英文 10%／倫理私隱 5%。
**四條致命規則**：① **所有材料只接受英文**（App 雙語不可省）② **雲端真實 AI 必須是主角**
③ 報告須列明 AI 工具名稱／版本／用途／學生分工（隱瞞**取消資格**）④ 不得提交學生不能理解的系統。
**四份交付物**：`ProjectIntroduction`(≤2頁)／`ResearchReport`(6–12頁)／`Poster`(0.8×1.1m 直向)／
`DemoVideo`(≤5分)。使用者＝**參賽學生本人**｜**不花錢**（只用免費模型）｜團隊 3 人，他負責 App 全部技術。
**排程**：09-28 雙語 ✅｜09-29 中性化＋條款 ✅｜09-30 三模式＋引導頁 ✅｜10-01~02 APK ✅ →
10-03~05 四份英文文件 → 10-06~08 Poster＋影片 → **10-09 提交**。

## 🚀 部署（09-28 上線；每次任務完成**自動**執行）
正式網址 `https://app.labelbuddy-ai.workers.dev`（Worker 名 = `wrangler.toml` 的 `name`；
**唯一可靠來源是 `wrangler deploy` 最後一行**）。帳號 `kanhf28@gmail.com`，
Account ID `4ffa5d1a862bdbeaef2782f9b9774034`，憑證在 `%APPDATA%\xdg.config\.wrangler\config\default.toml`。
Secret：`OPENROUTER_API_KEY`、`GEMINI_API_KEY`、`NVIDIA_API_KEY`。版控 `Spencer-F3D/labelbuddy-ai`（Private）。
⚠️⚠️ **`git commit` 只是本機動作** —— 不上 GitHub、更不上線。每次任務完成自動跑：
`git push origin main` → `vite build` → `wrangler deploy` → **驗證**線上首頁引用的
`assets/index-XXXX.js` 必須等於 `dist/assets/` 的檔名。

## 📦 APK 建置（`npm run apk` / 建立APK.bat）
應用名稱與桌面檔名都是 **營養放大鏡**。JDK 21 在 `D://Java//jdk-21.0.12.1+1`（⚠️ Capacitor 8.x
要 **21**，17 會 `invalid source release: 21`）；Android SDK 在 `D://Android//Sdk`；簽章
`android/labelbuddy-release.jks`＋`keystore.properties`（**兩者都不可進版控**）。
★ **打包網頁進 APK**（不用 `server.url`）→ WebView origin 是 `https://localhost` →
  API 一律走 `src/utils/apiBase.ts` 的 `apiUrl()`。
★★ **`gradlew.bat` 不能直接 `spawnSync`**（Node 18.20.2+ 修 CVE-2024-27980 會回
  `EINVAL errno:-4071`，訊息**像找不到檔案或權限問題**）→ 走 `cmd.exe /d /s /c`，
  **不要用 `shell: true`**（那正是 CVE 的成因）。
★ 檔名日期用**本機時區**（曾用 UTC → 16:00 後寫成「昨天」）。
★ 驗章用 `apksigner verify`，**不要**看「META-INF 有沒有 .RSA」（v2/v3 在 Signing Block → 假警報）。
★ 沙箱「防大量刪除」是**累計**（50 檔/回合）→ 同回合連刪大檔會害後面的 `vite build` 清 dist 被擋。

## 🔊 語音朗讀（TTS）
★★ **APK 是 Capacitor Android WebView，不實作 Web Speech 合成 API**（`window.speechSynthesis`
  只有 Chrome 有）→ 舊版 `speakText()` 每次靜默 `return false`（**不拋錯、不記錄、畫面無異狀**）。
  → 原生走 `@capacitor-community/text-to-speech`，瀏覽器走 Web Speech。
★★ **只裝 npm 套件不算生效，要驗三件事**：① `android/app/capacitor.build.gradle` 有
  `implementation project(':capacitor-community-text-to-speech')` ② APK 內
  `assets/capacitor.plugins.json` 有 `...tts.TextToSpeechPlugin` ③ **合併後的 AndroidManifest
  有 `<queries><intent><action TTS_SERVICE>`**（Android 11+ 套件可見性；少了它引擎找不到**且不報錯**）
  → 驗法 `aapt2 dump xmltree --file AndroidManifest.xml <apk>`。
★ `getVoices()` **非同步** → 要監聽 `voiceschanged`，否則第一次朗讀挑不到語音。
★ 澳門用 `zh-HK`（粵語），不是 `zh-TW`。
★ 設定存 `labelbuddy_tts_v1`（`volume`／`touched`／`voiceLang`）；**長者預設開、其他身分預設關**；
  有 `touched` 旗標，手動改過就永遠以使用者為準（否則改身分時會被覆蓋）。
★ 「關閉」在 `speakText` 最前面擋掉，**不是** volume 設 0（會被當無效參數 → 反而變大聲）。
★ **音量一律由 `getTtsVolume()` 決定 —— 呼叫端不要傳 `volume`**，傳了會覆寫使用者的設定。

## 🛠️ 開發者面板（隱藏）
連點主標「LabelBuddy AI」**7 下**進入。計數用 **ref 不用 state**（state 會全樹重繪），
且必須有**時間窗**（2 秒），否則分幾天點也會開。內容：供應商用量／上限、冷卻、上次錯誤、
模型鏈、快取、NVIDIA 狀態、執行環境。★ 供應商清單以 `orderedProviders` 為準
（現為 `nvidia → gemini → openrouter`，**NIM 在輪替鏈上**，含圖請求會跳過它）。

## 🧮 本機規則引擎（`smartNutritionAnalyzer.ts`）
★★ **12 項評分不能只綁 `selectedConditions`**：沒勾慢性病 → riskScore 恆 0 → **永遠綠燈**
  （鈉 2350mg／每日上限 118% 也說「很適合您」，卻同時在 `nutrient_facts` 顯示紅條，**自己打自己**）。
  → 修法：任一項 >= 每日上限 → **至少黃燈**，並寫出是哪一項超標。未勾慢性病時的黃燈文案
  **不可沿用原本那句**（`matchedConditions` 是空的 → 出現「對您的身體（）」）。★ `nutrientFacts` 只算一次共用。
★ 顏色一律以規則引擎為準，AI 只提供文字。

## 🛡️ 安全鐵則（違反會害到人）
★ **顏色一律以規則引擎為準，AI 只提供文字**（實測 158/96＋血糖 8.4：規則 red、雲端 AI yellow；
  「該紅卻報黃」比誤報危險）。**性別絕不可影響紅黃綠**（`check-honorific.ts` 已隨性別機制刪除，
  現由 `ADDRESS_RULE` 與程式審查守住）。
★ **五類「不會報錯」的 bug**（都踩過）：① **對照表鍵對不上**（中文句子當鍵，一字之差靜默回中文，踩 4 次）
  ② **插值變數漏翻** ③ **快取鍵用錯內容來源**（前端 OCR 下 `imageBase64` 是空字串 → 所有商品共用一鍵）
  ④ **改了映射函式沒改呼叫端** ⑤ **後端沒產生某個值，前端卻為它寫了分支**。
★ 通則：**UI 有 if/else 的值，都要確認每個值真的有生產者。**

## 🔒 隱私架構與 AI 三模式
`cloud_image` 照片上傳／`cloud_text` 只送 OCR 文字／`local_only` 完全不連網（詳見 `ARCHITECTURE.md`）。
★ 文案一律**逐模式陳述**（「照片永遠不離開裝置」已不是通則）。★ 前端 OCR 從必經之路變成**後備方案**。
★★ **同意閘門**：`analyze-indicators`／`ask-health-question` 曾**無條件呼叫雲端**（選 `local_only`
  照樣上傳血壓與提問）→ 已加 `localOnly` 檢查。**這是「不會報錯、只會偷偷違背承諾」的 bug。**
★ `localOnly` **一律由 `analysisMode` 推導**，呼叫端不能自己傳。
★ 舊鍵遷移 `true`→`cloud_text`／`false`→`local_only`，**不可蓋成新預設值**。
★ 判斷模式看**欄位是否存在**（OCR 失敗送 `ocrText: ''` 仍是文字模式 → 回「請重拍」）。
★ **任何「會呼叫雲端」的功能都要有同意閘門**（`/api/analyze-label`、`/api/ask-health-question`、
  `/api/fitness-report`）—— 新增雲端端點時，前端要傳 `localOnly`、後端要真的檢查。

## 📷 本機 OCR（`cloud_text` / `local_only` 的命脈）
引擎 = 瀏覽器端 tesseract.js，要下載 **約 6.4 MB**（`chi_tra.traineddata` 2.37MB＋WASM 約 4MB＋worker）。
★★ **`warmUpBrowserOcr()` 曾長期是死匯入**（存在但沒人呼叫）→ 6.4MB 在按下快門那一刻才開始下載
  → 超市弱訊號下失敗 → App 卻說「請重拍」→ **使用者一直重拍而照片從來沒問題**。
  現已在完成引導頁後呼叫。
★ **診斷鐵則：要測 App 真正在跑的那份程式碼**（探針頁載 tesseract.js 的 **UMD 版**會繞過 App 的
  ESM 路徑 →「探針說可以、使用者說不行」）。正確做法：跑 Vite dev server，在頁面裡
  `await import('/src/ocr/ocrBrowser.ts')` 再呼叫它。
★ 失敗要分「引擎」與「照片」（`errorKind`）；引擎失敗**不要叫使用者重拍**。
★ 資產快取標頭在 `public/_headers`（Workers Assets 預設 `max-age=0` → 每次重驗）。
★ 工具：`scripts/check-ocr-pipeline.mjs`（標籤佔畫面 100%→25% 逐級測）、
  `scripts/check-local-ocr.mjs`（**唯一走瀏覽器 OCR 的檢查**）、`scripts/make-ocr-test-photos.py`
  —— 三支都記錄了我自己量錯的方式，**先讀檔頭再用**。

## ⚠️ AI 供應商與模型鏈（會變動，失敗時先重查）
輪替鏈 `orderedProviders(hasClientKey, hasImage)` = **nvidia → gemini → openrouter**
（排序＝使用率低者優先；`DAILY_QUOTA.nvidia = 100000` 是**輪替權重**，讓沒有上限的它先吃請求）。
`DEFAULT_MODEL_CHAIN` **上限 3 個**。
★ **NIM 是文字模型、收不下圖片** → 含圖請求必須跳過它（不跳過會把失敗計數推高 →
  最後讓這個「沒有上限」的供應商被冷卻 → 反而失去省額度的意義）。
★ **免費模型會變動** → 失敗時先查 `GET /api/v1/models` 過濾 `pricing.prompt == 0` 且
  `input_modalities` 含 `image`。★ 額度四層：輪替｜健康冷卻｜**回應快取**（最有效）｜額度預檢。
⚠️ 多開金鑰／帳號**無效**（capacity 是全域治理，違反條款）。
★ **改供應商清單時要同步改 `/api/ai-status` 的 providers 迴圈**（漏了不會報錯，面板只會與事實不符）。
★ NIM 金鑰 = Worker secret `NVIDIA_API_KEY`（本機測試放 `.dev.vars`）；
  Base URL `https://integrate.api.nvidia.com/v1`，無每日上限。模型鏈以**實測**決定（不要照抄技能結論）：
  `openai/gpt-oss-20b` **0.76s 主力**｜`z-ai/glm-5.3-flash` 13.5s（**`content` 是 null，答案在 `reasoning_content`**）｜
  `nvidia/nemotron-3.5-lightning-30b-a3b` **40s 逾時，不列入**（會逾時的模型比沒有備援更糟）。
★ `/api/fitness-report` 只送**彙總數字**、不送逐筆紀錄；AI 失敗回**離線規則版**。

## ⛔ Gemini 區域封鎖（已定案，不必重查）
Gemini 支援區域**不含中國澳門／香港／大陸**；三把金鑰皆回 `400 FAILED_PRECONDITION`
→ **換帳號無用**。用 VPN 或謊報地區繞過屬服務條款問題，**不做**。

## 🎓 7 身分（`LearnerProfileId`，2026-10-02 起）
`senior` 長者／`child` 兒童／`teen` 青少年／`fitness` 健身人士／`young` 青年／`middle` 中年／
`student` 學生。定義集中 `src/data/learnerProfiles.ts`，**前後端共用** → 必須**純資料**。
★ 名稱不得含評價性字眼（「長者三高」→**長者**）；身分卡片不得顯示說明文字。
  ⚠️ `bilingual.ts` 的 `PROFILE_NAME_EN` 曾漏改，長者英文名寫成 "Senior with hypertension…"
  （＝把三高貼在長者身上，**只有英文介面看得到**）。
★ **改 id 一定要同時寫遷移**（`LEGACY_PROFILE_IDS`）：否則舊裝置的值被判無效而**靜默退回長者**
  （鈉上限 2000→1500、字級放大），使用者不會知道為什麼。
★ 「中年」＝**一般成人上限**，重點放在三高**長期累積**（不併入長者＝不讓未確診的人過度緊張；
  不併入青年＝保留「預防」這個判讀角度）。
⚠️ 兒童／青少年鈉糖上限明顯低於成人；**快取鍵必須含身分**；
  `targets[].target` 是給人看的字串，**不能做數學運算**。

## 🗣️ 稱謂與性別（**2026-10-02 已整套移除**）
`GenderPicker`／引導頁性別步驟／`gender` state／`buildAddressRule`／`applyHonorific*`／
`LABEL_TEXT_FIELDS`／`check-honorific.ts` **全部刪除**。
★★ **但 `core.ts` 的 `ADDRESS_RULE` 絕對不能跟著刪** ——「不可用阿公／阿伯／爺爺／奶奶等長輩稱呼」
  ＋「你一律寫成您」。原本這兩條綁在性別分支裡，整段刪掉的話模型會開始叫 13 歲使用者「阿公」，
  **而且要等實際輸出才會發現**。
★ 舊鍵 `labelbuddy_gender_v1` 不需特刪（清除用前綴掃描）；程式已不讀它。
★ 健身專區的 BMR 公式**需要**生理性別參數（生理事實，與稱謂無關）→ 由使用者在該頁**自己填**，
  不從全域設定偷偷帶進來。

## 🏋️ 健身專區（2026-10-02 新增）
只在身分＝`fitness` 時出現在側邊選單（過濾寫在 **render** 裡，不是 `MENU_ITEMS` 常數 ——
常數是模組層、看不到 state，寫在那裡切換身分不會更新且**不會報錯**）。
三個分頁：課表規劃／訓練紀錄／飲食熱量。儲存鍵 `labelbuddy_fitness_v1`（純本機）。
★ **課表用確定性規則**（3 目標 × 5 天數＝15 模板，`src/data/fitnessContent.ts`），**不叫 AI**
  （AI 會每次不一樣、吃掉標籤辨識額度，還可能生出解剖學上不合理卻看不出來的組合）。
★ 熱量用 Mifflin-St Jeor；蛋白質／脂肪**以每公斤體重**計（寫死公克數對 50kg 與 90kg 都是錯的）；
  畫面必須寫明是**估算值（±10%）**。★ 不預填任何示範資料；不做醫療建議。
★ 圖表只算「有填重量」的動作並註明 —— 自重訓練算進去會讓圖表看起來像「這週沒練」，
  那是**錯誤的視覺暗示**。

## 🚫 過敏選項的用字（2026-10-02 使用者指定）
**不要寫「絕對不能吃」「會呼吸困難」「吃了會腹瀉」等後果字樣**（本 App 是飲食教育工具，
不是診斷工具 —— 寫得越肯定責任越大）。→ 過敏原仍靠**紅色＋三角警示圖示**識別。
`ALLERGEN_SEVERITY` 與 `conditions.mildReaction`／`severeReaction` 已刪除。

## 🎨 字級縮放（**兩個密度模式**）
`<html data-density>` 由 `App.tsx` 依 `learnerProfileId !== 'senior'` 切換，`index.css` 命中
**四種**字級（16/18/19/20）：`compact`（非長者）14/16/17/18；`comfortable`（長者）**19/22/23/24**。
★ **新增字級必須兩個模式都補一行**；寫在 `<html>` 而非包 div（fixed 元素才蓋得到）。
★ **唯一例外：12px**（`LegalNotice.tsx`）刻意不受縮放影響。
⚠️ 改動後**必須跑 `npm run check:layout`**，且**一定要加 `--lang=en`**（中文一字一方塊、英文以詞斷行，
  中文乾淨**不代表**英文乾淨）與 **`--profile=fitness`**（不加就整塊沒被看過 → 報告全綠，**假通過**）。
★ **`min-w-0` ＋ `whitespace-nowrap` ＝保證溢出** → 要單行的標籤改 **`shrink-0`**。
★ **`truncate` 用於「狀態摘要」等於讓該設計失效**（那些欄位就是要讓長者不展開也知道設了什麼）→ 要折行。
★ **孤行的常見成因是「flex 兄弟搶寬度」**（圖示／勾勾／間距都吃同一行）→
  把最重要的那行**移出 flex 列、改獨立一行取全寬**比縮文案更治本。

## 📷 選圖入口
**兩個 hidden input**：一個有 `capture="environment"`（拍照）、一個**沒有**（相簿）。
★ 加了 `capture` 就等於拿掉「選相簿」（手機會直接開鏡頭）。

## 🚪 首次啟動引導頁（09-30 改版；10-02 移除性別步驟）
流程：`語言閘門` → 介紹→身分→**慢性病與過敏**→教學→AI 方式→私隱。
**頁數依身分**：長者 **8 頁**（教學分 3 頁）／其他 **6 頁**（教學 1 頁）。
★ **「不用滾動」指的是語言閘門，不是介紹頁**（閘門實測 597/640px；介紹頁保留六條功能、接受滾動）。
★ **不顯示步數與進度條**（09-30 使用者指定：數字只增加壓力）。
★ **語言閘門不屬於編號流程**（用 `languageChosen` 布林，不是 `buildSteps`）——
  閘門要**先選再按「確定」**；題目**雙語**、選項用**母語名稱**。
★ 第一頁＝kicker＋標題＋六條功能清單（**說明行 10-02 已移除**：640px 扣內距與底部按鈕只剩約 498px）。
★ 內距／間距用**明確 px**（`:root{font-size:20px}` 讓 `p-4`／`gap-4` 實際是 20px）。
★ 用 `StepId` 陣列而不是數字；回頭改身分**必須對 step 夾取**。

## 🔤 難字簡化（09-30 使用者指定）
鈉→**鹽分**、膳食纖維→**纖維**、飽和脂肪→**動物油**、添加糖→**糖**（碳水化合物不變）。
★ **單一對照表**（`src/data/bilingual.ts`）＋**進出邊界轉換**：提示詞用簡化名稱；內部鍵保持
  **canonical**；`nutrient_facts.name` 輸出 canonical → 前端依語言顯示
  （後端寫死簡化名 → **英文介面會露出中文**）。
★★ **改映射函式時必須 grep 所有消費者**（`NutrientFactBars` 直接渲染 `fact.name` 與 `fact.unit`，
  改了函式沒改呼叫端 → 畫面照樣顯示「鈉」「毫克」，**不會報錯**）。
★ `simplifyNutrientWording()` 只換**片語**、**不碰單一個「鈉」字**
  （**L-麩酸鈉／苯甲酸鈉／碳酸鈉** 也是「鈉」結尾）—— **寧可漏換，不要錯換**；
  **不套用到 `ingredients_detected`**（標籤原文）。
★★ **方向（上限 vs 目標）**：後端正規化**必須**帶 `getNutrientDirections(profileId)`，
  否則纖維／蛋白質被講成「每天上限」；排序也要「上限類優先」。
⚠️ **1mg 鈉 ≈ 2.5mg 鹽**；**改中文文案必須同步改 `localEngineEn.ts` 的鍵**（已踩 4 次）。

## 💾 儲存鍵與「清除所有資料」
全部以 `labelbuddy` 開頭（語言／身分／分析模式／慢性病／指標／紀錄／同意／引導頁／學習進度／健身）。
★ 清除用**前綴掃描**（`k.startsWith('labelbuddy')`），不是寫死清單；清完 `location.reload()`
  （逐一重設 state 會漏且不報錯）。詳見 `ARCHITECTURE.md`。

## 📊 後端數值與文字處理
★ **鐵則：模型只讀出「含量」，百分比一律由後端重算**（`normalizeNutrientFacts`），
  **三條路徑都要套用**：雲端成功／**快取命中**／本機備援（漏掉快取會回傳舊格式）。
⚠️ **limit 與 target 方向相反**（鈉 120% 是壞事、蛋白質 120% 是好事）。
⚠️ 簡繁表只收「一對一無歧義」的字（后/後、干/乾、里/裡、面/麵、只/隻、發/髮 不列）。
  看到簡體字先查是不是新字不在表內，**別急著換模型**。

## 📋 飲食紀錄（DietRecord）
★ **紀錄跟隨「標籤本身的語言」**，與介面語言無關（「照片是什麼語言，紀錄就是什麼語言」）。
  `lang` 在建立時固定；介面語言 ≠ 標籤語言時用**本機引擎就地重新產生**（純函式、離線、不花額度）。
  品名用 `extractFoodName`（**標籤原文品名**）。

## 🧪 驗證機制（改動翻譯／稱謂／快取／模式／引導頁後必跑）
`check:i18n`（引擎輸出掃 CJK）｜`check:cache`（11）｜`check:diet`（15）
｜`check:mode`（**閘門＋用字＋方向 26，會啟動伺服器**）｜`check:lookup`（**對照表孤兒鍵 9 張**）
｜`check:ui`（真實 Chrome **17 畫面**）｜`check:layout`（**中英 × 長者/健身 四組合**）
｜`measure:onboarding`（逐頁高度）｜`verify:all`（全部）。
★★★ **「假通過」比紅燈危險**：① 腳本寫死頁數 ② **不確定性**（只走雲端，模型不一定回傳
  `nutrient_facts` → 長條圖不渲染 → 掃不到 → 通過但沒驗到）③ 改按鈕文字但腳本還在找舊字。
  → **頁數用 `\d+`；要有確定性來源；要斷言「東西真的出現了」**。
★★★ **檢查腳本的錨點一律用穩定 id，不要用文案**（已踩三次；現有 `id="onboarding-flow"`、
  `id="onboarding-language-gate"`）。★ 靜態掃描（grep）只能找線索，**不能當驗收**。
★ 引導頁段落**必須先勾同意勾選框**才能按「開始使用」。
★ **設定 localStorage 要在走完引導頁之後**（引導頁的預設值會覆寫回去）。
★ 不要用 `| head` 接 node 腳本（SIGPIPE 殺掉它）。細節見 `ARCHITECTURE.md`。

## 使用者決策與節奏
1. **🚀 每次任務完成後自動部署上線（09-29）** → **不用問、不用等確認**。
   ⚠️ 但**破壞性操作仍要先問**（刪檔、改架構、動他的資料）。
2. **🧹 死檔要刪除或合併（09-29）** → 刪前必須可達性分析＋字串搜尋雙重證明；
   刪後 `tsc`＋build＋檢查腳本全過。
3. **一律先給計劃、確認後才動檔案**（但第 1、2 點已預先授權）。
4. 使用者說「**Google**」常指 **Chrome 瀏覽器** → 模糊指涉先問來源。
5. 每次回覆結束前**明確告訴他下一步要做什麼**。
6. **完成任務播單響、需要確認播雙響**（`C:\Users\Spencer\.workbuddy-ai\notify\notify.py done|ask`）。

## 📄 關鍵文件位置
| 文件 | 位置 |
| --- | --- |
| 章程 PDF | 專案根目錄（掃描版，要渲染成圖） |
| UI 規則 | `.workbuddy-ai/memory/UI_RULES.md` |
| 架構細節／踩坑 | `.workbuddy-ai/memory/ARCHITECTURE.md` |
| 逐日工作日誌 | `.workbuddy-ai/memory/YYYY-MM-DD.md` |
| 專案交接文件 | `docs/專案交接文件.md`（＋ .pdf） |
| 跨 AI 溝通板 | `AI_COLLAB.md` |
