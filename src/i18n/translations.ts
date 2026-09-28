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
  'app.tagline': '專為長者設計的超市食品健康放大鏡',
  'app.taglineEn': 'A supermarket food health magnifier for older adults',
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
  'result.switchToLocal': '改回本機模式（不上傳）',
  'result.switchToCloud': '開啟雲端辨識（更準）',
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
  'vitals.quickPick': '長輩快選：',

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
  'app.tagline': 'A supermarket food health magnifier for older adults',
  'app.taglineEn': 'A supermarket food health magnifier for older adults',
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
  'result.switchToLocal': 'Switch back to on-device (no upload)',
  'result.switchToCloud': 'Turn on cloud AI (more accurate)',
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
