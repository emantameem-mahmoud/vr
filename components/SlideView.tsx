import React from 'react';
import { Slide } from '../types';

interface SlideViewProps {
  slide: Slide;
  isActive: boolean;
  zoomLevel: number;
}

const SlideView: React.FC<SlideViewProps> = ({ slide, isActive, zoomLevel }) => {
  const isImageSlide = slide.isImageOnly;
  const hasMultipleImages = slide.images && slide.images.length > 1;

  return (
    <div className={`absolute inset-0 w-full h-[100dvh] transition-all duration-700 ease-in-out overflow-hidden ${isActive ? 'opacity-100 translate-x-0 pointer-events-auto' : 'opacity-0 translate-x-full pointer-events-none'}`}>
      
      {/* Container for zooming */}
      <div 
        className="w-full h-full transition-transform duration-500 ease-out origin-center bg-slate-50 dark:bg-slate-900"
        style={{ transform: `scale(${zoomLevel})` }}
      >
        {/* Background Image/Color */}
        <div className={`absolute inset-0 z-0 ${isImageSlide ? 'bg-black flex items-center justify-center' : ''}`}>
          {isImageSlide ? (
            <img 
              src={slide.imageUrl} 
              alt={slide.title} 
              className="max-w-full max-h-full object-contain"
            />
          ) : (
             <>
               <img 
                 src={slide.imageUrl} 
                 alt="" 
                 className="absolute inset-0 w-full h-full object-cover opacity-10 dark:opacity-20 transition-opacity duration-300"
               />
               <div className="absolute inset-0 bg-gradient-to-br from-slate-50/95 via-slate-50/90 to-slate-100/80 dark:from-slate-900/95 dark:via-slate-900/90 dark:to-slate-900/80 transition-colors duration-300"></div>
             </>
          )}
        </div>

        {/* Content (Only for standard text slides) */}
        {!isImageSlide && (
          <div className="relative z-10 w-full h-full overflow-y-auto custom-scrollbar">
            <div className="min-h-full flex flex-col items-center justify-center p-4 pt-20 pb-32 sm:p-12 sm:pt-24 sm:pb-24 text-center">
              
              <div className="max-w-4xl w-full">
                <h2 className="text-xs sm:text-sm md:text-lg font-semibold text-primary dark:text-secondary tracking-widest uppercase mb-2 sm:mb-4 opacity-80">
                   الشريحة {slide.id}
                </h2>
                
                <h1 className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-bold text-slate-900 dark:text-white mb-6 sm:mb-8 leading-tight drop-shadow-sm dark:drop-shadow-lg transition-colors duration-300">
                  {slide.title}
                </h1>

                {slide.content && (
                  <p className="text-lg sm:text-xl md:text-2xl text-slate-700 dark:text-slate-300 mb-8 sm:mb-10 leading-relaxed max-w-2xl mx-auto transition-colors duration-300">
                    {slide.content}
                  </p>
                )}

                {/* Bullet Points */}
                {slide.bulletPoints.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 w-full text-right sm:text-center">
                    {slide.bulletPoints.map((point, idx) => (
                      <div 
                        key={idx} 
                        className="bg-white/60 dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 p-4 rounded-xl backdrop-blur-sm hover:bg-white/80 dark:hover:bg-slate-700/80 transition duration-300 shadow-sm flex items-center sm:block gap-3"
                      >
                        <div className="w-2 h-2 sm:w-3 sm:h-3 bg-primary rounded-full shrink-0 sm:mx-auto sm:mb-3"></div>
                        <p className="text-sm sm:text-lg font-medium text-slate-800 dark:text-slate-100 leading-snug">{point}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Extra Extracted Images */}
                {hasMultipleImages && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-4 mt-8">
                    {slide.images?.slice(1).map((img, idx) => (
                      <div key={idx} className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm aspect-video bg-black/10">
                        <img src={img} alt={`Content ${idx}`} className="w-full h-full object-cover" />
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