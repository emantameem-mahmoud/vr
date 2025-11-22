import React, { useRef, useEffect, useState, useCallback } from 'react';
import { identifyGesture } from '../services/geminiService';
import { GestureAction, BoundingBox } from '../types';

interface WebcamHandlerProps {
  onGestureDetected: (action: GestureAction) => void;
  isActive: boolean;
  isPaused?: boolean;
}

interface DetectionState {
  action: GestureAction;
  label: string;
  status: 'waiting' | 'success' | 'error' | 'rate_limit' | 'processing';
}

const WebcamHandler: React.FC<WebcamHandlerProps> = ({ onGestureDetected, isActive, isPaused = false }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const timeoutRef = useRef<number | null>(null);
  const animationRef = useRef<number | null>(null);
  
  // Configuration
  const delayRef = useRef<number>(6000); // Dynamic delay
  const lastActionTimeRef = useRef<number>(0);
  const COOLDOWN_MS = 2500; // Prevent double triggers
  
  // State
  const [processing, setProcessing] = useState(false);
  const [detectionState, setDetectionState] = useState<DetectionState>({
    action: GestureAction.NONE,
    label: "جاري الاستعداد...",
    status: 'waiting'
  });
  const [boundingBox, setBoundingBox] = useState<BoundingBox | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isMirrored, setIsMirrored] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('webcam_mirror');
      return saved !== 'false'; 
    } catch { return true; }
  });
  
  // Timer visualization
  const [timerProgress, setTimerProgress] = useState(0);
  const [visualDelay, setVisualDelay] = useState(6000);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 1280 }, 
          height: { ideal: 720 }, 
          facingMode: 'user',
          frameRate: { ideal: 30 }
        } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch(console.error);
        };
      }
    } catch (err) {
      console.error("Error accessing webcam:", err);
      setCameraError("تعذر الوصول للكاميرا. يرجى التحقق من الإذن.");
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    if (isActive) {
      startCamera();
    } else {
      // Stop stream if not active
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    }
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isActive, startCamera]);

  const toggleMirror = () => {
    const newState = !isMirrored;
    setIsMirrored(newState);
    localStorage.setItem('webcam_mirror', String(newState));
  };

  // Draw Bounding Box and Scanning Effect
  const drawOverlay = useCallback(() => {
    const video = videoRef.current;
    const canvas = overlayCanvasRef.current;
    
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Match canvas size to video
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    if (isMirrored) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    // Draw Bounding Box if exists and recent
    if (boundingBox && detectionState.status === 'success' && !processing) {
      const { ymin, xmin, ymax, xmax } = boundingBox;
      const x = xmin * canvas.width;
      const y = ymin * canvas.height;
      const w = (xmax - xmin) * canvas.width;
      const h = (ymax - ymin) * canvas.height;

      ctx.strokeStyle = '#10b981'; // Emerald 500
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeRect(x, y, w, h);
      
      ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
      ctx.fillRect(x, y, w, h);
    }

    ctx.restore();

    // Draw scanning line if processing (overlay on top, not mirrored context)
    if (processing) {
       const time = Date.now() / 1000;
       const y = (Math.sin(time * 4) + 1) / 2 * canvas.height;
       
       ctx.beginPath();
       ctx.moveTo(0, y);
       ctx.lineTo(canvas.width, y);
       ctx.strokeStyle = 'rgba(99, 102, 241, 0.8)'; // Indigo
       ctx.lineWidth = 2;
       ctx.stroke();
       
       // Glow effect
       ctx.shadowBlur = 10;
       ctx.shadowColor = 'rgba(99, 102, 241, 1)';
    } else {
        ctx.shadowBlur = 0;
    }

    animationRef.current = requestAnimationFrame(drawOverlay);
  }, [boundingBox, detectionState.status, isMirrored, processing]);

  useEffect(() => {
    if (isActive) {
        animationRef.current = requestAnimationFrame(drawOverlay);
    }
    return () => {
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
    }
  }, [isActive, drawOverlay]);

  const analyzeLoop = useCallback(async () => {
    if (!isActive || isPaused || cameraError) {
        setTimerProgress(0);
        return;
    }

    if (!videoRef.current || videoRef.current.readyState !== 4) {
        timeoutRef.current = window.setTimeout(analyzeLoop, 500);
        return;
    }

    if (document.hidden) {
         timeoutRef.current = window.setTimeout(analyzeLoop, 1000);
         return;
    }

    setProcessing(true);
    setTimerProgress(0); // Reset timer visual
    setDetectionState(prev => ({ ...prev, status: 'processing' }));
    setBoundingBox(null); 

    let nextDelay = delayRef.current;

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      if (canvas && video) {
          const context = canvas.getContext('2d', { willReadFrequently: true });
          if (context) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);

            // Use slightly lower quality for speed
            const base64Image = canvas.toDataURL('image/jpeg', 0.6);

            const result = await identifyGesture(base64Image);
            
            if (result.error === "QUOTA_EXCEEDED") {
                console.warn("API Limit reached, backing off...");
                setDetectionState({
                    action: GestureAction.NONE,
                    label: "⚠️ حد الاستخدام (انتظار)",
                    status: 'rate_limit'
                });
                nextDelay = Math.min(nextDelay * 2, 30000); // Exponential backoff max 30s
            } else {
                // Reset delay on success/normal operation
                nextDelay = 6000;
                const now = Date.now();
                const isCoolingDown = now - lastActionTimeRef.current < COOLDOWN_MS;
                
                if (result.action !== GestureAction.NONE && !isCoolingDown) {
                    // Map action to friendly label
                    let label = "";
                    switch (result.action) {
                        case GestureAction.NEXT: label = "التالي (👍)"; break;
                        case GestureAction.PREV: label = "السابق (👎)"; break;
                        case GestureAction.PAUSE: label = "توقف (✋)"; break;
                        case GestureAction.VOL_UP: label = "رفع الصوت (✌️)"; break;
                        case GestureAction.VOL_DOWN: label = "خفض الصوت (✊)"; break;
                        case GestureAction.CHANGE_THEME: label = "النمط (☝️)"; break;
                        case GestureAction.ZOOM_IN: label = "تكبير (👌)"; break;
                        case GestureAction.ZOOM_OUT: label = "تصغير (🤙)"; break;
                        case GestureAction.SPACE: label = "مسافة (3 أصابع)"; break;
                        default: label = "تم التعرف";
                    }
                    
                    setDetectionState({
                        action: result.action,
                        label: label,
                        status: 'success'
                    });
                    
                    if (result.boundingBox) {
                        setBoundingBox(result.boundingBox);
                    }

                    lastActionTimeRef.current = now;
                    if (navigator.vibrate) navigator.vibrate(50);
                    onGestureDetected(result.action);
                } else {
                    // No gesture detected
                    setDetectionState(prev => ({
                        ...prev,
                        label: isCoolingDown ? "انتظار..." : "جاهز...",
                        status: 'waiting',
                    }));
                }
            }
          }
      }
    } catch (error) {
      console.error("Analysis error:", error);
      setDetectionState(prev => ({ ...prev, status: 'error', label: 'خطأ' }));
    } finally {
      setProcessing(false);
      delayRef.current = nextDelay;
      setVisualDelay(nextDelay);
      
      // Start visual timer for next cycle
      // Slight delay to allow UI to settle
      setTimeout(() => {
          if(isActive && !isPaused) setTimerProgress(100);
      }, 100);
      
      timeoutRef.current = window.setTimeout(analyzeLoop, nextDelay);
    }
  }, [isActive, isPaused, cameraError, onGestureDetected]);

  // Init loop
  useEffect(() => {
      if (isActive && !isPaused && !cameraError) {
          analyzeLoop();
      } else {
          setTimerProgress(0);
      }
      return () => {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
      };
  }, [isActive, isPaused, cameraError, analyzeLoop]);

  // Helper for status color
  const getStatusColor = (state: DetectionState) => {
      if (isPaused) return "bg-amber-600 text-white";
      switch (state.status) {
          case 'rate_limit': return "bg-red-600 text-white";
          case 'error': return "bg-red-600 text-white";
          case 'success': 
             if ([GestureAction.PREV, GestureAction.VOL_DOWN, GestureAction.ZOOM_OUT].includes(state.action)) return "bg-rose-600 text-white";
             if ([GestureAction.ZOOM_IN, GestureAction.SPACE, GestureAction.CHANGE_THEME].includes(state.action)) return "bg-blue-600 text-white";
             return "bg-emerald-600 text-white";
          case 'processing': return "bg-slate-700 text-slate-300";
          default: return "bg-slate-700 text-slate-300";
      }
  };

  if (cameraError) {
    return (
      <div className="fixed bottom-4 left-4 z-50 flex flex-col items-center bg-red-900/95 p-4 rounded-xl shadow-2xl border border-red-700 backdrop-blur-sm max-w-[200px]">
        <p className="text-white text-xs text-center mb-2">{cameraError}</p>
        <button onClick={startCamera} className="px-3 py-1 bg-white text-red-900 text-xs font-bold rounded hover:bg-slate-200 transition">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 flex flex-col items-center bg-slate-800/90 p-3 rounded-xl shadow-2xl border border-slate-600 backdrop-blur-sm group transition-all duration-300 hover:bg-slate-800">
      <div className="relative w-48 h-36 rounded-lg overflow-hidden bg-black mb-2 border border-slate-600/50">
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          style={{ transform: isMirrored ? 'scaleX(-1)' : 'none' }}
          className="w-full h-full object-cover"
        />
        
        <canvas 
            ref={overlayCanvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
        />

        <button 
          onClick={toggleMirror}
          title="عكس اتجاه الكاميرا"
          className="absolute top-1 right-1 p-1 bg-black/50 rounded-full text-white hover:bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity z-10"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
          </svg>
        </button>
        
        {isPaused && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-[2px] pointer-events-none z-20">
             <span className="text-3xl">⏸️</span>
          </div>
        )}

        {/* Timer Progress Bar */}
        {!isPaused && !processing && (
          <div className="absolute bottom-0 left-0 h-1 bg-emerald-500 z-10 ease-linear" 
               style={{ 
                 width: `${timerProgress}%`, 
                 transitionProperty: 'width',
                 transitionDuration: `${visualDelay - 150}ms`
               }} />
        )}
      </div>
      
      <div className="text-xs text-slate-300 text-center w-full">
        <div className={`px-2 py-1 rounded-full block w-full transition-colors truncate font-medium ${getStatusColor(detectionState)}`}>
          {isPaused ? "متوقف" : detectionState.label}
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default WebcamHandler;