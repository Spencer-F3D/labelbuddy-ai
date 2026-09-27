/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ============================================================================
 * 長者即時相機取景與對焦輔助提示 (Camera Viewfinder with Focus Assist & Haptic Feedback)
 * ============================================================================
 * 1. 畫面中央虛擬框線：「請將標籤置於此處」高對比取景框與四角定位線。
 * 2. 震動輔助提示（Haptic Vibration）：相機啟動、對齊及拍照時發出觸覺震動回饋（環境支援時）。
 * 3. 專為 60+ 長者設計：大按鈕、大文字、防誤觸、翻轉前後鏡頭、閃光燈開關與友善錯誤降級。
 * ============================================================================
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Camera,
  X,
  RotateCw,
  Zap,
  ZapOff,
  AlertCircle,
  Vibrate,
  Scan,
  CheckCircle2,
  FileImage,
} from 'lucide-react';
import { compressImage } from '../utils/imageCompression';

interface CameraViewfinderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (base64: string) => void;
  contrastTheme?: string;
}

export const CameraViewfinderModal: React.FC<CameraViewfinderModalProps> = ({
  isOpen,
  onClose,
  onCapture,
  contrastTheme = 'standard',
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [supportsTorch, setSupportsTorch] = useState<boolean>(false);
  const [supportsVibrate, setSupportsVibrate] = useState<boolean>(false);
  const [vibrateTested, setVibrateTested] = useState<boolean>(false);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);

  const isYellowContrast = contrastTheme === 'high_contrast_yellow';

  // 觸發震動輔助提示
  const triggerHaptic = useCallback((pattern: number | number[] = [100, 50, 100]) => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {
        console.warn('震動提示調用失敗:', e);
      }
    }
  }, []);

  // 關閉並釋放鏡頭資源
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    setTorchOn(false);
  }, []);

  // 啟動相機鏡頭
  const startCamera = useCallback(async () => {
    stopCamera();
    setErrorMessage(null);

    // 檢測震動 API 支援狀況
    const hasVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator;
    setSupportsVibrate(hasVibrate);

    try {
      if (!navigator.mediaDevices || !Boolean(navigator.mediaDevices.getUserMedia)) {
        throw new Error('您的瀏覽器或設備未支援即時相機串流，請使用相片上傳功能。');
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setHasPermission(true);

      // 檢查是否支援手電筒 (torch)
      const track = stream.getVideoTracks()[0];
      if (track) {
        const capabilities = (track.getCapabilities && track.getCapabilities()) as any;
        if (capabilities && capabilities.torch) {
          setSupportsTorch(true);
        } else {
          setSupportsTorch(false);
        }
      }

      // 相機成功就緒，發出對焦輔助提示震動
      if (hasVibrate) {
        triggerHaptic([120, 60, 120]);
      }
    } catch (err: any) {
      console.error('開啟相機失敗:', err);
      setHasPermission(false);
      setErrorMessage(
        err.name === 'NotAllowedError'
          ? '未允許使用相機權限。請在瀏覽器設定中允許相機存取，或改用上傳相片方式。'
          : err.message || '無法開啟相機，請檢查鏡頭是否被其他應用程式佔用。'
      );
    }
  }, [facingMode, stopCamera, triggerHaptic]);

  // 開啟 Modal 時啟動相機，關閉時停止相機
  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, startCamera, stopCamera]);

  // 切換前後鏡頭
  const handleToggleFacingMode = () => {
    triggerHaptic(60);
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // 切換手電筒 (Torch)
  const handleToggleTorch = async () => {
    triggerHaptic(60);
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track) {
      try {
        const nextState = !torchOn;
        await (track as any).applyConstraints({
          advanced: [{ torch: nextState }],
        });
        setTorchOn(nextState);
      } catch (err) {
        console.warn('切換手電筒失敗:', err);
      }
    }
  };

  // 測試手動震動
  const handleTestVibration = () => {
    setVibrateTested(true);
    triggerHaptic([150, 80, 150]);
    setTimeout(() => setVibrateTested(false), 1000);
  };

  // 拍照確認並擷取目前畫面
  const handleCaptureFrame = async () => {
    if (!videoRef.current || isCapturing) return;

    setIsCapturing(true);
    // 觸發拍照成功震動提示
    triggerHaptic([80, 40, 120]);

    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      const w = video.videoWidth || 1280;
      const h = video.videoHeight || 720;

      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('無法建立畫布');

      // 繪製視訊畫面至 canvas
      ctx.drawImage(video, 0, 0, w, h);

      // 轉成 Blob 並透過現有的 compressImage 壓縮至最大 1024px
      canvas.toBlob(
        async (blob) => {
          if (!blob) {
            setIsCapturing(false);
            return;
          }
          try {
            const compressed = await compressImage(blob, 1024, 0.8);
            stopCamera();
            onCapture(compressed.base64);
            onClose();
          } catch (compressErr) {
            console.error('壓縮拍照影像失敗:', compressErr);
            // 降級使用 canvas base64
            const rawBase64 = canvas.toDataURL('image/jpeg', 0.8);
            stopCamera();
            onCapture(rawBase64);
            onClose();
          } finally {
            setIsCapturing(false);
          }
        },
        'image/jpeg',
        0.9
      );
    } catch (err) {
      console.error('拍照處理失敗:', err);
      setIsCapturing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      id="camera-viewfinder-modal"
      className="fixed inset-0 z-50 flex flex-col bg-black text-white select-none animate-in fade-in duration-200"
    >
      {/* 頂部控制列 */}
      <header className="relative z-20 flex items-center justify-between p-4 sm:p-6 bg-gradient-to-b from-black/90 via-black/60 to-transparent">
        <div className="flex items-center gap-3">
          <span className="p-2.5 rounded-2xl bg-blue-600/90 text-white">
            <Camera className="w-7 h-7 sm:w-8 sm:h-8" />
          </span>
          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-white flex items-center gap-2">
              <span>相機拍照對焦</span>
            </h2>
            <p className="text-sm sm:text-base font-bold text-slate-300">
              請把食品標籤上的成分或營養表對準中間框線
            </p>
          </div>
        </div>

        {/* 關閉按鈕 */}
        <button
          type="button"
          id="btn-close-camera-viewfinder"
          onClick={() => {
            triggerHaptic(40);
            stopCamera();
            onClose();
          }}
          className="p-3.5 sm:p-4 rounded-2xl bg-white/20 hover:bg-white/30 text-white font-black text-lg flex items-center gap-2 cursor-pointer transition-all active:scale-95 border-2 border-white/40"
          aria-label="關閉相機"
        >
          <X className="w-7 h-7 sm:w-8 sm:h-8" />
          <span className="hidden sm:inline">關閉相機</span>
        </button>
      </header>

      {/* 主體取景區域 (含全螢幕視訊串流與置中虛擬框線) */}
      <div className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden bg-black">
        {/* 視訊畫面 */}
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* 錯誤提示或相機未就緒狀態 */}
        {errorMessage && (
          <div className="relative z-30 max-w-md mx-4 p-6 sm:p-8 rounded-3xl bg-amber-950/90 border-4 border-amber-500 text-white text-center space-y-4 shadow-2xl backdrop-blur-md">
            <AlertCircle className="w-16 h-16 text-amber-400 mx-auto" />
            <h3 className="text-2xl font-black text-amber-200">無法開啟相機</h3>
            <p className="text-lg font-bold text-amber-100 leading-relaxed">{errorMessage}</p>
            <div className="pt-2 flex flex-col gap-3">
              <button
                type="button"
                onClick={startCamera}
                className="w-full py-4 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xl cursor-pointer"
              >
                重試開啟相機
              </button>
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  onClose();
                }}
                className="w-full py-3 rounded-2xl bg-white/20 hover:bg-white/30 text-white font-bold text-lg cursor-pointer"
              >
                返回並使用相片選取
              </button>
            </div>
          </div>
        )}

        {/* 核心功能：【對焦輔助提示】虛擬框線與中央導引 (當相機正常啟動時顯示) */}
        {!errorMessage && hasPermission && (
          <div className="relative z-10 w-full h-full pointer-events-none flex flex-col items-center justify-center p-6">
            {/* 半透明暗化四周遮罩，凸顯中間取景窗 */}
            <div className="relative w-full max-w-md sm:max-w-lg aspect-[3/4] sm:aspect-[4/3] rounded-3xl overflow-hidden flex flex-col items-center justify-between p-6">
              {/* 四個角落顯眼的對焦標記 (黃色/綠色高對比 5px 粗角線) */}
              {/* 左上角 */}
              <div
                className={`absolute top-0 left-0 w-12 h-12 sm:w-16 sm:h-16 border-t-6 border-l-6 rounded-tl-2xl ${
                  isYellowContrast ? 'border-yellow-400' : 'border-emerald-400'
                } shadow-[0_0_15px_rgba(34,197,94,0.6)]`}
              />
              {/* 右上角 */}
              <div
                className={`absolute top-0 right-0 w-12 h-12 sm:w-16 sm:h-16 border-t-6 border-r-6 rounded-tr-2xl ${
                  isYellowContrast ? 'border-yellow-400' : 'border-emerald-400'
                } shadow-[0_0_15px_rgba(34,197,94,0.6)]`}
              />
              {/* 左下角 */}
              <div
                className={`absolute bottom-0 left-0 w-12 h-12 sm:w-16 sm:h-16 border-b-6 border-l-6 rounded-bl-2xl ${
                  isYellowContrast ? 'border-yellow-400' : 'border-emerald-400'
                } shadow-[0_0_15px_rgba(34,197,94,0.6)]`}
              />
              {/* 右下角 */}
              <div
                className={`absolute bottom-0 right-0 w-12 h-12 sm:w-16 sm:h-16 border-b-6 border-r-6 rounded-br-2xl ${
                  isYellowContrast ? 'border-yellow-400' : 'border-emerald-400'
                } shadow-[0_0_15px_rgba(34,197,94,0.6)]`}
              />

              {/* 虛線輔助對齊外框 */}
              <div
                className={`absolute inset-0 border-2 border-dashed rounded-3xl ${
                  isYellowContrast ? 'border-yellow-300/60' : 'border-emerald-300/60'
                } animate-pulse`}
              />

              {/* 中央十字微對齊準星 */}
              <div className="absolute inset-0 flex items-center justify-center opacity-40">
                <div className="w-12 h-0.5 bg-white" />
                <div className="h-12 w-0.5 bg-white -ml-6" />
              </div>

              {/* 頂部標籤提示徽章 */}
              <div className="z-10 flex items-center gap-2 px-5 py-2.5 rounded-full bg-black/75 border-2 border-white/50 backdrop-blur-md shadow-lg text-white">
                <Scan className="w-6 h-6 text-emerald-400 animate-spin" />
                <span className="text-lg sm:text-xl font-black tracking-wide">
                  自動對焦輔助中
                </span>
              </div>

              {/* 中央醒目大白話提示標籤：【請將標籤置於此處】 */}
              <div
                id="camera-focus-guide-box"
                className={`z-10 text-center px-6 py-4 rounded-3xl border-3 shadow-2xl backdrop-blur-md transition-all ${
                  isYellowContrast
                    ? 'bg-black/90 border-yellow-400 text-yellow-300'
                    : 'bg-slate-900/90 border-emerald-400 text-white'
                }`}
              >
                <div className="flex items-center justify-center gap-3">
                  <span className="text-3xl sm:text-4xl animate-bounce">👇</span>
                  <p className="text-2xl sm:text-3xl md:text-4xl font-black tracking-wider drop-shadow-md">
                    請將標籤置於此處
                  </p>
                  <span className="text-3xl sm:text-4xl animate-bounce">👇</span>
                </div>
                <p className="text-base sm:text-xl font-bold text-slate-200 mt-1">
                  將成分表或營養標示填滿框線，字體越清晰辨識越準確
                </p>
              </div>

              {/* 底部震動提示狀態回饋小膠囊 */}
              <div className="z-10 flex items-center gap-2 px-4 py-2 rounded-full bg-black/75 border border-white/40 text-sm sm:text-base font-bold text-slate-200 backdrop-blur-md">
                <Vibrate className={`w-5 h-5 ${supportsVibrate ? 'text-emerald-400' : 'text-slate-400'}`} />
                <span>
                  {supportsVibrate
                    ? '📳 震動輔助提示：已就緒（對焦與拍照提供手部震動反饋）'
                    : '📳 震動提示：（此瀏覽器環境未支援震動）'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 底部功能與巨大拍照按鈕區 */}
      <footer className="relative z-20 p-4 sm:p-6 bg-gradient-to-t from-black/95 via-black/80 to-transparent flex flex-col items-center gap-4">
        {/* 次要控制按鈕 (手電筒、切換鏡頭、震動測試) */}
        <div className="flex items-center justify-center gap-4 w-full max-w-md">
          {/* 鏡頭翻轉 */}
          <button
            type="button"
            id="btn-switch-camera-lens"
            onClick={handleToggleFacingMode}
            className="flex-1 py-3 px-4 rounded-2xl bg-white/20 hover:bg-white/30 active:bg-white/40 text-white font-black text-lg flex items-center justify-center gap-2 cursor-pointer border border-white/30 transition-all active:scale-95"
            title="切換前/後鏡頭"
          >
            <RotateCw className="w-6 h-6" />
            <span>{facingMode === 'environment' ? '切換前鏡頭' : '切換後鏡頭'}</span>
          </button>

          {/* 手電筒補光燈 (若硬體支援) */}
          {supportsTorch && (
            <button
              type="button"
              id="btn-toggle-camera-torch"
              onClick={handleToggleTorch}
              className={`py-3 px-5 rounded-2xl font-black text-lg flex items-center justify-center gap-2 cursor-pointer border transition-all active:scale-95 ${
                torchOn
                  ? 'bg-amber-400 text-black border-amber-300 shadow-lg'
                  : 'bg-white/20 text-white border-white/30 hover:bg-white/30'
              }`}
            >
              {torchOn ? <Zap className="w-6 h-6" /> : <ZapOff className="w-6 h-6" />}
              <span>{torchOn ? '關閉補光燈' : '開啟補光燈'}</span>
            </button>
          )}

          {/* 震動反饋手動測試 (方便長者測試觸覺反饋) */}
          {supportsVibrate && (
            <button
              type="button"
              id="btn-test-camera-vibration"
              onClick={handleTestVibration}
              className={`py-3 px-4 rounded-2xl font-bold text-base sm:text-lg flex items-center justify-center gap-1.5 cursor-pointer border transition-all active:scale-95 ${
                vibrateTested
                  ? 'bg-emerald-500 text-white border-emerald-400'
                  : 'bg-white/20 text-white border-white/30 hover:bg-white/30'
              }`}
              title="點擊測試手機震動"
            >
              <Vibrate className="w-5 h-5 text-yellow-300" />
              <span>{vibrateTested ? '震動回饋中！' : '測試震動'}</span>
            </button>
          )}
        </div>

        {/* 核心極大拍照快門按鈕 */}
        <div className="w-full max-w-sm flex items-center justify-center">
          <button
            type="button"
            id="btn-camera-viewfinder-shutter"
            onClick={handleCaptureFrame}
            disabled={!hasPermission || isCapturing}
            className={`w-full py-5 sm:py-6 px-8 rounded-3xl font-black text-2xl sm:text-3xl text-white shadow-2xl flex items-center justify-center gap-4 cursor-pointer border-4 transition-all active:scale-95 disabled:opacity-50 ${
              isYellowContrast
                ? 'bg-yellow-400 text-black border-yellow-300 hover:bg-yellow-300'
                : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 border-blue-400 ring-4 ring-blue-500/40'
            }`}
          >
            {isCapturing ? (
              <>
                <Scan className="w-9 h-9 animate-spin" />
                <span>正在辨識拍下的標籤...</span>
              </>
            ) : (
              <>
                <Camera className="w-10 h-10 shrink-0 animate-pulse" />
                <span>📸 按此拍照 (已對焦)</span>
              </>
            )}
          </button>
        </div>
      </footer>
    </div>
  );
};
