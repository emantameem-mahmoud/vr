import React, { useState, useEffect, useCallback, useRef } from 'react';
// @ts-ignore
import JSZip from 'jszip';
import WebcamHandler from './components/WebcamHandler';
import SlideView from './components/SlideView';
import { DEMO_SLIDES } from './constants';
import { GestureAction, HandGesture, Slide } from './types';

const DEFAULT_MAPPINGS: Record<HandGesture, GestureAction> = {
  [HandGesture.THUMB_UP]: GestureAction.NEXT,
  [HandGesture.THUMB_DOWN]: GestureAction.PREV,
  [HandGesture.OPEN_PALM]: GestureAction.PAUSE,
  [HandGesture.VICTORY]: GestureAction.VOL_UP,
  [HandGesture.CLOSED_FIST]: GestureAction.VOL_DOWN,
  [HandGesture.POINTING_UP]: GestureAction.ZOOM_IN,
  [HandGesture.I_LOVE_YOU]: GestureAction.ZOOM_OUT,
  [HandGesture.NONE]: GestureAction.NONE,
};

const ACTION_LABELS: Record<GestureAction, string> = {
  [GestureAction.NEXT]: 'الشريحة التالية',
  [GestureAction.PREV]: 'الشريحة السابقة',
  [GestureAction.PAUSE]: 'توقف مؤقت / استئناف',
  [GestureAction.VOL_UP]: 'رفع الصوت',
  [GestureAction.VOL_DOWN]: 'خفض الصوت',
  [GestureAction.CHANGE_THEME]: 'تغيير المظهر',
  [GestureAction.ZOOM_IN]: 'تكبير',
  [GestureAction.ZOOM_OUT]: 'تصغير',
  [GestureAction.SPACE]: 'مسافة (التالي)',
  [GestureAction.NONE]: 'لا شيء',
};

const GESTURE_LABELS: Record<HandGesture, string> = {
  [HandGesture.THUMB_UP]: '👍 إبهام للأعلى',
  [HandGesture.THUMB_DOWN]: '👎 إبهام للأسفل',
  [HandGesture.OPEN_PALM]: '✋ كف مفتوح',
  [HandGesture.VICTORY]: '✌️ علامة النصر',
  [HandGesture.CLOSED_FIST]: '✊ قبضة مغلقة',
  [HandGesture.POINTING_UP]: '☝️ إصبع للأعلى',
  [HandGesture.I_LOVE_YOU]: '🤟 أحبك (Rock)',
  [HandGesture.NONE]: 'لا شيء',
};

// Stylized W Icon for Share (Abstract W shape)
const ShareIconW = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
     <path d="M4.5 4l2.5 16 3.5-11 3.5 11 2.5-16H14l-1.5 11L9.5 7h-1L5.5 18 4 4h-2z" stroke="currentColor" strokeWidth="0.5" />
     <path d="M7 4h2l2 8 2-8h2l-3.5 14h-1L7 4z" fillOpacity="0.5"/>
  </svg>
);


const App: React.FC = () => {
  // --- State ---
  const [slides, setSlides] = useState<Slide[]>(DEMO_SLIDES);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [volume, setVolume] = useState(50);
  const [showVolume, setShowVolume] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFullScreenMode, setIsFullScreenMode] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isCursorHidden, setIsCursorHidden] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [showWelcomeMessage, setShowWelcomeMessage] = useState(false);
  
  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [gestureMappings, setGestureMappings] = useState<Record<HandGesture, GestureAction>>(() => {
    try {
      const saved = localStorage.getItem('gesture_mappings');
      return saved ? JSON.parse(saved) : DEFAULT_MAPPINGS;
    } catch (e) {
      return DEFAULT_MAPPINGS;
    }
  });

  // Initialize dark mode carefully
  const [isDarkMode, setIsDarkMode] = useState(() => {
    try {
      const saved = localStorage.getItem('theme');
      if (saved) return saved === 'dark';
    } catch(e) {}
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cursorTimeoutRef = useRef<number | null>(null);

  // --- Effects ---

  // Welcome Message Effect
  useEffect(() => {
    if (!showIntro) {
      setShowWelcomeMessage(true);
      const timer = setTimeout(() => setShowWelcomeMessage(false), 3000);
      return () => clearTimeout(timer);
    } else {
      setShowWelcomeMessage(false);
    }
  }, [showIntro]);

  // Apply Theme
  useEffect(() => {
    const root = document.documentElement;
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    const color = isDarkMode ? '#0f172a' : '#f8fafc';

    if (isDarkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    
    root.style.backgroundColor = color;
    if (metaThemeColor) metaThemeColor.setAttribute('content', color);
    try {
      localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    } catch(e) {}
  }, [isDarkMode]);

  // Fullscreen & Cursor
  useEffect(() => {
    const handleFullscreenChange = () => setIsFullScreenMode(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    const handleMouseMove = () => {
      setIsCursorHidden(false);
      if (cursorTimeoutRef.current) clearTimeout(cursorTimeoutRef.current);
      if (isFullScreenMode) {
        cursorTimeoutRef.current = window.setTimeout(() => setIsCursorHidden(true), 3000);
      }
    };
    document.addEventListener('mousemove', handleMouseMove);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      if (cursorTimeoutRef.current) clearTimeout(cursorTimeoutRef.current);
    };
  }, [isFullScreenMode]);

  useEffect(() => {
    setZoomLevel(1);
  }, [currentSlideIndex]);

  // PWA Install Prompt
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Save Mappings
  useEffect(() => {
    try {
      localStorage.setItem('gesture_mappings', JSON.stringify(gestureMappings));
    } catch(e) {}
  }, [gestureMappings]);

  // --- Actions ---

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleInstallClick = useCallback(async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if(outcome === 'accepted') setInstallPrompt(null);
  }, [installPrompt]);

  const toggleTheme = useCallback(() => setIsDarkMode(p => !p), []);

  const toggleFullScreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(console.error);
    } else {
      if (document.exitFullscreen) document.exitFullscreen().catch(console.error);
    }
  }, []);

  const handleGoHome = useCallback(() => {
    setIsCameraActive(false);
    setShowIntro(true);
    if (document.fullscreenElement) document.exitFullscreen().catch(console.error);
  }, []);

  const handleResetSlides = useCallback(() => {
    if (window.confirm("هل أنت متأكد من إعادة تعيين العرض التقديمي؟")) {
      setSlides(DEMO_SLIDES);
      setCurrentSlideIndex(0);
      showNotification("تم إعادة تعيين الشرائح");
    }
  }, []);

  const handleShare = useCallback(async () => {
    const shareData = {
      title: 'Smart Presenter',
      text: 'جرب مُقدم العروض الذكي الذي يعمل بإيماءات اليد!',
      url: window.location.href, // This links to the current Vercel URL
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.log('Share canceled');
      }
    } else {
      try {
        await navigator.clipboard.writeText(window.location.href);
        showNotification("تم نسخ الرابط");
      } catch (err) {
        showNotification("تعذر المشاركة");
      }
    }
  }, []);

  const nextSlide = useCallback(() => {
    setCurrentSlideIndex((prev) => Math.min(prev + 1, slides.length - 1));
  }, [slides.length]);

  const prevSlide = useCallback(() => {
    setCurrentSlideIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const handleVolume = useCallback((change: 'up' | 'down') => {
    setVolume(prev => {
      const step = 10;
      return change === 'up' ? Math.min(prev + step, 100) : Math.max(prev - step, 0);
    });
    setShowVolume(true);
    setTimeout(() => setShowVolume(false), 2000);
  }, []);

  const handleGesture = useCallback((action: GestureAction) => {
    if (action === GestureAction.PAUSE) {
      setIsPaused(prev => !prev);
      return;
    }
    if (isPaused) return;

    switch (action) {
      case GestureAction.NEXT: nextSlide(); break;
      case GestureAction.PREV: prevSlide(); break;
      case GestureAction.SPACE: nextSlide(); break; 
      case GestureAction.VOL_UP: handleVolume('up'); break;
      case GestureAction.VOL_DOWN: handleVolume('down'); break;
      case GestureAction.CHANGE_THEME: toggleTheme(); break;
      case GestureAction.ZOOM_IN: setZoomLevel(prev => (prev >= 2.5 ? 1 : prev + 0.5)); break;
      case GestureAction.ZOOM_OUT: setZoomLevel(prev => Math.max(1, prev - 0.5)); break;
    }
  }, [nextSlide, prevSlide, handleVolume, isPaused, toggleTheme]);

  // Keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') { toggleFullScreen(); return; }
      if (isPaused && e.key !== 'Escape') return;

      switch(e.key) {
        case 'ArrowRight': case 'ArrowDown': case ' ': case 'PageDown': nextSlide(); break;
        case 'ArrowLeft': case 'ArrowUp': case 'PageUp': prevSlide(); break;
        case 'Escape': if (isPaused) setIsPaused(false); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextSlide, prevSlide, isPaused, toggleFullScreen]);

  // File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsLoading(true);
    try {
      const file = files[0];
      const isPPT = file.name.toLowerCase().endsWith('.pptx');

      if (isPPT) {
        const zip = new JSZip();
        const content = await zip.loadAsync(file);
        
        // Find slides and sort them
        const slideFiles = Object.keys(content.files).filter(name => name.match(/ppt\/slides\/slide\d+\.xml/));
        slideFiles.sort((a: string, b: string) => {
          const numA = parseInt(a.match(/slide(\d+)\.xml/)?.[1] || "0");
          const numB = parseInt(b.match(/slide(\d+)\.xml/)?.[1] || "0");
          return numA - numB;
        });

        const newSlides: Slide[] = [];
        const parser = new DOMParser();

        // Process each slide
        for (const fileName of slideFiles) {
           const slideNumber = fileName.match(/slide(\d+)\.xml/)?.[1];
           const xmlText = await content.files[fileName].async("string");
           const xmlDoc = parser.parseFromString(xmlText, "text/xml");
           
           // --- Extract Images (All media in slide) ---
           const slideImages: string[] = [];
           try {
             // 1. Check relationships file for this slide to find image targets
             const relsFileName = `ppt/slides/_rels/slide${slideNumber}.xml.rels`;
             if (content.files[relsFileName]) {
               const relsText = await content.files[relsFileName].async("string");
               const relsDoc = parser.parseFromString(relsText, "text/xml");
               const relationships = relsDoc.getElementsByTagName("Relationship");
               
               // Collect all image references
               for (let i=0; i < relationships.length; i++) {
                  const type = relationships[i].getAttribute("Type");
                  // Check for standard image relationship types
                  if (type && (type.includes("image") || type.includes("picture"))) {
                    let target = relationships[i].getAttribute("Target");
                    if (target) {
                       // Normalize path to zip root
                       target = target.replace("../", "ppt/").replace("..\\", "ppt/");
                       if (!target.startsWith("ppt/")) target = "ppt/slides/" + target; // Relative to slide folder if not relative to root
                       target = target.replace("ppt/slides/ppt/media", "ppt/media"); // Fix common path issue
                       target = target.replace("//", "/");
                       
                       // Try to find exact file match in zip
                       let zipPath = target;
                       if (!content.files[zipPath] && target.includes('media/')) {
                           // Fallback: look for the file name in ppt/media/
                           const fileName = target.split('/').pop();
                           zipPath = `ppt/media/${fileName}`;
                       }

                       if (content.files[zipPath]) {
                         const imgBlob = await content.files[zipPath].async("blob");
                         slideImages.push(URL.createObjectURL(imgBlob));
                       }
                    }
                  }
               }
             }
           } catch (err) { console.warn("Image extraction error", err); }

           // --- Extract Text ---
           const texts: string[] = [];
           // Look for all text paragraphs, respecting order
           const paragraphs = xmlDoc.getElementsByTagName("a:p");
           
           for (let i = 0; i < paragraphs.length; i++) {
               const runs = paragraphs[i].getElementsByTagName("a:t");
               let paraText = "";
               for (let k = 0; k < runs.length; k++) {
                 paraText += runs[k].textContent || "";
               }
               if (paraText.trim()) texts.push(paraText.trim());
           }

           // Fallback if structure is weird
           if (texts.length === 0) {
             const allTextNodes = xmlDoc.getElementsByTagName("a:t");
             for(let i = 0; i < allTextNodes.length; i++) {
                const txt = allTextNodes[i].textContent;
                if (txt && txt.trim()) texts.push(txt.trim());
             }
           }

           // --- Construct Slide Object ---
           let title = texts.length > 0 ? texts[0] : "";
           // If first text is very long, it might not be a title.
           if (title.length > 100) title = ""; 

           let bodyContent = "";
           let bulletPoints: string[] = [];

           if (texts.length > 0) {
              if (title) {
                  // If we identified a title, remaining text is body
                  const remaining = texts.slice(1);
                  if (remaining.length > 0) bodyContent = remaining[0];
                  if (remaining.length > 1) bulletPoints = remaining.slice(1);
              } else {
                  // No clear title
                  bodyContent = texts[0];
                  bulletPoints = texts.slice(1);
              }
           }
           
           // Defaults
           if (!title) title = `شريحة ${newSlides.length + 1}`;
           
           // Determine main image vs additional images
           let mainImage = "https://picsum.photos/800/600?grayscale&blur=2"; // Default placeholder
           let isImageOnly = false;

           if (slideImages.length > 0) {
             // If we have images, use the first one as "Main" (background/hero)
             mainImage = slideImages[0];
             // If very little text but has images, treat as Image Slide
             if (texts.length === 0) isImageOnly = true;
           } else if (texts.length === 0) {
             // No text, no images? Just keep default
           }

           newSlides.push({
              id: newSlides.length + 1,
              title: title,
              content: bodyContent,
              imageUrl: mainImage,
              images: slideImages, // Store all detected images
              bulletPoints: bulletPoints,
              isImageOnly: isImageOnly
           });
        }

        if (newSlides.length > 0) {
          setSlides(newSlides);
          setCurrentSlideIndex(0);
          setShowIntro(false);
          setIsCameraActive(true);
          showNotification("تم استيراد العرض بنجاح");
        } else { showNotification("لم يتم العثور على محتوى قابل للعرض في الملف."); }
      } else {
        // Handle standard image files upload
        const fileArray = (Array.from(files) as File[]).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        const newSlides: Slide[] = fileArray.map((f, index) => ({
          id: index + 1,
          title: f.name.split('.')[0],
          content: "",
          imageUrl: URL.createObjectURL(f),
          images: [URL.createObjectURL(f)],
          bulletPoints: [],
          isImageOnly: true
        }));
        setSlides(newSlides);
        setCurrentSlideIndex(0);
        setShowIntro(false);
        setIsCameraActive(true);
      }
    } catch (error) {
      console.error("Parse error:", error);
      showNotification("حدث خطأ أثناء قراءة الملف. تأكد من أنه ملف PPTX صالح.");
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // --- Classes & View Logic ---
  
  // Show controls if NOT in fullscreen OR if cursor is moving (not hidden)
  const showControls = !isFullScreenMode || !isCursorHidden;
  const controlsClass = `transition-opacity duration-500 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`;

  // Footer strictly hidden in fullscreen and on very small landscape screens
  const footerClass = `transition-opacity duration-500 ${!isFullScreenMode ? 'opacity-100' : 'opacity-0 pointer-events-none'}`;
  const cursorClass = isCursorHidden ? 'cursor-hidden' : '';

  // --- View: Intro ---
  if (showIntro) {
    return (
      <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center p-4 bg-slate-900 text-white relative overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 to-slate-900 z-0"></div>
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 pointer-events-none z-0"></div>

        {/* Notification Toast */}
        {notification && (
            <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white px-6 py-3 rounded-xl shadow-2xl animate-pulse whitespace-nowrap">
                {notification}
            </div>
        )}

        <div className="absolute top-4 right-4 z-20 flex gap-3">
           {installPrompt && (
              <button onClick={handleInstallClick} className="px-3 py-1.5 bg-emerald-600 rounded-full text-sm font-bold shadow-lg flex items-center gap-2 animate-pulse">
                <span>📲</span> تثبيت التطبيق
              </button>
           )}
           
           <button onClick={handleShare} title="مشاركة التطبيق" className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition text-white">
              <ShareIconW />
           </button>

          <button onClick={toggleTheme} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition">
            {isDarkMode ? '🌙' : '☀️'}
          </button>
        </div>

        <div className="w-full max-w-4xl bg-white/5 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/10 p-6 sm:p-12 relative z-10 flex flex-col items-center text-center max-h-[90dvh] overflow-y-auto custom-scrollbar">
          <div className="mb-6">
            <h1 className="text-3xl sm:text-5xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
               مدرسة الشمال الابتدائية بنات
            </h1>
            <p className="text-slate-400 text-sm sm:text-lg">مُقدم العروض الذكي | Smart Presenter</p>
          </div>
          
          {/* Responsive Grid for Gestures */}
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 sm:gap-3 mb-8 w-full">
            {Object.entries(DEFAULT_MAPPINGS).filter(([k,v]) => k !== HandGesture.NONE).map(([gesture, action], idx) => (
              <div key={idx} className="bg-slate-800/50 p-2 rounded-lg flex flex-col items-center border border-white/5">
                <span className="text-2xl mb-1">{GESTURE_LABELS[gesture as HandGesture].split(' ')[0]}</span>
                <span className="text-[10px] text-slate-300 truncate w-full text-center">{ACTION_LABELS[action]}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
            <button 
              onClick={() => { setShowIntro(false); setIsCameraActive(true); }}
              className="px-8 py-4 bg-gradient-to-r from-primary to-indigo-600 hover:from-indigo-500 hover:to-primary rounded-xl font-bold shadow-lg shadow-primary/20 transition-transform active:scale-95 flex items-center justify-center gap-2"
            >
               🚀 بدء العرض
            </button>
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="px-8 py-4 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2"
            >
              {isLoading ? 'جاري المعالجة...' : '📂 رفع ملف (PPTX)'}
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".pptx,.ppt,image/*" multiple className="hidden" />
          </div>
        </div>
      </div>
    );
  }

  // --- View: App ---
  return (
    <div className={`relative w-full h-[100dvh] overflow-hidden bg-slate-50 dark:bg-slate-900 transition-colors duration-300 select-none ${cursorClass}`}>
      
      {/* Notification Toast (In App Mode) */}
      {notification && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] bg-slate-800 text-white px-6 py-2 rounded-full shadow-xl border border-slate-700 whitespace-nowrap">
            {notification}
        </div>
      )}

      {/* --- Welcome Message Overlay --- */}
      <div className={`fixed inset-0 pointer-events-none z-[70] flex items-center justify-center transition-all duration-700 ease-out ${showWelcomeMessage ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
        <div className="bg-black/60 backdrop-blur-md text-white px-12 py-8 rounded-3xl shadow-2xl flex flex-col items-center gap-4 border border-white/10">
           <span className="text-6xl animate-bounce">🚀</span>
           <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
             عرض موفق!
           </h2>
        </div>
      </div>

      {/* --- Top Bar --- */}
      <div className={`fixed top-0 left-0 w-full p-2 z-50 flex justify-between items-center pointer-events-none`}>
        <div className="flex gap-2 pointer-events-auto">
          <button 
            onClick={handleGoHome}
            title="خروج"
            className={`p-2 bg-white/80 dark:bg-slate-800/80 rounded-full shadow-sm backdrop-blur border border-slate-200 dark:border-slate-700 transition ${controlsClass}`}
          >
            <svg className="w-5 h-5 text-slate-700 dark:text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          
          <button 
            onClick={handleResetSlides}
            title="إعادة تعيين العرض"
            className={`p-2 bg-white/80 dark:bg-slate-800/80 rounded-full shadow-sm backdrop-blur border border-slate-200 dark:border-slate-700 transition ${controlsClass} hover:text-red-500`}
          >
            <svg className="w-5 h-5 text-slate-700 dark:text-slate-200 hover:text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>

          <button 
            onClick={() => setShowSettings(true)}
            title="إعدادات الإيماءات"
            className={`p-2 bg-white/80 dark:bg-slate-800/80 rounded-full shadow-sm backdrop-blur border border-slate-200 dark:border-slate-700 transition ${controlsClass}`}
          >
            <svg className="w-5 h-5 text-slate-700 dark:text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </button>

           <button 
             onClick={handleShare}
             title="مشاركة التطبيق"
             className={`p-2 bg-white/80 dark:bg-slate-800/80 rounded-full shadow-sm backdrop-blur border border-slate-200 dark:border-slate-700 transition ${controlsClass} text-slate-700 dark:text-slate-200`}
           >
              <ShareIconW />
           </button>
        </div>

        <h1 className={`hidden md:block text-[10px] sm:text-sm font-bold text-slate-500 dark:text-slate-400 bg-white/80 dark:bg-slate-800/80 px-4 py-1 rounded-full backdrop-blur border border-slate-200 dark:border-slate-700 transition ${controlsClass} max-w-[150px] sm:max-w-none truncate`}>
          مدرسة الشمال الابتدائية بنات
        </h1>

        <button 
          onClick={toggleFullScreen}
          className={`pointer-events-auto p-2 bg-white/80 dark:bg-slate-800/80 rounded-full shadow-sm backdrop-blur border border-slate-200 dark:border-slate-700 transition ${controlsClass}`}
        >
          {isFullScreenMode ? (
            <svg className="w-5 h-5 text-slate-700 dark:text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5M15 15l5.25 5.25" /></svg>
          ) : (
            <svg className="w-5 h-5 text-slate-700 dark:text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>
          )}
        </button>
      </div>

      {/* --- Main Content --- */}
      <div className="relative w-full h-full">
        {slides.map((slide, index) => (
          <SlideView 
            key={slide.id} 
            slide={slide} 
            offset={index - currentSlideIndex}
            isActive={index === currentSlideIndex}
            zoomLevel={index === currentSlideIndex ? zoomLevel : 1}
          />
        ))}
      </div>

      {/* --- New Footer (Mobile Optimized) --- */}
      <div className={`fixed bottom-0 left-0 w-full z-40 flex flex-col items-center justify-end pointer-events-none transition-all duration-300 ${!isFullScreenMode ? 'pb-24 sm:pb-6 opacity-100' : 'pb-0 opacity-0'}`}>
         {/* Hide on short landscape screens to save space. Make text smaller on mobile. */}
         <div className="hidden sm:block landscape:hidden landscape:sm:block bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-md px-4 py-2 sm:px-6 sm:py-3 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl text-center max-w-[90%] sm:max-w-[95%]">
           <h2 className="text-[10px] sm:text-xs md:text-base font-bold text-indigo-600 dark:text-indigo-400">الرؤية: متعلم ريادي تنمية مستدامة</h2>
           <p className="text-[8px] sm:text-[10px] md:text-sm font-semibold text-slate-700 dark:text-slate-300 mt-1">إعداد وتطوير/ إيمان محمود</p>
         </div>
      </div>

      {/* --- Overlays --- */}
      
      {/* Settings Modal */}
      {showSettings && (
         <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
             <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90dvh]">
                 <div className="p-4 border-b dark:border-slate-700 flex justify-between items-center bg-slate-100 dark:bg-slate-900">
                     <h2 className="text-xl font-bold dark:text-white">إعدادات الإيماءات</h2>
                     <button onClick={() => setShowSettings(false)} className="text-slate-500 hover:text-slate-800 dark:hover:text-white">✕</button>
                 </div>
                 <div className="p-4 overflow-y-auto custom-scrollbar flex-1">
                     <div className="space-y-4">
                         {Object.values(HandGesture).filter(g => g !== HandGesture.NONE).map(gesture => (
                             <div key={gesture} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/50">
                                 <div className="flex items-center gap-3">
                                     <span className="text-2xl w-10 text-center">{GESTURE_LABELS[gesture].split(' ')[0]}</span>
                                     <span className="font-medium dark:text-slate-200">{GESTURE_LABELS[gesture].substring(2)}</span>
                                 </div>
                                 <select 
                                     value={gestureMappings[gesture]}
                                     onChange={(e) => setGestureMappings(prev => ({...prev, [gesture]: e.target.value as GestureAction}))}
                                     className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm dark:text-white focus:ring-2 focus:ring-primary outline-none"
                                 >
                                     {Object.values(GestureAction).map(action => (
                                         <option key={action} value={action}>{ACTION_LABELS[action]}</option>
                                     ))}
                                 </select>
                             </div>
                         ))}
                     </div>
                 </div>
                 <div className="p-4 bg-slate-50 dark:bg-slate-900 flex justify-between">
                     <button 
                         onClick={() => setGestureMappings(DEFAULT_MAPPINGS)}
                         className="text-red-500 hover:text-red-700 text-sm font-medium px-3 py-2"
                     >
                         استعادة الافتراضي
                     </button>
                     <button 
                         onClick={() => setShowSettings(false)}
                         className="bg-primary hover:bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold shadow-lg transition"
                     >
                         حفظ وإغلاق
                     </button>
                 </div>
             </div>
         </div>
      )}

      {/* Volume */}
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none transition-all duration-300 ${showVolume ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}>
         <div className="bg-black/70 backdrop-blur-lg p-8 rounded-3xl flex flex-col items-center shadow-2xl">
           <span className="text-white text-5xl mb-4">🔊</span>
           <div className="w-48 h-2 bg-slate-600 rounded-full overflow-hidden">
             <div className="h-full bg-primary transition-all" style={{ width: `${volume}%` }}></div>
           </div>
         </div>
      </div>

      {/* Zoom Badge */}
      {zoomLevel !== 1 && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 bg-blue-600/90 text-white px-4 py-1 rounded-full shadow-lg animate-pulse pointer-events-none text-sm font-bold">
           🔍 {zoomLevel}x
        </div>
      )}

      {/* Pause Overlay */}
      {isPaused && (
        <div className="absolute inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-800 p-8 rounded-2xl text-center border border-slate-700 shadow-2xl max-w-sm w-full">
            <div className="text-6xl mb-4 animate-bounce">✋</div>
            <h2 className="text-2xl font-bold text-white mb-2">العرض متوقف</h2>
            <button onClick={() => setIsPaused(false)} className="mt-6 w-full py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition">
              استئناف
            </button>
          </div>
        </div>
      )}

      {/* Progress Bar (Enhanced) */}
      <div className="fixed top-0 left-0 w-full h-1.5 bg-slate-200/20 z-[60]">
        <div className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 shadow-[0_0_10px_rgba(99,102,241,0.5)] transition-all duration-500 ease-out" style={{ width: `${((currentSlideIndex + 1) / slides.length) * 100}%` }} />
      </div>

      {/* --- Bottom Controls (Mobile Adjusted) --- */}
      <div className={`fixed bottom-0 left-0 w-full p-4 flex justify-between items-end z-40 pointer-events-none ${controlsClass}`}>
          
          {/* Left Side: Prev Button - Responsive margin for webcam */}
          <div className="pointer-events-auto ml-16 sm:ml-36 transition-all duration-300">
             <button 
                onClick={prevSlide}
                disabled={currentSlideIndex === 0}
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-lg flex items-center justify-center border border-slate-200 dark:border-slate-700 active:scale-95 disabled:opacity-50 transition-all hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
             </button>
          </div>

          {/* Right Side: Next Button */}
          <div className="pointer-events-auto flex gap-4 items-end">
             {/* Slide Counter - Hidden on very small screens */}
             <div className="hidden sm:block bg-black/50 text-white px-3 py-1 rounded-lg backdrop-blur text-sm font-mono mb-3">
               {currentSlideIndex + 1} / {slides.length}
             </div>

             <button 
               onClick={nextSlide}
               disabled={currentSlideIndex === slides.length - 1}
               className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-primary text-white shadow-lg flex items-center justify-center active:scale-95 disabled:opacity-50 transition-all hover:bg-indigo-600"
             >
               <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
             </button>
          </div>
      </div>

      {/* Webcam (Bottom Left Fixed) */}
      <WebcamHandler 
        isActive={isCameraActive} 
        isPaused={isPaused}
        onGestureDetected={handleGesture}
        gestureMappings={gestureMappings}
      />
    </div>
  );
};

export default App;