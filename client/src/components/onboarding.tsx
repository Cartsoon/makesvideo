import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import { 
  Play, Film, Newspaper, Sparkles, Rocket, Lock,
  ChevronRight, ChevronLeft, Layers, Tv, FileVideo,
  Eye, EyeOff, Loader2, FastForward
} from "lucide-react";

interface AuthUser {
  id: string;
  personalNumber: number;
  nickname: string | null;
  language: string;
  theme: string;
  subscriptionExpiresAt: string;
  createdAt: string;
}

interface OnboardingProps {
  onComplete: (user?: AuthUser) => void;
  requireAuth?: boolean;
}

const STORAGE_KEY = "idengine-onboarding-complete";
const SKIP_INTRO_KEY = "idengine-skip-intro";

export function useOnboarding() {
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const completed = localStorage.getItem(STORAGE_KEY);
    if (!completed) {
      setShowOnboarding(true);
    }
  }, []);

  const completeOnboarding = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setShowOnboarding(false);
  };

  return { showOnboarding, completeOnboarding };
}

const pages = [
  {
    icon: Play,
    title: "Добро пожаловать в Видеозавод!",
    description: "Приложение создано для упрощения и ускорения многих задач видеомонтажа и создания видео.",
    gradient: "from-rose-500/20 via-transparent to-amber-500/20",
    accentColor: "text-rose-400",
    glowColor: "shadow-rose-500/30",
  },
  {
    icon: Layers,
    title: "Раскадровка и таймлайн",
    description: "Вы можете сгенерировать раскадровку (таймлайн) основываясь на своей идее, или сгенерировать готовые варианты по разным трендовым новостям и источникам.",
    gradient: "from-blue-500/20 via-transparent to-cyan-500/20",
    accentColor: "text-blue-400",
    glowColor: "shadow-blue-500/30",
  },
  {
    icon: Newspaper,
    title: "Источники контента",
    description: "Добавляйте источники из списка, чтобы генерировать сценарии на основе популярных новостей, или добавляйте собственные источники которые будут отслеживаться.",
    gradient: "from-emerald-500/20 via-transparent to-teal-500/20",
    accentColor: "text-emerald-400",
    glowColor: "shadow-emerald-500/30",
  },
  {
    icon: FileVideo,
    title: "Полный пакет для видео",
    description: "Генерируйте сценарий, текст, закадровый голос и озвучку, раскадровку и подборку кадров со стоков, а также моментально выбирайте трендовые новости по нужным темам!",
    gradient: "from-violet-500/20 via-transparent to-purple-500/20",
    accentColor: "text-violet-400",
    glowColor: "shadow-violet-500/30",
  },
  {
    icon: Lock,
    title: "Введите пароль для доступа",
    description: "Для начала работы с приложением введите пароль доступа.",
    gradient: "from-amber-500/20 via-transparent to-orange-500/20",
    accentColor: "text-amber-400",
    glowColor: "shadow-amber-500/30",
    isAuthPage: true,
  },
];

export function Onboarding({ onComplete, requireAuth = true }: OnboardingProps) {
  const [currentPage, setCurrentPage] = useState(() => {
    const skipIntro = localStorage.getItem(SKIP_INTRO_KEY);
    return skipIntro === "true" ? pages.length - 1 : 0;
  });
  const [skipIntro, setSkipIntro] = useState(() => {
    return localStorage.getItem(SKIP_INTRO_KEY) === "true";
  });
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  const handleSkipIntroChange = (checked: boolean) => {
    setSkipIntro(checked);
    localStorage.setItem(SKIP_INTRO_KEY, checked ? "true" : "false");
  };

  const handleSkipToPassword = () => {
    setCurrentPage(pages.length - 1);
  };

  const handleNext = () => {
    if (currentPage < pages.length - 1) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePrev = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleLogin = async () => {
    if (!password.trim()) {
      setError(true);
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      return;
    }

    setIsLoading(true);
    setError(false);
    
    try {
      const response = await apiRequest("POST", "/api/auth/login", { password });
      const data = await response.json();
      sessionStorage.setItem("idengine-auth", "true");
      localStorage.setItem(STORAGE_KEY, "true");
      onComplete(data.user);
    } catch {
      setError(true);
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleLogin();
    }
  };

  const page = pages[currentPage];
  const IconComponent = page.icon;
  const isAuthPage = page.isAuthPage;
  const isLastContentPage = currentPage === pages.length - 2;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-background">
      <div className="absolute inset-0 bg-gradient-to-br from-neutral-900 via-background to-neutral-900" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", duration: 0.5 }}
        className={`relative z-10 w-full max-w-lg ${isShaking ? 'animate-shake' : ''}`}
      >
        <div className="relative overflow-hidden rounded-sm border border-white/10 bg-card/95 backdrop-blur-xl">
          <div className={`absolute inset-0 bg-gradient-to-br ${page.gradient} opacity-50`} />
          
          <div className="absolute top-0 left-0 right-0 h-1 bg-neutral-800">
            <motion.div
              className="h-full bg-gradient-to-r from-rose-500 to-amber-500"
              initial={{ width: 0 }}
              animate={{ width: `${((currentPage + 1) / pages.length) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>

          <div className="relative px-4 sm:px-8 pt-8 sm:pt-12 pb-6 sm:pb-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentPage}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col items-center text-center"
              >
                <div className="mb-6 sm:mb-8 relative">
                  <div className={`absolute inset-0 blur-2xl ${page.accentColor} opacity-30`} />
                  
                  <div className="relative flex items-center justify-center">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-24 sm:w-32 h-24 sm:h-32 border border-white/5 rotate-45" />
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-20 sm:w-24 h-20 sm:h-24 border border-white/10 rotate-12" />
                    </div>
                    
                    <motion.div
                      initial={{ scale: 0.8, rotate: -10 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", delay: 0.1 }}
                      className={`relative z-10 p-4 sm:p-6 ${page.glowColor} shadow-2xl`}
                    >
                      <IconComponent className={`h-10 w-10 sm:h-12 sm:w-12 ${page.accentColor}`} strokeWidth={1.5} />
                    </motion.div>
                  </div>

                  <div className="absolute -top-2 -left-2 w-2 h-2 bg-white/20" />
                  <div className="absolute -top-2 -right-2 w-2 h-2 bg-white/20" />
                  <div className="absolute -bottom-2 -left-2 w-2 h-2 bg-white/20" />
                  <div className="absolute -bottom-2 -right-2 w-2 h-2 bg-white/20" />
                </div>

                <div className="flex gap-1 mb-3 sm:mb-4">
                  <Film className="w-3 h-3 text-white/30" />
                  <Tv className="w-3 h-3 text-white/30" />
                  <Sparkles className="w-3 h-3 text-white/30" />
                </div>

                <h2 className="text-xl sm:text-2xl font-bold text-white mb-3 sm:mb-4 tracking-tight">
                  {page.title}
                </h2>

                <p className="text-sm sm:text-base text-white/70 leading-relaxed max-w-md mb-4 sm:mb-6">
                  {page.description}
                </p>

                {isAuthPage && (
                  <div className="w-full max-w-xs space-y-4">
                    <div className="relative group">
                      <div className="absolute -inset-0.5 bg-gradient-to-r from-rose-500/50 via-amber-500/50 to-rose-500/50 opacity-50 group-hover:opacity-75 transition-opacity animate-pulse" />
                      
                      <div className="absolute -top-1 -left-1 w-2 h-2 border-l border-t border-amber-400/60" />
                      <div className="absolute -top-1 -right-1 w-2 h-2 border-r border-t border-amber-400/60" />
                      <div className="absolute -bottom-1 -left-1 w-2 h-2 border-l border-b border-amber-400/60" />
                      <div className="absolute -bottom-1 -right-1 w-2 h-2 border-r border-b border-amber-400/60" />
                      
                      <div className="relative flex items-center bg-black/80 border border-white/20">
                        <div className="flex items-center justify-center w-10 h-10 border-r border-white/10">
                          <Lock className="h-4 w-4 text-amber-400" />
                        </div>
                        
                        <input
                          type={showPassword ? "text" : "password"}
                          placeholder="_ _ _ _ _ _ _ _"
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            setError(false);
                          }}
                          onKeyDown={handleKeyDown}
                          className={`flex-1 h-10 px-3 bg-transparent text-white placeholder:text-white/30 font-mono tracking-widest text-sm focus:outline-none ${
                            error ? 'text-red-400' : ''
                          }`}
                          data-testid="input-password"
                          autoComplete="current-password"
                        />
                        
                        <button
                          type="button"
                          className="flex items-center justify-center w-10 h-10 border-l border-white/10 text-white/40 hover:text-white transition-colors"
                          onClick={() => setShowPassword(!showPassword)}
                          data-testid="button-toggle-password"
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                      
                      <div className="absolute bottom-0 left-0 right-0 h-px">
                        <div className="h-full bg-gradient-to-r from-transparent via-amber-400/50 to-transparent animate-pulse" />
                      </div>
                    </div>
                    
                    {error && (
                      <div className="flex items-center gap-2 text-red-400 text-sm">
                        <div className="w-1 h-1 bg-red-400 animate-pulse" />
                        <span className="font-mono">ERROR: Неверный пароль</span>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            <div className="flex justify-center gap-2 mt-8 mb-4">
              {pages.map((_, index) => (
                <button
                  key={index}
                  onClick={() => !isAuthPage && setCurrentPage(index)}
                  disabled={index === pages.length - 1 && currentPage < pages.length - 1}
                  className={`h-1.5 transition-all duration-300 ${
                    index === currentPage
                      ? "w-8 bg-white"
                      : index < currentPage
                      ? "w-1.5 bg-white/50 cursor-pointer"
                      : "w-1.5 bg-white/20"
                  } ${index === pages.length - 1 && currentPage < pages.length - 1 ? 'cursor-not-allowed' : ''}`}
                  data-testid={`button-page-${index}`}
                />
              ))}
            </div>

            {!isAuthPage && (
              <div className="flex items-center justify-center gap-2 mb-4">
                <Checkbox 
                  id="skip-intro" 
                  checked={skipIntro}
                  onCheckedChange={handleSkipIntroChange}
                  className="border-white/30 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                  data-testid="checkbox-skip-intro"
                />
                <label 
                  htmlFor="skip-intro" 
                  className="text-xs text-white/50 cursor-pointer select-none"
                >
                  Пропускать приветствие
                </label>
                <button
                  onClick={handleSkipToPassword}
                  className="ml-2 flex items-center gap-1 text-xs text-amber-400/70 hover:text-amber-400 transition-colors"
                  data-testid="button-skip-to-password"
                >
                  <FastForward className="h-3 w-3" />
                  <span>К паролю</span>
                </button>
              </div>
            )}

            <div className="flex gap-3">
              {currentPage > 0 && (
                <Button
                  onClick={handlePrev}
                  variant="outline"
                  className="flex-1 h-12 bg-transparent border-white/20 text-white hover:bg-white/10 hover:text-white rounded-none"
                  data-testid="button-prev-onboarding"
                >
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Назад
                </Button>
              )}
              
              {isAuthPage ? (
                <Button
                  onClick={handleLogin}
                  disabled={isLoading}
                  className="flex-1 h-12 bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 text-white font-medium rounded-none border-0"
                  data-testid="button-login"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Начать работу
                      <Rocket className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  onClick={handleNext}
                  className={`flex-1 h-12 bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 text-white font-medium rounded-none border-0`}
                  data-testid="button-next-onboarding"
                >
                  Далее
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          </div>

          <div className="absolute top-0 left-0 w-4 h-px bg-white/30" />
          <div className="absolute top-0 left-0 w-px h-4 bg-white/30" />
          <div className="absolute top-0 right-0 w-4 h-px bg-white/30" />
          <div className="absolute top-0 right-0 w-px h-4 bg-white/30" />
          <div className="absolute bottom-0 left-0 w-4 h-px bg-white/30" />
          <div className="absolute bottom-0 left-0 w-px h-4 bg-white/30" />
          <div className="absolute bottom-0 right-0 w-4 h-px bg-white/30" />
          <div className="absolute bottom-0 right-0 w-px h-4 bg-white/30" />
        </div>
      </motion.div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
          20%, 40%, 60%, 80% { transform: translateX(5px); }
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
      `}</style>
    </div>
  );
}
