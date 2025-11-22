import { GoogleGenAI, Type } from "@google/genai";
import { GestureAction, DetectionResult } from "../types";

// NOTE: For production deployment, ensure process.env.API_KEY is set in your hosting environment (Vercel, Netlify, etc).
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Confidence threshold
const CONFIDENCE_THRESHOLD = 0.60;

export const identifyGesture = async (base64Image: string): Promise<DetectionResult> => {
  try {
    // Remove header if present (data:image/jpeg;base64,)
    const cleanBase64 = base64Image.split(',')[1] || base64Image;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: cleanBase64
            }
          },
          {
            text: `Analyze the image for a hand gesture controlling a presentation.
            
            Return JSON with 'action', 'confidence' and 'boundingBox'.
            
            GESTURE DEFINITIONS:
            - "NEXT": Thumb UP (👍).
            - "PREV": Thumb DOWN (👎).
            - "PAUSE": Open Palm facing camera (✋). Stop/Halt gesture.
            - "VOL_UP": "V" Sign / Peace Sign (✌️). Index and Middle fingers up.
            - "VOL_DOWN": Fist (✊). Hand closed tight.
            - "CHANGE_THEME": Index Finger pointing UP (☝️).
            - "ZOOM_IN": "OK" Sign / Pinch (👌). Index and Thumb tips touching.
            - "ZOOM_OUT": "Shaka" / "Phone" (🤙). Thumb and Pinky extended, middle 3 fingers curled.
            - "SPACE": Three Fingers UP (Index, Middle, Ring). Distinct from PAUSE (5 fingers) and V-Sign (2 fingers).
            
            - "NONE": No hand, blurry, neutral hand, or unclear gesture.
            
            OUTPUT RULES:
            1. If multiple gestures possible, choose the one with highest clarity.
            2. 'boundingBox' should cover the hand performing the gesture (ymin, xmin, ymax, xmax normalized 0-1).
            3. Be strict: "Space" must have 3 fingers, "Pause" must have 5.
            `
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            action: {
              type: Type.STRING,
              enum: [
                GestureAction.NEXT, 
                GestureAction.PREV, 
                GestureAction.PAUSE, 
                GestureAction.VOL_UP, 
                GestureAction.VOL_DOWN, 
                GestureAction.CHANGE_THEME, 
                GestureAction.ZOOM_IN,
                GestureAction.ZOOM_OUT,
                GestureAction.SPACE,
                GestureAction.NONE
              ],
            },
            confidence: {
              type: Type.NUMBER,
            },
            boundingBox: {
              type: Type.OBJECT,
              properties: {
                ymin: { type: Type.NUMBER },
                xmin: { type: Type.NUMBER },
                ymax: { type: Type.NUMBER },
                xmax: { type: Type.NUMBER }
              }
            }
          },
          required: ["action", "confidence"]
        }
      }
    });

    const text = response.text;
    if (!text) return { action: GestureAction.NONE, confidence: 0 };

    const json = JSON.parse(text);
    const action = json.action as GestureAction;
    const confidence = json.confidence || 0;
    const boundingBox = json.boundingBox;

    if (confidence < CONFIDENCE_THRESHOLD) {
      return { action: GestureAction.NONE, confidence };
    }

    return { action, confidence, boundingBox };

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    let errorMessage = "API Error";
    
    // Robust error checking for 429 / Quota
    if (
      error.message?.includes("429") || 
      error.status === 429 || 
      error.code === 429 ||
      (error.error && error.error.code === 429) ||
      error.message?.includes("quota") ||
      error.message?.includes("limit")
    ) {
      errorMessage = "QUOTA_EXCEEDED";
    }
    
    return { action: GestureAction.NONE, confidence: 0, error: errorMessage };
  }
};