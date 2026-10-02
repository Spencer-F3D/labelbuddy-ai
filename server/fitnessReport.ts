/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 健身週報（AI 生成）— 2026-10-02 新增
 * ============================================================================
 * 對應 POST /api/fitness-report
 *
 * 【為什麼這條路可以用雲端 AI，而健身紀錄本身不用】
 *   健身專區的紀錄平常**完全留在裝置上**（`labelbuddy_fitness_v1`）。
 *   這個端點只有在使用者**主動按下「用 AI 分析」**時才會被呼叫，
 *   而且送出去的是**彙總後的統計數字**，不是逐筆紀錄：
 *     送出：目標、近 7 天訓練天數、總訓練量、動作名稱清單、平均攝取 vs 目標
 *     不送：日期、逐筆紀錄、姓名、任何可識別個人的東西
 *   → 資料最小化 + 由使用者按鈕觸發（明示同意）。
 *   ⚠️ 健身專區的介紹頁寫的是「紀錄只存在這台手機裡」——
 *      所以前端按鈕上**必須**寫明這個動作會把統計數字送到雲端，
 *      否則就是在使用者不知道的情況下打破自己的承諾。
 *
 * 【為什麼一定要有離線備援】
 *   NIM 的冷啟動可能長達 86～156 秒（實測）。使用者按了按鈕不該看到「失敗」。
 *   所以 AI 失敗時，這裡用**確定性規則**產生一份簡短報告 ——
 *   內容樸素，但一定有東西，而且不會讓使用者以為功能壞了。
 * ------------------------------------------------------------------------- */

import { callNvidiaNim, type ApiResult } from './core';

export interface FitnessReportInput {
  language?: 'zh-TW' | 'en';
  goal?: string;
  daysPerWeek?: number;
  /** 近 7 天有紀錄的天數 */
  trainedDays?: number;
  /** 近 7 天總訓練量（重量 × 組數 × 次數，單位公斤） */
  totalVolume?: number;
  /** 近 7 天做過的動作名稱（最多 8 個） */
  exercises?: string[];
  /** 近 7 天平均每日攝取 */
  avgKcal?: number;
  avgProteinG?: number;
  /** 每日目標 */
  targetKcal?: number;
  targetProteinG?: number;
}

export interface FitnessReport {
  source: 'ai' | 'local';
  model?: string;
  headline: string;
  observations: string[];
  suggestions: string[];
  encouragement: string;
}

/**
 * 依規則產生離線版報告（AI 不可用時使用）。
 *
 * ⚠️ 這些規則刻意「保守」：只陳述使用者自己填的數字之間的關係，
 *    不做任何因果推論（例如「你蛋白質不夠所以沒長肌肉」）——
 *    那種話需要更多資訊才站得住腳，本 App 不該隨口說。
 */
export function buildLocalFitnessReport(input: FitnessReportInput): FitnessReport {
  const en = input.language === 'en';
  const trainedDays = Number(input.trainedDays) || 0;
  const perWeek = Number(input.daysPerWeek) || 3;
  const observations: string[] = [];
  const suggestions: string[] = [];

  if (trainedDays === 0) {
    observations.push(en ? 'No training recorded in the last 7 days.' : '最近 7 天沒有訓練紀錄。');
    suggestions.push(
      en
        ? 'Start with 2 sessions this week — consistency beats volume at the beginning.'
        : '這週先從 2 次開始就好，一開始「做得到」比「做得多」重要。'
    );
  } else {
    observations.push(
      en
        ? 'You trained ' + trainedDays + ' days in the last 7 days, against a plan of ' + perWeek + '.'
        : '最近 7 天有 ' + trainedDays + ' 天有訓練紀錄，你的課表是每週 ' + perWeek + ' 天。'
    );
    if (trainedDays < perWeek) {
      const gap = perWeek - trainedDays;
      suggestions.push(
        en
          ? 'You are ' + gap + ' session(s) short of the plan. If time is tight, cut sets rather than skipping a whole day.'
          : '離課表還差 ' + gap + ' 次。時間不夠的話，寧可少做幾組，也不要整週跳過。'
      );
    } else {
      suggestions.push(
        en
          ? 'You hit your weekly target. Keep the same weights for another week before adding load.'
          : '這週達到課表目標了。建議同重量再做一週，再考慮加重量。'
      );
    }
  }

  const avgKcal = Number(input.avgKcal) || 0;
  const targetKcal = Number(input.targetKcal) || 0;
  if (targetKcal > 0 && avgKcal > 0) {
    const diff = Math.round(avgKcal - targetKcal);
    if (Math.abs(diff) <= targetKcal * 0.1) {
      observations.push(en ? 'Your average calorie intake is close to target.' : '平均熱量攝取和目標很接近。');
    } else {
      observations.push(
        en
          ? 'Your average intake is ' + Math.abs(diff) + ' kcal ' + (diff > 0 ? 'above' : 'below') + ' target.'
          : '平均攝取比目標' + (diff > 0 ? '多' : '少') + '了約 ' + Math.abs(diff) + ' 大卡。'
      );
      suggestions.push(
        en
          ? 'Adjust one meal rather than changing everything — small, repeatable changes stick.'
          : '調整「一餐」就好，不要一次改全部 —— 做得到的改變才會留下來。'
      );
    }
  } else if (targetKcal > 0) {
    suggestions.push(
      en
        ? 'Fill in your weight, height and age to get calorie and protein targets.'
        : '填上體重、身高、年齡，才會算出熱量與蛋白質目標。'
    );
  }

  return {
    source: 'local',
    headline: en ? 'This week at a glance' : '這週的概況',
    observations,
    suggestions,
    encouragement: en
      ? 'Recording consistently is the part that actually works — keep going.'
      : '有紀錄就是最有效的那一步，繼續保持。',
  };
}

/** 系統提示詞：把「不可以做什麼」寫死，不靠模型自律 */
function buildSystemInstruction(en: boolean): string {
  return [
    '你是健身與飲食紀錄的分析助手。使用者會給你他一週的訓練與飲食「統計數字」。',
    '請用繁體中文回一份簡短、務實的週報。',
    '',
    '【嚴格限制】',
    '1. 只做「紀錄的分析」，絕對不要提供醫療建議、診斷或藥物相關內容。',
    '2. 不要臆測使用者沒給你的資料（例如體脂率、受傷史、睡眠）。',
    '3. 不要用命令語氣，也不要誇大。數字不足時就誠實說「資料還不夠」。',
    '4. 稱呼使用者一律用「您」；不可以使用先生／小姐／阿公／阿伯等任何稱謂。',
    '5. observations 最多 3 條、suggestions 最多 2 條，每條一句話，不要長篇。',
    en ? '6. Write the entire response in English.' : '',
    '',
    '【輸出格式】只輸出一個 JSON 物件，不要有其他文字：',
    '{"headline":"一句話總結","observations":["觀察1","觀察2"],"suggestions":["建議1","建議2"],"encouragement":"一句鼓勵"}',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * 產生健身週報。
 *
 * @param input 由前端彙總後送來的統計數字（見模組開頭的資料最小化說明）
 */
export async function generateFitnessReport(input: FitnessReportInput): Promise<FitnessReport> {
  const en = input.language === 'en';

  const ai = await callNvidiaNim({
    systemInstruction: buildSystemInstruction(en),
    userPrompt: JSON.stringify(
      {
        goal: input.goal ?? null,
        plannedDaysPerWeek: input.daysPerWeek ?? null,
        trainedDaysLast7: input.trainedDays ?? 0,
        totalVolumeKg: Math.round(Number(input.totalVolume) || 0),
        exercises: (input.exercises || []).slice(0, 8),
        avgDailyKcal: Math.round(Number(input.avgKcal) || 0),
        avgDailyProteinG: Math.round(Number(input.avgProteinG) || 0),
        targetDailyKcal: Math.round(Number(input.targetKcal) || 0),
        targetDailyProteinG: Math.round(Number(input.targetProteinG) || 0),
      },
      null,
      2
    ),
    maxTokens: 1200,
    temperature: 0.4,
  });

  const d = ai?.data;
  const okShape =
    d &&
    typeof d.headline === 'string' &&
    Array.isArray(d.observations) &&
    Array.isArray(d.suggestions);

  if (okShape) {
    return {
      source: 'ai',
      model: ai?.model,
      headline: d.headline,
      observations: d.observations.map((x: unknown) => String(x)).slice(0, 3),
      suggestions: d.suggestions.map((x: unknown) => String(x)).slice(0, 2),
      encouragement: String(d.encouragement ?? ''),
    };
  }

  // AI 不可用（未設金鑰、逾時、冷啟動、輸出格式不符）→ 離線規則版
  return buildLocalFitnessReport(input);
}

/** 對應 `/api/fitness-report` 的處理函式 */
export async function handleFitnessReport(
  body: any,
  _headers: Headers
): Promise<ApiResult> {
  try {
    const report = await generateFitnessReport((body || {}) as FitnessReportInput);
    return { status: 200, json: { success: true, data: report } };
  } catch (e: any) {
    // 理論上 generateFitnessReport 不會拋（內部已包離線備援），
    // 但真的拋了也要回一份可用的東西，不要讓畫面空著。
    return {
      status: 200,
      json: { success: true, data: buildLocalFitnessReport((body || {}) as FitnessReportInput) },
    };
  }
}
