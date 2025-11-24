import React, { useState, useEffect, useCallback, useRef } from 'react';
// @ts-ignore
import JSZip from 'jszip';
import WebcamHandler from './components/WebcamHandler';
import SlideView from './components/SlideView';
import { DEMO_SLIDES } from './constants';
import { GestureAction, Slide } from './types';

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
  const [isPortrait, setIsPortrait] = useState(false);

  // Initialize dark mode carefully to avoid flash
  const [isDarkMode, setIsDarkMode] = useState(() => {
    try {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('theme');
        if (saved) return saved === 'dark';
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
    } catch (e) { console.error(e); }
    return true; // Default to dark
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cursorTimeoutRef = useRef<number | null>(null);

  // --- Effects ---

  // Check Orientation
  useEffect(() => {
    const checkOrientation = () => {
       setIsPortrait(window.innerHeight > window.innerWidth);
    };
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    return () => window.removeEventListener('resize', checkOrientation);
  }, []);

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
    metaThemeColor?.setAttribute('content', color);
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
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

  // --- Actions ---

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
      setIsPaused(true);
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
        
        // Find slides
        const slideFiles = Object.keys(content.files).filter(name => name.match(/ppt\/slides\/slide\d+\.xml/));
        slideFiles.sort((a: string, b: string) => {
          const numA = parseInt(a.match(/slide(\d+)\.xml/)?.[1] || "0");
          const numB = parseInt(b.match(/slide(\d+)\.xml/)?.[1] || "0");
          return numA - numB;
        });

        const newSlides: Slide[] = [];
        const parser = new DOMParser();

        for (const fileName of slideFiles) {
           const slideNumber = fileName.match(/slide(\d+)\.xml/)?.[1];
           const xmlText = await content.files[fileName].async("string");
           const xmlDoc = parser.parseFromString(xmlText, "text/xml");
           
           const textNodes = xmlDoc.getElementsByTagName("a:t");
           const texts: string[] = [];
           for(let i = 0; i < textNodes.length; i++) {
              const txt = textNodes[i].textContent;
              if (txt && txt.trim()) texts.push(txt.trim());
           }

           const slideImages: string[] = [];
           try {
             const relsFileName = `ppt/slides/_rels/slide${slideNumber}.xml.rels`;
             if (content.files[relsFileName]) {
               const relsText = await content.files[relsFileName].async("string");
               const relsDoc = parser.parseFromString(relsText, "text/xml");
               const relationships = relsDoc.getElementsByTagName("Relationship");
               
               for (let i=0; i < relationships.length; i++) {
                  const type = relationships[i].getAttribute("Type");
                  if (type && type.includes("image")) {
                    let target = relationships[i].getAttribute("Target");
                    if (target) {
                       target = target.replace("../", "ppt/");
                       if (content.files[target]) {
                         const imgBlob = await content.files[target].async("blob");
                         slideImages.push(URL.createObjectURL(imgBlob));
                       }
                    }
                  }
               }
             }
           } catch (err) { console.warn("Image extraction error", err); }

           // Build Slide
           let mainImage = "https://picsum.photos/800/600?grayscale&blur=2";
           let isImageOnly = false;
           if (slideImages.length > 0) mainImage = slideImages[0];
           if (texts.length < 2 && slideImages.length > 0) isImageOnly = true;

           if (texts.length > 0 || slideImages.length > 0) {
             newSlides.push({
                id: newSlides.length + 1,
                title: texts[0] || `شريحة ${newSlides.length + 1}`,
                content: texts.length > 1 ? texts.slice(1, 2).join(" ") : "",
                imageUrl: mainImage,
                images: slideImages,
                bulletPoints: texts.length > 2 ? texts.slice(2, 6) : [],
                isImageOnly: isImageOnly
             });
           }
        }
        if (newSlides.length > 0) {
          setSlides(newSlides);
          setCurrentSlideIndex(0);
          setShowIntro(false);
          setIsCameraActive(true);
        } else { alert("لم يتم العثور على محتوى في الملف."); }
      } else {
        // Image Mode
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
      alert("حدث خطأ في قراءة الملف.");
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // --- Classes ---
  const hiddenInFullscreen = `transition-opacity duration-500 ${isFullScreenMode ? 'opacity-0 pointer-events-none hover:opacity-100' : 'opacity-100'}`;
  const cursorClass = isCursorHidden ? 'cursor-hidden' : '';

  // --- View: Portrait Warning ---
  if (isPortrait) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="text-6xl mb-6 animate-pulse">📲</div>
        <h1 className="text-2xl font-bold mb-4">يرجى تدوير الجهاز</h1>
        <p className="text-slate-400">للحصول على أفضل تجربة عرض، يرجى تدوير هاتفك للوضع الأفقي.</p>
      </div>
    );
  }

  // --- View: Intro ---
  if (showIntro) {
    return (
      <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center p-4 bg-slate-900 text-white relative overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 to-slate-900 z-0"></div>
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 pointer-events-none z-0"></div>

        <div className="absolute top-4 right-4 z-20 flex gap-3">
           {installPrompt && (
              <button onClick={handleInstallClick} className="px-3 py-1.5 bg-emerald-600 rounded-full text-sm font-bold shadow-lg flex items-center gap-2 animate-pulse">
                <span>⬇️</span> تثبيت
              </button>
           )}
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
          
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-3 mb-8 w-full">
            {[
              { i: '👍', l: 'التالي' }, { i: '👎', l: 'السابق' }, { i: '✋', l: 'توقف' },
              { i: '✌️', l: 'صوت+' }, { i: '✊', l: 'صوت-' },
              { i: '☝️', l: 'تكبير' }, { i: '🤟', l: 'تصغير' },
            ].map((g, idx) => (
              <div key={idx} className="bg-slate-800/50 p-2 rounded-lg flex flex-col items-center border border-white/5">
                <span className="text-2xl mb-1">{g.i}</span>
                <span className="text-[10px] text-slate-300">{g.l}</span>
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
      
      {/* --- Top Bar --- */}
      <div className={`fixed top-0 left-0 w-full p-2 z-50 flex justify-between items-center pointer-events-none`}>
        <button 
          onClick={handleGoHome}
          className={`pointer-events-auto p-2 bg-white/80 dark:bg-slate-800/80 rounded-full shadow-sm backdrop-blur border border-slate-200 dark:border-slate-700 transition ${hiddenInFullscreen}`}
        >
          <svg className="w-5 h-5 text-slate-700 dark:text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>

        <h1 className={`text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400 bg-white/80 dark:bg-slate-800/80 px-4 py-1 rounded-full backdrop-blur border border-slate-200 dark:border-slate-700 transition ${hiddenInFullscreen}`}>
          مدرسة الشمال الابتدائية بنات
        </h1>

        <button 
          onClick={toggleFullScreen}
          className={`pointer-events-auto p-2 bg-white/80 dark:bg-slate-800/80 rounded-full shadow-sm backdrop-blur border border-slate-200 dark:border-slate-700 transition ${hiddenInFullscreen}`}
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
            isActive={index === currentSlideIndex}
            zoomLevel={index === currentSlideIndex ? zoomLevel : 1}
          />
        ))}
      </div>

      {/* --- Overlays --- */}
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

      {/* Progress Bar */}
      <div className="fixed top-0 left-0 w-full h-1 bg-slate-200/20 z-50">
        <div className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-500" style={{ width: `${((currentSlideIndex + 1) / slides.length) * 100}%` }} />
      </div>

      {/* --- Bottom Controls --- */}
      
      {/* Mobile-Optimized Nav Buttons (Left/Right Split) */}
      <div className={`fixed bottom-0 left-0 w-full p-4 flex justify-between items-end z-40 pointer-events-none ${hiddenInFullscreen}`}>
          
          {/* Left Side: Prev Button (positioned after Webcam space) */}
          <div className="pointer-events-auto ml-16 sm:ml-0">
             <button 
                onClick={prevSlide}
                disabled={currentSlideIndex === 0}
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-lg flex items-center justify-center border border-slate-200 dark:border-slate-700 active:scale-95 disabled:opacity-50 transition-all hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
             </button>
          </div>

          {/* Center Info (Hidden on mobile to save space) */}
          <div className="hidden sm:block pointer-events-auto bg-white/90 dark:bg-slate-800/90 px-4 py-2 rounded-xl backdrop-blur border border-slate-200 dark:border-slate-700 shadow-sm mb-2">
             <p className="text-sm font-bold text-primary dark:text-secondary">الرؤية: متعلم ريادي تنمية مستدامة</p>
          </div>

          {/* Right Side: Next Button */}
          <div className="pointer-events-auto flex gap-4 items-end">
             {/* Slide Counter */}
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
      />
    </div>
  );
};

export default App;