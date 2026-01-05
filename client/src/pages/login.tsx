import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { 
  Film, 
  Play, 
  Camera, 
  Clapperboard, 
  Video, 
  MonitorPlay, 
  Tv, 
  Eye, 
  EyeOff,
  LogIn,
  Loader2
} from "lucide-react";

export interface AuthUser {
  id: string;
  personalNumber: number;
  nickname: string | null;
  language: string;
  theme: string;
  subscriptionExpiresAt: string;
  createdAt: string;
}

interface LoginPageProps {
  onLogin: (user: AuthUser) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(false);
    
    try {
      const response = await apiRequest("POST", "/api/auth/login", { username, password });
      const data = await response.json();
      sessionStorage.setItem("idengine-auth", "true");
      onLogin(data.user);
    } catch {
      setError(true);
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
    } finally {
      setIsLoading(false);
    }
  };

  const iconClasses = "absolute text-primary/5 dark:text-primary/10";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden p-4">
      {/* Decorative background icons */}
      <Film className={`${iconClasses} w-24 h-24 md:w-32 md:h-32 top-[5%] left-[5%] rotate-12`} />
      <Play className={`${iconClasses} w-16 h-16 md:w-24 md:h-24 top-[15%] right-[10%] -rotate-6`} />
      <Camera className={`${iconClasses} w-20 h-20 md:w-28 md:h-28 top-[40%] left-[8%] rotate-[-15deg]`} />
      <Clapperboard className={`${iconClasses} w-28 h-28 md:w-36 md:h-36 bottom-[20%] right-[5%] rotate-[20deg]`} />
      <Video className={`${iconClasses} w-18 h-18 md:w-24 md:h-24 bottom-[10%] left-[15%] rotate-6`} />
      <MonitorPlay className={`${iconClasses} w-20 h-20 md:w-28 md:h-28 top-[60%] right-[15%] -rotate-12`} />
      <Tv className={`${iconClasses} w-16 h-16 md:w-20 md:h-20 top-[25%] left-[25%] rotate-3`} />
      <Film className={`${iconClasses} w-14 h-14 md:w-20 md:h-20 bottom-[30%] left-[40%] -rotate-8`} />
      <Play className={`${iconClasses} w-12 h-12 md:w-16 md:h-16 top-[70%] left-[60%] rotate-15`} />
      <Camera className={`${iconClasses} w-16 h-16 md:w-24 md:h-24 top-[8%] left-[50%] -rotate-20`} />
      <Clapperboard className={`${iconClasses} w-14 h-14 md:w-18 md:h-18 bottom-[5%] right-[30%] rotate-10`} />
      <Video className={`${iconClasses} w-20 h-20 md:w-28 md:h-28 top-[50%] right-[40%] -rotate-5`} />

      {/* Login Card */}
      <Card 
        className={`w-full max-w-md relative z-10 shadow-lg ${isShaking ? 'animate-shake' : ''}`}
        data-testid="card-login"
      >
        <CardContent className="pt-8 pb-8 px-6 md:px-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
              <Film className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-xl md:text-2xl font-bold mb-2" data-testid="text-welcome-title">
              Добро пожаловать на Фабрику видеороликов!
            </h1>
            <p className="text-muted-foreground text-sm md:text-base">
              Для доступа введите логин и пароль:
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                type="text"
                placeholder="Логин"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError(false);
                }}
                className={error ? 'border-destructive focus-visible:ring-destructive' : ''}
                data-testid="input-username"
                autoComplete="username"
              />
            </div>
            
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Пароль"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(false);
                }}
                className={`pr-10 ${error ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                data-testid="input-password"
                autoComplete="current-password"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowPassword(!showPassword)}
                data-testid="button-toggle-password"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
            
            {error && (
              <p className="text-destructive text-sm text-center" data-testid="text-error">
                Неверный логин или пароль. Попробуйте ещё раз.
              </p>
            )}

            <Button 
              type="submit" 
              className="w-full"
              disabled={isLoading || !username || !password}
              data-testid="button-login"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4 mr-2" />
              )}
              Войти
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Add shake animation */}
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
