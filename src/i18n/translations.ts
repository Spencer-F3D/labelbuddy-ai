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
  // 瀏覽器分頁／書籤的標題（由 I18nProvider 寫進 document.title）
  'app.documentTitle': 'LabelBuddy AI - 您的超市健康小幫手',
  // ⚠️ 不要在這裡寫「專為長者設計」。
  //    本 App 有 6 種身分（長者／兒童／青少年／健身／年輕人／學生），
  //    預設使用者不是長者。標語若預設對方是老人，等於一開始就稱呼錯。
  'app.tagline': '看懂超市食品標籤的健康放大鏡',
  'app.taglineEn': 'A health magnifier for supermarket food labels',
  'app.statusCloud': '雲端 AI 辨識',
  'app.statusLocal': '本機備援引擎',
  'app.menuTitle': '功能選單',
  'app.openMenu': '開啟選單',
  'app.closeMenu': '關閉選單',

  /* ── 側邊選單 ─────────────────────────────────────────────── */
  'menu.home': '主頁',
  'menu.home.hint': '回到首頁',
  'menu.scan': '拍照辨識',
  'menu.scan.hint': '掃描食品標籤',
  'menu.history': '飲食紀錄',
  'menu.history.hint': '看過去的把關紀錄',
  'menu.classroom': '食育學堂',
  'menu.classroom.hint': '學怎麼吃得安心',
  'menu.conditions': '健康設定',
  'menu.conditions.hint': '設定慢性病與過敏原',

  /* ── 主頁 ─────────────────────────────────────────────────── */
  'home.greeting': '您好',
  'home.intro': '今天也要吃得安心。把包裝上的營養標示拍下來，我幫您看看適不適合。',
  'home.cameraButton': '拍照辨識',
  'home.cameraHint': '掃描食品標籤，馬上知道能不能買',
  'home.summaryTitle': '我的把關',
  'home.recordCount': '筆紀錄',
  'home.conditionCount': '項健康設定',
  'home.currentProfile': '目前身分',

  /* ── 底部固定按鈕 ─────────────────────────────────────────── */
  'footer.homeCamera': '拍照辨識',
  'footer.scanCamera': '一鍵拍照',
  'footer.scanRetake': '重新拍照',
  'footer.goScan': '前往拍照辨識',
  'footer.classroomTry': '去超市試試看',
  'footer.historyScan': '拍照為食品把關',
  'footer.retryScan': '再拍一次',

  /* ── 設定頁 ───────────────────────────────────────────────── */
  'settings.title': '健康設定',
  'settings.collapseHint': '點一下收起',
  'settings.profile.title': '學習者身分',
  'settings.vitals.title': '日常生理指標',
  'settings.selectedCount': '已選 {n} 項',
  'settings.notSet': '尚未設定',
  'settings.summary.vitals': '血壓 {bp} · 血糖 {sugar}',
  'settings.language.title': '語言',
  /* 2026-09-28 使用者要求：不要解釋文字，只要兩個選項。
     原本的 desc（「選擇您習慣閱讀的語言…」）與兩個 hint 都已移除。 */
  'settings.language.zh': '中文',
  'settings.language.en': 'English',
  'settings.language.saved': '語言已切換',
  'settings.conditions.title': '個人慢性病與過敏把關',
  'settings.conditions.availableCount': '共 {n} 項可選',
  'settings.conditions.desc': 'AI 在超市辨識食品時，會依據勾選項目嚴格比對食品成分與禁忌：',

  /* ── 拍照辨識流程（第二階段）───────────────────────────────── */
  /* 重拍提示卡 */
  'scan.retakeTitle': '這次沒成功',
  'scan.retakeSubtitle': '不是您的問題，不用擔心。',
  'scan.retakeTips': '可以試試這三件事：',
  'scan.tip1': '把手機靠近成分標籤一點，讓字看清楚',
  'scan.tip2': '找光線亮一點的地方，避開反光',
  'scan.tip3': '走到訊號比較好的位置再拍一次',
  'scan.aimLabel': '對準商品背後的成分標籤',
  'scan.tapButton': '點下方「📸 一鍵拍照」',
  'scan.checking': '正在把關：',
  'scan.switchProfile': '切換 ➔',
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
  'result.switchToLocal': '改回本機模式（文字也不送出）',
  'result.switchToCloud': '改用雲端分析（更準）',
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
  'mode.ocrLocal': '本機離線 OCR（照片沒有離開裝置）',
  'mode.ruleLocal': '本機規則引擎（未使用雲端 AI）',
  'mode.cloudCache': '☁️ 雲端 AI（快取）',
  'mode.cloud': '☁️ 雲端 AI',
  'mode.localBadge': '📴 本機離線',
  'mode.imageUploaded': '這次的照片有上傳到雲端辨識。',
  'mode.imageLocal': '這次的照片只在這支手機上處理，沒有上傳。',

  /* 營養素長條圖 */
  'nutrient.amount': '這包有 {value} {unit}',
  'nutrient.dailyMax': '，每天上限 {limit} {unit}',
  'nutrient.dailyMin': '，每天建議至少 {limit} {unit}',
  'nutrient.reaches': '達到 {n}%',
  'nutrient.basis': '以上上限是依「{name}」的每日參考值計算',

  /* 其他 */
  'common.noConditions': '無特殊病史',
  'common.weakSignalSpeech': '掃描成功，正在處理資料，請保持在網絡訊號良好區域',
  /** 清單分隔符號：中文用頓號，英文用逗號加空格 */
  'common.listSeparator': '、',
  /** 「血壓、糖尿病 等 5 項」的後綴 */
  'scan.conditionMore': '等 {n} 項',
  'result.modelLabel': '模型：{name}',
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
  'profile.picker.desc': '選好之後，辨識結果和學堂內容都會依您的需求調整。之後隨時可以回來改。',
  'profile.picker.selected': '目前選擇',
  'profile.picker.selectAria': '選擇身分：{name}',
  'profile.picker.dailyTitle': '{name}的每日參考值',
  'profile.picker.limit': '不超過',
  'profile.picker.atLeast': '至少',

  /* ── 日常生理指標（第三階段）───────────────────────────────── */
  'vitals.title': '日常身體量測指標',
  'vitals.subtitle': '血壓・心跳・血糖（點擊 ＋/－ 輕鬆調整）',
  'vitals.speak': '🔊 朗讀指標',
  'vitals.quickPick': '常用快選：',

  'vitals.bp.title': '🩸 血壓指標 (mmHg)',
  'vitals.bp.systolic': '上壓 (收縮壓)',
  'vitals.bp.diastolic': '下壓 (舒張壓)',
  'vitals.bp.minusSys': '減少上壓 5',
  'vitals.bp.plusSys': '增加上壓 5',
  'vitals.bp.minusDia': '減少下壓 5',
  'vitals.bp.plusDia': '增加下壓 5',
  'vitals.bp.presetNormal': '標準 (118/78)',
  'vitals.bp.presetSlight': '稍高 (136/86)',
  'vitals.bp.presetHigh': '偏高 (152/95)',
  'vitals.bp.statusHigh': '⚠️ 偏高（需控鈉）',
  'vitals.bp.statusSlight': '⚡ 稍偏高（注意清淡）',
  'vitals.bp.statusNormal': '✅ 正常理想',
  'vitals.bp.adviceHigh':
    '血壓偏高，在超市購物時請特別注意「低鈉」，避開重鹹醃漬品與高鈉調味包！',
  'vitals.bp.adviceSlight': '血壓稍偏高，建議多選擇天然原型食材，少吃泡麵與加工火鍋料。',
  'vitals.bp.adviceNormal': '血壓維持得很棒！請繼續保持少油少鹽的清淡好習慣。',

  'vitals.hr.title': '💓 心跳脈搏 (次/分 bpm)',
  'vitals.hr.label': '靜態心跳脈搏',
  'vitals.hr.unit': 'bpm (次/分)',
  'vitals.hr.minus': '減少心跳 2',
  'vitals.hr.plus': '增加心跳 2',
  'vitals.hr.presetRest': '靜息平穩 (65)',
  'vitals.hr.presetNormal': '標準常態 (75)',
  'vitals.hr.presetActive': '活動稍快 (88)',
  'vitals.hr.presetFast': '心跳偏快 (105)',
  'vitals.hr.statusFast': '⚠️ 偏快（避免刺激）',
  'vitals.hr.statusSlow': '⚡ 偏慢（注意保暖）',
  'vitals.hr.statusNormal': '✅ 平穩正常',
  'vitals.hr.adviceFast': '靜止心跳稍快，請避免高咖啡因飲品、濃茶或能量飲料，多喝溫開水。',
  'vitals.hr.adviceSlow': '心跳稍微偏慢，若有頭暈請及時休息，飲食保持營養均衡。',
  'vitals.hr.adviceNormal': '心跳脈搏非常平穩（正常範圍 60～100 bpm），元氣滿分！',

  'vitals.bs.title': '🍬 血糖指標',
  'vitals.bs.fasting': '🌅 空腹量測',
  'vitals.bs.postMeal': '🍱 飯後 2 小時',
  'vitals.bs.unitMmol': 'mmol/L (港/國際)',
  'vitals.bs.unitMgdl': 'mg/dL (台)',
  'vitals.bs.fastingValue': '空腹血糖值',
  'vitals.bs.postMealValue': '飯後血糖值',
  'vitals.bs.minus': '減少血糖',
  'vitals.bs.plus': '增加血糖',
  'vitals.bs.presetFasting': '空腹正常 ({v})',
  'vitals.bs.presetPostMeal': '飯後正常 ({v})',
  'vitals.bs.presetHigh': '血糖偏高 ({v})',
  'vitals.bs.statusHigh': '⚠️ 偏高（嚴格控糖）',
  'vitals.bs.statusSlight': '⚡ 稍偏高（減少甜食）',
  'vitals.bs.statusNormal': '✅ 血糖理想',
  'vitals.bs.adviceHigh': '血糖偏高，超市選購請認明「無加糖、高纖維」，嚴防含糖飲料與精緻糕點！',
  'vitals.bs.adviceSlight': '血糖稍微偏高，飯後建議多走動，點心少吃高糖水果與甜餅乾。',
  'vitals.bs.adviceNormal': '血糖控制得相當理想，請維持定時定量、多吃蔬菜好習慣。',

  'vitals.extra.title': '🩺 關節尿酸與血脂狀態',
  'vitals.extra.uricAcid': '痛風 / 尿酸指數',
  'vitals.extra.uricNormal': '正常',
  'vitals.extra.uricHigh': '偏高/常痛風',
  'vitals.extra.cholesterol': '血脂 / 膽固醇',
  'vitals.extra.cholNormal': '正常',
  'vitals.extra.cholHigh': '稍高/偏高',

  // ── AI 深入分析（2026-09-29 接回）──────────────────────────────
  'vitals.ai.title': '🤖 讓 AI 幫您深入看一次',
  'vitals.ai.hint':
    '上面的評估是用固定標準算的。按下按鈕，AI 會把您今天量到的數字、勾選的症狀一起看過，給您更完整的解釋與超市買菜建議。',
  'vitals.ai.button': '開始 AI 深入分析',
  'vitals.ai.busy': 'AI 正在看您的數字…',
  'vitals.ai.readAloud': '唸給我聽',
  'vitals.ai.resultTitle': 'AI 的分析結果',
  'vitals.ai.doNotBuy': '🛒 超市千萬不要買',
  'vitals.ai.recommended': '✅ 超市可以安心買',
  'vitals.ai.tips': '💡 生活貼心小叮嚀',
  'vitals.ai.linked': '🔗 已同步到食品標籤掃描',
  'vitals.ai.linkedNote': '下次掃食品標籤時，會特別幫您盯這些項目。',
  'vitals.ai.modeCloud': '☁️ 雲端 AI 分析',
  'vitals.ai.modeLocal': '📴 離線分析（目前沒有連線，用內建規則給您建議）',
  'vitals.ai.error': '目前連不上 AI，請稍後再試一次。',

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
  'onboard.identityTitle': '先問一下：您是誰？',
  'onboard.identityBody':
    '這個答案很重要。同一包食物，對不同的人結論可能完全相反 —— 例如高蛋白粉對健身的人是綠燈，對腎臟不好的人卻是紅燈。',
  'onboard.genderTitle': '要怎麼稱呼您？',
  'onboard.genderBody':
    '只影響我們跟您說話時的稱呼，不影響任何營養判斷。不想說也可以選「不用特別稱呼」。',
  'onboard.genderMale': '先生',
  'onboard.genderFemale': '小姐',
  'onboard.genderNone': '不用特別稱呼',
  'onboard.howTitle': '這個 App 怎麼用',
  'onboard.how1Title': '① 拍照',
  'onboard.how1Body': '對著包裝背後的營養標籤拍一張，或從相簿選一張。',
  'onboard.how2Title': '② 看結果',
  'onboard.how2Body':
    'AI 會用白話告訴您這個能不能買、為什麼，還會列出該注意的成分。看不懂可以按「唸給我聽」。',
  'onboard.how3Title': '③ 沒網路也能用',
  'onboard.how3Body':
    '如果剛好沒有網路，App 會改用內建的規則給您建議，不會整個不能用。',
  'onboard.privacyTitle': '私隱與 AI 使用方式',
  'onboard.privacyPromiseTitle': '我們的承諾',
  'onboard.privacy1': '您拍的照片**從頭到尾都不會離開這台手機**。',
  'onboard.privacy2': 'App 在手機上把照片讀成文字，只把**文字**送出去分析。',
  'onboard.privacy3': '雲端 AI 用您的文字給建議，不會收到您的照片。',
  'onboard.privacyNote':
    '您可以隨時在設定裡改成「只用本機」，那樣連文字也不會送出去。',
  'onboard.modeTitle': '要用哪一種 AI？',
  'onboard.modeBody': '兩種都可以隨時切換：',
  'onboard.modeCloud': '雲端 AI（建議）',
  'onboard.modeCloudNote': '答案最準、最完整。',
  'onboard.modeLocal': '只用本機（完全不上網）',
  'onboard.modeLocalNote': '最快也最私隱，但建議比較簡單。',
  'onboard.modeChangeLater': '之後可以在設定裡隨時改，不用重來。',
  'onboard.next': '下一步',
  'onboard.back': '上一步',
  'onboard.start': '開始使用',

  /* 語音朗讀用的單位（拼接給 TTS，不是畫面文字） */
  'vitals.speech.unitMmol': '毫摩爾每升',
  'vitals.speech.unitMgdl': '毫克每分升',
  'vitals.speech':
    '身體量測指標報告：您的血壓上壓為 {sys}，下壓為 {dia}，評估為 {bpStatus}。心跳為每分鐘 {hr} 次，評估為 {hrStatus}。血糖為 {bs} {bsUnit}，評估為 {bsStatus}。AI 已為您同步設定超市把關重點！',

  /* ── 慢性病與過敏原清單（第三階段）─────────────────────────── */
  'conditions.filterAria': '依分類篩選健康項目',
  'conditions.selectedCount': '已選擇（{n}）',
  'conditions.allSelected': '已全部選擇',
  'conditions.noneHint': '尚未選擇任何項目。建議至少勾選 1 項，AI 才能為您把關。',
  'conditions.collapseAria': '收起「{name}」說明',
  'conditions.expandAria': '展開「{name}」說明',
  'conditions.available': '可選擇的項目（{n}）',
  'conditions.critical': '絕對要避開',
  'conditions.allergenTitle': '食物過敏原（後果最嚴重）',
  'conditions.allergenHint': '誤食可能呼吸困難，請務必勾選',
  'conditions.allChosen': '所有項目都已勾選完畢。',
  'conditions.categoryAllChosen': '這個分類的項目都已勾選，都在上方的「已選擇」區。',
  'conditions.mildReaction': '⚠️ 吃了會腹瀉',
  'conditions.severeReaction': '⚠️ 絕對不能吃，會呼吸困難',

  /* ── 健康設定頁的其餘文字（第三階段）───────────────────────── */
  'settings.savedKept': '已保留您原本的設定',
  'settings.savedReset': '已為您重新套用預設的健康項目',
  'settings.profileSwitched': '已切換為{name}',
  'settings.noConditionsSelected': '目前沒有勾選任何病史',
  'settings.conditionsPreview': '包括：{list}',
  'settings.conditionsPreviewMore': '共 {n} 項，包括：{list} 等等',
  'settings.readFull': '🔊 朗讀我的完整健康設定（粵語/國語）',
  'settings.done': '✅ 設定完成，前往拍照辨識',
  'settings.upgradeTitle': '我們新增了更多健康項目',
  'settings.upgradeBody':
    '現在可以勾選的慢性病與過敏原變多了（共 {n} 項）。您原本勾選的項目我們都保留了，要不要花一分鐘重新確認一下？',
  'settings.upgradeKeep': '保留我原本的設定',
  'settings.upgradeReselect': '重新選擇',
  /* 語音朗讀整份健康設定（拼接給 TTS，不是畫面文字） */
  'settings.speech':
    '您好！您的健康指標設定為：收縮壓 {sys}，舒張壓 {dia}，心跳每分鐘 {hr} 次，血糖 {bs} {bsUnit}。把關的病史{condPart}。詳細設定可以在健康設定頁查看。在超市買餸時，我們會為您嚴密把關！',

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
  'advice.green.badge': '天然安心・保持好習慣',
  'advice.green.advice':
    '太棒了！這款食品成分單純無過多負擔，天天多攝取天然原型食物，身體元氣滿分！',
  'advice.green.habit': '長期小習慣：每天定時喝足溫開水、多吃五色蔬果，維持長壽活力。',

  /* ── 掃描流程的提示與錯誤訊息（第三階段）───────────────────── */
  'scan.savedCloud': '已開啟雲端辨識。之後拍的照片會上傳到雲端分析。',
  'scan.savedLocal': '已改回本機模式，照片不會離開這支手機。',
  'scan.readingLabel': '正在讀取標籤文字',
  'scan.analyzing': '正在為您分析',
  'scan.errBusy': '網絡繁忙，請稍後再試',
  'scan.errUnclear': '照片看不清楚，請重新拍一次',
  'scan.errNoResult': '無法取得食品辨識結果，請再試一次',
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
  'loading.analyzing': '正在為您分析…',
  'loading.localOnly': '照片只在這支手機上處理，不會上傳',
  'loading.typical': '通常需要 5 到 10 秒',
  'loading.waited': '（已等 {n} 秒）',
  'loading.privacyBadge': '照片不會離開這支手機',
  'loading.signalTitle': '超市訊號提示',
  'loading.signalBadge': '🔊 語音已為您播報，資料傳輸中',
  'loading.signalSpeech': '🔊 語音：「正在為您分析」',

  /* ── 飲食紀錄頁（第三階段）─────────────────────────────────── */
  'history.ariaModule': '我的飲食健康紀錄模組',
  'history.title': '飲食健康週紀錄',
  'history.subtitle': '過去 7 天把關與分級分析',
  'history.export': '匯出健康概況',
  'history.gradeBadge': '評級 {letter} ({title})',
  'history.gradeA': '優良把關',
  'history.gradeB': '良好維持',
  'history.gradeC': '注意防護',
  'history.sevenDays': '7天把關',
  'history.timesFood': '次食品',
  'history.stopSpeak': '停止播報',
  'history.speakWeekly': '🔊 朗讀週總結',
  'history.greenLight': '安心綠燈',
  'history.yellowLight': '留意黃燈',
  'history.redLight': '避開紅燈',
  'history.timesUnit': '次',
  'history.filterAll': '全部 ({n})',
  'history.filterGreen': '安心級 ({n})',
  'history.filterYellow': '留意級 ({n})',
  'history.filterRed': '避開級 ({n})',
  'history.barGreen': '綠燈 {n}%',
  'history.barYellow': '黃燈 {n}%',
  'history.barRed': '紅燈 {n}%',
  'history.emptyFilter': '此分級目前暫無紀錄。',
  'history.badgeGreen': '🟢 安心級',
  'history.badgeYellow': '🟡 留意級',
  'history.badgeRed': '🔴 避開級',
  'history.speakThisTitle': '語音播報此食品分析',
  'history.speakThis': '播報',
  'history.plainLabel': '💬 長者白話說明：',
  'history.altLabel': '💡 採買替代建議：',
  'history.collapse': '▲ 收起詳細說明',
  'history.expand': '▼ 查看完整白話說明與建議',
  'history.resetSample': '恢復示範紀錄',
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
  'history.report.vitalsHeader': '🩺 生理指標量測：',
  'history.report.bp': '  • 血壓：{sys}/{dia} mmHg {comment}',
  'history.report.hr': '  • 心跳：{hr} bpm (正常區間 60~100)',
  'history.report.bs': '  • 血糖：{bs} {unit} ({timing})',
  'history.report.conditions': '  • 把關病史與過敏：{list}',
  'history.report.conditionsOnly': '👵 把關健康條件：{list}',
  'history.report.bpHigh': '（偏高警戒）',
  'history.report.bpElevated': '（輕微偏高）',
  'history.report.bpNormal': '（標準健康）',
  'history.report.fasting': '空腹',
  'history.report.postMeal': '飯後',
  'history.report.gradeHeader': '📊 過去一週飲食健康綜合評級：【評級 {letter} - {title}】',
  'history.report.total': '  • 總共把關：{n} 次食品',
  'history.report.greenRow': '  • 🟢 安心推薦級：{n} 次 ({pct}%)',
  'history.report.yellowRow': '  • 🟡 留意份量級：{n} 次 ({pct}%)',
  'history.report.redRow': '  • 🔴 成功避開級：{n} 次 ({pct}%)',
  'history.report.itemsHeader': '🛒 近期把關食品明細摘要：',
  'history.report.item': '  {i}. 【{name}】 {tag}：{title}',
  'history.report.itemGreen': '🟢安心級',
  'history.report.itemYellow': '🟡留意級',
  'history.report.itemRed': '🔴避開級',
  'history.report.noItems': '  （暫無掃描紀錄）',
  'history.report.tipsHeader': '💡 溫馨健康叮嚀：',
  'history.report.tip1': '  • 請保持每日充足水分攝取（約 1500~2000cc）。',
  'history.report.tip2': '  • 採買時認明綠燈天然原型食材，少吃高鈉加工醬料與高糖零食。',
  'history.report.tip3': '  • 規律量測血壓與血糖，有助維持長久健康！',
  'history.report.noConditions': '無特殊慢性病史',
  'history.speech.empty':
    '您好！您過去一週尚未有掃描紀錄，只要點擊底部的拍照按鈕，就可以開始為您的健康飲食把關囉！',
  'history.speech.summary':
    '您好！這是您過去一週的健康飲食評級：總共把關了 {total} 次食品，綜合評定為 {letter} 級！其中安心綠燈食品有 {green} 次，黃燈提醒 {yellow} 次，避開紅燈 {red} 次。您有細心照顧身體，繼續保持！',

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
  'app.documentTitle': 'LabelBuddy AI - Your supermarket health helper',
  'app.tagline': 'A health magnifier for supermarket food labels',
  'app.taglineEn': 'A health magnifier for supermarket food labels',
  'app.statusCloud': 'Cloud AI',
  'app.statusLocal': 'On-device engine',
  'app.menuTitle': 'Menu',
  'app.openMenu': 'Open menu',
  'app.closeMenu': 'Close menu',

  'menu.home': 'Home',
  'menu.home.hint': 'Back to the start',
  'menu.scan': 'Scan a label',
  'menu.scan.hint': 'Read a food label',
  'menu.history': 'History',
  'menu.history.hint': 'See past checks',
  'menu.classroom': 'Learn',
  'menu.classroom.hint': 'Learn to eat safely',
  'menu.conditions': 'Health settings',
  'menu.conditions.hint': 'Set conditions and allergens',

  'home.greeting': 'Hello',
  'home.intro':
    'Take a photo of the nutrition label and I will tell you whether this product suits you.',
  'home.cameraButton': 'Scan a label',
  'home.cameraHint': 'Find out if it is safe to buy',
  'home.summaryTitle': 'My checks',
  'home.recordCount': 'records',
  'home.conditionCount': 'health settings',
  'home.currentProfile': 'Current profile',

  'footer.homeCamera': 'Scan a label',
  'footer.scanCamera': 'Take a photo',
  'footer.scanRetake': 'Retake photo',
  'footer.goScan': 'Go to scanner',
  'footer.classroomTry': 'Try it at the store',
  'footer.historyScan': 'Check a product',
  'footer.retryScan': 'Take another photo',

  'settings.title': 'Health settings',
  'settings.collapseHint': 'Tap to collapse',
  'settings.profile.title': 'Learner profile',
  'settings.vitals.title': 'Daily health measurements',
  'settings.selectedCount': '{n} selected',
  'settings.notSet': 'Not set',
  'settings.summary.vitals': 'BP {bp} · Sugar {sugar}',
  'settings.language.title': 'Language',
  'settings.language.zh': '中文',
  'settings.language.en': 'English',
  'settings.language.saved': 'Language changed',
  'settings.conditions.title': 'My conditions and allergens',
  'settings.conditions.availableCount': '{n} available',
  'settings.conditions.desc':
    'When scanning a product, the AI strictly checks the ingredients against the items you select:',

  'scan.retakeTitle': 'That did not work',
  'scan.retakeSubtitle': 'It is not your fault — nothing is broken.',
  'scan.retakeTips': 'Three things you can try:',
  'scan.tip1': 'Move the phone closer to the ingredient list',
  'scan.tip2': 'Find brighter light and avoid glare',
  'scan.tip3': 'Move somewhere with a better signal and try again',
  'scan.aimLabel': 'Point at the ingredient list on the back',
  'scan.tapButton': 'Tap "📸 Take a photo" below',
  'scan.checking': 'Checking for:',
  'scan.switchProfile': 'Change ➔',
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
  'result.switchToLocal': 'Switch back to on-device (nothing is sent out)',
  'result.switchToCloud': 'Use cloud analysis (more accurate)',
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

  'mode.ocrLocal': 'On-device OCR (photo never left your phone)',
  'mode.ruleLocal': 'On-device rule engine (no cloud AI)',
  'mode.cloudCache': '☁️ Cloud AI (cached)',
  'mode.cloud': '☁️ Cloud AI',
  'mode.localBadge': '📴 On-device',
  'mode.imageUploaded': 'This photo was uploaded for cloud analysis.',
  'mode.imageLocal': 'This photo was processed only on this phone — it was not uploaded.',

  'nutrient.amount': 'This pack has {value} {unit}',
  'nutrient.dailyMax': ', daily limit {limit} {unit}',
  'nutrient.dailyMin': ', aim for at least {limit} {unit} per day',
  'nutrient.reaches': '{n}% of daily target',
  'nutrient.basis': 'These limits are based on the daily reference values for {name}',

  'common.noConditions': 'No specific conditions',
  'common.weakSignalSpeech':
    'Scan complete, processing your data. Please stay where the signal is good.',
  'common.listSeparator': ', ',
  'scan.conditionMore': 'and {n} more',
  'result.modelLabel': 'Model: {name}',
  'result.speechWhy': 'Why: {text}',
  'result.speechHow': 'What to look for next time: {text}',
  'result.speechMeaning': 'What this means for you: {text}',
  'result.speechAdvice': 'Daily nutrition advice: {advice}. Long-term habit: {habit}',

  'common.close': 'Close menu',
  'common.on': 'On',
  'common.off': 'Off',

  'profile.picker.title': 'Choose your profile',
  'profile.picker.desc':
    'Once chosen, scan results and lesson content adapt to your needs. You can change it any time.',
  'profile.picker.selected': 'Selected',
  'profile.picker.selectAria': 'Select profile: {name}',
  'profile.picker.dailyTitle': 'Daily reference values for {name}',
  'profile.picker.limit': 'Up to',
  'profile.picker.atLeast': 'At least',

  'vitals.title': 'Daily health measurements',
  'vitals.subtitle': 'Blood pressure, heart rate and blood sugar (tap + / − to adjust)',
  'vitals.speak': '🔊 Read them out',
  'vitals.quickPick': 'Quick pick:',

  'vitals.bp.title': '🩸 Blood pressure (mmHg)',
  'vitals.bp.systolic': 'Systolic',
  'vitals.bp.diastolic': 'Diastolic',
  'vitals.bp.minusSys': 'Lower systolic by 5',
  'vitals.bp.plusSys': 'Raise systolic by 5',
  'vitals.bp.minusDia': 'Lower diastolic by 5',
  'vitals.bp.plusDia': 'Raise diastolic by 5',
  'vitals.bp.presetNormal': 'Normal (118/78)',
  'vitals.bp.presetSlight': 'Slightly high (136/86)',
  'vitals.bp.presetHigh': 'High (152/95)',
  'vitals.bp.statusHigh': '⚠️ High (watch sodium)',
  'vitals.bp.statusSlight': '⚡ Slightly high (eat light)',
  'vitals.bp.statusNormal': '✅ Normal and ideal',
  'vitals.bp.adviceHigh':
    'Your blood pressure is high. At the store, look for "low sodium" and avoid salty pickles and high-sodium seasoning packs.',
  'vitals.bp.adviceSlight':
    'Your blood pressure is slightly high. Choose natural, unprocessed foods and go easy on instant noodles and processed hotpot items.',
  'vitals.bp.adviceNormal':
    'Your blood pressure is in great shape. Keep up the low-oil, low-salt habit.',

  'vitals.hr.title': '💓 Heart rate (bpm)',
  'vitals.hr.label': 'Resting heart rate',
  'vitals.hr.unit': 'bpm',
  'vitals.hr.minus': 'Lower heart rate by 2',
  'vitals.hr.plus': 'Raise heart rate by 2',
  'vitals.hr.presetRest': 'Calm at rest (65)',
  'vitals.hr.presetNormal': 'Typical (75)',
  'vitals.hr.presetActive': 'Slightly active (88)',
  'vitals.hr.presetFast': 'Fast (105)',
  'vitals.hr.statusFast': '⚠️ Fast (avoid stimulants)',
  'vitals.hr.statusSlow': '⚡ Slow (keep warm)',
  'vitals.hr.statusNormal': '✅ Steady and normal',
  'vitals.hr.adviceFast':
    'Your resting heart rate is a little fast. Avoid high-caffeine drinks, strong tea and energy drinks, and drink more warm water.',
  'vitals.hr.adviceSlow':
    'Your heart rate is slightly slow. If you feel dizzy, rest right away and keep your meals balanced.',
  'vitals.hr.adviceNormal':
    'Your pulse is very steady (normal range 60–100 bpm). Excellent.',

  'vitals.bs.title': '🍬 Blood sugar',
  'vitals.bs.fasting': '🌅 Fasting',
  'vitals.bs.postMeal': '🍱 2 hours after a meal',
  'vitals.bs.unitMmol': 'mmol/L (HK / international)',
  'vitals.bs.unitMgdl': 'mg/dL (TW)',
  'vitals.bs.fastingValue': 'Fasting blood sugar',
  'vitals.bs.postMealValue': 'Blood sugar after a meal',
  'vitals.bs.minus': 'Lower blood sugar',
  'vitals.bs.plus': 'Raise blood sugar',
  'vitals.bs.presetFasting': 'Normal fasting ({v})',
  'vitals.bs.presetPostMeal': 'Normal after a meal ({v})',
  'vitals.bs.presetHigh': 'High ({v})',
  'vitals.bs.statusHigh': '⚠️ High (strict sugar control)',
  'vitals.bs.statusSlight': '⚡ Slightly high (less sweet food)',
  'vitals.bs.statusNormal': '✅ Ideal blood sugar',
  'vitals.bs.adviceHigh':
    'Your blood sugar is high. Look for "no added sugar" and "high fibre", and stay away from sweetened drinks and refined pastries.',
  'vitals.bs.adviceSlight':
    'Your blood sugar is slightly high. Walk more after meals and go easy on sweet fruit and biscuits.',
  'vitals.bs.adviceNormal':
    'Your blood sugar is well controlled. Keep eating at regular times and eating plenty of vegetables.',

  'vitals.extra.title': '🩺 Uric acid and blood lipids',
  'vitals.extra.uricAcid': 'Gout / uric acid',
  'vitals.extra.uricNormal': 'Normal',
  'vitals.extra.uricHigh': 'High / frequent gout',
  'vitals.extra.cholesterol': 'Blood lipids / cholesterol',
  'vitals.extra.cholNormal': 'Normal',
  'vitals.extra.cholHigh': 'Slightly high / high',

  // ── AI in-depth analysis (restored 2026-09-29) ──────────────────
  'vitals.ai.title': '🤖 Let the AI take a closer look',
  'vitals.ai.hint':
    'The assessment above uses fixed thresholds. Tap the button and the AI will read today\u2019s numbers together with the symptoms you ticked, and give you a fuller explanation plus supermarket advice.',
  'vitals.ai.button': 'Start AI analysis',
  'vitals.ai.busy': 'The AI is reading your numbers\u2026',
  'vitals.ai.readAloud': 'Read this to me',
  'vitals.ai.resultTitle': 'AI analysis result',
  'vitals.ai.doNotBuy': '🛒 Do not buy at the supermarket',
  'vitals.ai.recommended': '✅ Safe to buy',
  'vitals.ai.tips': '💡 Daily care tips',
  'vitals.ai.linked': '🔗 Also watched in label scanning',
  'vitals.ai.linkedNote': 'Next time you scan a food label, these are the things it will watch for you.',
  'vitals.ai.modeCloud': '☁️ Analysed by cloud AI',
  'vitals.ai.modeLocal':
    '📴 Offline analysis (no connection right now, so built-in rules are advising you)',
  'vitals.ai.error': 'Cannot reach the AI right now. Please try again in a moment.',

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
  'onboard.identityTitle': 'First, who are you?',
  'onboard.identityBody':
    'This answer matters. The same food can get opposite verdicts for different people \u2014 protein powder is a green light for a gym-goer but a red light for someone with kidney trouble.',
  'onboard.genderTitle': 'How should we address you?',
  'onboard.genderBody':
    'This only changes how we speak to you. It does not affect any nutrition judgement. If you would rather not say, choose "No particular title".',
  'onboard.genderMale': 'Mr',
  'onboard.genderFemale': 'Ms',
  'onboard.genderNone': 'No particular title',
  'onboard.howTitle': 'How this app works',
  'onboard.how1Title': '① Take a photo',
  'onboard.how1Body':
    'Point at the nutrition label on the back of the package, or pick a photo from your album.',
  'onboard.how2Title': '② Read the result',
  'onboard.how2Body':
    'The AI tells you in plain words whether you can buy it and why, and lists the ingredients to watch. Tap "Read this to me" if reading is tiring.',
  'onboard.how3Title': '③ It works offline too',
  'onboard.how3Body':
    'If you happen to have no connection, the app switches to built-in rules instead of failing completely.',
  'onboard.privacyTitle': 'Privacy and how the AI is used',
  'onboard.privacyPromiseTitle': 'Our promise',
  'onboard.privacy1': 'Your photo **never leaves this phone** \u2014 not at any point.',
  'onboard.privacy2':
    'The app reads the photo into text on your phone, and only the **text** is sent out.',
  'onboard.privacy3': 'The cloud AI works from that text. It never receives your photo.',
  'onboard.privacyNote':
    'You can switch to "on-device only" in Settings at any time \u2014 then even the text stays on your phone.',
  'onboard.modeTitle': 'Which AI would you like?',
  'onboard.modeBody': 'You can switch between these at any time:',
  'onboard.modeCloud': 'Cloud AI (recommended)',
  'onboard.modeCloudNote': 'The most accurate and complete answers.',
  'onboard.modeLocal': 'On-device only (no internet at all)',
  'onboard.modeLocalNote': 'Fastest and most private, but simpler advice.',
  'onboard.modeChangeLater': 'You can change this in Settings later \u2014 no need to start over.',
  'onboard.next': 'Next',
  'onboard.back': 'Back',
  'onboard.start': 'Get started',

  'vitals.speech.unitMmol': 'mmol/L',
  'vitals.speech.unitMgdl': 'mg/dL',
  'vitals.speech':
    'Health measurement report. Your blood pressure is {sys} over {dia}, assessed as {bpStatus}. Your heart rate is {hr} beats per minute, assessed as {hrStatus}. Your blood sugar is {bs} {bsUnit}, assessed as {bsStatus}. The AI has updated your supermarket checks accordingly.',

  'conditions.filterAria': 'Filter health items by category',
  'conditions.selectedCount': 'Selected ({n})',
  'conditions.allSelected': 'Everything is selected',
  'conditions.noneHint':
    'Nothing selected yet. Please tick at least one item so the AI can check for you.',
  'conditions.collapseAria': 'Collapse the description for {name}',
  'conditions.expandAria': 'Expand the description for {name}',
  'conditions.available': 'Available items ({n})',
  'conditions.critical': 'Must avoid',
  'conditions.allergenTitle': 'Food allergens (most serious)',
  'conditions.allergenHint': 'Eating these by mistake can cause breathing difficulty — please tick them',
  'conditions.allChosen': 'Every item has been selected.',
  'conditions.categoryAllChosen': 'Every item in this category is selected and listed above.',
  'conditions.mildReaction': '⚠️ Causes diarrhoea',
  'conditions.severeReaction': '⚠️ Never eat — can cause breathing difficulty',

  'settings.savedKept': 'Your original settings were kept',
  'settings.savedReset': 'The default health items were applied again',
  'settings.profileSwitched': 'Switched to {name}',
  'settings.noConditionsSelected': 'No conditions selected',
  'settings.conditionsPreview': 'Including: {list}',
  'settings.conditionsPreviewMore': '{n} in total, including: {list} and more',
  'settings.readFull': '🔊 Read my full health settings aloud',
  'settings.done': '✅ Done — go to the scanner',
  'settings.upgradeTitle': 'We added more health items',
  'settings.upgradeBody':
    'There are now more conditions and allergens you can tick ({n} in total). Everything you had selected is kept — would you like a minute to review?',
  'settings.upgradeKeep': 'Keep my current settings',
  'settings.upgradeReselect': 'Choose again',
  'settings.speech':
    'Hello. Your health settings are: systolic blood pressure {sys}, diastolic {dia}, heart rate {hr} beats per minute, blood sugar {bs} {bsUnit}. The conditions being checked are {condPart}. You can review everything on the health settings page. At the supermarket we will check carefully for you.',

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
  'advice.green.badge': 'Naturally safe, keep it up',
  'advice.green.advice':
    'Excellent — this product has simple ingredients with nothing extra weighing you down. Keep eating natural whole foods every day.',
  'advice.green.habit':
    'Long-term habit: drink enough warm water at set times each day and eat vegetables and fruit of many colours.',

  'scan.savedCloud': 'Cloud AI is now on. Photos you take will be uploaded for analysis.',
  'scan.savedLocal': 'Back to on-device mode. Photos will not leave this phone.',
  'scan.readingLabel': 'Reading the label text',
  'scan.analyzing': 'Analysing for you',
  'scan.errBusy': 'The network is busy — please try again shortly',
  'scan.errUnclear': 'The photo is not clear enough — please take another one',
  'scan.errNoResult': 'Could not get a result — please try again',
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
  'loading.analyzing': 'Analysing for you…',
  'loading.localOnly': 'The photo is processed only on this phone — nothing is uploaded',
  'loading.typical': 'Usually takes 5 to 10 seconds',
  'loading.waited': '(waited {n}s)',
  'loading.privacyBadge': 'The photo never leaves this phone',
  'loading.signalTitle': 'Supermarket signal tip',
  'loading.signalBadge': '🔊 Spoken aloud — sending your data',
  'loading.signalSpeech': '🔊 Voice: "Analysing for you"',

  'history.ariaModule': 'My food health history module',
  'history.title': 'Weekly food health record',
  'history.subtitle': 'Checks and grades over the past 7 days',
  'history.export': 'Export summary',
  'history.gradeBadge': 'Grade {letter} ({title})',
  'history.gradeA': 'Excellent',
  'history.gradeB': 'Good',
  'history.gradeC': 'Needs care',
  'history.sevenDays': '7-day checks',
  'history.timesFood': 'products',
  'history.stopSpeak': 'Stop reading',
  'history.speakWeekly': '🔊 Read the weekly summary',
  'history.greenLight': 'Safe (green)',
  'history.yellowLight': 'Caution (yellow)',
  'history.redLight': 'Avoid (red)',
  /* 英文不需要「次」這個量詞，數字單獨放在標籤下即可 */
  'history.timesUnit': '',
  'history.filterAll': 'All ({n})',
  'history.filterGreen': 'Safe ({n})',
  'history.filterYellow': 'Caution ({n})',
  'history.filterRed': 'Avoid ({n})',
  'history.barGreen': 'Green {n}%',
  'history.barYellow': 'Yellow {n}%',
  'history.barRed': 'Red {n}%',
  'history.emptyFilter': 'No records at this grade yet.',
  'history.badgeGreen': '🟢 Safe',
  'history.badgeYellow': '🟡 Caution',
  'history.badgeRed': '🔴 Avoid',
  'history.speakThisTitle': 'Read this analysis aloud',
  'history.speakThis': 'Read',
  'history.plainLabel': '💬 In plain words:',
  'history.altLabel': '💡 Shopping alternatives:',
  'history.collapse': '▲ Hide details',
  'history.expand': '▼ Show the full explanation and advice',
  'history.resetSample': 'Restore sample records',
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
  'history.report.vitalsHeader': '🩺 Measured health indicators:',
  'history.report.bp': '  • Blood pressure: {sys}/{dia} mmHg {comment}',
  'history.report.hr': '  • Heart rate: {hr} bpm (normal range 60-100)',
  'history.report.bs': '  • Blood sugar: {bs} {unit} ({timing})',
  'history.report.conditions': '  • Conditions and allergies checked: {list}',
  'history.report.conditionsOnly': '👵 Health conditions checked: {list}',
  'history.report.bpHigh': '(above the alert line)',
  'history.report.bpElevated': '(slightly high)',
  'history.report.bpNormal': '(healthy)',
  'history.report.fasting': 'fasting',
  'history.report.postMeal': 'after a meal',
  'history.report.gradeHeader': '📊 Overall grade for the past week: [Grade {letter} — {title}]',
  'history.report.total': '  • Products checked: {n}',
  'history.report.greenRow': '  • 🟢 Safe: {n} ({pct}%)',
  'history.report.yellowRow': '  • 🟡 Caution: {n} ({pct}%)',
  'history.report.redRow': '  • 🔴 Avoided: {n} ({pct}%)',
  'history.report.itemsHeader': '🛒 Recent products checked:',
  'history.report.item': '  {i}. [{name}] {tag}: {title}',
  'history.report.itemGreen': '🟢 Safe',
  'history.report.itemYellow': '🟡 Caution',
  'history.report.itemRed': '🔴 Avoid',
  'history.report.noItems': '  (no scans yet)',
  'history.report.tipsHeader': '💡 Friendly health reminders:',
  'history.report.tip1': '  • Drink enough water every day (about 1500-2000 ml).',
  'history.report.tip2':
    '  • Choose natural whole foods marked green, and go easy on high-sodium sauces and sugary snacks.',
  'history.report.tip3':
    '  • Measure your blood pressure and blood sugar regularly — it helps you stay healthy longer!',
  'history.report.noConditions': 'No specific chronic conditions',
  'history.speech.empty':
    'Hello! You have not scanned anything in the past week. Tap the camera button at the bottom to start checking your food.',
  'history.speech.summary':
    'Hello! Here is your food health grade for the past week: you checked {total} products and the overall grade is {letter}. You had {green} safe green-light products, {yellow} yellow-light reminders and {red} red lights avoided. You are taking good care of yourself — keep it up!',

  'classroom.title': 'Food education',
  'classroom.intro':
    'Learn to read food labels and judge for yourself next time you shop. Everything here works without an internet connection.',
  'classroom.currentProfile': 'Current profile: {name}',
  'classroom.tabsAria': 'Classroom sections',
  'classroom.tabCards': 'Cards',
  'classroom.tabQuiz': 'Quiz',
  'classroom.tabProgress': 'My progress',
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
