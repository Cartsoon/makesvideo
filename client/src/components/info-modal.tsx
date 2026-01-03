import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Info, ThumbsUp, ThumbsDown, Film, Clapperboard, Mail, Send } from "lucide-react";
import { useI18n } from "@/lib/i18n";

const RATING_STORAGE_KEY = "idengine-app-rating";
const STATS_STORAGE_KEY = "idengine-rating-stats";

interface RatingStats {
  likes: number;
  dislikes: number;
}

interface InfoModalProps {
  variant?: "default" | "icon";
  trigger?: React.ReactNode;
}

export function InfoModal({ variant = "default", trigger }: InfoModalProps) {
  const { t, language } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [userRating, setUserRating] = useState<"like" | "dislike" | null>(null);
  const [stats, setStats] = useState<RatingStats>({ likes: 847, dislikes: 12 });
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const savedRating = localStorage.getItem(RATING_STORAGE_KEY);
    if (savedRating) {
      setUserRating(savedRating as "like" | "dislike");
    }
    
    const savedStats = localStorage.getItem(STATS_STORAGE_KEY);
    if (savedStats) {
      setStats(JSON.parse(savedStats));
    }
  }, []);

  const handleRating = (rating: "like" | "dislike") => {
    setIsAnimating(true);
    
    let newStats = { ...stats };
    
    if (userRating === rating) {
      if (rating === "like") newStats.likes--;
      else newStats.dislikes--;
      setUserRating(null);
      localStorage.removeItem(RATING_STORAGE_KEY);
    } else {
      if (userRating === "like") newStats.likes--;
      if (userRating === "dislike") newStats.dislikes--;
      
      if (rating === "like") newStats.likes++;
      else newStats.dislikes++;
      
      setUserRating(rating);
      localStorage.setItem(RATING_STORAGE_KEY, rating);
    }
    
    setStats(newStats);
    localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(newStats));
    
    setTimeout(() => setIsAnimating(false), 300);
  };

  const totalVotes = stats.likes + stats.dislikes;
  const likePercentage = totalVotes > 0 ? Math.round((stats.likes / totalVotes) * 100) : 0;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger ? trigger : variant === "icon" ? (
          <Button 
            variant="ghost" 
            size="icon"
            data-testid="button-info-modal"
          >
            <Info className="h-4 w-4" />
          </Button>
        ) : (
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full justify-start gap-2 text-xs text-muted-foreground hover:text-foreground"
            data-testid="button-info-modal"
          >
            <Info className="h-3.5 w-3.5" />
            <span>{language === "ru" ? "Информация" : "Information"}</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md border-0 bg-transparent p-0 overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="relative">
          <div className="absolute inset-0 bg-neutral-900/95 backdrop-blur-xl" />
          
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent animate-pulse" />
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-rose-500/50 to-transparent animate-pulse" style={{ animationDelay: "0.5s" }} />
            <div className="absolute top-0 bottom-0 left-0 w-px bg-gradient-to-b from-transparent via-amber-500/50 to-transparent animate-pulse" style={{ animationDelay: "0.25s" }} />
            <div className="absolute top-0 bottom-0 right-0 w-px bg-gradient-to-b from-transparent via-blue-500/50 to-transparent animate-pulse" style={{ animationDelay: "0.75s" }} />
          </div>
          
          <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-cyan-400" />
          <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-rose-400" />
          <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-amber-400" />
          <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-blue-400" />
          
          <div className="relative p-4 sm:p-6">
            <DialogHeader className="mb-4 sm:mb-6">
              <div className="flex items-center justify-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <div className="relative">
                  <Clapperboard className="h-6 w-6 sm:h-8 sm:w-8 text-rose-400" />
                  <div className="absolute inset-0 blur-md bg-rose-400/30" style={{ zIndex: -1 }} />
                </div>
                <div className="relative">
                  <Film className="h-6 w-6 sm:h-8 sm:w-8 text-cyan-400" />
                  <div className="absolute inset-0 blur-md bg-cyan-400/30" style={{ zIndex: -1 }} />
                </div>
              </div>
              <DialogTitle className="text-center">
                <span className="relative inline-block">
                  <span className="text-3xl sm:text-4xl font-black text-white glitch-text tracking-tight" data-text="IDENGINE">
                    IDENGINE
                  </span>
                </span>
                <span className="block text-[10px] sm:text-xs text-neutral-400 uppercase tracking-[0.3em] mt-1 sm:mt-2">
                  VIDEO FACTORY
                </span>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 sm:space-y-6">
              <div className="relative p-3 sm:p-4 bg-neutral-800/50 border border-neutral-700/50">
                <div className="absolute top-0 left-0 w-1.5 h-1.5 border-t border-l border-neutral-500" />
                <div className="absolute top-0 right-0 w-1.5 h-1.5 border-t border-r border-neutral-500" />
                <div className="absolute bottom-0 left-0 w-1.5 h-1.5 border-b border-l border-neutral-500" />
                <div className="absolute bottom-0 right-0 w-1.5 h-1.5 border-b border-r border-neutral-500" />
                
                <p className="text-sm text-neutral-300 leading-relaxed text-center">
                  {language === "ru" 
                    ? <>Приложение разработал Иван (Cartsoon) и продакшен-команда <a href="https://cartsoon.ru" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 transition-colors underline underline-offset-2">Cartsoon Production</a>.</>
                    : <>Application developed by Ivan (Cartsoon) and the <a href="https://cartsoon.ru" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 transition-colors underline underline-offset-2">Cartsoon Production</a> team.</>}
                </p>
                
                <div className="flex items-center justify-center gap-2 mt-4 pt-4 border-t border-neutral-700/50">
                  <Send className="h-4 w-4 text-blue-400" />
                  <a 
                    href="https://t.me/idshortsfactory" 
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                    data-testid="link-telegram"
                  >
                    {language === "ru" ? "Следите за новостями в Telegram" : "Follow news on Telegram"}
                  </a>
                </div>
                
                <div className="flex items-center justify-center gap-2 mt-3">
                  <Mail className="h-4 w-4 text-amber-400" />
                  <a 
                    href="mailto:factory@cartsoon.ru" 
                    className="text-sm text-amber-400 hover:text-amber-300 transition-colors font-mono"
                    data-testid="link-contact-email"
                  >
                    factory@cartsoon.ru
                  </a>
                </div>
                
                <p className="text-[10px] text-neutral-500 text-center mt-3 uppercase tracking-wide">
                  {language === "ru" 
                    ? "Вопросы, предложения, жалобы"
                    : "Questions, suggestions, complaints"}
                </p>
              </div>

              <div className="space-y-3 sm:space-y-4">
                <h4 className="text-[10px] sm:text-xs font-semibold text-neutral-400 uppercase tracking-wider text-center flex items-center justify-center gap-2">
                  <div className="h-px w-6 sm:w-8 bg-gradient-to-r from-transparent to-neutral-600" />
                  {language === "ru" ? "Оцените приложение" : "Rate this app"}
                  <div className="h-px w-6 sm:w-8 bg-gradient-to-l from-transparent to-neutral-600" />
                </h4>
                
                <div className="flex items-center justify-center gap-4 sm:gap-6">
                  <button
                    onClick={() => handleRating("like")}
                    className={`group relative flex flex-col items-center gap-1.5 sm:gap-2 p-3 sm:p-4 transition-all duration-300 ${
                      userRating === "like" 
                        ? "scale-110" 
                        : "hover:scale-105"
                    }`}
                    data-testid="button-rate-like"
                  >
                    <div className={`relative p-2.5 sm:p-3 rounded-sm border-2 transition-all duration-300 ${
                      userRating === "like"
                        ? "border-emerald-400 bg-emerald-500/20"
                        : "border-neutral-600 bg-neutral-800/50 hover:border-emerald-400/50"
                    }`}>
                      <ThumbsUp className={`h-5 w-5 sm:h-6 sm:w-6 transition-all duration-300 ${
                        userRating === "like" 
                          ? "text-emerald-400" 
                          : "text-neutral-400 group-hover:text-emerald-400"
                      } ${isAnimating && userRating === "like" ? "animate-bounce" : ""}`} />
                      
                      {userRating === "like" && (
                        <div className="absolute inset-0 blur-lg bg-emerald-400/20" style={{ zIndex: -1 }} />
                      )}
                      
                      <div className="absolute -top-0.5 -left-0.5 w-1 h-1 border-t border-l border-emerald-400/50" />
                      <div className="absolute -top-0.5 -right-0.5 w-1 h-1 border-t border-r border-emerald-400/50" />
                      <div className="absolute -bottom-0.5 -left-0.5 w-1 h-1 border-b border-l border-emerald-400/50" />
                      <div className="absolute -bottom-0.5 -right-0.5 w-1 h-1 border-b border-r border-emerald-400/50" />
                    </div>
                    <span className={`text-base sm:text-lg font-bold font-mono transition-colors ${
                      userRating === "like" ? "text-emerald-400" : "text-neutral-400"
                    }`}>
                      {stats.likes}
                    </span>
                  </button>

                  <div className="h-12 sm:h-16 w-px bg-gradient-to-b from-transparent via-neutral-600 to-transparent" />

                  <button
                    onClick={() => handleRating("dislike")}
                    className={`group relative flex flex-col items-center gap-1.5 sm:gap-2 p-3 sm:p-4 transition-all duration-300 ${
                      userRating === "dislike" 
                        ? "scale-110" 
                        : "hover:scale-105"
                    }`}
                    data-testid="button-rate-dislike"
                  >
                    <div className={`relative p-2.5 sm:p-3 rounded-sm border-2 transition-all duration-300 ${
                      userRating === "dislike"
                        ? "border-rose-400 bg-rose-500/20"
                        : "border-neutral-600 bg-neutral-800/50 hover:border-rose-400/50"
                    }`}>
                      <ThumbsDown className={`h-5 w-5 sm:h-6 sm:w-6 transition-all duration-300 ${
                        userRating === "dislike" 
                          ? "text-rose-400" 
                          : "text-neutral-400 group-hover:text-rose-400"
                      } ${isAnimating && userRating === "dislike" ? "animate-bounce" : ""}`} />
                      
                      {userRating === "dislike" && (
                        <div className="absolute inset-0 blur-lg bg-rose-400/20" style={{ zIndex: -1 }} />
                      )}
                      
                      <div className="absolute -top-0.5 -left-0.5 w-1 h-1 border-t border-l border-rose-400/50" />
                      <div className="absolute -top-0.5 -right-0.5 w-1 h-1 border-t border-r border-rose-400/50" />
                      <div className="absolute -bottom-0.5 -left-0.5 w-1 h-1 border-b border-l border-rose-400/50" />
                      <div className="absolute -bottom-0.5 -right-0.5 w-1 h-1 border-b border-r border-rose-400/50" />
                    </div>
                    <span className={`text-base sm:text-lg font-bold font-mono transition-colors ${
                      userRating === "dislike" ? "text-rose-400" : "text-neutral-400"
                    }`}>
                      {stats.dislikes}
                    </span>
                  </button>
                </div>

                <div className="relative mt-3 sm:mt-4">
                  <div className="h-2 bg-neutral-800 overflow-hidden rounded-sm">
                    <div 
                      className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
                      style={{ width: `${likePercentage}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-2">
                    <span className="text-[10px] text-emerald-400 font-mono">{likePercentage}%</span>
                    <span className="text-[10px] text-neutral-500 font-mono">{totalVotes} {language === "ru" ? "голосов" : "votes"}</span>
                    <span className="text-[10px] text-rose-400 font-mono">{100 - likePercentage}%</span>
                  </div>
                </div>
              </div>

              <div className="text-center pt-3 sm:pt-4 border-t border-neutral-800">
                <p className="text-[9px] sm:text-[10px] text-neutral-600 font-mono uppercase tracking-wider">
                  v1.2.2 | 2025-2026
                </p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
