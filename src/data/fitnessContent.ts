/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 健身專區的資料與課表規則（Fitness zone content & local planner）
 * ============================================================================
 *
 * 【為什麼課表用「規則」而不是叫 AI 生成】
 *   引導頁與使用者的健身需求（增肌／減脂／雕塑）其實是**有限的組合**：
 *   3 種目標 × 5 種每週天數 = 15 套課表。
 *   這種題目用 AI 生成有三個缺點：
 *     ① 每次結果都不一樣 —— 使用者今天是這套、明天是另一套，無法累積
 *     ② 會消耗免費額度，而額度要留給「標籤辨識」這個主角
 *     ③ 可能生出解剖學上不合理的動作組合，而且**看不出來是錯的**
 *   所以課表用確定性的規則表；**AI 留在它真正擅長的地方（讀標籤）**。
 *   （這與本專案的核心原則一致：可預測的訊號交給規則，細膩的解釋交給模型。）
 *
 * 【為什麼文字直接寫成 {zh, en} 而不是進 translations.ts】
 *   這裡的內容是**資料**（動作名稱、課表名稱），不是介面文案。
 *   型別上 `{ zh: string; en: string }` 兩個欄位都是必填 ——
 *   所以「漏了英文」一樣會編譯失敗，與 `TranslationKey` 提供同等保證，
 *   但不必把 100 多個鍵塞進已經很大的 translations.ts。
 */

/** 健身目標 */
export type FitnessGoal = 'muscle' | 'fat_loss' | 'tone';

/** 雙語字串：兩個欄位都必填，漏英文會編譯失敗 */
export interface Bi {
  zh: string;
  en: string;
}

/* ---------------------------------------------------------------------------
 * 目標
 * ------------------------------------------------------------------------- */

export interface GoalDef {
  id: FitnessGoal;
  label: Bi;
  /** 一句話說明這個目標在做什麼（避免使用者選錯） */
  hint: Bi;
  /** 每個動作的組數／次數／休息（秒） */
  prescription: { sets: number; reps: string; restSec: number };
  /**
   * 每日營養目標。蛋白質以「每公斤體重公克數」表示 ——
   * 因為它真的要看體重，寫死一個公克數對 50 公斤和 90 公斤的人都錯。
   */
  macro: {
    /** 每公斤體重蛋白質（公克） */
    proteinPerKg: number;
    /** 每公斤體重脂肪（公克） */
    fatPerKg: number;
    /** 熱量調整：相對維持熱量的比例（增肌 +10%、減脂 −20%） */
    calorieFactor: number;
    note: Bi;
  };
}

export const FITNESS_GOALS: GoalDef[] = [
  {
    id: 'muscle',
    label: { zh: '增肌', en: 'Build muscle' },
    hint: {
      zh: '重量慢慢加、次數少一點，重點是蛋白質要吃夠。',
      en: 'Add weight gradually with fewer reps — and eat enough protein.',
    },
    prescription: { sets: 4, reps: '6–10', restSec: 120 },
    macro: {
      proteinPerKg: 1.8,
      fatPerKg: 0.9,
      calorieFactor: 1.1,
      note: {
        zh: '熱量要略高於維持（+10%），否則練了也長不出肌肉。',
        en: 'Eat slightly above maintenance (+10%) or the training will not turn into muscle.',
      },
    },
  },
  {
    id: 'fat_loss',
    label: { zh: '減脂', en: 'Lose fat' },
    hint: {
      zh: '重量不變、休息縮短，加上有氧；熱量要略低但不能挨餓。',
      en: 'Same weights with shorter rests plus cardio. Eat a little less, but do not starve.',
    },
    prescription: { sets: 3, reps: '12–15', restSec: 60 },
    macro: {
      proteinPerKg: 2.0,
      fatPerKg: 0.8,
      calorieFactor: 0.8,
      note: {
        zh: '減脂期蛋白質反而要拉高（每公斤 2 公克），否則減掉的是肌肉。',
        en: 'Protein goes UP while cutting (2 g/kg) — otherwise you lose muscle, not fat.',
      },
    },
  },
  {
    id: 'tone',
    label: { zh: '局部雕塑', en: 'Tone & shape' },
    hint: {
      zh: '中等重量、中等次數，把動作做穩比加重量重要。',
      en: 'Moderate weight and reps — control matters more than adding weight.',
    },
    prescription: { sets: 3, reps: '10–12', restSec: 90 },
    macro: {
      proteinPerKg: 1.6,
      fatPerKg: 0.9,
      calorieFactor: 1.0,
      note: {
        zh: '維持熱量、蛋白質足夠，體態就會慢慢改變。',
        en: 'Stay at maintenance with enough protein and your shape will change gradually.',
      },
    },
  },
];

/* ---------------------------------------------------------------------------
 * 動作庫
 *
 * ⚠️ `focus` 只用來分組顯示（胸／背／腿…），不用來做複雜的訓練科學判斷。
 *    本模組的定位是「幫使用者把該記的記下來」，不是取代教練。
 * ------------------------------------------------------------------------- */

export type MuscleGroup = 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | 'core' | 'cardio';

export const GROUP_LABEL: Record<MuscleGroup, Bi> = {
  chest: { zh: '胸', en: 'Chest' },
  back: { zh: '背', en: 'Back' },
  legs: { zh: '腿', en: 'Legs' },
  shoulders: { zh: '肩', en: 'Shoulders' },
  arms: { zh: '手臂', en: 'Arms' },
  core: { zh: '核心', en: 'Core' },
  cardio: { zh: '有氧', en: 'Cardio' },
};

export interface Exercise {
  id: string;
  name: Bi;
  group: MuscleGroup;
  /** 需要什麼器材（顯示用，讓使用者自己判斷家裡／健身房做不做得到） */
  equipment: Bi;
}

export const EXERCISES: Record<string, Exercise> = {
  bench: { id: 'bench', name: { zh: '臥推', en: 'Bench press' }, group: 'chest', equipment: { zh: '槓鈴／啞鈴', en: 'Barbell / dumbbell' } },
  pushup: { id: 'pushup', name: { zh: '伏地挺身', en: 'Push-up' }, group: 'chest', equipment: { zh: '無', en: 'None' } },
  fly: { id: 'fly', name: { zh: '啞鈴飛鳥', en: 'Dumbbell fly' }, group: 'chest', equipment: { zh: '啞鈴', en: 'Dumbbell' } },
  pulldown: { id: 'pulldown', name: { zh: '滑輪下拉', en: 'Lat pulldown' }, group: 'back', equipment: { zh: '滑輪機', en: 'Cable machine' } },
  pullup: { id: 'pullup', name: { zh: '引體上升', en: 'Pull-up' }, group: 'back', equipment: { zh: '單槓', en: 'Pull-up bar' } },
  row: { id: 'row', name: { zh: '划船', en: 'Row' }, group: 'back', equipment: { zh: '槓鈴／啞鈴', en: 'Barbell / dumbbell' } },
  deadlift: { id: 'deadlift', name: { zh: '硬舉', en: 'Deadlift' }, group: 'back', equipment: { zh: '槓鈴', en: 'Barbell' } },
  squat: { id: 'squat', name: { zh: '深蹲', en: 'Squat' }, group: 'legs', equipment: { zh: '槓鈴／自重', en: 'Barbell / bodyweight' } },
  lunge: { id: 'lunge', name: { zh: '弓步', en: 'Lunge' }, group: 'legs', equipment: { zh: '啞鈴／自重', en: 'Dumbbell / bodyweight' } },
  legpress: { id: 'legpress', name: { zh: '腿推', en: 'Leg press' }, group: 'legs', equipment: { zh: '腿推機', en: 'Leg press machine' } },
  calf: { id: 'calf', name: { zh: '提踵', en: 'Calf raise' }, group: 'legs', equipment: { zh: '無', en: 'None' } },
  shoulderpress: { id: 'shoulderpress', name: { zh: '肩推', en: 'Shoulder press' }, group: 'shoulders', equipment: { zh: '啞鈴', en: 'Dumbbell' } },
  lateralraise: { id: 'lateralraise', name: { zh: '側平舉', en: 'Lateral raise' }, group: 'shoulders', equipment: { zh: '啞鈴', en: 'Dumbbell' } },
  curl: { id: 'curl', name: { zh: '二頭彎舉', en: 'Biceps curl' }, group: 'arms', equipment: { zh: '啞鈴', en: 'Dumbbell' } },
  triceps: { id: 'triceps', name: { zh: '三頭下壓', en: 'Triceps pushdown' }, group: 'arms', equipment: { zh: '滑輪機', en: 'Cable machine' } },
  plank: { id: 'plank', name: { zh: '平板支撐', en: 'Plank' }, group: 'core', equipment: { zh: '無', en: 'None' } },
  crunch: { id: 'crunch', name: { zh: '捲腹', en: 'Crunch' }, group: 'core', equipment: { zh: '無', en: 'None' } },
  walk: { id: 'walk', name: { zh: '快走', en: 'Brisk walk' }, group: 'cardio', equipment: { zh: '無', en: 'None' } },
  run: { id: 'run', name: { zh: '跑步', en: 'Run' }, group: 'cardio', equipment: { zh: '無', en: 'None' } },
  rope: { id: 'rope', name: { zh: '跳繩', en: 'Skipping rope' }, group: 'cardio', equipment: { zh: '跳繩', en: 'Rope' } },
};

/* ---------------------------------------------------------------------------
 * 課表模板
 *
 * 依「每週幾天」分成不同的分化方式。這是健身界很常見的分法，
 * 不是我們發明的 —— 所以不需要 AI，只要照抄。
 * ------------------------------------------------------------------------- */

interface SessionTemplate {
  name: Bi;
  exercises: string[];
  /** 這一節是否以有氧收尾（減脂目標會自動加上） */
  cardio?: boolean;
}

export const PLAN_TEMPLATES: Record<number, SessionTemplate[]> = {
  2: [
    { name: { zh: '全身 A', en: 'Full body A' }, exercises: ['squat', 'bench', 'row', 'plank'] },
    { name: { zh: '全身 B', en: 'Full body B' }, exercises: ['deadlift', 'shoulderpress', 'pulldown', 'crunch'] },
  ],
  3: [
    { name: { zh: '推（胸肩三頭）', en: 'Push (chest, shoulders, triceps)' }, exercises: ['bench', 'shoulderpress', 'fly', 'triceps'] },
    { name: { zh: '拉（背二頭）', en: 'Pull (back, biceps)' }, exercises: ['pulldown', 'row', 'curl', 'plank'] },
    { name: { zh: '腿與核心', en: 'Legs & core' }, exercises: ['squat', 'lunge', 'calf', 'crunch'], cardio: true },
  ],
  4: [
    { name: { zh: '上肢 A', en: 'Upper A' }, exercises: ['bench', 'row', 'shoulderpress', 'curl'] },
    { name: { zh: '下肢 A', en: 'Lower A' }, exercises: ['squat', 'legpress', 'calf', 'plank'] },
    { name: { zh: '上肢 B', en: 'Upper B' }, exercises: ['pulldown', 'fly', 'lateralraise', 'triceps'] },
    { name: { zh: '下肢 B', en: 'Lower B' }, exercises: ['deadlift', 'lunge', 'crunch'], cardio: true },
  ],
  5: [
    { name: { zh: '胸', en: 'Chest' }, exercises: ['bench', 'fly', 'pushup', 'triceps'] },
    { name: { zh: '背', en: 'Back' }, exercises: ['pulldown', 'row', 'pullup', 'curl'] },
    { name: { zh: '腿', en: 'Legs' }, exercises: ['squat', 'legpress', 'lunge', 'calf'] },
    { name: { zh: '肩與手臂', en: 'Shoulders & arms' }, exercises: ['shoulderpress', 'lateralraise', 'curl', 'triceps'] },
    { name: { zh: '全身與核心', en: 'Full body & core' }, exercises: ['deadlift', 'pushup', 'plank', 'crunch'], cardio: true },
  ],
  6: [
    { name: { zh: '推 A', en: 'Push A' }, exercises: ['bench', 'shoulderpress', 'triceps'] },
    { name: { zh: '拉 A', en: 'Pull A' }, exercises: ['pulldown', 'row', 'curl'] },
    { name: { zh: '腿 A', en: 'Legs A' }, exercises: ['squat', 'lunge', 'calf'] },
    { name: { zh: '推 B', en: 'Push B' }, exercises: ['fly', 'pushup', 'lateralraise'] },
    { name: { zh: '拉 B', en: 'Pull B' }, exercises: ['deadlift', 'pullup', 'curl'] },
    { name: { zh: '腿 B 與核心', en: 'Legs B & core' }, exercises: ['legpress', 'calf', 'plank', 'crunch'], cardio: true },
  ],
};

/** 每週可選天數 */
export const DAYS_OPTIONS = [2, 3, 4, 5, 6] as const;

/** 有氧建議（只有減脂與雕塑目標會附上） */
export const CARDIO_ADVICE: Record<FitnessGoal, Bi | null> = {
  muscle: null,
  fat_loss: {
    zh: '每次訓練後加 20–30 分鐘快走或單車（能說話但有點喘的程度）。',
    en: 'After each session, add 20–30 minutes of brisk walking or cycling (slightly out of breath but able to talk).',
  },
  tone: {
    zh: '每週 2 次、每次 20 分鐘有氧即可，不必做到筋疲力盡。',
    en: 'Twice a week, 20 minutes of cardio is enough — you do not need to exhaust yourself.',
  },
};

/* ---------------------------------------------------------------------------
 * 產生課表
 * ------------------------------------------------------------------------- */

export interface PlannedSession {
  /** 第幾天的名稱（例如「推（胸肩三頭）」） */
  name: Bi;
  items: Array<{
    exercise: Exercise;
    sets: number;
    reps: string;
    restSec: number;
  }>;
  /** 這一節是否要加有氧 */
  cardio: boolean;
}

/**
 * 產生一份課表。
 *
 * ⚠️ 這是一個**純函式**：同樣的輸入一定得到同樣的輸出。
 *    使用者今天排的課表和下週再看一次必須完全一樣 —— 會變動的課表沒人敢照著練。
 */
export function buildPlan(goal: FitnessGoal, daysPerWeek: number): PlannedSession[] {
  const goalDef = FITNESS_GOALS.find((g) => g.id === goal) ?? FITNESS_GOALS[0];
  const template = PLAN_TEMPLATES[daysPerWeek] ?? PLAN_TEMPLATES[3];
  const { sets, reps, restSec } = goalDef.prescription;

  return template.map((session) => ({
    name: session.name,
    cardio: goal !== 'muscle' && !!session.cardio,
    items: session.exercises
      .map((id) => EXERCISES[id])
      .filter(Boolean)
      .map((exercise) => ({ exercise, sets, reps, restSec })),
  }));
}

/* ---------------------------------------------------------------------------
 * 熱量與三大营养素
 * ------------------------------------------------------------------------- */

export interface MacroResult {
  bmr: number;
  maintenance: number;
  target: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  note: Bi;
}

/**
 * 用 Mifflin-St Jeor 公式估算基礎代謝率（BMR），再乘活動係數。
 *
 * 【公式的選擇】
 *   Mifflin-St Jeor 是目前營養學界公認對一般人誤差最小的估算式
 *   （比舊的 Harris-Benedict 準）。它需要身高、體重、年齡、性別。
 *
 * ⚠️ **它仍然是估算**，誤差可達 ±10%。所以 UI 上一定要寫「這是估算值」，
 *    不能讓使用者以為是精密測量結果 —— 那是對健康數據的過度承諾。
 *
 * 【為什麼需要性別參數】
 *   公式本身有性別項（男女的基礎代謝不同），這是**生理事實**，
 *   與「要不要用先生／小姐稱呼使用者」是兩件事。
 *   本 App 的稱謂機制已移除，但這裡仍需要這個參數才能算。
 *   → 由使用者在健身專區**自己填**（不填就用中性估算），
 *     而不是從一個全域的性別設定偷偷帶進來。
 */
export function calcMacros(input: {
  weightKg: number;
  heightCm: number;
  age: number;
  /** 'male' | 'female' | 'unspecified'（不指定時取兩者平均） */
  sex: 'male' | 'female' | 'unspecified';
  /** 每週訓練天數 → 活動係數 */
  daysPerWeek: number;
  goal: FitnessGoal;
}): MacroResult {
  const { weightKg, heightCm, age, sex, daysPerWeek, goal } = input;
  const goalDef = FITNESS_GOALS.find((g) => g.id === goal) ?? FITNESS_GOALS[0];

  // Mifflin-St Jeor
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  const male = base + 5;
  const female = base - 161;
  const bmr = sex === 'male' ? male : sex === 'female' ? female : (male + female) / 2;

  // 活動係數：久坐 1.2 → 每週 6 練約 1.7
  const activity = 1.2 + Math.min(Math.max(daysPerWeek, 0), 6) * 0.083;
  const maintenance = bmr * activity;
  const target = maintenance * goalDef.macro.calorieFactor;

  const proteinG = weightKg * goalDef.macro.proteinPerKg;
  const fatG = weightKg * goalDef.macro.fatPerKg;
  // 碳水＝剩餘熱量 ÷ 4（蛋白質 4 大卡/公克、脂肪 9 大卡/公克）
  const carbKcal = Math.max(0, target - proteinG * 4 - fatG * 9);
  const carbG = carbKcal / 4;

  return {
    bmr: Math.round(bmr),
    maintenance: Math.round(maintenance),
    target: Math.round(target),
    proteinG: Math.round(proteinG),
    fatG: Math.round(fatG),
    carbG: Math.round(carbG),
    note: goalDef.macro.note,
  };
}

/** 從語言取字串（單一入口，避免各處自己寫 language === 'en' ? … : …） */
export function pick(bi: Bi, language: 'zh-TW' | 'en'): string {
  return language === 'en' ? bi.en : bi.zh;
}
