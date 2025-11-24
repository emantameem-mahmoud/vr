import { GestureRecognizer, FilesetResolver } from "@mediapipe/tasks-vision";
import { HandGesture, DetectionResult } from "../types";

let gestureRecognizer: GestureRecognizer | null = null;
let isInitializing = false;
let initError = false;

// Initialize the MediaPipe Gesture Recognizer model
export const initializeModel = async () => {
  if (gestureRecognizer) return; // Already initialized
  if (isInitializing) return; // Currently loading
  
  isInitializing = true;

  // Suppress specific INFO logs from MediaPipe/TFLite that users might mistake for errors
  const originalLog = console.log;
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const originalError = console.error;
  
  const filterLog = (args: any[]) => {
      try {
        const msg = args.map(a => String(a)).join(' ');
        // Filter out the XNNPACK info message and other TFLite initialization logs
        if (msg.includes('XNNPACK') || msg.includes('TensorFlow Lite') || msg.includes('delegate for CPU')) return true;
      } catch (e) { return false; }
      return false;
  };

  console.log = (...args) => { if(!filterLog(args)) originalLog(...args); };
  console.info = (...args) => { if(!filterLog(args)) originalInfo(...args); };
  
  try {
    // Use jsdelivr for more stable WASM asset serving than esm.sh for binary files
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm"
    );

    gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
        delegate: "GPU"
      },
      runningMode: "VIDEO"
    });

    originalLog("MediaPipe Model Loaded successfully");
    initError = false;
  } catch (e) {
    originalError("Failed to load MediaPipe:", e);
    initError = true;
  } finally {
    // Restore console logs
    console.log = originalLog;
    console.info = originalInfo;
    console.warn = originalWarn;
    console.error = originalError;
    isInitializing = false;
  }
};

// Accept HTMLVideoElement instead of base64
export const identifyGesture = async (videoSource: HTMLVideoElement): Promise<DetectionResult> => {
    if (!gestureRecognizer) {
        if (!isInitializing && !initError) {
             initializeModel().catch(console.error);
        }
        return { gesture: HandGesture.NONE, confidence: 0, error: initError ? "INIT_FAILED" : "LOADING" };
    }

    // Ensure video is ready and has dimensions
    if (videoSource.readyState < 2 || videoSource.videoWidth === 0 || videoSource.videoHeight === 0) {
        return { gesture: HandGesture.NONE, confidence: 0 };
    }

    try {
        const results = gestureRecognizer.recognizeForVideo(videoSource, Date.now());
        
        if (results.gestures.length > 0 && results.gestures[0].length > 0) {
            const gestureObj = results.gestures[0][0];
            const name = gestureObj.categoryName;
            const score = gestureObj.score;

            // Map string name to Enum
            let gesture = HandGesture.NONE;
            switch(name) {
                case "Thumb_Up": gesture = HandGesture.THUMB_UP; break;
                case "Thumb_Down": gesture = HandGesture.THUMB_DOWN; break;
                case "Open_Palm": gesture = HandGesture.OPEN_PALM; break;
                case "Victory": gesture = HandGesture.VICTORY; break; 
                case "Closed_Fist": gesture = HandGesture.CLOSED_FIST; break;
                case "Pointing_Up": gesture = HandGesture.POINTING_UP; break;
                case "ILoveYou": gesture = HandGesture.I_LOVE_YOU; break; 
                default: gesture = HandGesture.NONE;
            }
            
            // Only return if confidence is high enough
            if (score < 0.5) return { gesture: HandGesture.NONE, confidence: score };

            // Bounding Box Calculation
            let boundingBox = undefined;
            if (results.landmarks && results.landmarks[0]) {
                 const xs = results.landmarks[0].map(l => l.x);
                 const ys = results.landmarks[0].map(l => l.y);
                 boundingBox = {
                     xmin: Math.min(...xs),
                     xmax: Math.max(...xs),
                     ymin: Math.min(...ys),
                     ymax: Math.max(...ys)
                 };
            }

            return { gesture, confidence: score, boundingBox };
        }
    } catch (err) {
        console.error("Detection Error (Recoverable):", err);
    }
    
    return { gesture: HandGesture.NONE, confidence: 0 };
};