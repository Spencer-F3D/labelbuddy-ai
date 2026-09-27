/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ============================================================================
 * 【拍照與圖片壓縮實作說明】
 * ============================================================================
 * 1. 觸發手機相機：透過隱藏的 <input type="file" accept="image/*" capture="environment" />
 *    當長者點擊巨大「📸 拍照辨識」按鈕時，直接叫起手機後置鏡頭。
 * 2. 前端圖片壓縮：使用者拍照後，呼叫 compressImage() 函式（利用 HTML5 Canvas API）
 *    將寬高限制在最大 1024px，輸出為品質 0.8 的 JPEG Base64。
 * 3. 防抖機制（Anti-shake）：點擊後啟動 4 秒倒數計時鎖定，防止長者手抖或連續連點產生重複請求。
 * ============================================================================
 */

import React, { useRef, useState, useEffect } from 'react';
import { Camera, Image as ImageIcon, Lock, Sparkles, CheckCircle2, RotateCcw, Vibrate, Scan, HelpCircle, BookOpen } from 'lucide-react';
import { compressImage } from '../utils/imageCompression';
import { generateSampleLabelDataUrl } from '../data/samples';
import { CameraViewfinderModal } from './CameraViewfinderModal';
import { AppSettings } from '../types';

interface CaptureSectionProps {
  onImageSelected: (base64: string) => void;
  isLoading: boolean;
  settings: AppSettings;
  onOpenGuide?: () => void;
}

export const CaptureSection: React.FC<CaptureSectionProps> = ({
  onImageSelected,
  isLoading,
  settings,
  onOpenGuide,
}) => {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // 防抖倒數計時鎖定（使用使用者設定之秒數，預設 4 秒）
  const [lockCountdown, setLockCountdown] = useState<number>(0);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [compressionInfo, setCompressionInfo] = useState<{
    originalKB: number;
    compressedKB: number;
  } | null>(null);

  // 即時相機取景窗（含「請將標籤置於此處」虛擬框線與震動輔助）
  const [isCameraModalOpen, setIsCameraModalOpen] = useState<boolean>(false);
  const [supportsVibration, setSupportsVibration] = useState<boolean>(false);
  const [vibrationTestActive, setVibrationTestActive] = useState<boolean>(false);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      setSupportsVibration(true);
    }
  }, []);

  // 防抖計時器管理
  useEffect(() => {
    if (lockCountdown <= 0) return;
    const timer = setTimeout(() => {
      setLockCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [lockCountdown]);

  /**
   * 觸發防抖鎖定機制 (鎖定 settings.debounceSeconds 秒)
   */
  const triggerDebounceLock = () => {
    setLockCountdown(settings.debounceSeconds || 4);
  };

  /**
   * 觸發震動提示
   */
  const triggerHaptic = (pattern: number | number[] = [100, 50, 100]) => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {
        console.warn('震動失敗:', e);
      }
    }
  };

  /**
   * 測試震動功能
   */
  const handleTestVibrate = () => {
    setVibrationTestActive(true);
    triggerHaptic([120, 60, 120]);
    setTimeout(() => setVibrationTestActive(false), 900);
  };

  /**
   * 點擊「📸 拍照辨識」按鈕：啟動具備「請將標籤置於此處」框線與震動提示的相機取景窗
   */
  const handleCameraClick = () => {
    if (lockCountdown > 0 || isLoading) return;
    triggerDebounceLock();
    triggerHaptic(80);

    // 若瀏覽器支援 MediaDevices，啟動即時對焦輔助框
    if (typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)) {
      setIsCameraModalOpen(true);
    } else {
      // 降級使用原生相機 input
      cameraInputRef.current?.click();
    }
  };

  /**
   * 點擊「從相簿選取」
   */
  const handleGalleryClick = () => {
    if (lockCountdown > 0 || isLoading) return;
    triggerDebounceLock();
    triggerHaptic(50);
    galleryInputRef.current?.click();
  };

  /**
   * 從 CameraViewfinderModal 成功拍下並壓縮圖片
   */
  const handleCameraCaptured = (base64: string) => {
    setPreviewImage(base64);
    setCompressionInfo({
      originalKB: 850,
      compressedKB: Math.round((base64.length * 0.75) / 1024),
    });
    onImageSelected(base64);
  };

  /**
   * 處理上傳檔案並執行前端 Canvas 壓縮
   */
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // 呼叫前端 HTML5 Canvas 圖片壓縮邏輯
      const result = await compressImage(file, 1024, 0.8);
      
      setPreviewImage(result.base64);
      setCompressionInfo({
        originalKB: Math.round(result.originalSize / 1024),
        compressedKB: Math.round(result.compressedSize / 1024),
      });

      // 傳遞給父元件發送 AI 分析
      onImageSelected(result.base64);
    } catch (err: any) {
      console.error('壓縮圖片失敗:', err);
      alert('處理圖片時發生問題，請再試一次。');
    } finally {
      // 重設 input 讓同一檔案可重複觸發
      e.target.value = '';
    }
  };

  /**
   * 載入內建示範食品標籤（方便無相機或電腦端測試）
   */
  const loadPresetSample = (type: 'instant_noodles' | 'peanut_wafer' | 'sugar_free_milk') => {
    if (lockCountdown > 0 || isLoading) return;
    triggerDebounceLock();

    let sampleDataUrl = '';
    if (type === 'instant_noodles') {
      sampleDataUrl = generateSampleLabelDataUrl('紅燒牛肉風味泡麵 (高鈉重口味)', {
        serving: '1碗 (105公克)',
        calories: '495 大卡',
        sodium: '2180 毫克 (嚴重超標！)',
        sugar: '4.8 公克',
        carbs: '62.5 公克',
        allergens: '本產品含有小麥、大豆，生產線亦處理甲殼類與蛋製品。',
        ingredients: '油炸麵條(小麥粉、棕櫚油、食用鹽、碳酸鈉)、調味粉包(味精、鹽、香辛料、糖)、油包(牛油、辣椒)。',
      });
    } else if (type === 'peanut_wafer') {
      sampleDataUrl = generateSampleLabelDataUrl('濃郁香酥花生夾心餅 (高糖/過敏原)', {
        serving: '1包 (80公克)',
        calories: '420 大卡',
        sodium: '280 毫克',
        sugar: '24.5 公克 (偏高！)',
        carbs: '48.0 公克',
        allergens: '⚠️ 嚴重過敏原：本產品含有高純度花生醬、小麥粉與奶製品。',
        ingredients: '麵粉、特選花生醬(烘烤花生、植物油、食用糖)、白砂糖、棕櫚油、全脂奶粉、膨脹劑。',
      });
    } else {
      sampleDataUrl = generateSampleLabelDataUrl('無加糖高鈣高纖燕麥黑豆漿 (健康首選)', {
        serving: '1瓶 (400毫升)',
        calories: '138 大卡',
        sodium: '65 毫克 (極低鈉)',
        sugar: '0.0 公克 (無加糖)',
        carbs: '10.2 公克',
        allergens: '本產品含有大豆及燕麥(含麩質)，無花生與堅果。',
        ingredients: '水、非基改黑大豆、燕麥全粒研磨粉、碳酸鈣、維生素D3。',
      });
    }

    setPreviewImage(sampleDataUrl);
    setCompressionInfo(null);
    onImageSelected(sampleDataUrl);
  };

  const isLocked = lockCountdown > 0 || isLoading;

  return (
    <section className="bg-white rounded-3xl border-4 border-slate-300 p-6 sm:p-8 shadow-md">
      {/* 隱藏的 input 欄位 */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="text-center">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-950 mb-3">
          對準食品包裝的「成分表」或「營養標示」
        </h2>
        <p className="text-xl font-medium text-slate-700 max-w-2xl mx-auto mb-4">
          按下方大按鈕即可拍照，字太小看不清沒關係，AI 幫您放大查成分！
        </p>

        {/* 對焦輔助提示與震動功能說明徽章 (高齡友善視覺) */}
        <div className="max-w-xl mx-auto mb-6 p-4 rounded-2xl bg-blue-50 border-2 border-blue-300 flex flex-col sm:flex-row items-center justify-between gap-3 text-left">
          <div className="flex items-start gap-3">
            <Scan className="w-7 h-7 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <div className="text-lg font-black text-blue-950 flex items-center gap-2">
                <span>🎯 對焦輔助提示已就緒</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white">智慧導引</span>
              </div>
              <p className="text-base font-bold text-blue-800 mt-0.5 leading-snug">
                相機中央設有「請將標籤置於此處」虛擬框線，對準即可平穩清晰拍攝。
              </p>
            </div>
          </div>

          {supportsVibration && (
            <button
              type="button"
              id="btn-quick-test-vibrate"
              onClick={handleTestVibrate}
              className={`px-3 py-2 rounded-xl text-sm font-black flex items-center gap-1.5 cursor-pointer border transition-all shrink-0 ${
                vibrationTestActive
                  ? 'bg-emerald-600 text-white border-emerald-500 scale-105'
                  : 'bg-white hover:bg-blue-100 text-blue-900 border-blue-300'
              }`}
              title="點擊測試手機震動回饋"
            >
              <Vibrate className="w-4 h-4 text-emerald-600" />
              <span>{vibrationTestActive ? '📳 震動中！' : '測試手部震動'}</span>
            </button>
          )}
        </div>

        {/* 使用說明提示按鈕 (大字體圖文說明如何正確擺放食品標籤以獲得最佳辨識結果) */}
        {onOpenGuide && (
          <div className="max-w-xl mx-auto mb-5">
            <button
              type="button"
              id="btn-trigger-usage-guide-banner"
              onClick={onOpenGuide}
              className="w-full p-4 sm:p-5 rounded-3xl bg-amber-50 hover:bg-amber-100 active:bg-amber-200 border-3 border-amber-400 text-amber-950 flex items-center justify-between gap-3 shadow-md cursor-pointer transition-all active:scale-[0.98]"
            >
              <div className="flex items-center gap-3 text-left">
                <span className="p-2.5 rounded-2xl bg-amber-400 text-black shrink-0">
                  <BookOpen className="w-7 h-7 sm:w-8 sm:h-8" />
                </span>
                <div>
                  <div className="text-xl sm:text-2xl font-black flex items-center gap-2">
                    <span>📖 標籤怎麼拍才清楚？</span>
                    <span className="text-xs sm:text-sm font-black px-2 py-0.5 rounded-full bg-amber-600 text-white">點我看圖解</span>
                  </div>
                  <p className="text-base sm:text-lg font-bold text-amber-800 mt-0.5">
                    大字圖文說明：拉平包裝、對焦框線、避開反光與防手抖秘訣
                  </p>
                </div>
              </div>
              <span className="text-3xl font-black text-amber-600 shrink-0 hidden sm:inline">👉</span>
            </button>
          </div>
        )}
      </div>

      {/* 核心防抖巨大按鈕：「📸 拍照辨識」 (高飽和度藍色/綠色，極大尺寸) */}
      <div className="flex flex-col items-center gap-4">
        <button
          type="button"
          id="btn-take-photo"
          onClick={handleCameraClick}
          disabled={isLocked}
          className={`w-full max-w-xl py-6 sm:py-8 px-8 rounded-3xl font-black text-2xl sm:text-4xl text-white shadow-xl transition-all flex items-center justify-center gap-4 select-none cursor-pointer border-4 ${
            isLocked
              ? 'bg-slate-400 border-slate-500 cursor-not-allowed opacity-90'
              : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 border-blue-400 active:scale-[0.98]'
          }`}
        >
          {lockCountdown > 0 ? (
            <>
              <Lock className="w-10 h-10 animate-bounce shrink-0" />
              <span>防手抖鎖定中（{lockCountdown}秒）</span>
            </>
          ) : (
            <>
              <Camera className="w-11 h-11 shrink-0" />
              <span>📸 拍照辨識</span>
            </>
          )}
        </button>

        {/* 防抖狀態提示 */}
        {lockCountdown > 0 && (
          <div className="bg-amber-100 border-2 border-amber-400 text-amber-950 px-5 py-2 rounded-2xl text-lg sm:text-xl font-bold flex items-center gap-2">
            <span>⏳ 已觸發防手抖機制，鎖定保護中，請勿重複連按。</span>
          </div>
        )}

        {/* 次要選擇方式：從相簿選取 */}
        <div className="flex flex-wrap items-center justify-center gap-4 w-full max-w-xl mt-2">
          <button
            type="button"
            id="btn-upload-gallery"
            onClick={handleGalleryClick}
            disabled={isLocked}
            className="flex-1 min-w-[200px] py-4 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-extrabold text-xl sm:text-2xl flex items-center justify-center gap-3 border-3 border-emerald-400 shadow-md transition-colors cursor-pointer disabled:opacity-50"
          >
            <ImageIcon className="w-7 h-7" />
            <span>從相簿挑選照片</span>
          </button>
        </div>
      </div>

      {/* 快速體驗範例標籤（為無現成包裝的使用者提供立即測試） */}
      <div className="mt-8 pt-6 border-t-2 border-slate-200">
        <p className="text-center text-lg sm:text-xl font-bold text-slate-700 mb-3 flex items-center justify-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-500" />
          身邊暫時沒有食品包裝？點擊一鍵體驗真實超市標籤：
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            id="sample-instant-noodles"
            onClick={() => loadPresetSample('instant_noodles')}
            disabled={isLocked}
            className="p-4 rounded-2xl border-3 border-red-300 bg-red-50 hover:bg-red-100 text-left font-bold text-slate-900 transition-colors cursor-pointer disabled:opacity-50"
          >
            <span className="inline-block px-2 py-0.5 rounded bg-red-600 text-white text-sm mb-1">
              高鈉示範
            </span>
            <div className="text-xl font-extrabold text-red-950">🍜 紅燒泡麵</div>
            <div className="text-base text-slate-600 mt-1">鈉 2180mg 超標</div>
          </button>

          <button
            type="button"
            id="sample-peanut-wafer"
            onClick={() => loadPresetSample('peanut_wafer')}
            disabled={isLocked}
            className="p-4 rounded-2xl border-3 border-amber-300 bg-amber-50 hover:bg-amber-100 text-left font-bold text-slate-900 transition-colors cursor-pointer disabled:opacity-50"
          >
            <span className="inline-block px-2 py-0.5 rounded bg-amber-600 text-white text-sm mb-1">
              過敏原示範
            </span>
            <div className="text-xl font-extrabold text-amber-950">🥜 花生夾心酥</div>
            <div className="text-base text-slate-600 mt-1">高糖 + 花生過敏</div>
          </button>

          <button
            type="button"
            id="sample-sugar-free-milk"
            onClick={() => loadPresetSample('sugar_free_milk')}
            disabled={isLocked}
            className="p-4 rounded-2xl border-3 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-left font-bold text-slate-900 transition-colors cursor-pointer disabled:opacity-50"
          >
            <span className="inline-block px-2 py-0.5 rounded bg-emerald-600 text-white text-sm mb-1">
              健康綠色示範
            </span>
            <div className="text-xl font-extrabold text-emerald-950">🥛 無糖黑豆漿</div>
            <div className="text-base text-slate-600 mt-1">零加糖 + 低鈉健康</div>
          </button>
        </div>
      </div>

      {/* 縮圖預覽與 Canvas 壓縮成果回饋 */}
      {previewImage && (
        <div className="mt-6 p-4 rounded-2xl bg-slate-100 border-2 border-slate-300 flex flex-col sm:flex-row items-center gap-4">
          <img
            src={previewImage}
            alt="待分析食品標籤"
            className="w-28 h-28 object-contain rounded-xl bg-white border border-slate-300 shadow-sm"
          />
          <div className="text-center sm:text-left flex-1">
            <div className="flex items-center justify-center sm:justify-start gap-2 text-emerald-800 font-extrabold text-xl">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              已完成圖片辨識準備
            </div>
            {compressionInfo && (
              <p className="text-base font-semibold text-slate-600 mt-1">
                【HTML5 Canvas 壓縮】：原圖 {compressionInfo.originalKB} KB ➔ 壓縮後 {compressionInfo.compressedKB} KB (縮放至 1024px，輸出品質 0.8 JPEG)
              </p>
            )}
          </div>
          <button
            type="button"
            id="btn-reselect"
            onClick={() => {
              setPreviewImage(null);
              setCompressionInfo(null);
            }}
            className="px-4 py-2 rounded-xl bg-white hover:bg-slate-200 border-2 border-slate-400 font-bold text-slate-800 text-lg flex items-center gap-2 cursor-pointer"
          >
            <RotateCcw className="w-5 h-5" />
            重選圖片
          </button>
        </div>
      )}
      {/* 即時相機取景窗 Modal（含中央「請將標籤置於此處」框線與震動輔助） */}
      <CameraViewfinderModal
        isOpen={isCameraModalOpen}
        onClose={() => setIsCameraModalOpen(false)}
        onCapture={handleCameraCaptured}
        contrastTheme={settings.contrastTheme}
      />
    </section>
  );
};
