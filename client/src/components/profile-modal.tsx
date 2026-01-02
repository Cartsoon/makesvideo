import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { User, Calendar, RotateCcw, LogOut, Check, X, Loader2, Copy, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { apiRequest } from "@/lib/queryClient";
import type { AuthUser } from "@/lib/auth-context";
import { AVATARS, getAvatarById } from "@/lib/avatars";
import { cn } from "@/lib/utils";

interface ProfileModalProps {
  user: AuthUser;
  onUserUpdate: (user: AuthUser) => void;
  onLogout: () => void;
  trigger?: React.ReactNode;
}

export function ProfileModal({ user, onUserUpdate, onLogout, trigger }: ProfileModalProps) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [avatarPopoverOpen, setAvatarPopoverOpen] = useState(false);
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [nicknameValue, setNicknameValue] = useState(user.nickname || "");

  const updateNicknameMutation = useMutation({
    mutationFn: async (data: { nickname?: string }) => {
      const response = await apiRequest("PATCH", "/api/auth/profile", data);
      return response.json();
    },
    onSuccess: (data) => {
      onUserUpdate(data.user);
      setIsEditingNickname(false);
      toast({
        title: t("profile.updated"),
        description: t("profile.updatedDesc"),
      });
    },
    onError: (error: Error) => {
      if (error.message.includes("401")) {
        sessionStorage.removeItem("idengine-auth");
        onLogout();
        toast({
          title: t("profile.sessionExpired"),
          description: t("profile.pleaseLogin"),
          variant: "destructive",
        });
      } else {
        toast({
          title: t("profile.updateError"),
          variant: "destructive",
        });
      }
    },
  });

  const updateAvatarMutation = useMutation({
    mutationFn: async (avatarId: number) => {
      const response = await apiRequest("PATCH", "/api/auth/profile", { avatarId });
      return response.json();
    },
    onSuccess: (data) => {
      onUserUpdate(data.user);
      setAvatarPopoverOpen(false);
    },
    onError: (error: Error) => {
      if (error.message.includes("401")) {
        sessionStorage.removeItem("idengine-auth");
        onLogout();
        toast({
          title: t("profile.sessionExpired"),
          description: t("profile.pleaseLogin"),
          variant: "destructive",
        });
      } else {
        toast({
          title: t("profile.updateError"),
          variant: "destructive",
        });
      }
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auth/reset");
      return response.json();
    },
    onSuccess: (data) => {
      onUserUpdate(data.user);
      setNicknameValue("");
      toast({
        title: t("profile.reset"),
        description: t("profile.resetDesc"),
      });
    },
    onError: (error: Error) => {
      if (error.message.includes("401")) {
        sessionStorage.removeItem("idengine-auth");
        onLogout();
        toast({
          title: t("profile.sessionExpired"),
          description: t("profile.pleaseLogin"),
          variant: "destructive",
        });
      } else {
        toast({
          title: t("profile.resetError"),
          variant: "destructive",
        });
      }
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      sessionStorage.removeItem("idengine-auth");
      onLogout();
    },
  });

  const handleSaveNickname = () => {
    updateNicknameMutation.mutate({ nickname: nicknameValue || undefined });
  };

  const handleCancelEdit = () => {
    setNicknameValue(user.nickname || "");
    setIsEditingNickname(false);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const isSubscriptionActive = new Date(user.subscriptionExpiresAt) > new Date();
  const daysLeft = Math.ceil(
    (new Date(user.subscriptionExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="sm" className="gap-2" data-testid="button-profile">
            <User className="h-4 w-4" />
            {t("profile.title")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <div className="absolute -top-px -left-px w-4 h-4 border-t-2 border-l-2 border-primary rounded-tl-sm" />
        <div className="absolute -top-px -right-px w-4 h-4 border-t-2 border-r-2 border-primary rounded-tr-sm" />
        <div className="absolute -bottom-px -left-px w-4 h-4 border-b-2 border-l-2 border-primary rounded-bl-sm" />
        <div className="absolute -bottom-px -right-px w-4 h-4 border-b-2 border-r-2 border-primary rounded-br-sm" />

        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{t("profile.title")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          <Popover open={avatarPopoverOpen} onOpenChange={setAvatarPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                className="relative group cursor-pointer"
                data-testid="button-change-avatar"
              >
                <Avatar className="h-24 w-24 border-2 border-primary/30 shadow-lg transition-all group-hover:border-primary/60">
                  {user.avatarId > 0 ? (
                    <AvatarImage src={getAvatarById(user.avatarId)} alt="Profile" className="object-cover" />
                  ) : null}
                  <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/5 text-primary text-4xl font-bold">
                    {user.nickname?.[0]?.toUpperCase() || <User className="h-10 w-10" />}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                  <ChevronDown className="h-6 w-6 text-white" />
                </div>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3" align="center">
              <div className="grid grid-cols-3 gap-2">
                {AVATARS.map((avatar) => (
                  <button
                    key={avatar.id}
                    onClick={() => updateAvatarMutation.mutate(avatar.id)}
                    className={cn(
                      "relative rounded-sm overflow-visible transition-all hover-elevate",
                      user.avatarId === avatar.id && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                    )}
                    data-testid={`button-avatar-${avatar.id}`}
                    disabled={updateAvatarMutation.isPending}
                  >
                    <Avatar className="h-14 w-14">
                      <AvatarImage src={avatar.src} alt={avatar.name} className="object-cover" />
                    </Avatar>
                    {user.avatarId === avatar.id && (
                      <div className="absolute -top-1 -right-1 h-4 w-4 bg-primary rounded-full flex items-center justify-center">
                        <Check className="h-2.5 w-2.5 text-primary-foreground" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <button
            onClick={() => {
              navigator.clipboard.writeText(String(user.personalNumber));
              toast({
                title: t("profile.numberCopied"),
                description: `#${user.personalNumber}`,
              });
            }}
            className="group flex items-center justify-center gap-1.5 px-4 py-2 bg-primary/10 hover-elevate active-elevate-2 rounded-sm cursor-pointer transition-colors"
            data-testid="button-copy-number"
          >
            <span className="font-mono font-black text-xl text-primary tracking-tight" data-testid="text-personal-number">
              {user.personalNumber}
            </span>
            <Copy className="h-3.5 w-3.5 text-primary/50 group-hover:text-primary transition-colors" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground uppercase tracking-wide">
              {t("profile.nickname")}
            </label>
            {isEditingNickname ? (
              <div className="flex items-center gap-2">
                <Input
                  value={nicknameValue}
                  onChange={(e) => setNicknameValue(e.target.value)}
                  placeholder={t("profile.nicknamePlaceholder")}
                  className="flex-1"
                  data-testid="input-nickname"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleSaveNickname}
                  disabled={updateNicknameMutation.isPending}
                  data-testid="button-save-nickname"
                >
                  {updateNicknameMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4 text-green-500" />
                  )}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleCancelEdit}
                  data-testid="button-cancel-nickname"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            ) : (
              <button
                onClick={() => setIsEditingNickname(true)}
                className="w-full text-left px-3 py-2 rounded-sm bg-muted/50 hover-elevate text-sm"
                data-testid="button-edit-nickname"
              >
                {user.nickname || (
                  <span className="text-muted-foreground italic">{t("profile.noNickname")}</span>
                )}
              </button>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground uppercase tracking-wide">
              {t("profile.subscription")}
            </label>
            <div className="flex items-center gap-3 px-3 py-2 rounded-sm bg-muted/50">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1">
                {isSubscriptionActive ? (
                  <div>
                    <span className="text-sm">{t("profile.activeUntil")}</span>
                    <span className="text-sm font-medium ml-1" data-testid="text-subscription-date">
                      {formatDate(user.subscriptionExpiresAt)}
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      ({daysLeft} {t("profile.daysLeft")})
                    </span>
                  </div>
                ) : (
                  <span className="text-sm text-destructive">{t("profile.expired")}</span>
                )}
              </div>
            </div>
          </div>

          <Separator />

          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
              className="justify-start gap-2"
              data-testid="button-reset-settings"
            >
              {resetMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              {t("profile.resetSettings")}
            </Button>

            <Button
              variant="destructive"
              size="sm"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              className="justify-start gap-2"
              data-testid="button-logout"
            >
              {logoutMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
              {t("profile.logout")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
