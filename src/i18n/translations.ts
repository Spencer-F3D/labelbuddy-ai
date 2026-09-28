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
