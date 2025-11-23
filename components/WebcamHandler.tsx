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
  status: 'waiting' | 'success' | 'error' | 'loading';
}

const WebcamHandler: React.FC<WebcamHandlerProps> = ({ onGestureDetected, isActive, isPaused = false }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const isMountedRef = useRef<boolean>(true); 
  
  const requestRef = useRef<number | null>(null);
  const lastDetectionTimeRef = useRef<number>(0);
  const lastActionRef = useRef<GestureAction>(GestureAction.NONE);
  const actionCooldownRef = useRef<number>(0);
  
  const [detectionState, setDetectionState] = useState<DetectionState>({
    action: GestureAction.NONE,
    label: "تحميل النموذج...",
    status: 'loading'
  });
  const [boundingBox, setBoundingBox] = useState<BoundingBox | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isMirrored, setIsMirrored] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('webcam_mirror');
      return saved !== 'false'; 
    } catch { return true; }
  });

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      if (videoRef.current && videoRef.current.srcObject) {
         const s = videoRef.current.srcObject as MediaStream;
         s.getTracks().forEach(t => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 320 },
          height: { ideal: 240 }, 
          facingMode: 'user',
          frameRate: { ideal: 30 }
        } 
      });
      
      if (videoRef.current && isMountedRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
            if(isMountedRef.current) videoRef.current?.play().catch(console.error);
        };
      }
    } catch (err) {
      console.error("Error accessing webcam:", err);
      if (isMountedRef.current) setCameraError("تعذر الوصول للكاميرا.");
    }
  }, []);

  useEffect(() => {
    if (isActive) {
      startCamera();
    } else {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
    }
  }, [isActive, startCamera]);

  const toggleMirror = () => {
    const newState = !isMirrored;
    setIsMirrored(newState);
    localStorage.setItem('webcam_mirror', String(newState));
  };

  const drawOverlay = useCallback(() => {
    if (!isMountedRef.current) return;

    const video = videoRef.current;
    const canvas = overlayCanvasRef.current;
    
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

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

    // Draw Bounding Box
    if (boundingBox && detectionState.status === 'success') {
      const { ymin, xmin, ymax, xmax } = boundingBox;
      const x = xmin * canvas.width;
      const y = ymin * canvas.height;
      const w = (xmax - xmin) * canvas.width;
      const h = (ymax - ymin) * canvas.height;

      ctx.strokeStyle = '#10b981'; 
      ctx.lineWidth = 4;
      ctx.strokeRect(x, y, w, h);
    }

    ctx.restore();
  }, [boundingBox, detectionState.status, isMirrored]);

  const detectionLoop = useCallback(async () => {
    if (!isMountedRef.current) return;

    const now = Date.now();
    requestRef.current = requestAnimationFrame(detectionLoop);

    // Draw every frame
    drawOverlay();

    // Detect every 150ms to save battery but stay fast
    if (now - lastDetectionTimeRef.current < 150) return;
    lastDetectionTimeRef.current = now;

    if (!isActive || isPaused || cameraError || !videoRef.current) return;

    try {
       const result = await identifyGesture(videoRef.current);
       
       if (!isMountedRef.current) return;

       if (result.error === "LOADING") {
           setDetectionState(prev => ({ ...prev, status: 'loading', label: "تحميل النموذج..." }));
           return;
       }

       if (result.error === "INIT_FAILED") {
           setDetectionState(prev => ({ ...prev, status: 'error', label: "فشل تحميل AI" }));
           return;
       }

       // Handle Cooldown for same action to prevent stuttering
       if (now < actionCooldownRef.current) return;

       if (result.action !== GestureAction.NONE) {
           const label = result.action.replace('NUM_', '').replace('_', ' ');
           
           setDetectionState({
               action: result.action,
               label: label,
               status: 'success'
           });
           
           if (result.boundingBox) setBoundingBox(result.boundingBox);
           
           // Trigger action only if different or after cooldown
           // We add a small debounce
           if (result.action !== lastActionRef.current || now > actionCooldownRef.current) {
               if (navigator.vibrate) navigator.vibrate(50);
               onGestureDetected(result.action);
               actionCooldownRef.current = now + 1000; // 1 second cooldown between same actions
               lastActionRef.current = result.action;
           }
       } else {
           setDetectionState(prev => ({
               ...prev,
               label: "مستعد",
               status: 'waiting',
           }));
           setBoundingBox(null);
           // Reset last action if nothing detected for a while, allowing easier re-trigger
           if (now - actionCooldownRef.current > 500) {
              lastActionRef.current = GestureAction.NONE;
           }
       }
    } catch (err) {
        console.error(err);
    }

  }, [isActive, isPaused, cameraError, drawOverlay, onGestureDetected]);

  useEffect(() => {
      if (isActive && !isPaused) {
          requestRef.current = requestAnimationFrame(detectionLoop);
      }
      return () => {
          if (requestRef.current) cancelAnimationFrame(requestRef.current);
      };
  }, [isActive, isPaused, detectionLoop]);

  const getStatusColor = (state: DetectionState) => {
      if (isPaused) return "bg-amber-600 text-white";
      switch (state.status) {
          case 'error': return "bg-red-600 text-white";
          case 'success': return "bg-emerald-600 text-white";
          case 'loading': return "bg-indigo-600 text-white animate-pulse";
          default: return "bg-slate-700 text-slate-300";
      }
  };

  if (cameraError) {
    return (
      <div className="fixed bottom-4 left-4 z-50 flex flex-col items-center bg-red-900/95 p-4 rounded-xl shadow-2xl">
        <p className="text-white text-xs text-center mb-2">{cameraError}</p>
        <button onClick={startCamera} className="px-3 py-1 bg-white text-red-900 text-xs font-bold rounded">
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
      </div>
      
      <div className="text-xs text-slate-300 text-center w-full">
        <div className={`px-2 py-1 rounded-full block w-full transition-colors truncate font-medium ${getStatusColor(detectionState)}`}>
          {isPaused ? "متوقف" : detectionState.label}
        </div>
      </div>
    </div>
  );
};

export default WebcamHandler;