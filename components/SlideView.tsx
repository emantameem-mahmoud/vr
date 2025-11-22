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
    <div className={`absolute inset-0 w-full h-full transition-all duration-700 ease-in-out overflow-hidden ${isActive ? 'opacity-100 translate-x-0 pointer-events-auto' : 'opacity-0 translate-x-full pointer-events-none'}`}>
      
      {/* Container for zooming */}
      <div 
        className="w-full h-full transition-transform duration-500 ease-out origin-center"
        style={{ transform: `scale(${zoomLevel})` }}
      >
        {/* Background Image */}
        <div className={`absolute inset-0 z-0 ${isImageSlide ? 'bg-black' : 'bg-slate-50 dark:bg-slate-900'}`}>
          <img 
            src={slide.imageUrl} 
            alt={slide.title} 
            className={`w-full h-full ${isImageSlide ? 'object-contain' : 'object-cover opacity-10 dark:opacity-20'}`}
          />
          {/* Gradient overlay for text slides - adapts to theme */}
          {!isImageSlide && (
            <div className="absolute inset-0 bg-gradient-to-t from-white/90 via-white/80 to-white/70 dark:from-slate-900 dark:via-slate-900/90 dark:to-slate-900/80 transition-colors duration-300"></div>
          )}
        </div>

        {/* Content (Only for standard text slides) */}
        {!isImageSlide && (
          <div className="relative z-10 flex flex-col items-center justify-center h-full p-8 md:p-16 text-center overflow-y-auto">
            <div className="max-w-4xl w-full">
              <h2 className="text-sm md:text-lg font-semibold text-primary dark:text-secondary tracking-widest uppercase mb-4 animate-pulse">
                 الشريحة {slide.id}
              </h2>
              
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-slate-900 dark:text-white mb-8 leading-tight drop-shadow-sm dark:drop-shadow-lg transition-colors duration-300">
                {slide.title}
              </h1>

              <p className="text-lg md:text-2xl text-slate-700 dark:text-slate-300 mb-8 leading-relaxed max-w-2xl mx-auto transition-colors duration-300">
                {slide.content}
              </p>

              {/* Bullet Points */}
              {slide.bulletPoints.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8 mb-8">
                  {slide.bulletPoints.map((point, idx) => (
                    <div 
                      key={idx} 
                      className="bg-white/60 dark:bg-white/5 border border-slate-200 dark:border-white/10 p-6 rounded-xl backdrop-blur-md hover:bg-white/80 dark:hover:bg-white/10 transition duration-300 shadow-sm dark:shadow-none"
                    >
                      <div className="w-2 h-2 bg-primary rounded-full mb-4 mx-auto"></div>
                      <p className="text-base font-medium text-slate-800 dark:text-slate-100 transition-colors duration-300">{point}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Extra Extracted Images */}
              {hasMultipleImages && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                  {slide.images?.slice(1).map((img, idx) => (
                    <div key={idx} className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm">
                      <img src={img} alt={`Slide content ${idx}`} className="w-full h-32 object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SlideView;