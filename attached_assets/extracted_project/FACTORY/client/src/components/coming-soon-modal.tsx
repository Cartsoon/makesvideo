import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Construction, Sparkles, Film, Mic, FileText, Users, ExternalLink, Heart, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface ComingSoonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FloatingHeart {
  id: number;
  x: number;
  y: number;
}

export function ComingSoonModal({ open, onOpenChange }: ComingSoonModalProps) {
  const { language } = useI18n();
  const [clickCount, setClickCount] = useState(0);
  const [floatingHearts, setFloatingHearts] = useState<FloatingHeart[]>([]);
  const [heartIdCounter, setHeartIdCounter] = useState(0);

  const resetHearts = useCallback(() => {
    setClickCount(0);
    setFloatingHearts([]);
  }, []);

  useEffect(() => {
    if (clickCount >= 4) {
      const timer = setTimeout(resetHearts, 3000);
      return () => clearTimeout(timer);
    }
  }, [clickCount, resetHearts]);

  useEffect(() => {
    if (!open) {
      resetHearts();
    }
  }, [open, resetHearts]);

  const handleHeartClick = () => {
    if (clickCount < 3) {
      const newHearts: FloatingHeart[] = [];
      const heartCount = 2 + Math.floor(Math.random() * 2);
      
      for (let i = 0; i < heartCount; i++) {
        newHearts.push({
          id: heartIdCounter + i,
          x: -20 + Math.random() * 40,
          y: -10 + Math.random() * 20,
        });
      }
      
      setHeartIdCounter(prev => prev + heartCount);
      setFloatingHearts(prev => [...prev, ...newHearts]);
      setClickCount(prev => prev + 1);

      setTimeout(() => {
        setFloatingHearts(prev => prev.filter(h => !newHearts.find(nh => nh.id === h.id)));
      }, 1000);
    } else if (clickCount === 3) {
      setClickCount(4);
      setFloatingHearts([]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-0 bg-transparent p-0 shadow-none">
        <div className="relative overflow-hidden bg-neutral-900/98 border border-blue-500/30 backdrop-blur-xl">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-cyan-500/10" />
          
          <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-blue-400" />
          <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-cyan-400" />
          <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-cyan-400" />
          <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-blue-400" />

          <div className="absolute -right-8 -top-8 opacity-[0.03]">
            <Film className="w-32 h-32" />
          </div>

          <DialogHeader className="relative p-5 pb-0">
            <div className="flex items-center gap-3">
              <div className="relative flex items-center justify-center w-12 h-12 rounded-sm bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30">
                <Construction className="h-6 w-6 text-amber-400" />
                <div className="absolute -top-1 -right-1 w-2.5 h-2.5 border-t border-r border-amber-400" />
                <div className="absolute -bottom-1 -left-1 w-2.5 h-2.5 border-b border-l border-amber-400" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-white uppercase tracking-wide">
                  {language === "ru" ? "Упс! Скоро будет" : "Oops! Coming Soon"}
                </DialogTitle>
                <p className="text-xs text-amber-400/80 mt-0.5">
                  {language === "ru" ? "Функция в разработке" : "Feature in development"}
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="relative p-5 space-y-4">
            <div className="space-y-3 text-sm text-neutral-300 leading-relaxed">
              <p>
                {language === "ru" 
                  ? "В данный момент мы усердно работаем над функцией создания ролика из вашего загруженного материала." 
                  : "We are currently working hard on the feature to create videos from your uploaded material."}
              </p>
              
              <div className="flex items-start gap-2 p-3 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20">
                <Users className="h-5 w-5 text-cyan-400 mt-0.5 shrink-0" />
                <p>
                  {language === "ru" ? (
                    <>
                      Пока мы можем предложить обратиться к{" "}
                      <a 
                        href="https://cartsoon.ru" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 inline-flex items-center gap-1"
                      >
                        нашим специалистам
                        <ExternalLink className="h-3 w-3" />
                      </a>
                      {" "} — мы быстро и качественно соберём ваш материал!
                    </>
                  ) : (
                    <>
                      Meanwhile, you can contact{" "}
                      <a 
                        href="https://cartsoon.ru" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 inline-flex items-center gap-1"
                      >
                        our specialists
                        <ExternalLink className="h-3 w-3" />
                      </a>
                      {" "} — we'll quickly and professionally edit your material!
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-neutral-800">
              <p className="text-xs text-neutral-400 mb-3">
                {language === "ru" 
                  ? "Сейчас приложение отлично подходит для:" 
                  : "Currently the app is great for:"}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2 p-2 bg-neutral-800/50 border border-neutral-700/50">
                  <FileText className="h-4 w-4 text-rose-400" />
                  <span className="text-xs text-neutral-300">
                    {language === "ru" ? "Генерация сценариев" : "Script generation"}
                  </span>
                </div>
                <div className="flex items-center gap-2 p-2 bg-neutral-800/50 border border-neutral-700/50">
                  <Film className="h-4 w-4 text-amber-400" />
                  <span className="text-xs text-neutral-300">
                    {language === "ru" ? "Раскадровка" : "Storyboards"}
                  </span>
                </div>
                <div className="flex items-center gap-2 p-2 bg-neutral-800/50 border border-neutral-700/50">
                  <Mic className="h-4 w-4 text-blue-400" />
                  <span className="text-xs text-neutral-300">
                    {language === "ru" ? "Закадровый голос" : "Voiceover"}
                  </span>
                </div>
                <div className="flex items-center gap-2 p-2 bg-neutral-800/50 border border-neutral-700/50">
                  <Sparkles className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs text-neutral-300">
                    {language === "ru" ? "Инфоповоды → Видео" : "News → Videos"}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3">
              <button
                onClick={handleHeartClick}
                className="relative flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-400 transition-colors cursor-pointer select-none"
                data-testid="button-thanks-heart"
              >
                <div className="relative">
                  {clickCount >= 4 ? (
                    <X className="h-3.5 w-3.5 text-neutral-500 animate-pulse" />
                  ) : (
                    <Heart 
                      className={`h-3.5 w-3.5 text-rose-400 transition-transform ${clickCount > 0 ? 'scale-110' : ''}`} 
                      fill={clickCount > 0 ? "currentColor" : "none"}
                    />
                  )}
                  
                  {floatingHearts.map((heart) => (
                    <Heart
                      key={heart.id}
                      className="absolute h-3 w-3 text-rose-400 pointer-events-none animate-float-heart"
                      fill="currentColor"
                      style={{
                        left: `${heart.x}px`,
                        top: `${heart.y}px`,
                      }}
                    />
                  ))}
                </div>
                <span>{language === "ru" ? "Спасибо за понимание" : "Thanks for understanding"}</span>
              </button>
              <Button 
                onClick={() => onOpenChange(false)}
                className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white border-0"
              >
                {language === "ru" ? "Понятно" : "Got it"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
