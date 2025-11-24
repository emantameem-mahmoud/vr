export enum GestureAction {
  NEXT = 'NEXT',
  PREV = 'PREV',
  PAUSE = 'PAUSE',
  VOL_UP = 'VOL_UP',
  VOL_DOWN = 'VOL_DOWN',
  CHANGE_THEME = 'CHANGE_THEME',
  ZOOM_IN = 'ZOOM_IN',
  ZOOM_OUT = 'ZOOM_OUT',
  SPACE = 'SPACE',
  NONE = 'NONE',
}

export enum HandGesture {
  THUMB_UP = 'Thumb_Up',
  THUMB_DOWN = 'Thumb_Down',
  OPEN_PALM = 'Open_Palm',
  VICTORY = 'Victory',
  CLOSED_FIST = 'Closed_Fist',
  POINTING_UP = 'Pointing_Up',
  I_LOVE_YOU = 'ILoveYou',
  NONE = 'None'
}

export interface Slide {
  id: number;
  title: string;
  content: string;
  imageUrl: string;
  images?: string[]; // Support for multiple images extracted from PPTX
  bulletPoints: string[];
  isImageOnly?: boolean;
}

export interface BoundingBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

export interface DetectionResult {
  gesture: HandGesture;
  confidence: number;
  boundingBox?: BoundingBox;
  error?: string;
}
