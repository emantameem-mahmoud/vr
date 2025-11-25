import React from 'react';
import { Slide } from '../types';

interface SlideViewProps {
  slide: Slide;
  isActive: boolean;
  offset: number;
  zoomLevel: number;
}

const SlideView: React.FC<SlideViewProps> = ({ slide, isActive, offset, zoomLevel }) => {
  const isImageSlide = slide.isImageOnly;
  const hasMultipleImages = slide.images && slide.images.length > 1;

  // Render only the active slide and its immediate neighbors for performance
  const isVisible = Math.abs(offset) <= 1;

  return (
    <div 
      className={`absolute inset-0 w-full h-[100dvh] overflow-hidden will-change-transform ${
        isActive ? 'pointer-events-auto z-20' : 'pointer-events-none z-10'
      } ${isVisible ? 'visible' : 'invisible'}`}
      style={{
        // Slide Effect Logic:
        // offset * 100% places slides side-by-side
        // scale drops slightly for inactive slides for a depth effect
        transform: `translate3d(${offset * 100}%, 0, 0) scale(${isActive ? 1 : 0.9})`,
        opacity: Math.abs(offset) <= 1 ? 1 : 0,
        transition: 'transform 0.6s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.6s ease-in-out',
      }}
    >
      
      {/* Container for zooming */}
      <div 
        className="w-full h-full transition-transform duration-300 ease-out origin-center bg-slate-50 dark:bg-slate-900"
        style={{ transform: `scale(${zoomLevel})` }}
      >
        {/* Background Layer */}
        {/* If it's a pure image slide with 1 image, show full screen. If text slide, show subtle background */}
        <div className={`absolute inset-0 z-0 ${isImageSlide && !hasMultipleImages ? 'bg-black flex items-center justify-center' : ''}`}>
          {isImageSlide && !hasMultipleImages ? (
            <img 
              src={slide.imageUrl} 
              alt={slide.title} 
              className="max-w-full max-h-full object-contain"
            />
          ) : (
             <>
               {/* Use the first image as a blurred background if present */}
               {slide.imageUrl && !slide.imageUrl.includes('picsum') && (
                  <img 
                    src={slide.imageUrl} 
                    alt="" 
                    className="absolute inset-0 w-full h-full object-cover opacity-10 dark:opacity-20 transition-opacity duration-300 blur-sm"
                  />
               )}
               <div className="absolute inset-0 bg-gradient-to-br from-slate-50/95 via-slate-50/90 to-slate-100/80 dark:from-slate-900/95 dark:via-slate-900/90 dark:to-slate-900/80 transition-colors duration-300"></div>
             </>
          )}
        </div>

        {/* Content Layer (Text + Multiple Images) */}
        {(!isImageSlide || hasMultipleImages) && (
          <div className="relative z-10 w-full h-full overflow-y-auto custom-scrollbar">
            {/* Adjusted padding for mobile responsiveness: increased bottom padding to clear controls, reduce top padding on mobile */}
            <div className="min-h-full flex flex-col items-center justify-center p-4 pt-16 pb-24 sm:p-12 sm:pt-24 sm:pb-36 text-center">
              
              <div className="max-w-6xl w-full">
                {/* Slide Header */}
                <h2 className="text-[10px] sm:text-xs md:text-sm font-semibold text-primary dark:text-secondary tracking-widest uppercase mb-1 sm:mb-4 opacity-80">
                   الشريحة {slide.id}
                </h2>
                
                {slide.title && (
                    <h1 className="text-lg sm:text-3xl md:text-5xl lg:text-7xl font-bold text-slate-900 dark:text-white mb-2 sm:mb-8 leading-tight drop-shadow-sm dark:drop-shadow-lg transition-colors duration-300">
                    {slide.title}
                    </h1>
                )}

                {/* Body Text */}
                {slide.content && (
                  <p className="text-xs sm:text-base md:text-2xl text-slate-700 dark:text-slate-300 mb-4 sm:mb-10 leading-relaxed max-w-3xl mx-auto transition-colors duration-300 whitespace-pre-wrap">
                    {slide.content}
                  </p>
                )}

                {/* Bullet Points */}
                {slide.bulletPoints.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-6 w-full text-right sm:text-center mb-6 sm:mb-10">
                    {slide.bulletPoints.map((point, idx) => (
                      <div 
                        key={idx} 
                        className="bg-white/60 dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 p-2 sm:p-4 rounded-xl backdrop-blur-sm hover:bg-white/80 dark:hover:bg-slate-700/80 transition duration-300 shadow-sm flex items-center sm:block gap-3"
                      >
                        <div className="w-2 h-2 sm:w-3 sm:h-3 bg-primary rounded-full shrink-0 sm:mx-auto sm:mb-3"></div>
                        <p className="text-xs sm:text-sm md:text-lg font-medium text-slate-800 dark:text-slate-100 leading-snug">{point}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Images Grid (Render all images found in the slide) */}
                {slide.images && slide.images.length > 0 && (
                  <div className={`grid gap-4 mt-4 sm:mt-8 w-full ${
                      slide.images.length === 1 ? 'grid-cols-1 max-w-3xl mx-auto' : 
                      slide.images.length === 2 ? 'grid-cols-1 sm:grid-cols-2' :
                      'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                  }`}>
                    {slide.images.map((img, idx) => (
                      <div key={idx} className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-lg bg-black/10 transition hover:scale-[1.02] duration-300">
                        <img 
                            src={img} 
                            alt={`Content ${idx}`} 
                            className="w-full h-auto object-contain max-h-[250px] sm:max-h-[500px]" 
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SlideView;