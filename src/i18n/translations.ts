/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 介面文字字典（i18n）
 * ============================================================================
 * 【為什麼要做雙語】
 *   本專案參加的競賽章程明文規定「所有材料只接受英文」，
 *   且「未使用英文」是**可不予評審**的條件之一。
 *   因此 App 介面必須能切換成英文，而不只是提交英文文件。
 *
 * 【設計決定一：繁體中文是預設，英文是選項】
 *   主要使用者是長者，他們看中文。英文是給評審與國際使用者看的。
 *   所以預設語言是 zh-TW，不會因為要符合規範而犧牲主要使用者的體驗。
 *
 * 【設計決定二：用「扁平鍵 + 型別推導」而不是巢狀物件】
 *   `zhTW` 用 `as const` 定義後，`TranslationKey` 會自動推導出所有鍵；
 *   `en` 則標註為 `Record<TranslationKey, string>`。
 *   這樣**只要 en 少了一個鍵，TypeScript 就會編譯失敗** ——
 *   不會出現「切到英文後某處還是中文」這種查不出來的問題。
 *
 * 【設計決定三：英文用「簡短祈使句」而不是直譯】
 *   例如「把包裝上的營養標示拍下來，我幫您看看適不適合」
 *   不是逐字翻，而是寫成 "Take a photo of the nutrition label." ——
 *   英文讀者要的是清楚，不是中文語序的英文。
 */

/** 支援的語言 */
export type Language = 'zh-TW' | 'en';

/** 繁體中文（預設）。所有鍵的來源，其他語言必須完整對應。 */
const zhTW = {
  /* ── App 外框 ─────────────────────────────────────────────── */
  'app.name': 'LabelBuddy AI',
  /**
   * 中文副標（2026-10-02 使用者指定）。
   *
   * 【為什麼英文是空字串 —— 這不是漏翻】
   *   使用者明確指定「英文維持 LabelBuddy AI」。
   *   在英文介面另外取一個英文名字（例如 Nutrition Magnifier）
   *   會變成「一個 App 兩個英文名」，評審與使用者都會混淆。
   *   → 所以英文刻意留空，畫面用 `{t('app.nameZh') && ...}` 守衛，
   *     不會渲染出一個空的元素。
   */
  'app.nameZh': '營養放大鏡',
  // 瀏覽器分頁／書籤的標題（由 I18nProvider 寫進 document.title）
  'app.documentTitle': 'LabelBuddy AI（營養放大鏡）- 您的超市健康小幫手',
  // ⚠️ 不要在這裡寫「專為長者設計」。
  //    本 App 有 6 種身分（長者／兒童／青少年／健身／年輕人／學生），
  //    預設使用者不是長者。標語若預設對方是老人，等於一開始就稱呼錯。
  'app.tagline': '看懂超市食品標籤的健康放大鏡',
  'app.taglineEn': 'A health magnifier for supermarket food labels',
  'app.statusCloud': '雲端 AI',
  'app.statusLocal': '離線模式',
  'app.menuTitle': '功能選單',
  'app.openMenu': '開啟選單',
  'app.closeMenu': '關閉選單',

  /* ── 側邊選單 ─────────────────────────────────────────────── */
  'menu.home': '主頁',
  'menu.home.hint': '回到首頁',
  'menu.scan': '拍照看標籤',
  'menu.scan.hint': '拍食品標籤',
  'menu.history': '飲食紀錄',
  'menu.history.hint': '看過去的把關紀錄',
  'menu.classroom': '食育學堂',
  'menu.classroom.hint': '學怎麼吃得安心',
  'menu.qa': '健康問答',
  'menu.qa.hint': '問關於吃的健康問題',
  'menu.conditions': '健康設定',
  'menu.conditions.hint': '設定慢性病與過敏原',

  /* ── 主頁 ─────────────────────────────────────────────────── */
  'home.greeting': '您好',
  'home.intro': '今天也要吃得安心。把包裝上的營養標示拍下來，我幫您看看適不適合。',
  'home.cameraButton': '拍照看標籤',
  'home.cameraHint': '拍食品標籤，馬上知道能不能買',
  'home.summaryTitle': '我的把關',
  'home.recordCount': '筆紀錄',
  'home.conditionCount': '項健康設定',
  'home.currentProfile': '目前身分',

  /* ── 底部固定按鈕 ─────────────────────────────────────────── */
  'footer.homeCamera': '拍照看標籤',
  /* 從相簿／檔案選圖（2026-09-30）：只有 capture 的 input 會強制開鏡頭，
     使用者需要另一個入口才能選已經拍好的照片。 */
  'footer.pickFromGallery': '從相簿選',
  'footer.scanCamera': '拍照看標籤',
  'footer.scanRetake': '重新拍照',
  'footer.goScan': '前往拍照',
  'footer.classroomTry': '去超市試試看',
  'footer.qaToScan': '拍照為食品把關',
  'footer.historyScan': '拍照為食品把關',
  'footer.retryScan': '再拍一次',
  // ⚠️ 2026-10-02：拍到「不是食物標籤」的東西時，叫他「再拍一次」是**誤導** ——
  //    他會以為是自己拍不好，於是重拍同一個不是標籤的東西。
  //    這種情況要說「換一個東西拍」。
  'footer.retryScanOther': '換一個東西拍',

  /* ── 設定頁 ───────────────────────────────────────────────── */
  'settings.title': '健康設定',
  'settings.collapseHint': '點一下收起',
  'settings.profile.title': '學習者身分',
  'settings.selectedCount': '已選 {n} 項',
  'settings.notSet': '尚未設定',
  'settings.language.title': '語言',
  /* 2026-09-28 使用者要求：不要解釋文字，只要兩個選項。
     原本的 desc（「選擇您習慣閱讀的語言…」）與兩個 hint 都已移除。 */
  'settings.language.zh': '中文',
  'settings.language.en': 'English',
  'settings.language.saved': '語言已切換',
  'settings.conditions.title': '慢性病與過敏',
  'settings.conditions.availableCount': '共 {n} 項可選',
  'settings.conditions.desc': 'AI 在超市幫您看食品時，會依據勾選項目比對成分與禁忌：',

  /* ── 拍照辨識流程（第二階段）───────────────────────────────── */
  /* 重拍提示卡 */
  'scan.retakeTitle': '這次沒成功',
  'scan.retakeSubtitle': '不是您的問題，不用擔心。',
  'scan.retakeTips': '可以試試這三件事：',
  /* ── 本機 OCR「引擎載入失敗」專用（2026-10-02）
     ⚠️ 這幾句**不可以跟「重拍」混用**。
        「只送文字」與「只在本機」兩個模式都要下載約 6 MB 的辨識引擎；
        下載失敗時重拍照片完全沒有用，只會讓使用者一直做白工。
        → 這種情況要講的是「重試」，不是「重拍」。 */
  'scan.engineTitle': '手機的辨識引擎沒有載入成功',
  'scan.engineSubtitle': '不是您的問題，也跟照片拍得好不好無關。',
  'scan.engineHint':
    '「只送文字」與「只在本機」這兩個模式，需要先下載約 6 MB 的辨識引擎才能讀標籤。剛才沒有下載成功，通常是當下網路不穩。請確認網路順暢後按下面的按鈕重試，或改用「直接雲端」模式。',
  'scan.engineRetry': '用同一張照片再試一次',
  'scan.errEngineNotFound': '辨識引擎沒有載入成功（網路問題，不是照片的問題）',
  'scan.tip1': '把手機靠近成分標籤一點，讓字看清楚',
  'scan.tip2': '找光線亮一點的地方，避開反光',
  'scan.tip3': '走到訊號比較好的位置再拍一次',
  'scan.aimLabel': '對準包裝背面的「營養標示」',
  'scan.tapButton': '點下方「📸 拍照看標籤」',
  'scan.checking': '正在把關：',
  'scan.switchProfile': '切換 ➔',
  /* ── 食物成份表範例（2026-10-03）─────────────────────────────
     ★ 這一塊同時是「本機 OCR 讀不到」的解方之一：
       表格在畫面裡佔多大，比引擎參數更能決定辨識成敗。 */
  /* ── 本機讀不到時的雲端備援（2026-10-03）
     ★ 使用者實測「照片上雲端可以精準識別」，但本機 OCR 在他手機上讀不出來。
       在找出真正原因之前，給他一條**明示同意**的出路。
       ⚠️ 文案必須寫清楚「照片會上傳」——本機模式的承諾就是照片不離開裝置，
          不寫清楚就等於我們自己偷偷違背承諾。 */
  'scan.cloudFallback': '改用「直接雲端」讀這張照片',
  'scan.cloudFallbackHint':
    '雲端模型看整張照片，通常比本機讀得準。照片會上傳，並記住這個設定（可在設定改回）。',
  'scan.cloudFallbackKeep': '或者，用同一張照片再試一次本機讀取',
  'scan.exampleTitle': '要拍的長這樣',
  'scan.exampleBody': '包裝背面都有一塊「營養標示」表格，鈉、糖、碳水這些數字就在裡面。',
  'scan.exampleTip1': '讓表格盡量填滿畫面 —— 離太遠拍，字太小會讀不出來',
  'scan.exampleTip2': '避開反光，光線從側面照比正面直打清楚',
  'scan.exampleTip3': '讀不到也沒關係，App 會直接告訴您，不會亂猜',
  'scan.exampleTry': '用這張範例試一次',
  'scan.exampleAlt': '營養標示範例',
  'scan.demoTitle': '沒有食品？用示範標籤',
  'scan.demoRamen': '🍜 高鈉泡麵標籤',
  'scan.demoRamenTag': '高鈉警示',
  'scan.demoOat': '🥣 無糖燕麥片標籤',
  'scan.demoOatTag': '安全適合',
  'scan.weakSignal': '弱訊號語音安撫',
  'scan.previewVoice': '🔊 試聽',

  /* 結果頁 */
  'result.noConclusion':
    '沒有讀到足夠的營養數字，所以我這次不給結論 —— 這樣才不會猜錯。',
  'result.why': '為什麼？',
  /* 難字簡化的說明（安全網：長條圖用簡單說法，但包裝上印的是另一組字） */
  'result.autoDowngraded':
    '⚠️ 這次連不上雲端，已改用手機內建的方式看（照片沒有上傳）。',
  'result.changeMode': '在設定裡改',
  'result.stopReading': '⏹️ 停止朗讀',
  'result.readToMe': '🔊 念給我聽',
  'result.moreInfo': '更多資訊與替代建議',
  'result.learnConcept': '學一個帶得走的觀念',
  'result.learnWhy': '為什麼',
  'result.learnHow': '下次怎麼看',
  'result.learnMeaning': '對您代表什麼',
  'result.conditionReminders': '您的慢性病提醒',
  'result.alternatives': '可以改買這些',
  'result.dailyAdvice': '每日營養建議',
  'result.habits': '長效健康習慣',
  'result.readTip': '🔊 念這條叮嚀',
  'result.saved': '已自動存入您的「飲食健康紀錄」',
  'result.viewHistory': '查看本週紀錄',
  'result.retakeAdvice': '重拍建議',
  'result.basis': '判斷依據',
  'result.tapToRead': '點擊聽語音朗讀',
  'result.education': '食育教學',
  'result.conditions': '慢性病提醒',
  'result.habit': '習慣',

  /* 結論文字（伺服器沒回傳 warning_title 時的前端備援） */
  'risk.red': '這包對您的身體負擔比較大，建議先放回架上。',
  'risk.yellow': '可以吃，但要留意份量，不要一次吃完整包。',
  'risk.green': '成分溫和，可以放心買回家。',
  'risk.unclearTitle': '看不清楚標籤數字',

  /* 資料處理模式標籤 */
  'mode.cloud': '☁️ 雲端 AI',
  'mode.localBadge': '📴 離線回答',
  /* 來源徽章的 tooltip（滑鼠停留才看到）：用白話說清楚答案從哪來 */
  'mode.cloudBadgeTip': '這次的答案來自雲端 AI。',
  'mode.localBadgeTip': '這次的答案在你手機上算出來，沒有上網。',
  'mode.imageUploaded': '這次的照片有送到雲端。',
  'mode.imageLocal': '這次的照片只在這支手機上處理，沒有上傳。',

  /* ── 三種分析模式（2026-09-30）───────────────────────────────
   * ⚠️ 引導頁與設定頁共用同一組鍵，避免兩邊說法不一致。
   * `*.Data` 是每個模式**最關鍵的差別**：什麼會離開這台手機。
   * 每一句都必須與後端實際行為一致（見 server/handlers.ts 的 localOnly 判斷）。 */
  'mode.title': '要用哪一種 AI？',
  'mode.body': '三種都可以隨時切換，差別在「什麼會離開這台手機」：',
  'mode.cloudImage': '雲端',
  'mode.cloudImageNote': '最準：AI 直接看照片，連標籤排版都看得到。',
  'mode.cloudImageData': '上傳：照片與病史',
  'mode.cloudText': '本機圖像識別',
  'mode.cloudTextNote': '手機先把照片讀成文字，只把文字送給 AI。',
  'mode.cloudTextData': '上傳：標籤與病史',
  'mode.localOnly': '只在本機',
  'mode.localOnlyNote': '完全不上網，最快也最私密，但建議比較簡單。',
  'mode.localOnlyData': '不上傳任何資料',
  'mode.changeLater': '之後可以在設定裡隨時改，不用重來。',
  'mode.savedVoice': '已切換為「{mode}」',
  'mode.currentLabel': '目前的方式',
  /* ── 語音朗讀設定（2026-10-03 新增）
     ★ 這幾句要能回答兩個問題：現在是開的嗎？這台裝置能不能發出聲音？
       因為「設定關掉了」和「裝置做不到」的處理方式完全不同。 */
  /* ── 開發者面板（2026-10-03）：連點主標 7 下進入。 */
  /* ── 開發者面板（2026-10-03）
     ★ 使用者指定：面板文字要**跟介面語言一致**。
       ⚠️ 但 gemini／openrouter／NVIDIA／模型 ID 這些**不翻譯** ——
          它們是專有名稱，翻譯了反而對不上 API 與日誌。
          所以那些字串直接寫在元件裡，不走 i18n。 */
  'dev.title': '開發者資訊',
  'dev.aiUsage': 'AI 用量（標籤辨識鏈）',
  'dev.noKey': '未設定金鑰',
  'dev.cooling': '冷卻中',
  'dev.available': '可用',
  'dev.lastError': '上次錯誤',
  'dev.cooldownUntil': '冷卻至',
  'dev.models': '模型鏈',
  'dev.cache': '回應快取',
  'dev.entries': '{n} 筆',
  'dev.updated': '更新時間',
  'dev.nvidiaTitle': 'NVIDIA NIM',
  'dev.rotationNote': '已加入三供應商輪替；純文字請求會走它，含圖片的請求仍走視覺模型。',
  'dev.key': '金鑰',
  'dev.configured': '已設定',
  'dev.missing': '未設定',
  'dev.runtime': '執行環境',
  'dev.platform': '平台',
  'dev.platformNative': 'App（原生）',
  'dev.platformBrowser': '瀏覽器',
  'dev.speech': '語音',
  'dev.speechNative': '原生 TTS',
  'dev.speechWeb': '瀏覽器 Web Speech',
  'dev.speechNone': '此裝置不支援',
  'dev.localOcr': '本機 OCR',
  'dev.ocrLoaded': '引擎已載入',
  'dev.ocrNotLoaded': '尚未載入',
  'dev.ocrLast': '上次 OCR 結果',
  'dev.analyzeMode': '分析模式',
  'dev.profile': '身分',
  'dev.language': '語言',
  'dev.refresh': '重新整理',
  'dev.close': '關閉',
  'dev.loading': '載入中…',
  'dev.cannotReach': '連不上 /api/ai-status',
  'dev.rawTitle': '上次標籤原文',
  'dev.rawOcr': '本機 OCR 讀到的原始文字',
  'dev.rawAi': 'AI 回傳的原始內容',
  'dev.rawEmpty': '（還沒有紀錄 —— 先掃一次標籤就會出現）',
  'dev.tapMore': '再按 {n} 下',
  'settings.sound.title': '語音朗讀',
  'settings.sound.summaryOn': '音量 {n}%',
  'settings.sound.summaryOff': '已關閉',
  'settings.sound.on': '語音大小：{n}%',
  'settings.sound.muted': '目前沒有聲音',
  'settings.sound.hint': '放開滑桿就會念一句讓您聽聽看。',
  'settings.sound.mutedHint': '把滑桿往右拉就會有聲音。',
  'settings.sound.voiceLang': '朗讀語言',
  'settings.sound.langCantonese': '粵語',
  'settings.sound.langMandarin': '普通話',
  'settings.sound.langEnglish': 'English',
  'settings.sound.volume': '音量',
  'settings.sound.sample': '您好，這是語音朗讀的示範。',
  'settings.sound.unsupported':
    '這個裝置不支援語音朗讀。網頁版需要 Chrome、Edge 或 Safari；App 版請安裝最新的 APK。',
  'settings.sound.checkNative': '聽不到聲音的話，請檢查手機的媒體音量（不是來電音量）。',
  'settings.sound.checkBrowser': '聽不到聲音的話，請檢查系統音量，並確認瀏覽器沒有靜音這個分頁。',
  'settings.mode.title': 'AI 方式',

  /* 營養素長條圖 */
  // ⚠️ 2026-10-02：原本是「這包有 {value} {unit}」——
  //    改成「不換算、只呈現標籤原樣」之後，數字已經不是整包了。
  //    這句話會變成**錯的陳述**（把「每 100 公克 800 毫克」講成「這包有 800 毫克」）。
  'nutrient.amount': '{basis} {value} {unit}',
  'nutrient.basisPer100g': '每 100 公克',
  'nutrient.basisPerServing': '每份',
  'nutrient.basisWholePack': '整包',
  'nutrient.basisUnknown': '標籤未標示基準',
  // ⚠️ 與 basisUnknown 不同：這一種是「App 根本沒去判斷基準」。
  //    本機規則引擎不解析標籤的計數基準，所以它產生的數字**沒有基準資訊**。
  //    說「標籤未標示基準」是對標籤的**錯誤宣稱**（我們沒看，不是它沒寫）；
  //    說「基準未確認」才是誠實描述 App 自己的狀態。
  'nutrient.basisNotConfirmed': '基準未確認',
  'nutrient.dailyMax': '，每天上限 {limit} {unit}',
  'nutrient.dailyMin': '，每天建議至少 {limit} {unit}',
  'nutrient.reaches': '達到 {n}%',
  'nutrient.basis': '以上上限是依「{name}」的每日參考值計算',

  /* 其他 */
  'common.noConditions': '無特殊病史',
  'common.weakSignalSpeech': '照片收到了，正在處理。請保持網路順暢。',
  /** 清單分隔符號：中文用頓號，英文用逗號加空格 */
  'common.listSeparator': '、',
  /** 「血壓、糖尿病 等 5 項」的後綴 */
  'scan.conditionMore': '等 {n} 項',
  /* 語音朗讀的段落標題（拼接給 TTS 用，不是畫面文字） */
  'result.speechWhy': '為什麼：{text}',
  'result.speechHow': '下次怎麼看：{text}',
  'result.speechMeaning': '對您代表什麼：{text}',
  'result.speechAdvice': '每日營養建議：{advice}。長效健康習慣：{habit}',

  /* ── 通用 ─────────────────────────────────────────────────── */
  'common.close': '關閉選單',
  'common.on': '開',
  'common.off': '關',

  /* ── 身分選擇器（第三階段）─────────────────────────────────── */
  'profile.picker.title': '先選您的身分',
  'profile.picker.desc': '選好之後，拍完的結果和學堂內容都會依您的需求調整。之後隨時可以回來改。',
  'profile.picker.selected': '目前選擇',
  'profile.picker.selectAria': '選擇身分：{name}',

  // ── 健康問答（2026-09-29 接回）────────────────────────────────
  'settings.qa.title': '問健康問題',
  'settings.qa.summary': '有問題就問，AI 用白話回答',
  'qa.hint': '有健康或飲食的問題可以直接問。AI 會看您上面填的數字，用白話回答您。',
  'qa.commonTitle': '大家常問的問題',
  'qa.suggestCoffee': '我有高血壓，喝咖啡可以嗎？',
  'qa.suggestBanana': '血糖高可以吃香蕉嗎？',
  'qa.suggestTofu': '痛風可以吃豆腐嗎？',
  'qa.suggestGrapefruit': '吃降血壓藥可以吃柚子嗎？',
  'qa.inputLabel': '或自己輸入問題',
  'qa.placeholder': '例如：我有糖尿病，可以吃西瓜嗎？',
  'qa.ask': '問 AI',
  'qa.busy': 'AI 正在想…',
  'qa.readAloud': '唸給我聽',
  'qa.tips': '💡 安心小叮嚀',
  'qa.modeCloud': '☁️ 雲端 AI 回答',
  'qa.modeLocal': '📴 離線回答（目前沒有連線，用內建知識回答）',
  'qa.error': '目前連不上 AI，請稍後再試一次。',

  // ── 首次啟動引導頁（2026-09-29）──────────────────────────────
  'onboard.stepOf': '第 {n} 步，共 {total} 步',
  'onboard.welcomeTitle': '歡迎使用 LabelBuddy AI',
  'onboard.welcomeBody': '拍一張食品包裝後面的營養標籤，我幫您看這個東西適不適合您吃。',
  /* ── 第 1 頁：超簡單介紹（2026-09-30）── */
  'onboard.introKicker': '超市食品標籤辨識 App',
  'onboard.introTitle': '拍下包裝背後的標籤，馬上知道能不能買',
  'onboard.introBody': '對準包裝背後的「成分表」與「營養標示」拍一張就好。',
  /* 功能清單：第一頁要把每一個功能都講到（使用者指定），
     所以逐條列出，每條只有一行標題 ＋ 一行說明。 */
  'onboard.featListTitle': '這個 App 有什麼',
  'onboard.feat1Title': '拍標籤，看結論',
  'onboard.feat1Body': '紅黃綠，一眼看懂',
  'onboard.feat2Title': '白話說明',
  'onboard.feat2Body': '用簡單的話告訴您為什麼，看不懂的字也講給您聽',
  'onboard.feat3Title': '飲食紀錄',
  'onboard.feat3Body': '每次結果自動存下來，看得到自己的變化',
  'onboard.feat4Title': '食育學堂',
  'onboard.feat4Body': '一步一步教您怎麼看標籤、怎麼挑',
  'onboard.feat5Title': '健康問答',
  'onboard.feat5Body': '有問題可以直接問',
  'onboard.feat6Title': '健康設定',
  'onboard.feat6Body': '選身分、勾慢性病，結論更貼近您',
  /* 「拍這個 → 得到這個」的視覺對照（不識字也看得懂） */
  /* ── 第 3 頁：慢性病與過敏（2026-09-30）── */
  'onboard.conditionsTitle': '您有下面這些情形嗎？',
  'onboard.conditionsBody': '有的話請打勾。沒有的話直接按下一步就好。',
  'onboard.conditionsChronic': '慢性病',
  'onboard.conditionsAllergy': '食物過敏',
  'onboard.conditionsAllergyNote': '會過敏的食物請務必打勾。',
  'onboard.identityTitle': '先問一下：您是誰？',
  'onboard.identityBody':
    '這個答案很重要。同一包食物，對不同的人結論可能完全相反。',
/* 性別與稱謂相關的鍵已於 2026-10-02 全部移除（使用者指定）。 */
  /* ── 健身專區介紹頁（2026-10-02）：只在身分＝健身人士時出現 ──
     放在身分頁之後。使用者剛講完自己是健身人士，這時說「所以你多了一個專區」
     因果最清楚；放到後面隔了慢性病與教學就斷了。 */
  'onboard.fitnessTitle': '您多了一個「健身專區」',
  'onboard.fitnessBody': '因為您選擇了健身人士，功能選單裡會多一個專區，專門放健身要用的東西。',
  'onboard.fitnessPlanBody': '選目標（增肌／減脂／雕塑）與每週天數，直接排出課表。',
  'onboard.fitnessLogBody': '記下重量、組數、次數與休息，看得到這週練了多少。',
  'onboard.fitnessNutritionBody': '算出每日熱量與蛋白質目標，並記錄吃了什麼。',
  'onboard.fitnessPrivacy': '健身紀錄只存在這台手機裡，不會自動上傳。只有您自己按下「用 AI 產生報告」時，才會把統計數字送出去。',

  'onboard.howTitle': '這個 App 怎麼用',  'onboard.how1Title': '第一步：拍照',
  'onboard.how1Body': '對著包裝後面那張表拍一張。光線亮一點、手不要晃。也可以從相簿選已經拍好的照片。',
  'onboard.how2Title': '第二步：看顏色',
  'onboard.how2Body':
    '綠色可以買。黃色少吃一點。紅色先放回去。我會用白話講為什麼，也可以唸給您聽。',
  'onboard.how3Title': '第三步：沒網路的時候',
  'onboard.how3Body':
    '收訊不好也不怕。沒網路時，我會用手機裡的方法先幫您看，只是講得比較簡單。',
  'onboard.privacyTitle': '私隱與 AI 使用方式',
  'onboard.privacyPromiseTitle': '無論選哪一種都不變',
  'onboard.privacy1': '伺服器不保存任何照片：不落地儲存、不寫入資料庫，處理完就忘掉。',
  'onboard.privacy2': '沒有帳號、沒有廣告、沒有第三方追蹤。',
  'onboard.privacy3': '紀錄只存在這台裝置，你可以隨時在設定裡清除。',
  'onboard.next': '下一步',
  'onboard.back': '上一步',
  // 向下捲動提示（2026-10-02）。只在內容超出手機畫面時出現 ——
  // 這時「下一步」按鈕會落在畫面之外，使用者會以為頁面卡住。
  'onboard.scrollHint': '下面還有內容',
  'onboard.start': '開始使用',

  /* ── 私隱條款與免責聲明（設定底部 ＋ 引導頁共用）───────────────
   * ⚠️ 這一段的字級刻意用 12px，是全站唯一的例外。
   *    理由與風險見 src/components/LegalNotice.tsx 的檔頭註解。 */
  'legal.privacy.title': '私隱條款',
  'legal.privacy.1': '照片會不會離開裝置，取決於你在上面選的分析模式 —— 每一個模式都寫明了「什麼會離開手機」。',
  'legal.privacy.2': '伺服器不保存任何照片：不落地儲存、不寫入資料庫，處理完就丟棄。',
  'legal.privacy.3': '飲食紀錄與身分設定只存在這台裝置；雲端模式只會把標籤內容與慢性病史送去判斷，不會保存，也不會與任何人共享。',
  'legal.privacy.4': '本 App 沒有帳號、沒有廣告、沒有第三方追蹤，也不收集任何個人身分資料。',
  'legal.privacy.5': '你隨時可以在設定中改回「只在本機分析」，或按「清除所有資料」把一切刪除。',
  'legal.disclaimer.title': '免責聲明',
  'legal.disclaimer.1': '本 App 提供的是一般飲食與營養參考，不是醫療診斷、治療或處方建議。',
  'legal.disclaimer.2': '本 App 不能取代醫師、藥師或營養師的專業意見。任何用藥、停藥或飲食調整，請先諮詢專業醫療人員。',
  'legal.disclaimer.3': 'AI 分析可能出錯。判斷結果僅供參考，請務必自行核對包裝上的營養標示與官方公告。',
  'legal.disclaimer.4': '食品成分與相關法規可能隨時變動，請以產品包裝標示及主管機關公告為準。',
  'legal.disclaimer.5': '若你依本 App 的資訊做出決定而產生任何後果，開發者不負法律責任。',
  'legal.agreeLabel': '我已閱讀並同意上述私隱條款與免責聲明',
  'legal.agreeRequired': '請先勾選「我已閱讀並同意」才能開始使用。',

  /* ── 清除所有資料（設定頁最下方，兩級警告）───────────────────── */
  'clear.title': '清除所有資料',
  'clear.summary': '一鍵刪除本 App 存在這台裝置上的所有資料，並回到首次啟動的引導頁。',
  'clear.button': '清除所有資料',
  'clear.step1Title': '這會刪除什麼？',
  'clear.step1Body': '以下資料會從這台裝置永久刪除，而且無法復原：',
  'clear.item1': '身分設定',
  'clear.item2': '慢性病與過敏原設定',
  'clear.item3': '飲食紀錄與一週統計',
  'clear.item4': '食育學堂的學習進度',
  'clear.item5': '雲端分析同意設定與介面語言',
  'clear.step2Title': '最後確認',
  'clear.step2Body': '真的要刪除全部資料嗎？刪除後無法復原，App 會回到一開始的引導頁。',
  'clear.continue': '我了解，繼續',
  'clear.confirmDelete': '確定全部刪除',
  'clear.cancel': '取消',

  /* ── 慢性病與過敏原清單（第三階段）─────────────────────────── */
  'conditions.filterAria': '依分類篩選健康項目',
  'conditions.selectedCount': '已選擇（{n}）',
  'conditions.allSelected': '已全部選擇',
  'conditions.noneHint': '尚未選擇任何項目。建議至少勾選 1 項，AI 才能為您把關。',
  'conditions.collapseAria': '收起「{name}」說明',
  'conditions.expandAria': '展開「{name}」說明',
  'conditions.available': '可選擇的項目（{n}）',
  'conditions.critical': '過敏原',
  /** ★ 2026-10-02 使用者指定：過敏選項**不要寫「絕對不能吃」「會呼吸困難」等後果字樣**。
      本 App 是飲食教育工具，不是診斷工具 —— 寫得越肯定，責任越大，
      而且後果因人而異，統一的說法反而可能誤導。用中性描述即可。 */
  'conditions.allergenTitle': '食物過敏原',
  'conditions.allergenHint': '請勾選您會過敏的食物',
  'conditions.allChosen': '所有項目都已勾選完畢。',
  'conditions.categoryAllChosen': '這個分類的項目都已勾選，都在上方的「已選擇」區。',

  /* ── 健康設定頁的其餘文字（第三階段）───────────────────────── */
  'settings.savedKept': '已保留您原本的設定',
  'settings.savedReset': '已為您重新套用預設的健康項目',
  'settings.profileSwitched': '已切換為{name}',
  'settings.noConditionsSelected': '目前沒有勾選任何病史',
  'settings.conditionsPreview': '包括：{list}',
  'settings.conditionsPreviewMore': '共 {n} 項，包括：{list} 等等',
  'settings.readFull': '🔊 朗讀我的完整健康設定（粵語/國語）',
  'settings.done': '完成，前往拍照',
  'settings.upgradeTitle': '我們新增了更多健康項目',
  'settings.upgradeBody':
    '現在可以勾選的慢性病與過敏原變多了（共 {n} 項）。您原本勾選的項目我們都保留了，要不要花一分鐘重新確認一下？',
  'settings.upgradeKeep': '保留我原本的設定',
  'settings.upgradeReselect': '重新選擇',
  /* 語音朗讀整份健康設定（拼接給 TTS，不是畫面文字） */
  'settings.speech':
    '您好！目前把關的病史{condPart}。詳細設定可以在健康設定頁查看。在超市買餸時，我們會為您嚴密把關！',

  /* ── 每日營養建議（結果頁第三層，第三階段）─────────────────── */
  'advice.redSodium.badge': '少吃重鹹・多喝溫水',
  'advice.redSodium.advice':
    '若吃了重鹹或含鈉較高的食品，請記得多喝 2 至 3 杯溫開水幫助體內排鈉，今天其他餐點請記得少鹽少醬汁！',
  'advice.redSodium.habit': '長期小習慣：煮菜少放半匙鹽，喝湯只喝半碗，心血管更輕鬆。',
  'advice.redSugar.badge': '控糖護血管・飯後走動',
  'advice.redSugar.advice':
    '高糖容易造成血糖劇烈波動。今天建議改喝溫水或無糖麥茶，飯後在家中慢步 15 分鐘！',
  'advice.redSugar.habit': '長期小習慣：下午點心用低糖水果或無調味堅果取代精緻甜點蛋糕。',
  'advice.redKidney.badge': '護腎減負擔・多吃原型',
  'advice.redKidney.advice':
    '腎臟代謝需要水分與天然營養，今天其他餐點請以清蒸水煮的原型食物為主，避免重鹹或加工醃製肉品！',
  'advice.redKidney.habit': '長期小習慣：多吃新鮮蔬果，少喝火鍋湯底與濃稠肉汁。',
  'advice.redOther.badge': '減輕負擔・清淡飲食',
  'advice.redOther.advice':
    '這類食品加工與添加成分較多，今天其餘餐點多吃一份深綠色蔬菜，讓腸胃與身體好好休息！',
  'advice.redOther.habit': '長期小習慣：正餐盡量選擇看得到食物原本形貌的天然食材。',
  'advice.yellow.badge': '注意份量・細嚼慢嚥',
  'advice.yellow.advice':
    '這款食品建議偶爾嚐鮮即可，食用時分次少量、慢嚼細嚥，並搭配一杯溫水減少身體負擔！',
  'advice.yellow.habit': '長期小習慣：每餐吃七分飽，放慢進食速度，幫助腸胃消化吸收。',
  'advice.green.badge': '天然・保持好習慣',
  'advice.green.advice':
    '太棒了！這款食品成分單純無過多負擔，天天多攝取天然原型食物，身體元氣滿分！',
  'advice.green.habit': '長期小習慣：每天定時喝足溫開水、多吃五色蔬果，維持長壽活力。',

  /* ── 掃描流程的提示與錯誤訊息（第三階段）───────────────────── */
  'scan.readingLabel': '正在讀取標籤文字',
  /* 「直接雲端」失敗時的自動降級提示（一定要讓使用者知道，不能悄悄降級） */
  'scan.autoDowngrade': '雲端忙線中，已改用手機內建的方式重試。',
  'scan.analyzing': '正在幫您看',
  'scan.errBusy': '網絡繁忙，請稍後再試',
  'scan.errUnclear': '照片看不清楚，請重新拍一次',
  'scan.errNoResult': '這張標籤看不清楚，請再拍一次',
  'scan.errPhoto': '讀取照片失敗，請重新拍照。',
  'settings.savedKeptToast': '已保留您原本的設定',
  'settings.savedResetToast': '已為您重新套用預設的健康項目',

  /* 飲食紀錄的時間顯示 */
  'history.justNow': '剛剛 ({time})',
  'history.dateFormat': '{m}月{d}日 {ampm}',
  'history.am': '上午',
  'history.pm': '下午',

  /* 紀錄的食品名稱（後端沒給出可辨識品名時的備援，第三階段） */
  'foodname.ramen': '紅燒牛肉風味泡麵',
  'foodname.oat': '純天然高纖大燕麥片',
  'foodname.soymilk': '低糖黑豆營養豆漿',
  'foodname.sodaCracker': '海鹽無添加蘇打餅',
  'foodname.milk': '無加糖高鈣全脂鮮奶',
  'foodname.green': '健康安心選購食品',
  'foodname.yellow': '微量調味需注意食品',
  'foodname.red': '高負擔不建議食品',

  /* ── 等待畫面（第三階段）───────────────────────────────────── */
  'loading.reading': '正在讀取標籤…',
  'loading.analyzing': '正在幫您看…',
  'loading.localOnly': '照片只在這支手機上處理，不會送出去',
  'loading.typical': '通常需要 5 到 10 秒',
  'loading.waited': '（已等 {n} 秒）',
  'loading.privacyBadge': '照片不會離開這支手機',
  'loading.signalTitle': '保持網路',
  'loading.signalSpeech': '🔊 語音：「正在為您分析」',

  /* ── 飲食紀錄頁（第三階段）─────────────────────────────────── */
  'history.ariaModule': '我的飲食健康紀錄模組',
  'history.title': '飲食健康週紀錄',
  'history.subtitle': '過去 7 天的紀錄',
  'history.export': '匯出健康概況',
  'history.gradeBadge': '評級 {letter} ({title})',
  'history.gradeA': '優良把關',
  'history.gradeB': '良好維持',
  'history.gradeC': '注意防護',
  'history.sevenDays': '7天把關',
  'history.timesFood': '次食品',
  'history.stopSpeak': '停止播報',
  'history.speakWeekly': '🔊 朗讀週總結',
  'history.greenLight': '綠燈',
  'history.yellowLight': '黃燈',
  'history.redLight': '紅燈',
  'history.timesUnit': '次',
  'history.filterAll': '全部 ({n})',
  'history.filterGreen': '綠燈 ({n})',
  'history.filterYellow': '黃燈 ({n})',
  'history.filterRed': '紅燈 ({n})',
  'history.barGreen': '綠燈 {n}%',
  'history.barYellow': '黃燈 {n}%',
  'history.barRed': '紅燈 {n}%',
  'history.emptyFilter': '此分級目前暫無紀錄。',
  'history.badgeGreen': '🟢 綠燈',
  'history.badgeYellow': '🟡 黃燈',
  'history.badgeRed': '🔴 紅燈',
  'history.speakThisTitle': '唸給我聽',
  'history.speakThis': '播報',
  'history.plainLabel': '💬 長者白話說明：',
  'history.altLabel': '💡 採買替代建議：',
  'history.collapse': '▲ 收起詳細說明',
  'history.expand': '▼ 查看完整白話說明與建議',
  'history.exportFooter': '📤 匯出健康週報給家人',
  'history.clear': '清空紀錄',
  'history.clearConfirm': '確定要清空過去一週的飲食紀錄嗎？',
  'history.modalTitle': '匯出長者健康概況',
  'history.modalSubtitle': '已整理好生理指標與飲食週報，可複製分享給家人',
  'history.modalTip1': '點擊下方大按鈕即可',
  'history.modalTipStrong1': '一鍵複製文字',
  'history.modalTip2': '，或在下方文字框',
  'history.modalTipStrong2': '長按全選複製',
  'history.modalTip3': '，直接貼至 LINE、WhatsApp 等通訊軟體傳給子女或家人查看！',
  'history.textLabel': '📋 概況文字內容（可長按選取）：',
  'history.textHint': '點選即可手動複製',
  'history.copied': '✅ 已複製到剪貼簿！',
  'history.copy': '📋 一鍵複製全文',
  'history.share': '📤 分享給家人',
  'history.closeWindow': '關閉視窗',
  'history.closeAria': '關閉',
  'history.shareTitle': '長者飲食健康概況週報',

  /* 匯出週報的純文字內容（逐行組裝，行與行之間用換行接起來） */
  'history.report.title': '【LabelBuddy AI 長者飲食健康概況週報】',
  'history.report.date': '📅 產出日期：{date}',
  'history.report.conditions': '  • 把關病史與過敏：{list}',
  'history.report.gradeHeader': '📊 過去一週飲食健康綜合評級：【評級 {letter} - {title}】',
  'history.report.total': '  • 總共把關：{n} 次食品',
  'history.report.greenRow': '  • 🟢 綠燈：{n} 次 ({pct}%)',
  'history.report.yellowRow': '  • 🟡 黃燈：{n} 次 ({pct}%)',
  'history.report.redRow': '  • 🔴 紅燈：{n} 次 ({pct}%)',
  'history.report.itemsHeader': '🛒 近期把關食品明細摘要：',
  'history.report.item': '  {i}. 【{name}】 {tag}：{title}',
  'history.report.itemGreen': '🟢綠燈',
  'history.report.itemYellow': '🟡黃燈',
  'history.report.itemRed': '🔴紅燈',
  'history.report.noItems': '  （還沒有紀錄）',
  'history.report.tipsHeader': '💡 溫馨健康叮嚀：',
  'history.report.tip1': '  • 請保持每日充足水分攝取（約 1500~2000cc）。',
  'history.report.tip2': '  • 採買時認明綠燈天然原型食材，少吃高鈉加工醬料與高糖零食。',
  'history.report.tip3': '  • 買之前先看一眼標籤，長期下來就是最好的健康投資。',
  'history.report.noConditions': '無特殊慢性病史',
  'history.speech.empty':
    '您好！您過去一週尚未有掃描紀錄，只要點擊底部的拍照按鈕，就可以開始為您的健康飲食把關囉！',
  'history.speech.summary':
    '您好！這是您過去一週的健康飲食評級：總共把關了 {total} 次食品，綜合評定為 {letter} 級！其中綠燈食品有 {green} 次，黃燈提醒 {yellow} 次，紅燈 {red} 次。您有細心照顧身體，繼續保持！',

  /* ── 食育學堂（第三階段）───────────────────────────────────── */
  'classroom.title': '食育學堂',
  'classroom.intro': '學會看懂食品標示，下次去超市就能自己判斷。這裡的內容不需上網，隨時可以看。',
  'classroom.currentProfile': '目前身分：{name}',
  'classroom.tabsAria': '學堂分頁',
  'classroom.tabCards': '知識卡',
  'classroom.tabQuiz': '測驗',
  'classroom.tabProgress': '我的進度',
  'classroom.all': '全部',
  'classroom.allQuestions': '全部題目',
  'classroom.topicCount': '{label}（{n}）',
  'classroom.cardCount': '共 {n} 張卡片，已讀 {m} 張',
  'classroom.read': '已讀',
  'classroom.stopReading': '停止朗讀',
  'classroom.listen': '用聽的',
  'classroom.markRead': '我讀完了',
  'classroom.questionOf': '第 {i} 題 / 共 {n} 題',
  'classroom.correct': '✅ 答對了！',
  'classroom.wrongHint': '💡 再想一下，解說在這裡：',
  'classroom.prev': '上一題',
  'classroom.next': '下一題',
  'classroom.restart': '從第一題重新開始',
  'classroom.noQuestions': '這個主題目前沒有題目。',
  'classroom.readCards': '已讀知識卡',
  'classroom.correctCount': '答對過的題數',
  'classroom.attempts': '累計作答 {total} 次，答對 {correct} 次',
  'classroom.accuracy': '（正確率 {pct}%）',
  'classroom.remaining': '還有 {n} 題沒答對過',
  'classroom.remainingHint': '建議先回去看對應的知識卡，再回來測一次。',
  'classroom.clearProgress': '清除學習紀錄',

  /* ── 健身專區（2026-10-02 新增；只在身分＝健身人士時出現）─────────
     ⚠️ 動作名稱與課表名稱**不在這裡** —— 它們是資料，放在
        `src/data/fitnessContent.ts`（用 {zh, en} 必填欄位，
        漏英文一樣會編譯失敗，但不必把 100 多個鍵塞進這個檔案）。 */
  'menu.fitness': '健身專區',
  'menu.fitness.hint': '課表、訓練紀錄、熱量',

  'fit.title': '健身專區',
  'fit.subtitle': '課表規劃、訓練紀錄、熱量與營養素追蹤。資料只存在這台裝置。',
  'fit.tabPlan': '課表規劃',
  'fit.tabLog': '訓練紀錄',
  'fit.tabNutrition': '飲食熱量',

  'fit.goalTitle': '你的目標',
  'fit.daysTitle': '每週練幾天',
  'fit.daysUnit': '每週 {n} 天',
  'fit.planTitle': '你的課表（每週 {n} 天）',
  'fit.dayN': '第 {n} 天',
  'fit.prescription': '{sets} 組 × {reps} 次，休息 {rest} 秒',
  'fit.cardioAfter': '這一節結束後加有氧。',
  'fit.planNote':
    '這是依你的目標與天數排出的標準課表。動作品質比重量重要 —— 動作做不穩就先降重量。',

  'fit.addTitle': '記一組',
  'fit.phExercise': '動作名稱（例如：深蹲）',
  'fit.phSession': '鍛鍊部位（選填，例如：胸、腿）',
  'fit.phWeight': '重量（公斤）',
  'fit.phSets': '組數',
  'fit.phReps': '次數',
  'fit.phRest': '休息（秒）',
  'fit.addButton': '新增紀錄',
  'fit.chartTitle': '最近 7 天的訓練量',
  'fit.chartNote': '訓練量 = 重量 × 組數 × 次數。只計算有填重量的動作（自重訓練不會顯示在這裡）。',
  'fit.logTitle': '訓練紀錄（{n} 筆）',
  'fit.logEmpty': '還沒有紀錄。在上面填一組，就會出現在這裡。',
  'fit.logDetail': '{sets} 組 × {reps} 次，休息 {rest} 秒',
  'fit.deleteAria': '刪除「{name}」這筆紀錄',

  'fit.bodyTitle': '你的身體資料',
  'fit.phBodyWeight': '體重（公斤）',
  'fit.phBodyHeight': '身高（公分）',
  'fit.phBodyAge': '年齡',
  'fit.bodySexAria': '生理性別',
  'fit.sexUnspecified': '不指定',
  'fit.sexMale': '男',
  'fit.sexFemale': '女',
  'fit.targetTitle': '每日目標',
  'fit.kcalTarget': '熱量 {n} 大卡',
  'fit.macroProtein': '蛋白質',
  'fit.macroCarb': '碳水化合物',
  'fit.macroFat': '脂肪',
  'fit.unitG': '公克',
  'fit.estimateNote': '這是用身高體重估算的參考值，誤差約 ±10%，不是精密測量結果。',
  'fit.needBody': '填上體重、身高、年齡，就會算出你的每日熱量與三大營養素目標。',

  'fit.todayTitle': '今天的飲食',
  'fit.phMeal': '吃了什麼（選填）',
  'fit.phKcal': '熱量（大卡）',
  'fit.phProtein': '蛋白質（公克）',
  'fit.phCarb': '碳水（公克）',
  'fit.phFat': '脂肪（公克）',
  'fit.addMeal': '新增這一餐',
  'fit.todayKcal': '今天累計 {n} 大卡',
  'fit.unnamedMeal': '未命名',
  'fit.mealNote': '營養素可以留空，只記熱量也可以。重點是**持續記**，不是記得多精確。',
  'fit.groupHint': '課表會涵蓋的部位：{list}',
  'fit.notForProfile': '健身專區只提供給「健身人士」這個身分。你目前的設定不是健身人士。',
  'fit.backHome': '回到主頁',

  /* ── AI 健身週報（2026-10-02）
     ★ 隱私原則：健身紀錄平常完全留在裝置上（專區介紹頁也是這樣寫的），
       所以按鈕上的說明**必須自己講清楚會送出什麼** ——
       與標籤辨識的同意閘門是同一條原則：
       「不可以在使用者不知道的情況下上傳」。 */
  'fit.reportTitle': '這週的 AI 報告',
  'fit.reportNote':
    '按下按鈕會把這週的**統計數字**送到雲端 AI（訓練天數、總訓練量、動作名稱、平均熱量）。逐筆紀錄與日期不會送出。',
  'fit.reportButton': '用 AI 產生這週的報告',
  'fit.reportLoading': 'AI 正在看您的紀錄…',
  'fit.reportError': '暫時拿不到報告。請稍後再試一次——紀錄都還在，不會不見。',
  'fit.reportSourceAi': 'AI 產生',
  'fit.reportSourceLocal': '本機規則產生（AI 暫時不可用）',
  'fit.reportObs': '觀察',
  'fit.reportSuggest': '建議',
} as const;

/** 所有可用的翻譯鍵。新增鍵只要加在 zhTW，這裡會自動跟上。 */
export type TranslationKey = keyof typeof zhTW;

/**
 * 英文。
 *
 * ⚠️ 型別標註成 `Record<TranslationKey, string>` 是刻意的：
 *    少任何一個鍵都會編譯失敗，強迫兩種語言保持同步。
 */
const en: Record<TranslationKey, string> = {
  'app.name': 'LabelBuddy AI',
  /* 中文副標。英文刻意留空 —— 見 zhTW 版本的說明（英文維持 LabelBuddy AI）。 */
  'app.nameZh': '',
  'app.documentTitle': 'LabelBuddy AI - Your supermarket health helper',
  'app.tagline': 'A health magnifier for supermarket food labels',
  'app.taglineEn': 'A health magnifier for supermarket food labels',
  'app.statusCloud': 'Cloud AI',
  'app.statusLocal': 'Offline mode',
  'app.menuTitle': 'Menu',
  'app.openMenu': 'Open menu',
  'app.closeMenu': 'Close menu',

  'menu.home': 'Home',
  'menu.home.hint': 'Back to the start',
  'menu.scan': 'Photo a label',
  'menu.scan.hint': 'Photograph a food label',
  'menu.history': 'History',
  'menu.history.hint': 'See past checks',
  'menu.classroom': 'Learn',
  'menu.classroom.hint': 'Learn to eat safely',
  'menu.qa': 'Health Q&A',
  'menu.qa.hint': 'Ask a health question',
  'menu.conditions': 'Health settings',
  'menu.conditions.hint': 'Set conditions and allergens',

  'home.greeting': 'Hello',
  'home.intro':
    'Take a photo of the nutrition label and I will tell you whether this product suits you.',
  'home.cameraButton': 'Photo a label',
  'home.cameraHint': 'Find out if it is safe to buy',
  'home.summaryTitle': 'My checks',
  'home.recordCount': 'records',
  'home.conditionCount': 'health settings',
  'home.currentProfile': 'Current profile',

  'footer.homeCamera': 'Photo a label',
  'footer.pickFromGallery': 'From gallery',
  'footer.scanCamera': 'Photo a label',
  'footer.scanRetake': 'Retake photo',
  'footer.goScan': 'Go to the camera',
  'footer.classroomTry': 'Try it at the store',
  'footer.qaToScan': 'Check a product',
  'footer.historyScan': 'Check a product',
  'footer.retryScan': 'Take another photo',
  'footer.retryScanOther': 'Shoot something else',

  'settings.title': 'Health settings',
  'settings.collapseHint': 'Tap to collapse',
  'settings.profile.title': 'Learner profile',
  'settings.selectedCount': '{n} selected',
  'settings.notSet': 'Not set',
  'settings.language.title': 'Language',
  'settings.language.zh': '中文',
  'settings.language.en': 'English',
  'settings.language.saved': 'Language changed',
  'settings.conditions.title': 'Conditions and allergens',
  'settings.conditions.availableCount': '{n} available',
  'settings.conditions.desc':
    'When you photograph a product, the AI checks the ingredients against the items you select:',

  'scan.retakeTitle': 'That did not work',
  'scan.retakeSubtitle': 'It is not your fault — nothing is broken.',
  'scan.retakeTips': 'Three things you can try:',
  /* ── On-device OCR engine failed to load (2026-10-02) ── */
  'scan.engineTitle': 'The on-device reading engine did not load',
  'scan.engineSubtitle': 'This is not your fault, and it is not about how well you took the photo.',
  'scan.engineHint':
    'The "text only" and "on-device only" modes must download about 6 MB of reading engine before they can read a label. That download did not finish, usually because the connection was unstable. Check your connection and tap the button below to try again — or switch to "Direct cloud" mode.',
  'scan.engineRetry': 'Try again with the same photo',
  'scan.errEngineNotFound': 'The reading engine could not be loaded (a network problem, not a photo problem)',
  'scan.tip1': 'Move the phone closer to the ingredient list',
  'scan.tip2': 'Find brighter light and avoid glare',
  'scan.tip3': 'Move somewhere with a better signal and try again',
  'scan.aimLabel': 'Point at the nutrition table on the back',
  'scan.tapButton': 'Tap "📸 Photo a label" below',
  'scan.checking': 'Checking for:',
  'scan.switchProfile': 'Change ➔',
  /* ── Nutrition label example (2026-10-03) ── */
  /* ── Cloud fallback when on-device reading fails (2026-10-03) ── */
  'scan.cloudFallback': 'Read this photo in the cloud instead',
  'scan.cloudFallbackHint':
    'The cloud model sees the whole photo and usually reads it more accurately. The photo will be uploaded, and this setting is remembered (you can change it back in Settings).',
  'scan.cloudFallbackKeep': 'Or try on-device reading again with the same photo',
  'scan.exampleTitle': 'This is what to photograph',
  'scan.exampleBody': 'On the back of the pack there is a nutrition table — sodium, sugar and carbs are in there.',
  'scan.exampleTip1': 'Fill the frame with the table — shooting from far away makes the text too small to read',
  'scan.exampleTip2': 'Avoid glare; light from the side works better than straight on',
  'scan.exampleTip3': 'If it cannot read, it will say so — it never guesses',
  'scan.exampleTry': 'Try it with this sample',
  'scan.exampleAlt': 'Nutrition label example',
  'scan.demoTitle': 'No product? Try a sample label',
  'scan.demoRamen': '🍜 High-sodium instant noodles',
  'scan.demoRamenTag': 'High sodium',
  'scan.demoOat': '🥣 Unsweetened oatmeal',
  'scan.demoOatTag': 'Safe for you',
  'scan.weakSignal': 'Weak signal voice support',
  'scan.previewVoice': '🔊 Preview',

  'result.noConclusion':
    'I could not read enough nutrition numbers, so I am not giving a verdict this time — that way I will not guess wrong.',
  'result.why': 'Why?',
  'result.autoDowngraded':
    'Could not reach the cloud, so this used what is built into your phone instead. Your photo was not uploaded.',
  'result.changeMode': 'Change mode in Settings',
  'result.stopReading': '⏹️ Stop reading',
  'result.readToMe': '🔊 Read it to me',
  'result.moreInfo': 'More details and alternatives',
  'result.learnConcept': 'One idea to take away',
  'result.learnWhy': 'Why',
  'result.learnHow': 'What to look for next time',
  'result.learnMeaning': 'What it means for you',
  'result.conditionReminders': 'Your condition reminders',
  'result.alternatives': 'Better alternatives',
  'result.dailyAdvice': 'Daily nutrition advice',
  'result.habits': 'Long-term habits',
  'result.readTip': '🔊 Read this tip',
  'result.saved': 'Saved to your food health history',
  'result.viewHistory': 'View this week',
  'result.retakeAdvice': 'Retake advice',
  'result.basis': 'How I decided',
  'result.tapToRead': 'Tap to hear it read aloud',
  'result.education': 'Food education',
  'result.conditions': 'Condition reminders',
  'result.habit': 'Habit',

  'risk.red': 'This product is a heavy burden for you — best to put it back on the shelf.',
  'risk.yellow': 'You can eat it, but watch the portion — do not finish the whole pack at once.',
  'risk.green': 'The ingredients are gentle — safe to buy and take home.',
  'risk.unclearTitle': 'Cannot read the label numbers',

  'mode.cloud': '☁️ Cloud AI',
  'mode.localBadge': '📴 Offline answer',
  'mode.cloudBadgeTip': 'This answer came from the cloud AI.',
  'mode.localBadgeTip': 'This answer was worked out on your phone, with no internet.',
  'mode.imageUploaded': 'This photo was uploaded for cloud analysis.',
  'mode.imageLocal': 'This photo was processed only on this phone — it was not uploaded.',

  /* ── The three analysis modes (2026-09-30) ───────────────────── */
  'mode.title': 'Which kind of AI?',
  'mode.body': 'You can switch any time. The difference is what leaves your phone:',
  'mode.cloudImage': 'Cloud',
  'mode.cloudImageNote': 'Most accurate: the AI reads the photo itself, layout and all.',
  'mode.cloudImageData': 'Uploads: photo + health info',
  'mode.cloudText': 'On-device image recognition',
  'mode.cloudTextNote': 'Your phone turns the photo into text first; only the text is sent.',
  'mode.cloudTextData': 'Uploads: text + health info',
  'mode.localOnly': 'On-device only',
  'mode.localOnlyNote': 'No internet at all — fastest and most private, but simpler advice.',
  'mode.localOnlyData': 'Uploads nothing',
  'mode.changeLater': 'You can change this in Settings later — no need to start over.',
  'mode.savedVoice': 'Switched to {mode}',
  'mode.currentLabel': 'Current mode',
  /* ── Speech settings (2026-10-03) ── */
  /* ── Developer panel (2026-10-03): tap the title 7 times. ── */
  /* ── Developer panel (2026-10-03) ── */
  'dev.title': 'Developer',
  'dev.aiUsage': 'AI usage (label recognition chain)',
  'dev.noKey': 'No key',
  'dev.cooling': 'Cooling down',
  'dev.available': 'Available',
  'dev.lastError': 'last',
  'dev.cooldownUntil': 'until',
  'dev.models': 'Models',
  'dev.cache': 'Cache',
  'dev.entries': '{n} entries',
  'dev.updated': 'Updated',
  'dev.nvidiaTitle': 'NVIDIA NIM',
  'dev.rotationNote': 'Added to the three-provider rotation; text-only requests may use it, image requests still use vision models.',
  'dev.key': 'Key',
  'dev.configured': 'configured',
  'dev.missing': 'missing',
  'dev.runtime': 'Runtime',
  'dev.platform': 'Platform',
  'dev.platformNative': 'App (native)',
  'dev.platformBrowser': 'Browser',
  'dev.speech': 'Speech',
  'dev.speechNative': 'native TTS',
  'dev.speechWeb': 'browser Web Speech',
  'dev.speechNone': 'unsupported on this device',
  'dev.localOcr': 'Local OCR',
  'dev.ocrLoaded': 'engine loaded',
  'dev.ocrNotLoaded': 'not loaded yet',
  'dev.ocrLast': 'Last OCR result',
  'dev.analyzeMode': 'Mode',
  'dev.profile': 'Profile',
  'dev.language': 'Language',
  'dev.refresh': 'Refresh',
  'dev.close': 'Close',
  'dev.loading': 'Loading…',
  'dev.cannotReach': 'Cannot reach /api/ai-status',
  'dev.rawTitle': 'Last label raw text',
  'dev.rawOcr': 'Raw text from on-device OCR',
  'dev.rawAi': 'Raw AI response',
  'dev.rawEmpty': '(nothing yet — scan a label once)',
  'dev.tapMore': '{n} more taps',
  'settings.sound.title': 'Voice reading',
  'settings.sound.summaryOn': 'Volume {n}%',
  'settings.sound.summaryOff': 'Muted',
  'settings.sound.on': 'Voice volume: {n}%',
  'settings.sound.muted': 'No sound right now',
  'settings.sound.hint': 'Let go of the slider and it will read a line to you.',
  'settings.sound.mutedHint': 'Drag the slider to the right to enable sound.',
  'settings.sound.voiceLang': 'Voice language',
  'settings.sound.langCantonese': 'Cantonese',
  'settings.sound.langMandarin': 'Mandarin',
  'settings.sound.langEnglish': 'English',
  'settings.sound.volume': 'Volume',
  'settings.sound.sample': 'Hello, this is a sample of voice reading.',
  'settings.sound.unsupported':
    'This device cannot read text aloud. The web version needs Chrome, Edge or Safari; for the app, please install the latest APK.',
  'settings.sound.checkNative': 'If you hear nothing, check the media volume on your phone (not the ring volume).',
  'settings.sound.checkBrowser': 'If you hear nothing, check your system volume and make sure this tab is not muted.',
  'settings.mode.title': 'AI analysis mode',

  'nutrient.amount': '{basis}: {value} {unit}',
  'nutrient.basisPer100g': 'Per 100 g',
  'nutrient.basisPerServing': 'Per serving',
  'nutrient.basisWholePack': 'Whole pack',
  'nutrient.basisUnknown': 'Basis not stated',
  'nutrient.basisNotConfirmed': 'Basis not confirmed',
  'nutrient.dailyMax': ', daily limit {limit} {unit}',
  'nutrient.dailyMin': ', aim for at least {limit} {unit} per day',
  'nutrient.reaches': '{n}% of daily target',
  'nutrient.basis': 'These limits are based on the daily reference values for {name}',

  'common.noConditions': 'No specific conditions',
  'common.weakSignalSpeech':
    'Photo received, processing. Please stay where the signal is good.',
  'common.listSeparator': ', ',
  'scan.conditionMore': 'and {n} more',
  'result.speechWhy': 'Why: {text}',
  'result.speechHow': 'What to look for next time: {text}',
  'result.speechMeaning': 'What this means for you: {text}',
  'result.speechAdvice': 'Daily nutrition advice: {advice}. Long-term habit: {habit}',

  'common.close': 'Close menu',
  'common.on': 'On',
  'common.off': 'Off',

  'profile.picker.title': 'Choose your profile',
  'profile.picker.desc':
    'Once chosen, results and lesson content adapt to your needs. You can change it any time.',
  'profile.picker.selected': 'Selected',
  'profile.picker.selectAria': 'Select profile: {name}',

  // ── Health Q&A (restored 2026-09-29) ──────────────────────────
  'settings.qa.title': 'Ask a health question',
  'settings.qa.summary': 'Ask anything \u2014 the AI answers in plain words',
  'qa.hint':
    'Have a health or diet question? Just ask. The AI will look at the numbers you entered above and answer in plain words.',
  'qa.commonTitle': 'Questions people often ask',
  'qa.suggestCoffee': 'I have high blood pressure \u2014 can I drink coffee?',
  'qa.suggestBanana': 'Can I eat bananas if my blood sugar is high?',
  'qa.suggestTofu': 'Can I eat tofu if I have gout?',
  'qa.suggestGrapefruit': 'I take blood pressure medicine \u2014 can I eat grapefruit?',
  'qa.inputLabel': 'Or type your own question',
  'qa.placeholder': 'For example: I have diabetes \u2014 can I eat watermelon?',
  'qa.ask': 'Ask the AI',
  'qa.busy': 'The AI is thinking\u2026',
  'qa.readAloud': 'Read this to me',
  'qa.tips': '💡 Good to know',
  'qa.modeCloud': '☁️ Answered by cloud AI',
  'qa.modeLocal': '📴 Offline answer (no connection right now, using built-in knowledge)',
  'qa.error': 'Cannot reach the AI right now. Please try again in a moment.',

  // ── First-run onboarding (2026-09-29) ───────────────────────────
  'onboard.stepOf': 'Step {n} of {total}',
  'onboard.welcomeTitle': 'Welcome to LabelBuddy AI',
  'onboard.welcomeBody':
    'Take a photo of the nutrition label on the back of any food package, and I will tell you whether it suits you.',
  /* ── Page 1: very short intro (2026-09-30) ── */
  'onboard.introKicker': 'Supermarket food-label app',
  'onboard.introTitle': 'Photograph the label on the pack \u2014 know at once if you can buy it',
  'onboard.introBody': 'Just photograph the ingredient list and nutrition table on the back of the pack.',
  'onboard.featListTitle': 'What this app does',
  'onboard.feat1Title': 'Photo a label, get a verdict',
  'onboard.feat1Body': 'Red, yellow, green at a glance',
  'onboard.feat2Title': 'Plain-language explanation',
  'onboard.feat2Body': 'Why it is fine, or why not \u2014 hard words explained',
  'onboard.feat3Title': 'History',
  'onboard.feat3Body': 'Every result is saved so you can see the pattern',
  'onboard.feat4Title': 'Learn',
  'onboard.feat4Body': 'Step-by-step lessons on reading labels',
  'onboard.feat5Title': 'Health Q&A',
  'onboard.feat5Body': 'Ask a question whenever you want',
  'onboard.feat6Title': 'Health settings',
  'onboard.feat6Body': 'Pick your profile and conditions for a sharper verdict',
  /* ── Page 3: conditions and allergies (2026-09-30) ── */
  'onboard.conditionsTitle': 'Do any of these apply to you?',
  'onboard.conditionsBody': 'Tick the ones that apply. If none do, just tap Next.',
  'onboard.conditionsChronic': 'Long-term conditions',
  'onboard.conditionsAllergy': 'Food allergies',
  'onboard.conditionsAllergyNote': 'Please tick any food you are allergic to.',
  'onboard.identityTitle': 'First, who are you?',
  'onboard.identityBody':
    'This answer matters. The same food can get opposite verdicts for different people.',
/* 性別與稱謂相關的鍵已於 2026-10-02 全部移除（使用者指定）。 */
  /* ── Fitness zone intro page (2026-10-02): only for the Fitness profile ── */
  'onboard.fitnessTitle': 'You also get a Fitness zone',
  'onboard.fitnessBody': 'Because you chose the Fitness profile, a new section appears in the menu, built around training.',
  'onboard.fitnessPlanBody': 'Pick a goal (build muscle / lose fat / tone) and days per week to get a plan.',
  'onboard.fitnessLogBody': 'Record weight, sets, reps and rest — and see how much you trained this week.',
  'onboard.fitnessNutritionBody': 'Get daily calorie and protein targets, and log what you ate.',
  'onboard.fitnessPrivacy': 'Your training records stay on this phone and are never uploaded automatically. Only when you tap "Generate report with AI" are summary numbers sent.',

  'onboard.howTitle': 'How this app works',
  'onboard.how1Title': 'Step 1: Take a photo',
  'onboard.how1Body':
    'Photograph the table on the back of the pack. Good light, steady hand. You can also pick a photo you already took.',
  'onboard.how2Title': 'Step 2: Read the colour',
  'onboard.how2Body':
    'Green: fine to buy. Yellow: keep the portion small. Red: put it back. I will explain why in plain words, and can read it aloud.',
  'onboard.how3Title': 'Step 3: When there is no internet',
  'onboard.how3Body':
    'Weak signal is fine. Without internet I use what is built into your phone \u2014 the advice is just simpler.',
  'onboard.privacyTitle': 'Privacy and how the AI is used',
  'onboard.privacyPromiseTitle': 'These hold true in every mode',
  'onboard.privacy1': 'The server never stores photos \u2014 no disk, no database, gone after processing.',
  'onboard.privacy2': 'No accounts, no ads, no third-party tracking.',
  'onboard.privacy3': 'Records stay on this device and you can clear them any time in Settings.',
  'onboard.next': 'Next',
  'onboard.back': 'Back',
  'onboard.scrollHint': 'More below',
  'onboard.start': 'Get started',

  /* ── Privacy notice & disclaimer (settings bottom + onboarding) ──
   * ⚠️ Deliberately 12px — the only exception to the 16px font-size floor.
   *    See the header comment in src/components/LegalNotice.tsx. */
  'legal.privacy.title': 'Privacy notice',
  'legal.privacy.1':
    'Whether your photo leaves the phone depends on the analysis mode you choose above \u2014 each mode states exactly what leaves your phone.',
  'legal.privacy.2':
    'The server never stores photos: no disk, no database, discarded after processing.',
  'legal.privacy.3':
    'Diet records and your profile stay on this device. Cloud modes send only the label content and your conditions for judgement \u2014 never stored, never shared.',
  'legal.privacy.4':
    'This app has no accounts, no ads, no third-party tracking, and collects no personally identifying data.',
  'legal.privacy.5':
    'You can switch back to on-device analysis at any time in Settings, or press "Clear all data" to delete everything.',
  'legal.disclaimer.title': 'Disclaimer',
  'legal.disclaimer.1':
    'This app provides general food and nutrition information. It is not medical diagnosis, treatment or prescribing advice.',
  'legal.disclaimer.2':
    'This app is not a substitute for a doctor, pharmacist or dietitian. Always consult a healthcare professional about medication or dietary changes.',
  'legal.disclaimer.3':
    'AI analysis can be wrong. Treat the result as a reference only and always check the nutrition panel on the packaging yourself.',
  'legal.disclaimer.4':
    'Ingredients and regulations can change. The product label and the competent authority\u2019s announcements take precedence.',
  'legal.disclaimer.5':
    'The developer accepts no legal liability for any consequence of decisions made using this app.',
  'legal.agreeLabel': 'I have read and agree to the privacy notice and disclaimer above',
  'legal.agreeRequired': 'Please tick "I have read and agree" before you start.',

  /* ── Clear all data (bottom of Settings, two-stage warning) ─────── */
  'clear.title': 'Clear all data',
  'clear.summary':
    'Delete everything this app has stored on this device in one tap, and return to the first-run setup.',
  'clear.button': 'Clear all data',
  'clear.step1Title': 'What will be deleted?',
  'clear.step1Body':
    'The following will be permanently deleted from this device and cannot be recovered:',
  'clear.item1': 'Profile setting',
  'clear.item2': 'Chronic conditions and allergens',
  'clear.item3': 'Diet records and weekly statistics',
  'clear.item4': 'Food-education learning progress',
  'clear.item5': 'Cloud-analysis consent setting and interface language',
  'clear.step2Title': 'Final confirmation',
  'clear.step2Body':
    'Delete absolutely everything? This cannot be undone, and the app will return to the first-run setup.',
  'clear.continue': 'I understand, continue',
  'clear.confirmDelete': 'Delete everything',
  'clear.cancel': 'Cancel',

  'conditions.filterAria': 'Filter health items by category',
  'conditions.selectedCount': 'Selected ({n})',
  'conditions.allSelected': 'Everything is selected',
  'conditions.noneHint':
    'Nothing selected yet. Please tick at least one item so the AI can check for you.',
  'conditions.collapseAria': 'Collapse the description for {name}',
  'conditions.expandAria': 'Expand the description for {name}',
  'conditions.available': 'Available items ({n})',
  'conditions.critical': 'Allergen',
  'conditions.allergenTitle': 'Food allergens',
  'conditions.allergenHint': 'Tick the foods you are allergic to',
  'conditions.allChosen': 'Every item has been selected.',
  'conditions.categoryAllChosen': 'Every item in this category is selected and listed above.',

  'settings.savedKept': 'Your original settings were kept',
  'settings.savedReset': 'The default health items were applied again',
  'settings.profileSwitched': 'Switched to {name}',
  'settings.noConditionsSelected': 'No conditions selected',
  'settings.conditionsPreview': 'Including: {list}',
  'settings.conditionsPreviewMore': '{n} in total, including: {list} and more',
  'settings.readFull': '🔊 Read my full health settings aloud',
  'settings.done': 'Done — go to the camera',
  'settings.upgradeTitle': 'We added more health items',
  'settings.upgradeBody':
    'There are now more conditions and allergens you can tick ({n} in total). Everything you had selected is kept — would you like a minute to review?',
  'settings.upgradeKeep': 'Keep my current settings',
  'settings.upgradeReselect': 'Choose again',
  'settings.speech':
    'Hello. The conditions being checked are {condPart}. You can review everything on the health settings page. At the supermarket we will check carefully for you.',

  'advice.redSodium.badge': 'Less salt, more water',
  'advice.redSodium.advice':
    'If you ate something salty or high in sodium, drink 2 to 3 cups of warm water to help flush it out, and keep the rest of today\u2019s meals low in salt and sauce.',
  'advice.redSodium.habit':
    'Long-term habit: use half a spoon less salt when cooking, and only half a bowl of soup.',
  'advice.redSugar.badge': 'Control sugar, walk after meals',
  'advice.redSugar.advice':
    'High sugar makes blood sugar swing sharply. Switch to warm water or unsweetened barley tea today, and take a slow 15-minute walk after meals.',
  'advice.redSugar.habit':
    'Long-term habit: replace afternoon cake and pastries with low-sugar fruit or plain nuts.',
  'advice.redKidney.badge': 'Ease the kidneys, eat whole foods',
  'advice.redKidney.advice':
    'Your kidneys need water and natural nutrients. Make today\u2019s other meals steamed or boiled whole foods, and avoid salty or cured processed meat.',
  'advice.redKidney.habit':
    'Long-term habit: eat more fresh vegetables and fruit, and drink less hotpot broth and thick gravy.',
  'advice.redOther.badge': 'Lighten the load, eat plainly',
  'advice.redOther.advice':
    'This product is heavily processed with many additives. Add an extra portion of dark green vegetables to your other meals today and give your stomach a rest.',
  'advice.redOther.habit':
    'Long-term habit: for main meals, choose natural ingredients where you can still see the original shape of the food.',
  'advice.yellow.badge': 'Watch the portion, chew slowly',
  'advice.yellow.advice':
    'Treat this one as an occasional taste. Eat it in small amounts, chew slowly, and have a glass of warm water alongside to lighten the load.',
  'advice.yellow.habit':
    'Long-term habit: stop eating at about 80% full and slow down — it helps digestion and absorption.',
  'advice.green.badge': 'Natural — keep it up',
  'advice.green.advice':
    'Excellent — this product has simple ingredients with nothing extra weighing you down. Keep eating natural whole foods every day.',
  'advice.green.habit':
    'Long-term habit: drink enough warm water at set times each day and eat vegetables and fruit of many colours.',

  'scan.readingLabel': 'Reading the label text',
  'scan.autoDowngrade': 'The cloud is busy \u2014 retrying with what is built into your phone.',
  'scan.analyzing': 'Checking it for you',
  'scan.errBusy': 'The network is busy — please try again shortly',
  'scan.errUnclear': 'The photo is not clear enough — please take another one',
  'scan.errNoResult': 'Could not read this label — please take another photo',
  'scan.errPhoto': 'Could not read the photo. Please take another one.',
  'settings.savedKeptToast': 'Your original settings were kept',
  'settings.savedResetToast': 'The default health items were applied again',

  'history.justNow': 'Just now ({time})',
  'history.dateFormat': '{m}/{d} {ampm}',
  'history.am': 'AM',
  'history.pm': 'PM',

  'foodname.ramen': 'Braised beef instant noodles',
  'foodname.oat': 'Pure wholegrain oats',
  'foodname.soymilk': 'Low-sugar black soybean milk',
  'foodname.sodaCracker': 'Sea-salt soda crackers',
  'foodname.milk': 'Unsweetened high-calcium whole milk',
  'foodname.green': 'Safe healthy choice',
  'foodname.yellow': 'Lightly seasoned — take care',
  'foodname.red': 'High burden — not recommended',

  'loading.reading': 'Reading the label…',
  'loading.analyzing': 'Checking it for you…',
  'loading.localOnly': 'The photo is processed only on this phone — nothing is sent out',
  'loading.typical': 'Usually takes 5 to 10 seconds',
  'loading.waited': '(waited {n}s)',
  'loading.privacyBadge': 'The photo never leaves this phone',
  'loading.signalTitle': 'Stay connected',
  'loading.signalSpeech': '🔊 Voice: "Analysing for you"',

  'history.ariaModule': 'My food health history module',
  'history.title': 'Weekly food health record',
  'history.subtitle': 'Your last 7 days',
  'history.export': 'Export summary',
  'history.gradeBadge': 'Grade {letter} ({title})',
  'history.gradeA': 'Excellent',
  'history.gradeB': 'Good',
  'history.gradeC': 'Needs care',
  'history.sevenDays': '7-day checks',
  'history.timesFood': 'items',
  'history.stopSpeak': 'Stop reading',
  'history.speakWeekly': '🔊 Read the weekly summary',
  'history.greenLight': 'Green',
  'history.yellowLight': 'Yellow',
  'history.redLight': 'Red',
  /* 英文不需要「次」這個量詞，數字單獨放在標籤下即可 */
  'history.timesUnit': '',
  'history.filterAll': 'All ({n})',
  'history.filterGreen': 'Green ({n})',
  'history.filterYellow': 'Yellow ({n})',
  'history.filterRed': 'Red ({n})',
  'history.barGreen': 'Green {n}%',
  'history.barYellow': 'Yellow {n}%',
  'history.barRed': 'Red {n}%',
  'history.emptyFilter': 'No records at this grade yet.',
  'history.badgeGreen': '🟢 Green',
  'history.badgeYellow': '🟡 Yellow',
  'history.badgeRed': '🔴 Red',
  'history.speakThisTitle': 'Read this to me',
  'history.speakThis': 'Read',
  'history.plainLabel': '💬 In plain words:',
  'history.altLabel': '💡 Shopping alternatives:',
  'history.collapse': '▲ Hide details',
  'history.expand': '▼ Show the full explanation and advice',
  'history.exportFooter': '📤 Export the weekly report for family',
  'history.clear': 'Clear records',
  'history.clearConfirm': 'Clear all food records from the past week?',
  'history.modalTitle': 'Export health summary',
  'history.modalSubtitle':
    'Your measurements and weekly food report are ready to copy and share',
  'history.modalTip1': 'Tap the big button below to',
  'history.modalTipStrong1': 'copy everything in one tap',
  'history.modalTip2': ', or press and hold the text box below to',
  'history.modalTipStrong2': 'select and copy',
  'history.modalTip3':
    ', then paste it into LINE, WhatsApp or any chat app to share with your family.',
  'history.textLabel': '📋 Summary text (press and hold to select):',
  'history.textHint': 'Tap to select and copy manually',
  'history.copied': '✅ Copied to clipboard!',
  'history.copy': '📋 Copy everything',
  'history.share': '📤 Share with family',
  'history.closeWindow': 'Close',
  'history.closeAria': 'Close',
  'history.shareTitle': 'Weekly food health summary',

  'history.report.title': '[LabelBuddy AI — Weekly food health summary]',
  'history.report.date': '📅 Date: {date}',
  'history.report.conditions': '  • Conditions and allergies checked: {list}',
  'history.report.gradeHeader': '📊 Overall grade for the past week: [Grade {letter} — {title}]',
  'history.report.total': '  • Products checked: {n}',
  'history.report.greenRow': '  • 🟢 Green: {n} ({pct}%)',
  'history.report.yellowRow': '  • 🟡 Yellow: {n} ({pct}%)',
  'history.report.redRow': '  • 🔴 Red: {n} ({pct}%)',
  'history.report.itemsHeader': '🛒 Recent products checked:',
  'history.report.item': '  {i}. [{name}] {tag}: {title}',
  'history.report.itemGreen': '🟢 Green',
  'history.report.itemYellow': '🟡 Yellow',
  'history.report.itemRed': '🔴 Red',
  'history.report.noItems': '  (nothing yet)',
  'history.report.tipsHeader': '💡 Friendly health reminders:',
  'history.report.tip1': '  • Drink enough water every day (about 1500-2000 ml).',
  'history.report.tip2':
    '  • Choose natural whole foods marked green, and go easy on high-sodium sauces and sugary snacks.',
  'history.report.tip3':
    '  • Glance at the label before you buy — over time that is the best health investment you can make.',
  'history.report.noConditions': 'No specific chronic conditions',
  'history.speech.empty':
    'Hello! You have not scanned anything in the past week. Tap the camera button at the bottom to start checking your food.',
  'history.speech.summary':
    'Hello! Here is your food health grade for the past week: you checked {total} products and the overall grade is {letter}. You had {green} green-light items, {yellow} yellow-light items and {red} red-light items. You are taking good care of yourself — keep it up!',

  'classroom.title': 'Food education',
  'classroom.intro':
    'Learn to read food labels and judge for yourself next time you shop. Everything here works without an internet connection.',
  'classroom.currentProfile': 'Current profile: {name}',
  'classroom.tabsAria': 'Classroom sections',
  'classroom.tabCards': 'Cards',
  'classroom.tabQuiz': 'Quiz',
  'classroom.tabProgress': 'Progress',
  'classroom.all': 'All',
  'classroom.allQuestions': 'All questions',
  'classroom.topicCount': '{label} ({n})',
  'classroom.cardCount': '{n} cards, {m} read',
  'classroom.read': 'Read',
  'classroom.stopReading': 'Stop reading',
  'classroom.listen': 'Listen',
  'classroom.markRead': 'I have read it',
  'classroom.questionOf': 'Question {i} of {n}',
  'classroom.correct': '✅ Correct!',
  'classroom.wrongHint': '💡 Think again — here is the explanation:',
  'classroom.prev': 'Previous',
  'classroom.next': 'Next',
  'classroom.restart': 'Start again from question 1',
  'classroom.noQuestions': 'There are no questions in this topic yet.',
  'classroom.readCards': 'Cards read',
  'classroom.correctCount': 'Questions answered correctly',
  'classroom.attempts': '{total} answers so far, {correct} correct',
  'classroom.accuracy': ' ({pct}% accuracy)',
  'classroom.remaining': '{n} questions not yet answered correctly',
  'classroom.remainingHint': 'Read the matching cards first, then come back and try again.',
  'classroom.clearProgress': 'Clear learning record',

  /* ── Fitness zone (added 2026-10-02; only shown for the fitness profile) ── */
  'menu.fitness': 'Fitness zone',
  'menu.fitness.hint': 'Plan, training log, calories',

  'fit.title': 'Fitness zone',
  'fit.subtitle': 'Plan your week, log your sets, track calories and macros. Everything stays on this device.',
  'fit.tabPlan': 'Plan',
  'fit.tabLog': 'Training log',
  'fit.tabNutrition': 'Food & calories',

  'fit.goalTitle': 'Your goal',
  'fit.daysTitle': 'Days per week',
  'fit.daysUnit': '{n} days a week',
  'fit.planTitle': 'Your plan ({n} days a week)',
  'fit.dayN': 'Day {n}',
  'fit.prescription': '{sets} sets x {reps} reps, rest {rest}s',
  'fit.cardioAfter': 'Add cardio after this session.',
  'fit.planNote':
    'This is a standard plan built from your goal and weekly days. Form matters more than weight — if you cannot control the movement, drop the weight.',

  'fit.addTitle': 'Log a set',
  'fit.phExercise': 'Exercise name (e.g. Squat)',
  'fit.phSession': 'Body part (optional, e.g. Chest, legs)',
  'fit.phWeight': 'Weight (kg)',
  'fit.phSets': 'Sets',
  'fit.phReps': 'Reps',
  'fit.phRest': 'Rest (seconds)',
  'fit.addButton': 'Add entry',
  'fit.chartTitle': 'Training volume, last 7 days',
  'fit.chartNote': 'Volume = weight x sets x reps. Only entries with a weight are counted (bodyweight work will not show here).',
  'fit.logTitle': 'Training log ({n} entries)',
  'fit.logEmpty': 'No entries yet. Fill in a set above and it will appear here.',
  'fit.logDetail': '{sets} sets x {reps} reps, {rest}s rest',
  'fit.deleteAria': 'Delete the entry for {name}',

  'fit.bodyTitle': 'Your body data',
  'fit.phBodyWeight': 'Weight (kg)',
  'fit.phBodyHeight': 'Height (cm)',
  'fit.phBodyAge': 'Age',
  'fit.bodySexAria': 'Biological sex',
  'fit.sexUnspecified': 'Not specified',
  'fit.sexMale': 'Male',
  'fit.sexFemale': 'Female',
  'fit.targetTitle': 'Daily target',
  'fit.kcalTarget': '{n} kcal',
  'fit.macroProtein': 'Protein',
  'fit.macroCarb': 'Carbohydrate',
  'fit.macroFat': 'Fat',
  'fit.unitG': 'g',
  'fit.estimateNote': 'Estimated from your height and weight. Expect about ±10% error — this is not a measured value.',
  'fit.needBody': 'Enter your weight, height and age to see your daily calorie and macro targets.',

  'fit.todayTitle': 'Today\u2019s food',
  'fit.phMeal': 'What you ate (optional)',
  'fit.phKcal': 'Calories (kcal)',
  'fit.phProtein': 'Protein (g)',
  'fit.phCarb': 'Carbs (g)',
  'fit.phFat': 'Fat (g)',
  'fit.addMeal': 'Add this meal',
  'fit.todayKcal': '{n} kcal so far today',
  'fit.unnamedMeal': 'Untitled',
  'fit.mealNote': 'You can leave the macros blank and log only calories. What matters is logging consistently, not perfectly.',
  'fit.groupHint': 'Muscle groups covered by the plan: {list}',
  'fit.notForProfile': 'The fitness zone is only for the "Fitness" profile, and your current profile is not that one.',
  'fit.backHome': 'Back to home',

  /* ── AI weekly fitness report (2026-10-02) ── */
  'fit.reportTitle': 'This week\u2019s AI report',
  'fit.reportNote':
    'Tapping the button sends this week\u2019s summary numbers to a cloud AI (training days, total volume, exercise names, average calories). Individual entries and dates are not sent.',
  'fit.reportButton': 'Generate this week\u2019s report with AI',
  'fit.reportLoading': 'The AI is reading your log\u2026',
  'fit.reportError': 'Could not get a report right now. Please try again later \u2014 your records are safe.',
  'fit.reportSourceAi': 'Generated by AI',
  'fit.reportSourceLocal': 'Generated on-device (AI unavailable)',
  'fit.reportObs': 'What the numbers say',
  'fit.reportSuggest': 'Suggestions',
};

export const TRANSLATIONS: Record<Language, Record<TranslationKey, string>> = {
  'zh-TW': zhTW,
  en,
};

/** 語言選擇器要顯示的資訊 */
export const LANGUAGE_OPTIONS: Array<{
  id: Language;
  labelKey: TranslationKey;
  /** 圓形徽章上的短標記，讓不識字的視覺線索也能分辨兩個選項 */
  short: string;
}> = [
  { id: 'zh-TW', labelKey: 'settings.language.zh', short: '中' },
  { id: 'en', labelKey: 'settings.language.en', short: 'EN' },
];
