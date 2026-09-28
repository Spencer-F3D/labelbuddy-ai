/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 可收合的設定區塊（Accordion Section）
 * ============================================================================
 * 設定頁原本 4 個區塊全部展開，整頁長度超過 3 個螢幕高，
 * 長者要一直滑才找得到想改的項目。這個元件讓每個區塊能收起來。
 *
 * 【★★ 最重要的設計決定：收合時必須顯示「目前狀態」】
 *   如果收起來只顯示標題，長者就得一個一個展開才知道自己設了什麼 ——
 *   那比全部展開還麻煩。
 *   所以 header 一定要有 `summary`，例如：
 *     🧓 學習者身分        長者三高
 *     ❤️ 日常生理指標      血壓 148/92 · 血糖 8.8
 *     🩺 慢性病與過敏      已選 4 項
 *   這樣「收起來」反而比「展開」更快看到重點。
 *
 * 【為什麼用 grid-template-rows 做動畫，而不是 max-height】
 *   max-height 要猜一個夠大的值，動畫速度會不自然（內容短時會先停頓）。
 *   `grid-template-rows: 0fr → 1fr` 能依內容實際高度平滑展開，
 *   不需要用 JS 量測高度。
 *
 * 【無障礙】
 *   用 <button> 當 header（鍵盤可用）、aria-expanded 表達狀態、
 *   aria-controls 指向內容區。chevron 只是視覺輔助，用 aria-hidden 標記。
 */

import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export interface SettingsSectionProps {
  /** 供自動化測試與深層連結使用的固定 id */
  id: string;
  /** 標題左側圖示 */
  icon: ReactNode;
  /** 區塊標題 */
  title: string;
  /**
   * 收合時顯示的目前狀態。
   * ⚠️ 強烈建議一定要給 —— 這是這個元件對長者有沒有幫助的關鍵。
   */
  summary?: string;
  /** 預設是否展開 */
  defaultOpen?: boolean;
  children: ReactNode;
}

export function SettingsSection({
  id,
  icon,
  title,
  summary,
  defaultOpen = false,
  children,
}: SettingsSectionProps) {
  const [isOpen, setIsOpen] = useState<boolean>(defaultOpen);
  const contentId = `${useId()}-content`;

  return (
    <section
      id={id}
      className="bg-white rounded-3xl border-4 border-blue-900 shadow-md overflow-hidden"
    >
      <button
        type="button"
        id={`${id}-toggle`}
        aria-expanded={isOpen}
        aria-controls={contentId}
        onClick={() => setIsOpen((v) => !v)}
        /* 觸控高度 72px：比一般規範的 48px 更大，長者手指較難精準點擊 */
        className={`w-full min-h-[72px] px-5 py-3 flex items-center gap-[12px] text-left cursor-pointer transition-colors ${
          isOpen ? 'bg-blue-900' : 'bg-white hover:bg-slate-50'
        }`}
      >
        <span
          className={`w-[44px] h-[44px] shrink-0 rounded-full flex items-center justify-center ${
            isOpen ? 'bg-blue-800 text-white' : 'bg-slate-100 text-slate-800'
          }`}
          aria-hidden="true"
        >
          {icon}
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={`block text-[19px] font-black leading-tight ${
              isOpen ? 'text-white' : 'text-slate-950'
            }`}
          >
            {title}
          </span>
          {/* 收合時顯示目前狀態；展開時就不重複顯示了（展開後看得到實際內容） */}
          {summary && !isOpen && (
            <span className="block text-[16px] font-bold text-slate-600 leading-tight mt-[2px] truncate">
              {summary}
            </span>
          )}
          {isOpen && (
            <span className="block text-[16px] font-bold text-blue-200 leading-tight mt-[2px]">
              點一下收起
            </span>
          )}
        </span>

        <ChevronDown
          className={`w-[28px] h-[28px] shrink-0 transition-transform duration-300 ${
            isOpen ? 'rotate-180 text-white' : 'text-slate-500'
          }`}
          aria-hidden="true"
        />
      </button>

      {/* 平滑展開：0fr → 1fr，內層 overflow-hidden 才能被裁切 */}
      <div
        id={contentId}
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="p-5 border-t-4 border-blue-900">{children}</div>
        </div>
      </div>
    </section>
  );
}
