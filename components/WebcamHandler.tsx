import React, { useRef, useEffect, useState, useCallback } from 'react';
import { identifyGesture } from '../services/geminiService';
import { GestureAction, BoundingBox, HandGesture } from '../types';

interface WebcamHandlerProps {
  onGestureDetected: (action: GestureAction) => void;
  isActive: boolean;
  isPaused?: boolean;
  gestureMappings: Record<HandGesture, GestureAction>;
}

interface DetectionState {
  gesture: HandGesture;
  action: GestureAction;
  label: string;
  status: 'waiting' | 'success' | 'error' | 'loading';
}

const WebcamHandler: React.FC<WebcamHandlerProps> = ({ onGestureDetected, isActive, isPaused = false, gestureMappings }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const isMountedRef = useRef<boolean>(true); 
  const requestRef = useRef<number | null>(null);
  const lastDetectionTimeRef = useRef<number>(0);
  const lastGestureRef = useRef<HandGesture>(HandGesture.NONE);
  const actionCooldownRef = useRef<number>(0);
  
  const [detectionState, setDetectionState] = useState<DetectionState>({
    gesture: HandGesture.NONE,
    action: GestureAction.NONE,
    label: "تحميل...",
    status: 'loading'
  });
  const [boundingBox, setBoundingBox] = useState<BoundingBox | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  const [isMirrored, setIsMirrored] = useState(() => {
    try {
      return localStorage.getItem('webcam_mirror') !== 'false';
    } catch(e) { return true; }
  });
  
  const [isMinimized, setIsMinimized] = useState(false);

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
      // Cleanup previous stream first
      if (videoRef.current && videoRef.current.srcObject) {
         (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
         videoRef.current.srcObject = null;
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user', frameRate: { ideal: 30 } } 
      });

      if (!isMountedRef.current || !isActive) {
        // Stopped before we finished starting
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => { if(isMountedRef.current) videoRef.current?.play().catch(console.error); };
      }
    } catch (err) {
      console.error("Camera Error:", err);
      if (isMountedRef.current) setCameraError("الكاميرا مغلقة");
    }
  }, [isActive]);

  useEffect(() => {
    if (isActive) startCamera();
    else if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
  }, [isActive, startCamera]);

  const toggleMirror = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMirrored(p => { 
      try {
        localStorage.setItem('webcam_mirror', String(!p));
      } catch(e) {}
      return !p; 
    });
  };

  const drawOverlay = useCallback(() => {
    if (!isMountedRef.current || !videoRef.current || !overlayCanvasRef.current) return;
    const video = videoRef.current;
    const canvas = overlayCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (canvas.width !== video.videoWidth) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (boundingBox && detectionState.status === 'success') {
      ctx.save();
      if (isMirrored) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
      const { ymin, xmin, ymax, xmax } = boundingBox;
      ctx.strokeStyle = '#10b981'; ctx.lineWidth = 4;
      ctx.strokeRect(xmin * canvas.width, ymin * canvas.height, (xmax-xmin) * canvas.width, (ymax-ymin) * canvas.height);
      ctx.restore();
    }
  }, [boundingBox, detectionState.status, isMirrored]);

  const detectionLoop = useCallback(async () => {
    if (!isMountedRef.current) return;
    requestRef.current = requestAnimationFrame(detectionLoop);
    drawOverlay();

    const now = Date.now();
    if (now - lastDetectionTimeRef.current < 150) return;
    lastDetectionTimeRef.current = now;

    if (!isActive || isPaused || cameraError || !videoRef.current) return;

    try {
       const result = await identifyGesture(videoRef.current);
       if (!isMountedRef.current) return;
       
       if (result.error === "LOADING") return setDetectionState(p => ({ ...p, status: 'loading', label: "..." }));
       if (result.error === "INIT_FAILED") return setDetectionState(p => ({ ...p, status: 'error', label: "Err" }));

       if (now < actionCooldownRef.current) return;

       if (result.gesture !== HandGesture.NONE) {
           // Look up action in mappings
           const mappedAction = gestureMappings[result.gesture] || GestureAction.NONE;
           const gestureName = result.gesture.replace('_', ' ');
           
           if (mappedAction !== GestureAction.NONE) {
             setDetectionState({ gesture: result.gesture, action: mappedAction, label: mappedAction, status: 'success' });
             if (result.boundingBox) setBoundingBox(result.boundingBox);
             
             // Trigger action if gesture changed or cooldown passed
             if (result.gesture !== lastGestureRef.current || now > actionCooldownRef.current) {
                 if (navigator.vibrate) navigator.vibrate(50);
                 onGestureDetected(mappedAction);
                 actionCooldownRef.current = now + 1000;
                 lastGestureRef.current = result.gesture;
             }
           } else {
             // Gesture detected but mapped to NONE
             setDetectionState(p => ({ ...p, label: gestureName, status: 'waiting' }));
             setBoundingBox(null);
           }
       } else {
           setDetectionState(p => ({ ...p, label: "جاهز", status: 'waiting' }));
           setBoundingBox(null);
           if (now - actionCooldownRef.current > 500) lastGestureRef.current = HandGesture.NONE;
       }
    } catch (err) { console.error(err); }
  }, [isActive, isPaused, cameraError, drawOverlay, onGestureDetected, gestureMappings]);

  useEffect(() => {
      if (isActive && !isPaused) requestRef.current = requestAnimationFrame(detectionLoop);
      return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [isActive, isPaused, detectionLoop]);

  if (cameraError) {
    return (
      <button onClick={startCamera} className="fixed bottom-4 left-4 z-50 bg-red-600 text-white p-2 rounded-full shadow-lg text-xs animate-pulse">
        !
      </button>
    );
  }

  return (
    <div 
      className={`fixed bottom-4 left-4 z-50 transition-all duration-300 ease-in-out ${isMinimized ? 'w-12 h-12' : 'w-28 sm:w-48'}`}
    >
      <div 
        className={`relative bg-black rounded-xl overflow-hidden shadow-2xl border border-slate-600 cursor-pointer group transition-all duration-300 ${isMinimized ? 'h-12 w-12 rounded-full border-2 border-indigo-500' : 'aspect-video'}`}
        onClick={() => setIsMinimized(!isMinimized)}
      >
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          style={{ transform: isMirrored ? 'scaleX(-1)' : 'none' }}
          className={`w-full h-full object-cover ${isMinimized ? 'opacity-50' : 'opacity-100'}`}
        />
        <canvas ref={overlayCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

        {isMinimized && (
           <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-white text-lg">📷</div>
        )}

        {!isMinimized && (
            <>
                {/* Mirror Toggle Button */}
                <button 
                  onClick={toggleMirror}
                  className="absolute top-1 right-1 p-1 bg-black/40 rounded-full text-white/80 hover:bg-black/80 transition z-10"
                  title="عكس الكاميرا"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>
                </button>

                {/* Minimize Button */}
                <button 
                  onClick={(e) => { e.stopPropagation(); setIsMinimized(true); }}
                  className="absolute top-1 left-1 p-1 bg-black/40 rounded-full text-white/80 hover:bg-black/80 transition z-10"
                  title="تصغير"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 12h-15" />
                  </svg>
                </button>

                {isPaused && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 pointer-events-none">
                     <span className="text-2xl">⏸️</span>
                  </div>
                )}
            </>
        )}
      </div>

      {!isMinimized && (
        <div className={`mt-1 text-center transition-all ${detectionState.status === 'success' ? 'scale-105' : 'scale-100'}`}>
           <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold text-white shadow-sm ${
             isPaused ? 'bg-amber-600' : 
             detectionState.status === 'success' ? 'bg-emerald-600' : 
             detectionState.status === 'error' ? 'bg-red-600' : 
             detectionState.status === 'loading' ? 'bg-indigo-600 animate-pulse' : 'bg-slate-700'
           }`}>
             {isPaused ? "متوقف" : detectionState.label}
           </span>
        </div>
      )}
    </div>
  );
};

export default WebcamHandler;