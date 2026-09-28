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
