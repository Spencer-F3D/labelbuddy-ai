# LabelBuddy AI — 專案長期筆記

> 逐日細節 `memory/YYYY-MM-DD.md`｜UI 規則 `UI_RULES.md`｜架構與踩坑 `ARCHITECTURE.md`。
> **本檔只放「規則與指標」；實作細節一律放 `ARCHITECTURE.md`** —— 超過注入上限會被截斷。
> **最後整理：2026-10-05**

## 🏆 比賽（最高優先）
2026 全球青少年人工智能未來創新競賽（澳門中學生賽區）｜**截止 2026-10-09**｜複評 11-01~11-16｜
決賽 11-26 澳門線下。主題 **AI for Education**，定位「AI 食育學習平台」，SDG 3/4/12。
評審比重：教育 20%／創意 20%／**AI 技術 25%**／原型 20%／英文 10%／倫理私隱 5%。
**四條致命規則**：① **所有材料只接受英文** ② **雲端真實 AI 必須是主角**
③ 報告須列明 AI 工具名稱／版本／用途／學生分工（隱瞞**取消資格**）④ 不得提交學生不能理解的系統。
**四份交付物**：`ProjectIntroduction`(≤2頁)／`ResearchReport`(6–12頁)／`Poster`(0.8×1.1m 直向)／
`DemoVideo`(≤5分)。使用者＝**參賽學生本人**｜**不花錢**（只用免費模型）｜團隊 3 人，他負責 App 全部技術。
**排程**：09-28 雙語 ✅｜09-29 中性化＋條款 ✅｜09-30 三模式＋引導頁 ✅｜10-01~02 APK ✅｜
10-03~05 四份英文文件 → 10-06~08 Poster＋影片 → **10-09 提交**。

## 🚀 部署與「三管道一致」（每次任務完成**自動**執行）
正式網址 `https://app.labelbuddy-ai.workers.dev`（Worker 名 = `wrangler.toml` 的 `name`；
**唯一可靠來源是 `wrangler deploy` 最後一行**）。帳號 `kanhf28@gmail.com`，
Account ID `4ffa5d1a862bdbeaef2782f9b9774034`，憑證在 `%APPDATA%\xdg.config\.wrangler\config\default.toml`。
Secret：`OPENROUTER_API_KEY`、`GEMINI_API_KEY`、`NVIDIA_API_KEY`。版控 `Spencer-F3D/labelbuddy-ai`（Private）。
★★ **收尾的唯一正確動作是 `npm run ship`**（＝ `node scripts/ship-all.mjs`，或雙擊「一鍵同步.bat」）：
工作區乾淨 → 跑檢查 → `vite build` → `git push` → `wrangler deploy` → 出 APK →
**`check-consistency.ts` 驗證線上／GitHub／APK 三者一致**（沒過就以非零結束碼失敗）。
⚠️⚠️ **`git commit` 只是本機動作** —— 不上 GitHub、更不上線。
★ **判定「一致」的方式**：建置時把指紋寫進 `dist/index.html` 的 `<meta name="x-build-id">`
  （＝ `<commit>[-dirty]+<原始碼內容雜湊>`，見 `scripts/build-stamp.mjs`）；`cap sync` 會把它一起帶進 APK。
  三者比對**指紋 ＋ bundle 的 sha256**。**不比檔名**（同名可能不同內容）、**不比時間**（複製／checkout 會改時間）。
★★ **指紋只能放在 `index.html`，不可以注入 JS**（踩過）——注入進 JS 會讓 bundle 雜湊取決於 commit
  →「同一份程式碼、不同 commit」也產生不同 bundle → sha256 永遠過不了。
★★ **判準分兩級**：內容指紋不同／sha256 不同／`-dirty` → **失敗**；**只有 commit 雜湊不同 → 警告**。
  理由：兩個 AI 同時提交時，對方提交文件就會讓我方產物變成「上一個 commit」；若算失敗，檢查會永遠是紅的
  而原因與 App 無關 → 沒人看它，保證反而死掉。要嚴格語意 → `--strict-commit`。
★ `ship-all.mjs` 的 `git push` 曾用「cmd.exe 重導到檔案」而**沒有真的推上去**（結束碼被吃掉）；
  已改成 `execFileSync` ＋明確 stdio。**驗證有沒有推上去要看 `origin/main`，不要只看結束碼。**
★★ **沙箱 `spawnSync` 的真相（2026-10-04 實測修正）**：EBUSY 只發生在**接管 stdio** 時
  （`encoding:'utf8'`／pipe）。用 **`stdio:'inherit'` 是正常的（status 0、無 EBUSY）**。
  舊記載「沙箱內 spawnSync 一律 EBUSY」**語意過寬，已更正**。要拿輸出 → `execFileSync`＋pipe。
★ **診斷「總結與逐項矛盾」時不要用 `| tail -N`**（會把前段的 ❌ 截掉 → 誤判成假警報，已踩）。
★ `deploy-worker.mjs`（「部署上線.bat」）原本**沒有先 `vite build`**，而 assets 指向 `./dist`
  → 會把舊版推上線且顯示成功；`SECRETS` 也漏了 `NVIDIA_API_KEY`。兩者已修。
★ 開發者面板（連點主標 7 下）顯示執行中的建置指紋 → 一眼知道手機裝的是哪一版。

## 📦 APK 建置（`npm run apk` / 建立APK.bat）
應用名稱與桌面檔名都是 **營養放大鏡**。JDK 21 在 `D://Java//jdk-21.0.12.1+1`（⚠️ Capacitor 8.x
要 **21**，17 會 `invalid source release: 21`）；Android SDK 在 `D://Android//Sdk`；簽章
`android/labelbuddy-release.jks`＋`keystore.properties`（**兩者都不可進版控**）。
★ **打包網頁進 APK**（不用 `server.url`）→ WebView origin 是 `https://localhost` → API 走 `apiUrl()`。
★★ **`gradlew.bat` 不能直接 `spawnSync`**（Node 18.20.2+ 修 CVE-2024-27980 會回 `EINVAL errno:-4071`，
  訊息**像找不到檔案或權限問題**）→ 走 `cmd.exe /d /s /c`，**不要用 `shell: true`**（那正是 CVE 的成因）。
★ 檔名日期用**本機時區**（曾用 UTC → 16:00 後寫成「昨天」）。
★ 驗章用 `apksigner verify`，**不要**看「META-INF 有沒有 .RSA」（v2/v3 在 Signing Block → 假警報）。
★ 沙箱裡建 APK 三個關卡：① `vite build` 清 dist 被防大量刪除 shim 擋（EBUSY）→ 加
  `CODEBUDDY_SAFE_DELETE_ENABLED=0`；② `cap sync` 的 `update` 會 EPERM 並刪掉
  `capacitor-cordova-android-plugins/cordova.variables.gradle` → 手動刪 `.../build` 再跑（`copy` 成功就夠）；
  ③ gradle 可能把 `packageRelease` 判成 `UP-TO-DATE` → 產出「看起來成功但內容是舊的」APK。
  ★ 沙箱「防大量刪除」是**累計**（50 檔/回合）→ 同回合連刪大檔會害後面的 `vite build` 清 dist 被擋。

## 🌐 雙語（i18n）架構
扁平鍵 `src/i18n/translations.ts`：`const zhTW = {...} as const` → `type TranslationKey = keyof typeof zhTW`
→ `const en: Record<TranslationKey, string>`（型別強制兩語同步）。`I18nContext` 提供 `t()`（支援 `{n}` 佔位）。
儲存鍵 `labelbuddy-language`。
★★ **快取鍵必須含語言**（中英共用快取 → 拿到錯語言結果且**不報錯**）。
★★ **本機規則引擎是預設路徑**（不是備援）→ 雙語不能只做雲端提示詞，`server/localEngineEn.ts` 必須同步。
★ 本機引擎 112 條中文字串**大半是比對關鍵字，不能翻譯** → 只用**對照片**轉換**輸出欄位**。
★ **改中文文案必須同步改 `localEngineEn.ts` 的對照鍵**（已踩 4 次）。
★ 英文格式化：`over by 18%` / `18% of limit`（取代直譯）；清單分隔符「、」→「, 」。
★ JSX 屬性值要**大括號**：`aria-label={t('key')}`（寫成 `t('key')` 會 `TS1145`）。
★ 英文較長 → 狀態摘要**不可用 `truncate`**。

## 🎨 品牌與介面原則
主標 **LabelBuddy AI** ＋ 中文副標 **營養放大鏡**（`app.nameZh`）。
★ 英文模式的 `app.nameZh` **刻意留空** → 畫面用 `{t(...) && ...}` 守衛。★ 副標 **flex-col 疊在主標下方**，
  **不加進語言閘門**（品牌區須語言中立）。
★ **為普通人而寫**：不出現 OCR／規則引擎／快取／模型名稱／備援／技術狀態。按鈕用「拍／看」。
★ **翻譯字串是純文字，不要寫 Markdown**（`**粗體**` 會原樣顯示星號）。

## 🎨 字級縮放（**兩個密度模式**）
`<html data-density>` 由 `App.tsx` 依 `learnerProfileId !== 'senior'` 切換，`index.css` 命中
**四種**字級（16/18/19/20）：`compact`（非長者）14/16/17/18；`comfortable`（長者）**19/22/23/24**。
★ **新增字級必須兩個模式都補一行**；寫在 `<html>` 而非包 div（fixed 元素才蓋得到）。
★ **唯一例外：12px**（`LegalNotice.tsx`）刻意不受縮放影響。
⚠️ 改動後**必須跑 `npm run check:layout`**，且**一定要加 `--lang=en`**（英文以詞斷行，中文乾淨不代表英文乾淨）
  與 **`--profile=fitness`**（不加就整塊沒被看過 → 報告全綠，**假通過**）。
★ **`min-w-0` ＋ `whitespace-nowrap` ＝保證溢出** → 要單行的標籤改 **`shrink-0`**。
★ **`truncate` 用於「狀態摘要」等於讓該設計失效** → 要折行。
★ **孤行的常見成因是「flex 兄弟搶寬度」** → 把最重要的那行**移出 flex 列、改獨立一行取全寬**比縮文案治本。
★ 內距／間距用**明確 px**（`:root{font-size:20px}` 讓 `p-4`／`gap-4` 實際是 20px）。

## 🔒 隱私架構與 AI 三模式
`cloud_image` 照片上傳／`cloud_text` 只送 OCR 文字／`local_only` 完全不連網（詳見 `ARCHITECTURE.md`）。
★ 文案一律**逐模式陳述**（「照片永遠不離開裝置」已不是通則）。★ 前端 OCR 從必經之路變成**後備方案**。
★★ **任何「會呼叫雲端」的功能都要有同意閘門**（`/api/analyze-label`、`/api/ask-health-question`、
  `/api/fitness-report`）—— 前端要傳 `localOnly`、後端要真的檢查。曾三處漏掉（選 `local_only` 照樣上傳）
  → **「不會報錯、只會偷偷違背承諾」**。修法：`FitnessZone` 收 `analysisMode` → 推導 `localOnly` → 傳 `LogTab`
  （**不要在子元件各自再算一次**）；`local_only` 時**不渲染按鈕**、改顯示「要切換模式才能用」；
  後端 `localOnly === true` → 回本機版（第二道防線）。★ 使用者要求：報告**要繼續真的用 AI**，不可靜默降級。
★ `localOnly` **一律由 `analysisMode` 推導**，呼叫端不能自己傳。★ 舊鍵遷移 `true`→`cloud_text`／`false`→`local_only`。
★ 判斷模式看**欄位是否存在**（OCR 失敗送 `ocrText: ''` 仍是文字模式 → 回「請重拍」）。
★ **送 API 的欄位名不能猜**：是 `conditions`（不是 `conditionNames`）、`localOnly`（不是 `analysisMode`）。

## 🛡️ 安全鐵則（違反會害到人）
★ **顏色一律以規則引擎為準，AI 只提供文字**（實測 158/96＋血糖 8.4：規則 red、雲端 AI yellow；
  「該紅卻報黃」比誤報危險）。**性別絕不可影響紅黃綠**。
★ **五類「不會報錯」的 bug**（都踩過）：① **對照表鍵對不上**（一字之差靜默回中文，踩 4 次）
  ② **插值變數漏翻** ③ **快取鍵用錯內容來源**（前端 OCR 下 `imageBase64` 是空字串 → 所有商品共用一鍵）
  ④ **改了映射函式沒改呼叫端** ⑤ **後端沒產生某個值，前端卻為它寫了分支**。
★ 通則：**UI 有 if/else 的值，都要確認每個值真的有生產者。**

## 🧮 本機規則引擎（`smartNutritionAnalyzer.ts`）
★★ **12 項評分不能只綁 `selectedConditions`**：沒勾慢性病 → riskScore 恆 0 → **永遠綠燈**
  （鈉 2350mg／118% 也說「很適合您」，卻同時在 `nutrient_facts` 顯示紅條，**自己打自己**）。
  → 修法：任一項 >= 每日上限 → **至少黃燈**，並寫出哪一項超標。未勾慢性病時的黃燈文案
  **不可沿用原本那句**（`matchedConditions` 是空的 → 出現「對您的身體（）」）。★ `nutrientFacts` 只算一次共用。

## 📷 本機 OCR（`cloud_text` / `local_only` 的命脈）
引擎 = 瀏覽器端 tesseract.js，要下載 **約 6.4 MB**（`chi_tra.traineddata` 2.37MB＋WASM 約 4MB＋worker）。
★★ **`warmUpBrowserOcr()` 曾長期是死匯入**（存在但沒人呼叫）→ 6.4MB 在按下快門那一刻才開始下載
  → 弱訊號下失敗 → App 卻說「請重拍」→ **使用者一直重拍而照片從來沒問題**。現已在完成引導頁後呼叫。
★ **診斷鐵則：要測 App 真正在跑的那份程式碼**（探針頁載 **UMD 版**會繞過 App 的 ESM 路徑）。
  正確做法：跑 Vite dev server，在頁面裡 `await import('/src/ocr/ocrBrowser.ts')` 再呼叫它。
★ 失敗要分「引擎」與「照片」（`errorKind`）；引擎失敗**不要叫使用者重拍**。
★ 資產快取標頭在 `public/_headers`（Workers Assets 預設 `max-age=0` → 每次重驗）。
★ 工具：`scripts/check-ocr-pipeline.mjs`、`scripts/check-local-ocr.mjs`（**唯一走瀏覽器 OCR 的檢查**）、
  `scripts/make-ocr-test-photos.py` —— 三支都記錄了我自己量錯的方式，**先讀檔頭再用**。

## ⚠️ AI 供應商與模型鏈（會變動，失敗時先重查）
輪替鏈 `orderedProviders(hasClientKey, hasImage)` = **nvidia → gemini → openrouter**
（排序＝使用率低者優先；`DAILY_QUOTA.nvidia = 100000` 是**輪替權重**）。`DEFAULT_MODEL_CHAIN` **上限 3 個**。
★ **NIM 是文字模型、收不下圖片** → 含圖請求必須跳過它（不跳過會把失敗計數推高 → 讓這個「沒有上限」的
  供應商被冷卻 → 反而失去省額度的意義）。
★ **免費模型會變動** → 失敗時先查 `GET /api/v1/models` 過濾 `pricing.prompt == 0` 且 `input_modalities` 含 `image`。
★ 額度四層：輪替｜健康冷卻｜**回應快取**（最有效）｜額度預檢。⚠️ 多開金鑰／帳號**無效**（違反條款）。
★ **改供應商清單時要同步改 `/api/ai-status` 的 providers 迴圈**（漏了不會報錯，面板只會與事實不符）。
★ NIM 金鑰 = Worker secret `NVIDIA_API_KEY`（本機測試放 `.dev.vars`）；Base URL
  `https://integrate.api.nvidia.com/v1`，無每日上限。加速關鍵：`reasoning_effort: 'low'`。
  現役 `NVIDIA_MODEL_CHAIN` **只有 `openai/gpt-oss-20b`**（實測 0.76s）。曾測但**已移除**：
  `z-ai/glm-5.3-flash`（13～33s 太慢）、`nvidia/nemotron-3.5-lightning-30b-a3b`（40s 逾時）。
  **會逾時的模型比沒有備援更糟。**
★ `/api/fitness-report` 只送**彙總數字**、不送逐筆紀錄；AI 失敗回**離線規則版**。

## ⛔ Gemini 區域封鎖（已定案，不必重查）
Gemini 支援區域**不含中國澳門／香港／大陸**；三把金鑰皆回 `400 FAILED_PRECONDITION`
→ **換帳號無用**。用 VPN 或謊報地區繞過屬服務條款問題，**不做**。

## 🎓 8 身分（`LearnerProfileId`）
`senior` 長者／`child` 兒童／`teen` 青少年／`fitness` 健身人士／`young` 青年／`middle` 中年／
`student` 學生／`pregnant` 孕婦（2026-10-04 新增）。定義集中 `src/data/learnerProfiles.ts`，**前後端共用** → 必須**純資料**。
★★ **孕婦與其他七個性質不同**：別人是「數字低一點」，孕婦多了「**成分絕對不能有**」——酒精 0.5 公克
  不會讓任何數字超標，但對胎兒就是風險。→ `PREGNANCY_HAZARDS` 成分層級把關（酒精／生食未殺菌／高汞魚＝紅燈；
  咖啡因＝至少黃燈）。⚠️ 尚未做孕期專屬教學卡與題庫；咖啡因只靠**成分關鍵字**抓。
★ 名稱不得含評價性字眼；身分卡片不得顯示說明文字。⚠️ `bilingual.ts` 的 `PROFILE_NAME_EN` 曾漏改，
  長者英文名寫成 "Senior with hypertension…"（＝把三高貼在長者身上，**只有英文介面看得到**）。
★ **改 id 一定要同時寫遷移**（`LEGACY_PROFILE_IDS`）：否則舊裝置的值被判無效而**靜默退回長者**。
★ 「中年」＝**一般成人上限**，重點在長期累積。⚠️ 兒童／青少年鈉糖上限明顯低於成人；
  **快取鍵必須含身分**；`targets[].target` 是給人看的字串，**不能做數學運算**。

## 🗣️ 稱謂與性別（**2026-10-02 已整套移除**）
`GenderPicker`／引導頁性別步驟／`gender` state／`buildAddressRule`／`applyHonorific*` 全刪。
★★ **但 `core.ts` 的 `ADDRESS_RULE` 絕對不能跟著刪** ——「不可用阿公／阿伯／爺爺／奶奶等長輩稱呼」
  ＋「你一律寫成您」。整段刪掉模型會開始叫 13 歲使用者「阿公」，**要等實際輸出才會發現**。
★ 舊鍵 `labelbuddy_gender_v1` 不需特刪（清除用前綴掃描）。★ 健身專區 BMR **需要**生理性別參數
  （生理事實，與稱謂無關）→ 由使用者在該頁**自己填**，不從全域設定偷偷帶進來。

## 🏋️ 健身專區（2026-10-02 新增）
只在身分＝`fitness` 時出現在側邊選單（過濾寫在 **render** 裡，不是 `MENU_ITEMS` 常數 —— 常數是模組層、
看不到 state，寫在那裡切換身分不會更新且**不會報錯**）。三頁：課表規劃／訓練紀錄／飲食熱量。
儲存鍵 `labelbuddy_fitness_v1`（純本機）。
★ **課表用確定性規則**（3 目標 × 5 天數＝15 模板），**不叫 AI**（AI 每次不一樣、吃額度，還可能生出
  解剖學上不合理卻看不出來的組合）。★ 熱量用 Mifflin-St Jeor；蛋白質／脂肪**以每公斤體重**計；
  畫面必須寫明是**估算值（±10%）**。★ 不預填示範資料；不做醫療建議。★ 圖表只算「有填重量」的動作並註明。

## 🚫 過敏選項的用字（2026-10-02 使用者指定）
**不要寫「絕對不能吃」「會呼吸困難」「吃了會腹瀉」等後果字樣**（本 App 是飲食教育工具，不是診斷工具）。
→ 過敏原仍靠**紅色＋三角警示圖示**識別。`ALLERGEN_SEVERITY` 與 `conditions.mildReaction` 已刪除。

## 🔤 難字簡化（09-30 使用者指定）
鈉→**鹽分**、膳食纖維→**纖維**、飽和脂肪→**動物油**、添加糖→**糖**（碳水化合物不變）。
★ **單一對照表**（`src/data/bilingual.ts`）＋**進出邊界轉換**：提示詞用簡化名稱；內部鍵保持
  **canonical**；`nutrient_facts.name` 輸出 canonical → 前端依語言顯示（後端寫死簡化名 → **英文介面會露出中文**）。
★★ **改映射函式時必須 grep 所有消費者**（`NutrientFactBars` 直接渲染 `fact.name` 與 `fact.unit`）。
★ `simplifyNutrientWording()` 只換**片語**、**不碰單一個「鈉」字**（**L-麩酸鈉／苯甲酸鈉／碳酸鈉** 也是「鈉」結尾）
  —— **寧可漏換，不要錯換**；**不套用到 `ingredients_detected`**（標籤原文）。
★★ **方向（上限 vs 目標）**：後端正規化**必須**帶 `getNutrientDirections(profileId)`，否則纖維／蛋白質
  被講成「每天上限」；排序也要「上限類優先」。
⚠️ **1mg 鈉 ≈ 2.5mg 鹽**。

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
★ **紀錄跟隨「標籤本身的語言」**，與介面語言無關。`lang` 在建立時固定；介面語言 ≠ 標籤語言時用
  **本機引擎就地重新產生**（純函式、離線、不花額度）。品名用 `extractFoodName`（**標籤原文品名**）。

## 📷 選圖入口
**兩個 hidden input**：一個有 `capture="environment"`（拍照）、一個**沒有**（相簿）。
★ 加了 `capture` 就等於拿掉「選相簿」。

## 🚪 首次啟動引導頁
流程：`語言閘門` → 介紹→身分→**慢性病與過敏**→教學→AI 方式→私隱。
**頁數依身分**：長者 **8 頁**（教學分 3 頁）／其他 **6 頁**（教學 1 頁）。
★ **「不用滾動」指的是語言閘門，不是介紹頁**。★ **不顯示步數與進度條**（數字只增加壓力）。
★ **語言閘門不屬於編號流程**（用 `languageChosen` 布林）—— 要**先選再按「確定」**；題目**雙語**、
  選項用**母語名稱**。★ 第一頁＝kicker＋標題＋六條功能清單。★ 用 `StepId` 陣列而不是數字；
  回頭改身分**必須對 step 夾取**。

## 🧪 驗證機制（改動翻譯／稱謂／快取／模式／引導頁後必跑）
`check:i18n`（引擎輸出掃 CJK）｜`check:cache`(11)｜`check:diet`(15)｜`check:mode`（**閘門＋用字＋方向 26**）｜
`check:lookup`（**對照表孤兒鍵 9 張**）｜`check:ui`（真實 Chrome **17 畫面**）｜`check:layout`（**中英 × 長者/健身**）｜
`measure:onboarding`｜`verify:all`。
★★★ **「假通過」比紅燈危險**：① 腳本寫死頁數 ② **不確定性**（只走雲端，模型不一定回傳 `nutrient_facts`
  → 長條圖不渲染 → 掃不到 → 通過但沒驗到）③ 改按鈕文字但腳本還在找舊字。
  → **頁數用 `\d+`；要有確定性來源；要斷言「東西真的出現了」**。
★★★ **檢查腳本的錨點一律用穩定 id，不要用文案**（已踩三次）。★ 靜態掃描（grep）只能找線索，**不能當驗收**。
★ 引導頁段落**必須先勾同意勾選框**才能按「開始使用」。★ **設定 localStorage 要在走完引導頁之後**。
★ 不要用 `| head` 接 node 腳本（SIGPIPE 殺掉它）。

## 🔊 語音朗讀（TTS）
★★ **APK 是 Capacitor Android WebView，不實作 Web Speech 合成 API** → 舊版 `speakText()` 每次靜默
  `return false`（**不拋錯、不記錄、畫面無異狀**）→ 原生走 `@capacitor-community/text-to-speech`，瀏覽器走 Web Speech。
★★ **只裝 npm 套件不算生效，要驗三件事**：① `capacitor.build.gradle` 有 `implementation project(...tts)`；
  ② APK 內 `assets/capacitor.plugins.json` 有 `...TextToSpeechPlugin`；③ **合併後的 AndroidManifest
  有 `<queries><intent><action TTS_SERVICE>`**（少了它引擎找不到**且不報錯**）。
  → 驗法 `aapt2 dump xmltree --file AndroidManifest.xml <apk>`。
★ `getVoices()` **非同步** → 要監聽 `voiceschanged`。★ 澳門用 `zh-HK`（粵語），不是 `zh-TW`。
★ 設定存 `labelbuddy_tts_v1`；**長者預設開、其他身分預設關**；有 `touched` 旗標，手動改過就永遠以使用者為準。
★ 「關閉」在 `speakText` 最前面擋掉，**不是** volume 設 0（會被當無效參數 → 反而變大聲）。
★ **音量一律由 `getTtsVolume()` 決定 —— 呼叫端不要傳 `volume`**。

## 🛠️ 開發者面板（隱藏）
連點主標「LabelBuddy AI」**7 下**進入。計數用 **ref 不用 state**，且必須有**時間窗**（2 秒）。
內容：供應商用量／上限、冷卻、上次錯誤、模型鏈、快取、NVIDIA 狀態、執行環境。

## 使用者決策與節奏
1. **🚀 每次任務完成後自動部署上線（09-29）** → **不用問、不用等確認**；現在做法是 `npm run ship`。
   ⚠️ 但**破壞性操作仍要先問**（刪檔、改架構、動他的資料）。
2. **🧹 死檔要刪除或合併（09-29）** → 刪前必須可達性分析＋字串搜尋雙重證明；刪後 `tsc`＋build＋檢查腳本全過。
3. **一律先給計劃、確認後才動檔案**（但第 1、2 點已預先授權）。
4. 使用者說「**Google**」常指 **Chrome 瀏覽器** → 模糊指涉先問來源。
5. 每次回覆結束前**明確告訴他下一步要做什麼**。
6. **完成任務播單響、需要確認播雙響**（`notify.py done|ask`）。
7. **★ 三管道一致（2026-10-04）**：原話「**我要不管是你還是另一個 AI，做了改動便要保證
   線上／GitHub／APK 三者要一致**」→ 每次改動（**含只改文件**）收尾都要跑 `npm run ship`；
   驗證不過就等於任務沒完成。**不要用時間或檔名猜，要用建置指紋 ＋ sha256。**
8. **文件一律放桌面**（他會指定位置，不要自作主張歸檔）。

## 📄 關鍵文件位置
| 文件 | 位置 |
| --- | --- |
| 章程 PDF | 專案根目錄（掃描版，要渲染成圖） |
| UI 規則 | `.workbuddy-ai/memory/UI_RULES.md` |
| 架構細節／踩坑 | `.workbuddy-ai/memory/ARCHITECTURE.md` |
| 逐日工作日誌 | `.workbuddy-ai/memory/YYYY-MM-DD.md` |
| 專案交接文件 | `docs/專案交接文件.md`（＋ .pdf） |
| 跨 AI 溝通板 | `AI_COLLAB.md` |
