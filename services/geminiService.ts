import { GestureRecognizer, FilesetResolver } from "@mediapipe/tasks-vision";
import { GestureAction, DetectionResult } from "../types";

let gestureRecognizer: GestureRecognizer | null = null;
let isInitializing = false;
let initError = false;

// Initialize the MediaPipe Gesture Recognizer model
export const initializeModel = async () => {
  if (isInitializing || gestureRecognizer || initError) return;
  isInitializing = true;

  // Suppress specific INFO logs from MediaPipe/TFLite that users might mistake for errors
  const originalLog = console.log;
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const originalError = console.error;
  const originalDebug = console.debug;
  
  const filterLog = (args: any[]) => {
      const msg = args.map(a => String(a)).join(' ');
      // Filter out the XNNPACK info message and other TFLite initialization logs
      if (msg.includes('XNNPACK') || msg.includes('TensorFlow Lite') || msg.includes('delegate for CPU')) return true;
      return false;
  };

  console.log = (...args) => { if(!filterLog(args)) originalLog(...args); };
  console.info = (...args) => { if(!filterLog(args)) originalInfo(...args); };
  console.warn = (...args) => { if(!filterLog(args)) originalWarn(...args); };
  console.error = (...args) => { if(!filterLog(args)) originalError(...args); };
  console.debug = (...args) => { if(!filterLog(args)) originalDebug(...args); };

  try {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
    );

    gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
        delegate: "GPU"
      },
      runningMode: "VIDEO"
    });

    // Use originalLog to ensure this specific success message is printed
    originalLog("MediaPipe Model Loaded successfully");
  } catch (e) {
    originalError("Failed to load MediaPipe", e);
    initError = true;
  } finally {
    // Restore console logs
    console.log = originalLog;
    console.info = originalInfo;
    console.warn = originalWarn;
    console.error = originalError;
    console.debug = originalDebug;
    isInitializing = false;
  }
};

// Accept HTMLVideoElement instead of base64
export const identifyGesture = async (videoSource: HTMLVideoElement): Promise<DetectionResult> => {
    if (!gestureRecognizer) {
        if (initError) return { action: GestureAction.NONE, confidence: 0, error: "INIT_FAILED" };
        
        await initializeModel();
        
        // If model is still loading or failed
        if (!gestureRecognizer) {
             return initError 
                ? { action: GestureAction.NONE, confidence: 0, error: "INIT_FAILED" }
                : { action: GestureAction.NONE, confidence: 0, error: "LOADING" };
        }
    }

    // Ensure video is ready
    if (videoSource.readyState < 2) return { action: GestureAction.NONE, confidence: 0 };

    try {
        const results = gestureRecognizer.recognizeForVideo(videoSource, Date.now());
        
        if (results.gestures.length > 0 && results.gestures[0].length > 0) {
            const gesture = results.gestures[0][0];
            const name = gesture.categoryName;
            const score = gesture.score;

            // Standard MediaPipe Gesture Mapping
            // Categories: None, Closed_Fist, Open_Palm, Pointing_Up, Thumb_Down, Thumb_Up, Victory, ILoveYou
            let action = GestureAction.NONE;
            switch(name) {
                case "Thumb_Up": action = GestureAction.NEXT; break;
                case "Thumb_Down": action = GestureAction.PREV; break;
                case "Open_Palm": action = GestureAction.PAUSE; break;
                case "Victory": action = GestureAction.VOL_UP; break; // V sign
                case "Closed_Fist": action = GestureAction.VOL_DOWN; break;
                case "Pointing_Up": action = GestureAction.ZOOM_IN; break;
                case "ILoveYou": action = GestureAction.ZOOM_OUT; break; // 🤟
                default: action = GestureAction.NONE;
            }
            
            // Only return if confidence is high enough (standard model is usually very confident)
            if (score < 0.5) return { action: GestureAction.NONE, confidence: score };

            // Bounding Box Calculation from Landmarks
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

            return { action, confidence: score, boundingBox };
        }
    } catch (err) {
        // Suppress benign runtime errors if needed, but usually we want to see real errors
        console.error("Detection Error:", err);
    }
    
    return { action: GestureAction.NONE, confidence: 0 };
};