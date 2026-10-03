/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 開發者面板（隱藏）— 2026-10-03 新增
 * ============================================================================
 * 進入方式：連續點「LabelBuddy AI」主標 **7 下**。
 *
 * 【為什麼要隱藏、不做成看得見的按鈕】
 *   這個面板是給開發者／評審答辯時看的，一般使用者看到一堆
 *   「供應商冷卻中／快取 37 筆／模型鏈」只會困惑，而且會怕自己按壞什麼。
 *   所以走隱藏手勢：知道的人按得出來，不知道的人不會誤觸。
 *
 * 【為什麼是 7 下而不是 3 下】
 *   3 下太容易誤觸（連點標題在手機上很常見）。
 *   7 下幾乎不可能是意外，而且不需要記複雜手勢。
 *   ★ 點擊計數必須有**時間窗**：不能讓使用者分三天點 7 下也打開。
 *     這裡用 2 秒 —— 中間停超過 2 秒就重新算。
 *
 * 【面板要回答什麼】
 *   使用者指定「有寫 AI 用了多少等資訊」。所以核心是**用量與額度**：
 *     ① 哪幾家 AI 供應商現在可用？今天用了幾次、上限多少？
 *     ② 有沒有在冷卻？上次失敗原因是什麼？
 *     ③ 標籤辨識用哪條模型鏈？健身週報用哪條？（兩條是分開的）
 *     ④ 快取命中多少？（這是延長免費額度最有效的一層）
 *   另外附上環境資訊，因為「語音沒聲音」「本機 OCR 讀不到」這類問題
 *   幾乎都跟執行環境有關（網頁 vs APK、有無原生 TTS）。
 * ============================================================================
 */

import React, { useEffect, useState } from 'react';
import { X, RefreshCw, Cpu, Server, Activity, Smartphone, Globe } from 'lucide-react';
import { apiUrl } from '../utils/apiBase';
import { useI18n } from '../i18n/I18nContext';
import { isNativeTts, canSpeak } from '../utils/tts';
import { isBrowserOcrReady, getLastOcrDiagnostics } from '../ocr/ocrBrowser';

/** `/api/ai-status` 的回應形狀（只宣告我們用到的欄位） */
interface AiStatus {
  status?: string;
  hasKey?: boolean;
  providers?: Array<{
    name: string;
    configured: boolean;
    available: boolean;
    usedToday: number;
    dailyQuota: number;
    coolingDownUntil: string | null;
    lastError: string | null;
    /** 最後一次呼叫的耗時（毫秒，-1 = 還沒跑過） */
    lastLatencyMs?: number;
  }>;
  models?: string[];
  nvidia?: { configured: boolean; models: string[]; purpose: string };
  cacheEntries?: number;
  openrouterQuota?: { remaining?: number; limit?: number } | null;
  message?: string;
}

export interface DeveloperPanelProps {
  onClose: () => void;
  /**
   * 上一次分析的 AI 結果（2026-10-03 使用者要求「增加上次標籤原文」）。
   *
   * ⚠️ 由 App 傳進來而不是面板自己去抓 —— 面板是純顯示元件，
   *    不應該為了顯示而再發一次請求（那會多花一次 AI 額度）。
   */
  lastAi?: {
    provider?: string;
    model?: string;
    rawText?: string;
  } | null;
  /** 目前的執行環境資訊（由 App 提供，避免面板自己去猜） */
  context: {
    analysisMode: string;
    profileId: string;
    language: string;
    userAgent: string;
  };
}

export const DeveloperPanel: React.FC<DeveloperPanelProps> = ({ onClose, context, lastAi }) => {
  const { t } = useI18n();
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<string>('');

  const load = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(apiUrl('/api/ai-status'));
      const json = (await res.json()) as AiStatus;
      setStatus(json);
      setFetchedAt(new Date().toLocaleTimeString());
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex items-start gap-[8px] text-[16px] leading-snug">
      <span className="shrink-0 font-black text-slate-500 min-w-[104px]">{label}</span>
      {/* ⚠️ 用 break-all 而不是 break-words：
          模型 ID（dots-studio/dots-3-note-preview:free）這種字串**沒有空白**，
          break-words 找不到斷點 → 直接穿出框框（使用者回報的溢出問題）。
          break-all 允許在任何字元斷行，長 token 才不會溢出。 */}
      <span className="flex-1 min-w-0 font-bold text-slate-900 break-all">{value}</span>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/70 flex items-start justify-center overflow-y-auto p-[12px]"
      role="dialog"
      aria-modal="true"
      aria-label={t('dev.title')}
    >
      <div className="w-full max-w-[420px] bg-white rounded-2xl border-2 border-slate-800 flex flex-col my-[16px]">
        {/* ── 標題列 ── */}
        <div className="flex items-center gap-[8px] px-[14px] py-[12px] border-b-2 border-slate-200">
          <Cpu className="w-[24px] h-[24px] shrink-0 text-slate-800" aria-hidden="true" />
          <h2 className="flex-1 min-w-0 text-[19px] font-black text-slate-950">{t('dev.title')}</h2>
          <button
            type="button"
            onClick={() => void load()}
            aria-label={t('dev.refresh')}
            className="w-[44px] h-[44px] shrink-0 rounded-xl border-2 border-slate-300 flex items-center justify-center cursor-pointer active:scale-90"
          >
            <RefreshCw className={`w-[20px] h-[20px] ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
          <button
            type="button"
            id="dev-panel-close"
            onClick={onClose}
            aria-label={t('dev.close')}
            className="w-[44px] h-[44px] shrink-0 rounded-xl border-2 border-slate-300 flex items-center justify-center cursor-pointer active:scale-90"
          >
            <X className="w-[20px] h-[20px]" aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-col gap-[16px] p-[14px]">
          {/* ── 1. AI 用量 ─────────────────────────────────── */}
          <section className="flex flex-col gap-[8px]">
            <h3 className="flex items-center gap-[6px] text-[17px] font-black text-slate-900">
              <Activity className="w-[20px] h-[20px] text-emerald-700" aria-hidden="true" />
              {t('dev.aiUsage')}
            </h3>

            {loading && !status && <p className="text-[16px] font-bold text-slate-500">{t('dev.loading')}</p>}
            {failed && (
              <p className="text-[16px] font-bold text-rose-800 bg-rose-50 rounded-lg px-[10px] py-[8px]">
                {t('dev.cannotReach')}
              </p>
            )}

            {status?.providers?.map((p) => {
              /**
               * ⚠️ 「已設定但冷卻中」與「沒設定金鑰」要分開講。
               *    前者等一下會自己好，後者永遠不會 —— 混在一起講會讓人誤判。
               */
              const state = !p.configured
                ? t('dev.noKey')
                : p.coolingDownUntil
                  ? t('dev.cooling')
                  : t('dev.available');
              return (
                <div
                  key={p.name}
                  className="rounded-xl border-2 border-slate-200 bg-slate-50 px-[10px] py-[8px] flex flex-col gap-[4px]"
                >
                  <div className="flex items-center gap-[8px] min-w-0">
                    <span
                      className={`w-[10px] h-[10px] rounded-full shrink-0 ${
                        p.available ? 'bg-emerald-600' : p.coolingDownUntil ? 'bg-amber-500' : 'bg-slate-400'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="text-[17px] font-black text-slate-900">{p.name}</span>
                    <span className="text-[16px] font-bold text-slate-600">{state}</span>
                    <span className="ml-auto shrink-0 text-[16px] font-black text-slate-900">
                      {p.usedToday} / {p.dailyQuota}
                      {/* 最後一次耗時 —— 使用者反映「NVIDIA API 過慢」，
                          有數字才能判斷是冷啟動還是模型本身慢 */}
                      {typeof p.lastLatencyMs === 'number' && p.lastLatencyMs >= 0 && (
                        <span className="ml-[6px] font-bold text-slate-500">
                          {(p.lastLatencyMs / 1000).toFixed(1)}s
                        </span>
                      )}
                    </span>
                  </div>
                  {/* 用量長條：一眼看出離上限多遠 */}
                  <div className="h-[8px] rounded-full bg-slate-200 overflow-hidden" aria-hidden="true">
                    <div
                      className="h-full bg-blue-700"
                      style={{ width: `${Math.min(100, (p.usedToday / Math.max(p.dailyQuota, 1)) * 100)}%` }}
                    />
                  </div>
                  {p.lastError && (
                    <p className="text-[15px] font-bold text-rose-800 break-words">{t('dev.lastError')}: {p.lastError}</p>
                  )}
                  {p.coolingDownUntil && (
                    <p className="text-[15px] font-bold text-amber-800">
                      {t('dev.cooldownUntil')} {new Date(p.coolingDownUntil).toLocaleTimeString()}
                    </p>
                  )}
                </div>
              );
            })}

            {status?.openrouterQuota && (
              <p className="text-[15px] font-bold text-slate-600">
                OpenRouter quota API: {JSON.stringify(status.openrouterQuota)}
              </p>
            )}

            {row(t('dev.models'), (status?.models ?? []).join(' · ') || '—')}
            {row(t('dev.cache'), status?.cacheEntries != null ? t('dev.entries', { n: status.cacheEntries }) : '—')}
            {row(t('dev.updated'), fetchedAt || '—')}
          </section>

          {/* ── 2. NVIDIA（獨立一條路，不進輪替鏈）──────────── */}
          <section className="flex flex-col gap-[8px]">
            <h3 className="flex items-center gap-[6px] text-[17px] font-black text-slate-900">
              <Server className="w-[20px] h-[20px] text-indigo-700" aria-hidden="true" />
              {t('dev.nvidiaTitle')}
            </h3>
            {row(t('dev.key'), status?.nvidia?.configured ? t('dev.configured') : t('dev.missing'))}
            {row(t('dev.models'), (status?.nvidia?.models ?? []).join(' · ') || '—')}
            {/* ⚠️ 這一句是給答辯用的：明確說明它為什麼不在上面的輪替鏈裡 */}
            <p className="text-[15px] font-bold text-slate-500 leading-snug">
              {t('dev.rotationNote')}
            </p>
          </section>

          {/* ── 3. 執行環境 ─────────────────────────────────── */}
          <section className="flex flex-col gap-[8px]">
            <h3 className="flex items-center gap-[6px] text-[17px] font-black text-slate-900">
              {context.userAgent.toLowerCase().includes('android') || isNativeTts() ? (
                <Smartphone className="w-[20px] h-[20px] text-slate-700" aria-hidden="true" />
              ) : (
                <Globe className="w-[20px] h-[20px] text-slate-700" aria-hidden="true" />
              )}
              {t('dev.runtime')}
            </h3>
            {row(t('dev.platform'), isNativeTts() ? t('dev.platformNative') : t('dev.platformBrowser'))}
            {row(t('dev.speech'), !canSpeak() ? t('dev.speechNone') : isNativeTts() ? t('dev.speechNative') : t('dev.speechWeb'))}
            {row(t('dev.localOcr'), isBrowserOcrReady() ? t('dev.ocrLoaded') : t('dev.ocrNotLoaded'))}
            {/* ★ 上次 OCR 的具體結果（2026-10-03）。
                這是「使用者說不行、開發者重現不出來」時唯一的線索來源 ——
                引擎載入失敗的原始錯誤訊息會直接顯示在這裡。
                ⚠️ 錯誤訊息本身不翻譯（那是引擎原文），只翻譯標籤。 */}
            {(() => {
              const d = getLastOcrDiagnostics();
              if (!d) return null;
              return (
                <p
                  className={`text-[15px] font-bold rounded-lg px-[10px] py-[6px] break-words leading-snug ${
                    d.outcome === 'ok'
                      ? 'bg-emerald-50 text-emerald-900'
                      : 'bg-rose-50 text-rose-900'
                  }`}
                >
                  {t('dev.ocrLast')}: {d.outcome} · {d.textLength} chars · {d.elapsedMs}ms
                  {d.error ? ` · ${d.error}` : ''}
                </p>
              );
            })()}
            {row(t('dev.analyzeMode'), context.analysisMode)}
            {row(t('dev.profile'), context.profileId)}
            {row(t('dev.language'), context.language)}
          </section>

          {/* ── 4. 上次標籤原文（2026-10-03 使用者要求）─────────────
              排查「模型／引擎到底回了什麼」時，只看解析後的欄位是不夠的。
              ⚠️ 用 <pre> + whitespace-pre-wrap + break-all：
                 原文可能很長且沒有空白，不這樣設定會直接穿出框框。 */}
          <section className="flex flex-col gap-[8px]">
            <h3 className="text-[17px] font-black text-slate-900">{t('dev.rawTitle')}</h3>

            {(() => {
              const d = getLastOcrDiagnostics();
              return (
                <div className="flex flex-col gap-[4px]">
                  <span className="text-[16px] font-black text-slate-600">{t('dev.rawOcr')}</span>
                  {d?.rawText ? (
                    <pre className="text-[15px] font-bold text-slate-800 bg-slate-50 border border-slate-300 rounded-lg p-[8px] whitespace-pre-wrap break-all max-h-[160px] overflow-y-auto m-0">
                      {d.rawText}
                    </pre>
                  ) : (
                    <p className="text-[15px] font-bold text-slate-400">{t('dev.rawEmpty')}</p>
                  )}
                </div>
              );
            })()}

            <div className="flex flex-col gap-[4px]">
              <span className="text-[16px] font-black text-slate-600">
                {t('dev.rawAi')}
                {lastAi?.provider ? ` · ${lastAi.provider}` : ''}
                {lastAi?.model ? ` · ${lastAi.model}` : ''}
              </span>
              {lastAi?.rawText ? (
                <pre className="text-[15px] font-bold text-slate-800 bg-slate-50 border border-slate-300 rounded-lg p-[8px] whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto m-0">
                  {lastAi.rawText}
                </pre>
              ) : (
                <p className="text-[15px] font-bold text-slate-400">{t('dev.rawEmpty')}</p>
              )}
            </div>
          </section>

          <p className="text-[15px] font-bold text-slate-400 break-all">{context.userAgent}</p>
        </div>
      </div>
    </div>
  );
};
