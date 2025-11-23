import React, { useState, useEffect, useCallback, useRef } from 'react';
// @ts-ignore
import JSZip from 'jszip';
import WebcamHandler from './components/WebcamHandler';
import SlideView from './components/SlideView';
import { DEMO_SLIDES } from './constants';
import { GestureAction, Slide } from './types';

const App: React.FC = () => {
  // State
  const [slides, setSlides] = useState<Slide[]>(DEMO_SLIDES);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [volume, setVolume] = useState(50);
  const [showVolume, setShowVolume] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isFullScreenMode, setIsFullScreenMode] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isCursorHidden, setIsCursorHidden] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cursorTimeoutRef = useRef<number | null>(null);

  // --- Effects ---

  // PWA Install Prompt Listener
  useEffect(() => {
    const handler = (e: any) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setInstallPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  // Theme Sync
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      document.body.style.backgroundColor = '#0f172a';
    } else {
      document.documentElement.classList.remove('dark');
      document.body.style.backgroundColor = '#f8fafc';
    }
  }, [isDarkMode]);

  // Fullscreen Listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullScreenMode(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Cursor Auto-Hide in Fullscreen
  useEffect(() => {
    const handleMouseMove = () => {
      setIsCursorHidden(false);
      if (cursorTimeoutRef.current) clearTimeout(cursorTimeoutRef.current);
      
      if (isFullScreenMode) {
        cursorTimeoutRef.current = window.setTimeout(() => {
          setIsCursorHidden(true);
        }, 3000);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      if (cursorTimeoutRef.current) clearTimeout(cursorTimeoutRef.current);
    };
  }, [isFullScreenMode]);

  // Reset zoom on slide change
  useEffect(() => {
    setZoomLevel(1);
  }, [currentSlideIndex]);

  // --- Actions ---

  const handleInstallClick = useCallback(async () => {
    if (!installPrompt) return;
    
    // Show the install prompt
    installPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await installPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    
    // We've used the prompt, and can't use it again, throw it away
    setInstallPrompt(null);
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

  // Gesture Logic
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
      case GestureAction.ZOOM_IN: 
        setZoomLevel(prev => (prev >= 2.5 ? 1 : prev + 0.5));
        break;
      case GestureAction.ZOOM_OUT: 
        setZoomLevel(prev => Math.max(1, prev - 0.5));
        break;
    }
  }, [nextSlide, prevSlide, handleVolume, isPaused, toggleTheme]);

  // Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') {
        toggleFullScreen();
        return;
      }
      
      if (isPaused && e.key !== 'Escape') return;

      switch(e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case ' ': // Spacebar
        case 'PageDown':
          nextSlide();
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
          prevSlide();
          break;
        case 'Escape':
          if (isPaused) setIsPaused(false);
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextSlide, prevSlide, isPaused, toggleFullScreen]);

  // --- File Handling ---

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
        
        const slideFiles = Object.keys(content.files).filter(name => 
          name.match(/ppt\/slides\/slide\d+\.xml/)
        );
        
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
           
           // Text extraction
           const textNodes = xmlDoc.getElementsByTagName("a:t");
           const texts: string[] = [];
           for(let i = 0; i < textNodes.length; i++) {
              const txt = textNodes[i].textContent;
              if (txt && txt.trim()) texts.push(txt.trim());
           }

           // Image extraction
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
           } catch (err) {
             console.warn(`Skipping images for slide ${slideNumber}`, err);
           }

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
        } else {
          alert("لم يتم العثور على محتوى نصي أو صور في الملف.");
        }

      } else {
        // Image Mode
        const fileArray: File[] = Array.from(files);
        fileArray.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

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
      console.error("File parsing error:", error);
      alert("حدث خطأ أثناء معالجة الملف. الرجاء المحاولة مرة أخرى.");
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Styles
  const hiddenInFullscreen = `transition-opacity duration-500 ${isFullScreenMode ? 'opacity-0 pointer-events-none delay-300 hover:opacity-100 hover:delay-0' : 'opacity-100'}`;
  const cursorClass = isCursorHidden ? 'cursor-hidden' : '';

  // --- Render Intro ---
  
  if (showIntro) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br from-[#8D6E63] to-[#3E2723] text-white font-sans overflow-hidden relative">
        
        {/* Background Decoration */}
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 pointer-events-none"></div>

        <div className="absolute top-4 right-4 z-10 flex gap-2">
           {/* Install Button (Only if supported) */}
           {installPrompt && (
              <button 
                onClick={handleInstallClick}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-full font-bold shadow-lg transition-transform hover:scale-105 flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                تثبيت التطبيق
              </button>
           )}
          <button onClick={toggleTheme} className="p-2 bg-black/20 hover:bg-black/30 rounded-full backdrop-blur-sm transition-all transform hover:scale-110">
            {isDarkMode ? '☀️' : '🌙'}
          </button>
        </div>

        <div className="max-w-5xl w-full bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl p-8 md:p-10 border border-white/20 text-center relative z-10">
          <h1 className="text-5xl font-bold text-white mb-2 drop-shadow-lg">
            مدرسة الشمال الابتدائية بنات
          </h1>
          <div className="h-1 w-32 bg-primary mx-auto rounded-full mb-4"></div>
          <p className="text-xl text-slate-200 mb-8 tracking-wide font-light">مُقدم العروض الذكي | Smart Presenter</p>
          
          {/* Gesture Grid */}
          <div className="grid grid-cols-3 md:grid-cols-7 gap-3 mb-10 text-right justify-center">
            {[
              { i: '👍', l: 'التالي' },
              { i: '👎', l: 'السابق' },
              { i: '✋', l: 'توقف' },
              { i: '✌️', l: 'رفع الصوت', c: 'text-emerald-300' },
              { i: '✊', l: 'خفض الصوت', c: 'text-rose-300' },
              { i: '☝️', l: 'تكبير', c: 'text-blue-300' },
              { i: '🤟', l: 'تصغير', c: 'text-blue-300' },
            ].map((g, idx) => (
              <div key={idx} className="bg-black/30 p-3 rounded-xl flex flex-col items-center text-center gap-2 hover:bg-black/40 transition cursor-help group border border-white/5">
                <span className="text-3xl group-hover:scale-110 transition-transform">{g.i}</span>
                <p className={`text-xs font-bold ${g.c || 'text-slate-200'}`}>{g.l}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-stretch">
            <button 
              onClick={() => { setShowIntro(false); setIsCameraActive(true); }}
              disabled={isLoading}
              className="px-8 py-4 bg-primary hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-primary/30 transition-all duration-300 transform hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-2"
            >
               <span>📽️</span> بدء العرض التجريبي
            </button>

            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="px-8 py-4 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl shadow-lg transition-all duration-300 transform hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-2 border border-white/10"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <span>📂</span>
                  <span>رفع ملف (PPTX / صور)</span>
                </>
              )}
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              accept=".pptx,.ppt,image/*" 
              multiple 
              className="hidden" 
            />
          </div>
          <p className="mt-6 text-xs text-slate-300 opacity-60">يدعم التطبيق ملفات PowerPoint (.pptx) والصور. يعمل بدون انترنت.</p>
        </div>
      </div>
    );
  }

  // --- Render App ---

  return (
    <div className={`relative w-full h-screen overflow-hidden bg-slate-50 dark:bg-slate-900 transition-colors duration-300 select-none ${cursorClass}`}>
      
      {/* Top Controls */}
      <div className={`fixed top-4 left-0 w-full px-4 z-50 flex justify-between items-start pointer-events-none`}>
        
        {/* Home */}
        <button 
          onClick={handleGoHome}
          className={`pointer-events-auto p-2 bg-white/90 dark:bg-slate-800/90 rounded-full shadow-lg border border-slate-200 dark:border-slate-600 backdrop-blur hover:bg-slate-100 dark:hover:bg-slate-700 transition ${hiddenInFullscreen}`}
          title="خروج"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-slate-700 dark:text-slate-200">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <div className={`pointer-events-auto bg-white/90 dark:bg-slate-800/90 px-6 py-2 rounded-full border border-slate-200 dark:border-slate-700 backdrop-blur shadow-lg transition-opacity duration-500 ${isFullScreenMode ? 'opacity-0 hover:opacity-100' : 'opacity-100'}`}>
          <h1 className="text-sm font-bold text-slate-900 dark:text-white">مدرسة الشمال الابتدائية بنات</h1>
        </div>

        {/* Fullscreen */}
        <button 
          onClick={toggleFullScreen}
          className={`pointer-events-auto p-2 bg-white/90 dark:bg-slate-800/90 rounded-full shadow-lg border border-slate-200 dark:border-slate-600 backdrop-blur hover:bg-slate-100 dark:hover:bg-slate-700 transition ${hiddenInFullscreen}`}
          title="ملء الشاشة (F)"
        >
          {isFullScreenMode ? (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-slate-700 dark:text-slate-200">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5M15 15l5.25 5.25" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-slate-700 dark:text-slate-200">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
          )}
        </button>
      </div>

      {/* Footer Info */}
      <div className={`fixed bottom-4 left-0 w-full px-4 z-40 flex justify-between items-end pointer-events-none ${hiddenInFullscreen}`}>
         {/* Left: Counter handled by App layout below */}
         <div /> 

         {/* Center: Vision */}
         <div className="pointer-events-auto bg-white/90 dark:bg-slate-800/90 px-6 py-2 rounded-xl border border-slate-200 dark:border-slate-700 backdrop-blur shadow-lg text-center mb-8">
            <p className="text-sm font-bold text-primary dark:text-secondary">الرؤية: متعلم ريادي تنمية مستدامة</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">إعداد: إيمان محمود | مديرة المدرسة: مريم الحسيني</p>
         </div>

         {/* Right: Manual Nav */}
         <div className="pointer-events-auto flex flex-col gap-2 mb-12">
             <button onClick={toggleTheme} className="p-2 bg-white/90 dark:bg-slate-800/90 rounded-full shadow border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700">
               {isDarkMode ? '☀️' : '🌙'}
             </button>
         </div>
      </div>

      {/* Slides Area */}
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

      {/* Feedback Overlays */}
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none transition-all duration-300 ${showVolume ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}>
         <div className="bg-black/70 backdrop-blur-lg p-8 rounded-3xl flex flex-col items-center shadow-2xl border border-white/10">
           <span className="text-white text-5xl mb-4">🔊</span>
           <div className="w-48 h-2 bg-slate-600/50 rounded-full overflow-hidden">
             <div className="h-full bg-primary transition-all duration-200" style={{ width: `${volume}%` }}></div>
           </div>
           <span className="text-white mt-3 font-mono text-xl">{volume}%</span>
         </div>
      </div>

      {/* Zoom Indicator */}
      {zoomLevel !== 1 && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 bg-blue-600/90 text-white px-4 py-1 rounded-full backdrop-blur shadow-lg flex items-center gap-2 animate-pulse pointer-events-none">
           <span>🔍</span>
           <span className="font-bold text-sm">Zoom {zoomLevel}x</span>
        </div>
      )}

      {/* Pause Overlay */}
      {isPaused && (
        <div className="absolute inset-0 z-[60] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center animate-fadeIn">
          <div className="bg-slate-800 p-10 rounded-3xl shadow-2xl text-center border border-slate-700 max-w-md mx-4 transform transition-all">
            <div className="text-7xl mb-6 animate-bounce">✋</div>
            <h2 className="text-3xl font-bold text-white mb-3">العرض متوقف</h2>
            <p className="text-slate-400 mb-8">اضغط متابعة لاستئناف التحكم بالإيماءات</p>
            <button 
              onClick={() => setIsPaused(false)}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition shadow-lg text-lg"
            >
              متابعة العرض
            </button>
          </div>
        </div>
      )}

      {/* Progress Line */}
      <div className="fixed top-0 left-0 w-full h-1 bg-slate-200/20 z-50">
        <div 
          className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-500 ease-out"
          style={{ width: `${((currentSlideIndex + 1) / slides.length) * 100}%` }}
        />
      </div>

      {/* Manual Slide Nav (Bottom Right) */}
      <div className={`fixed bottom-8 right-6 z-50 flex gap-3 ${hiddenInFullscreen}`}>
          <button 
            onClick={nextSlide}
            disabled={currentSlideIndex === slides.length - 1}
            className="p-4 rounded-full bg-primary text-white shadow-lg hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
      </div>
      
      <div className={`fixed bottom-8 right-24 z-50 flex gap-3 ${hiddenInFullscreen}`}>
         <button 
            onClick={prevSlide}
            disabled={currentSlideIndex === 0}
            className="p-4 rounded-full bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-lg hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
      </div>

      {/* Slide Counter */}
      <div className={`fixed bottom-8 left-24 z-40 ${hiddenInFullscreen}`}>
        <div className="bg-black/50 text-white px-4 py-2 rounded-lg backdrop-blur-sm font-mono text-sm border border-white/10">
          {currentSlideIndex + 1} / {slides.length}
        </div>
      </div>

      {/* Webcam Widget */}
      <WebcamHandler 
        isActive={isCameraActive} 
        isPaused={isPaused}
        onGestureDetected={handleGesture} 
      />
    </div>
  );
};

export default App;