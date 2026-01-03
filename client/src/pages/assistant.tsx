import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { 
  Send, 
  Trash2, 
  Bot, 
  User, 
  Loader2, 
  MoreVertical,
  Sparkles,
  Download,
  MessageSquare,
  Clapperboard,
  Volume2,
  VolumeX,
  ChevronLeft,
  ChevronRight,
  StickyNote,
  Save,
  FileText,
  FolderDown,
  FileVideo,
  FileType,
  FileCheck,
  Film,
  Scissors,
  X,
  Play,
  Square,
  Layers,
  ChevronUp
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { AssistantChat } from "@shared/schema";
import { format } from "date-fns";
import { ru, enUS } from "date-fns/locale";
import { playSendSound, playReceiveSound } from "@/hooks/use-sound";
import { Layout } from "@/components/layout";

interface OptimisticMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  isOptimistic?: boolean;
}

interface PaginatedResponse {
  messages: AssistantChat[];
  total: number;
  totalPages: number;
}

export default function AssistantPage() {
  const { language } = useI18n();
  const [input, setInput] = useState("");
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [optimisticMessages, setOptimisticMessages] = useState<OptimisticMessage[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [notes, setNotes] = useState("");
  const [notesSaved, setNotesSaved] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem("assistant-sound-enabled");
    return saved !== "false";
  });
  const [mobileNotesOpen, setMobileNotesOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [mobileDrawerTab, setMobileDrawerTab] = useState<"notes" | "files">("notes");
  const [showWelcome, setShowWelcome] = useState(() => {
    return !localStorage.getItem("assistant-welcome-seen");
  });
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const notesTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (notesTimeoutRef.current) {
        clearTimeout(notesTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("assistant-sound-enabled", String(soundEnabled));
  }, [soundEnabled]);

  const { data: paginatedData, isLoading } = useQuery<PaginatedResponse>({
    queryKey: ["/api/assistant/chat/page", currentPage],
    queryFn: async () => {
      const res = await fetch(`/api/assistant/chat/page/${currentPage}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: notesData } = useQuery<{ content: string }>({
    queryKey: ["/api/assistant/notes"],
  });

  useEffect(() => {
    if (notesData?.content !== undefined && notes === "") {
      setNotes(notesData.content);
    }
  }, [notesData]);

  const saveNotesMutation = useMutation({
    mutationFn: (content: string) => apiRequest("POST", "/api/assistant/notes", { content }),
    onSuccess: () => {
      setNotesSaved(true);
      queryClient.invalidateQueries({ queryKey: ["/api/assistant/notes"] });
    },
  });

  const handleNotesChange = (value: string) => {
    setNotes(value);
    setNotesSaved(false);
    
    if (notesTimeoutRef.current) {
      clearTimeout(notesTimeoutRef.current);
    }
    notesTimeoutRef.current = setTimeout(() => {
      saveNotesMutation.mutate(value);
    }, 1500);
  };

  const messages = paginatedData?.messages || [];
  const totalPages = paginatedData?.totalPages || 1;
  const totalMessages = paginatedData?.total || 0;

  const clearMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/assistant/chat"),
    onSuccess: () => {
      setOptimisticMessages([]);
      setCurrentPage(1);
      queryClient.invalidateQueries({ queryKey: ["/api/assistant/chat/page", 1] });
    },
  });

  const scrollToBottom = useCallback(() => {
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        requestAnimationFrame(() => {
          viewport.scrollTop = viewport.scrollHeight;
        });
      }
    }
  }, []);

  useEffect(() => {
    if (currentPage === 1) {
      scrollToBottom();
    }
  }, [messages, streamingContent, optimisticMessages, scrollToBottom, currentPage]);

  useEffect(() => {
    if (messages.length > 0 && optimisticMessages.length > 0) {
      setOptimisticMessages(prev => 
        prev.filter(om => !messages.some(m => 
          m.content === om.content && m.role === om.role
        ))
      );
    }
  }, [messages]);

  const allMessages = currentPage === 1 ? [...messages, ...optimisticMessages] : messages;

  const sendMessage = async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage = input.trim();
    const tempId = `temp-user-${Date.now()}`;
    
    if (currentPage !== 1) {
      setCurrentPage(1);
    }
    
    if (soundEnabled) {
      playSendSound();
    }
    
    setOptimisticMessages(prev => [...prev, {
      id: tempId,
      role: "user",
      content: userMessage,
      createdAt: new Date().toISOString(),
      isOptimistic: true,
    }]);
    
    setInput("");
    setIsStreaming(true);
    setStreamingContent("");

    try {
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: userMessage }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to send message");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                accumulated += data.content;
                setStreamingContent(accumulated);
              }
              if (data.done) {
                if (soundEnabled) {
                  playReceiveSound();
                }
                const assistantTempId = `temp-assistant-${Date.now()}`;
                setOptimisticMessages(prev => [...prev, {
                  id: assistantTempId,
                  role: "assistant",
                  content: accumulated,
                  createdAt: new Date().toISOString(),
                  isOptimistic: true,
                }]);
                setStreamingContent("");
                setIsStreaming(false);
                queryClient.invalidateQueries({ queryKey: ["/api/assistant/chat/page", 1] });
              }
            } catch {}
          }
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setOptimisticMessages(prev => prev.filter(m => m.id !== tempId));
      setIsStreaming(false);
      setStreamingContent("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatContent = (content: string) => {
    return content.split("\n").map((line, i) => {
      if (line.startsWith("**") && line.endsWith("**")) {
        return <p key={i} className="font-semibold mt-3 mb-1 text-foreground">{line.slice(2, -2)}</p>;
      }
      if (line.startsWith("- ")) {
        return <li key={i} className="ml-4 list-disc text-foreground/90">{line.slice(2)}</li>;
      }
      if (line.match(/^\d+\.\s/)) {
        return <li key={i} className="ml-4 list-decimal text-foreground/90">{line.replace(/^\d+\.\s/, "")}</li>;
      }
      if (line.trim() === "") {
        return <div key={i} className="h-2" />;
      }
      return <p key={i} className="mb-1 text-foreground/90 leading-relaxed">{line}</p>;
    });
  };

  const formatTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return format(date, "HH:mm", { locale: language === "ru" ? ru : enUS });
    } catch {
      return "";
    }
  };

  const exportChat = async () => {
    const allExportMessages: AssistantChat[] = [];
    let page = 1;
    let hasMore = true;
    
    while (hasMore) {
      const res = await fetch(`/api/assistant/chat/page/${page}`, { credentials: "include" });
      const data = await res.json();
      allExportMessages.push(...data.messages);
      hasMore = page < data.totalPages;
      page++;
    }
    
    allExportMessages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    
    const content = allExportMessages.map((m: AssistantChat) => 
      `[${formatTime(m.createdAt)}] ${m.role === "user" ? "Вы" : "AI"}: ${m.content}`
    ).join("\n\n");
    
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-export-${format(new Date(), "yyyy-MM-dd-HHmm")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const quickPrompts = language === "ru" ? [
    "Как сделать крутой хук для видео?",
    "Расскажи про правило третей",
    "Лучшие переходы для Shorts",
  ] : [
    "How to make a great video hook?",
    "Tell me about the rule of thirds",
    "Best transitions for Shorts",
  ];

  const closeWelcome = () => {
    localStorage.setItem("assistant-welcome-seen", "true");
    setShowWelcome(false);
  };

  return (
    <Layout title="VIDEO AI">
      {/* Welcome Modal */}
      <Dialog open={showWelcome} onOpenChange={(open) => !open && closeWelcome()}>
        <DialogContent className="max-w-sm p-0 gap-0 overflow-hidden border-0">
          <div className="relative p-6 overflow-hidden">
            {/* Stylish grid background */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-amber-500/10 to-orange-500/15" />
            <div className="absolute inset-0 opacity-10" style={{
              backgroundImage: `
                linear-gradient(90deg, currentColor 1px, transparent 1px),
                linear-gradient(currentColor 1px, transparent 1px)
              `,
              backgroundSize: '20px 20px'
            }} />
            {/* Corner markers */}
            <div className="absolute top-2 left-2 w-4 h-4 border-l-2 border-t-2 border-primary/40" />
            <div className="absolute top-2 right-2 w-4 h-4 border-r-2 border-t-2 border-primary/40" />
            <div className="absolute bottom-2 left-2 w-4 h-4 border-l-2 border-b-2 border-primary/40" />
            <div className="absolute bottom-2 right-2 w-4 h-4 border-r-2 border-b-2 border-primary/40" />
            
            <div className="relative flex items-center justify-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-md bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
                <Clapperboard className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="w-10 h-10 rounded-md bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                <Film className="h-5 w-5 text-white" />
              </div>
              <div className="w-10 h-10 rounded-md bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                <Scissors className="h-5 w-5 text-white" />
              </div>
            </div>
            <DialogHeader className="relative text-center space-y-2">
              <DialogTitle className="text-lg">VIDEO AI</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
                {language === "ru" 
                  ? "Это ваш помощник в сфере съемки, монтажа и создания видео. Мы обучаем его, чтобы он давал качественные ответы в нашей сфере."
                  : "Your assistant for filming, editing, and video creation. We train it to provide quality answers in our field."
                }
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="p-4 space-y-3 bg-card">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-md bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                <StickyNote className="h-4 w-4 text-amber-500" />
              </div>
              <div>
                <p className="text-xs font-medium">
                  {language === "ru" ? "Заметки" : "Notes"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {language === "ru" 
                    ? "Сохраняйте важные идеи из чата"
                    : "Save important ideas from chat"
                  }
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <FolderDown className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs font-medium">
                  {language === "ru" ? "Полезные файлы" : "Useful Files"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {language === "ru" 
                    ? "Шаблоны, чек-листы и ресурсы"
                    : "Templates, checklists and resources"
                  }
                </p>
              </div>
            </div>
          </div>
          <div className="p-4 pt-0 bg-card">
            <Button onClick={closeWelcome} className="w-full" data-testid="button-close-welcome">
              {language === "ru" ? "Начать" : "Get Started"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* MOBILE CONSOLE LAYOUT */}
      <div className="lg:hidden flex flex-col h-[calc(100vh-4rem)] bg-background">
        {/* Console Header - Timeline Style */}
        <div className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-background via-card to-background border-b border-border/50 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
            </div>
            <div className="h-4 w-px bg-border mx-1" />
            <div className="flex items-center gap-1.5">
              <Play className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-mono text-muted-foreground">
                {totalMessages > 0 ? String(totalMessages).padStart(3, '0') : "000"}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-1.5">
            <div className="px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
              <span className="text-[10px] font-mono text-primary">VIDEO AI</span>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setSoundEnabled(!soundEnabled)}
              data-testid="button-toggle-sound-mobile"
            >
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 text-muted-foreground" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-chat-menu-mobile">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={exportChat} disabled={totalMessages === 0}>
                  <Download className="h-4 w-4 mr-2" />
                  {language === "ru" ? "Экспорт" : "Export"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={() => clearMutation.mutate()}
                  disabled={clearMutation.isPending || totalMessages === 0}
                  className="text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {language === "ru" ? "Очистить" : "Clear"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Timeline Track Ruler */}
        <div className="flex items-center h-5 px-3 bg-muted/30 border-b border-border/30 flex-shrink-0">
          <div className="flex-1 flex items-center gap-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center gap-1">
                <div className="w-px h-2 bg-muted-foreground/30" />
                <span className="text-[8px] font-mono text-muted-foreground/50">{i + 1}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 px-3 py-1.5 bg-muted/20 border-b border-border/30 flex-shrink-0">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage >= totalPages}>
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <span className="text-[10px] font-mono text-muted-foreground">{currentPage}/{totalPages}</span>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage <= 1}>
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Chat Area - Track Style */}
        <ScrollArea className="flex-1" ref={scrollAreaRef}>
          <div className="p-3 space-y-3">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary/50" />
              </div>
            ) : allMessages.length === 0 && !streamingContent ? (
              <div className="flex flex-col items-center justify-center py-8 px-4">
                <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-3 border border-primary/20">
                  <Clapperboard className="h-7 w-7 text-primary" />
                </div>
                <h3 className="font-medium text-sm mb-1">
                  {language === "ru" ? "Видео Ассистент" : "Video Assistant"}
                </h3>
                <p className="text-xs text-muted-foreground text-center mb-4">
                  {language === "ru" ? "Спросите о монтаже, съемке или кино" : "Ask about editing, filming, or cinema"}
                </p>
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {quickPrompts.slice(0, 2).map((prompt, i) => (
                    <Button key={i} variant="outline" size="sm" className="text-[10px] h-7" onClick={() => { setInput(prompt); textareaRef.current?.focus(); }} data-testid={`button-quick-prompt-mobile-${i}`}>
                      {prompt.slice(0, 25)}...
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {allMessages.map((msg, idx) => (
                  <div key={msg.id || idx} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`} data-testid={`chat-message-mobile-${msg.id || idx}`}>
                    <div className={`w-6 h-6 rounded flex-shrink-0 flex items-center justify-center ${msg.role === "user" ? "bg-accent" : "bg-primary/20"}`}>
                      {msg.role === "user" ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3 text-primary" />}
                    </div>
                    <div className={`flex flex-col max-w-[85%] ${msg.role === "user" ? "items-end" : "items-start"}`}>
                      <div className={`px-3 py-2 rounded-lg text-sm ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted/80 border border-border/50"}`}>
                        {msg.role === "assistant" ? (
                          <div className="prose prose-sm dark:prose-invert max-w-none text-xs">{formatContent(msg.content)}</div>
                        ) : (
                          <p className="whitespace-pre-wrap text-xs">{msg.content}</p>
                        )}
                      </div>
                      <span className="text-[9px] text-muted-foreground mt-0.5 px-1 font-mono">{formatTime(msg.createdAt)}</span>
                    </div>
                  </div>
                ))}
                {streamingContent && (
                  <div className="flex gap-2">
                    <div className="w-6 h-6 rounded flex-shrink-0 flex items-center justify-center bg-primary/20 animate-pulse">
                      <Bot className="h-3 w-3 text-primary" />
                    </div>
                    <div className="flex flex-col max-w-[85%]">
                      <div className="px-3 py-2 rounded-lg text-sm bg-muted/80 border border-primary/30">
                        <div className="prose prose-sm dark:prose-invert max-w-none text-xs">{formatContent(streamingContent)}</div>
                      </div>
                      <span className="text-[9px] text-primary mt-0.5 px-1 font-mono flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                        {language === "ru" ? "печатает" : "typing"}
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>

        {/* Console Bottom - Input & Dock */}
        <div className="flex-shrink-0 border-t border-border/30 safe-bottom">
          {/* Minimal Input Area */}
          <div className="flex gap-2 items-center px-3 py-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={language === "ru" ? "Сообщение..." : "Message..."}
              className="min-h-[36px] max-h-20 resize-none text-sm bg-transparent border-0 focus-visible:ring-0 py-2"
              disabled={isStreaming}
              data-testid="input-chat-message-mobile"
            />
            <Button onClick={sendMessage} disabled={!input.trim() || isStreaming} size="icon" variant="ghost" className="h-9 w-9 flex-shrink-0" data-testid="button-send-message-mobile">
              {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>

          {/* Bottom Action Buttons */}
          <div className="flex gap-2 px-3 py-2 border-t border-border/50 bg-card/50">
            <button
              onClick={() => { setMobileDrawerTab("notes"); setMobileDrawerOpen(true); }}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-md bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 active:scale-[0.98] transition-all"
              data-testid="button-open-notes-mobile"
            >
              <StickyNote className="h-4 w-4 text-amber-500" />
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                {language === "ru" ? "Заметки" : "Notes"}
              </span>
              {notes.length > 0 && (
                <span className="text-[9px] bg-amber-500/20 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full font-mono">{notes.length}</span>
              )}
            </button>
            <button
              onClick={() => { setMobileDrawerTab("files"); setMobileDrawerOpen(true); }}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-md bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 active:scale-[0.98] transition-all"
              data-testid="button-open-files-mobile"
            >
              <FolderDown className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-primary">
                {language === "ru" ? "Файлы" : "Files"}
              </span>
            </button>
          </div>

          {/* Sheet Drawer */}
          <Sheet open={mobileDrawerOpen} onOpenChange={setMobileDrawerOpen}>
            <SheetContent side="bottom" className="h-[70vh] rounded-t-xl p-0">
              {/* Drawer Tabs */}
              <div className="flex border-b">
                <button
                  onClick={() => setMobileDrawerTab("notes")}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${mobileDrawerTab === "notes" ? "text-amber-500 border-b-2 border-amber-500 bg-amber-500/5" : "text-muted-foreground"}`}
                  data-testid="button-drawer-tab-notes"
                >
                  <StickyNote className="h-4 w-4" />
                  {language === "ru" ? "Заметки" : "Notes"}
                </button>
                <button
                  onClick={() => setMobileDrawerTab("files")}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${mobileDrawerTab === "files" ? "text-primary border-b-2 border-primary bg-primary/5" : "text-muted-foreground"}`}
                  data-testid="button-drawer-tab-files"
                >
                  <FolderDown className="h-4 w-4" />
                  {language === "ru" ? "Файлы" : "Files"}
                </button>
              </div>

              {mobileDrawerTab === "notes" ? (
                <div className="flex flex-col h-[calc(70vh-48px)]">
                  <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-amber-500/5 to-orange-500/5">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {notesSaved ? <><Save className="h-3 w-3 text-green-500" />{language === "ru" ? "Сохранено" : "Saved"}</> : <><Loader2 className="h-3 w-3 animate-spin" />{language === "ru" ? "Сохранение..." : "Saving..."}</>}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleNotesChange("")} disabled={notes.length === 0} className="h-7 text-xs" data-testid="button-clear-notes-drawer">
                      <Trash2 className="h-3 w-3 mr-1" />
                      {language === "ru" ? "Очистить" : "Clear"}
                    </Button>
                  </div>
                  <Textarea
                    value={notes}
                    onChange={(e) => handleNotesChange(e.target.value)}
                    placeholder={language === "ru" ? "Записывайте важные идеи из чата здесь..." : "Write down important ideas from chat here..."}
                    className="flex-1 resize-none border-0 rounded-none bg-gradient-to-b from-amber-500/5 via-transparent to-orange-500/5 focus-visible:ring-0 text-sm leading-relaxed px-4 notes-scrollbar"
                    data-testid="input-notes-drawer"
                  />
                </div>
              ) : (
                <div className="p-4 space-y-3">
                  <p className="text-xs text-muted-foreground mb-3">
                    {language === "ru" ? "Полезные шаблоны и ресурсы" : "Useful templates and resources"}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { icon: FileType, name: language === "ru" ? "Шаблон сценария" : "Script Template", file: "script-template.txt", color: "from-blue-500 to-blue-600", desc: language === "ru" ? "Структура для Shorts" : "Structure for Shorts" },
                      { icon: FileCheck, name: language === "ru" ? "Правила ОТК" : "QC Rules", file: "otk-tv-rules.pdf", color: "from-green-500 to-green-600", desc: language === "ru" ? "Проверка качества" : "Quality check" },
                      { icon: FileVideo, name: "Premiere Pro", file: "podcast-premiere-template.prproj", color: "from-purple-500 to-purple-600", desc: language === "ru" ? "Проект подкаста" : "Podcast project" },
                      { icon: FileText, name: language === "ru" ? "Чек-лист монтажа" : "Edit Checklist", file: "editing-checklist.pdf", color: "from-orange-500 to-orange-600", desc: language === "ru" ? "Пошаговая проверка" : "Step-by-step check" },
                    ].map((item) => (
                      <button
                        key={item.file}
                        onClick={() => { const link = document.createElement("a"); link.href = `/files/${item.file}`; link.download = item.file; link.click(); }}
                        className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-left"
                        data-testid={`button-download-drawer-${item.file}`}
                      >
                        <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${item.color} flex items-center justify-center flex-shrink-0`}>
                          <item.icon className="h-5 w-5 text-white" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{item.name}</p>
                          <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* DESKTOP LAYOUT */}
      <div className="hidden lg:flex gap-4 h-[calc(100vh-4.5rem)] mx-6 py-3">
        <div className="flex flex-col flex-1 bg-background rounded-md border overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/50 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-xs font-mono font-medium">VIDEO AI</span>
              </div>
              <span className="text-[10px] text-muted-foreground font-mono">
                {totalMessages > 0 ? `[${String(totalMessages).padStart(3, '0')}]` : ""}
              </span>
            </div>
          
            <div className="flex items-center gap-0.5">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSoundEnabled(!soundEnabled)} data-testid="button-toggle-sound">
                {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" data-testid="button-chat-menu">
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={exportChat} disabled={totalMessages === 0}>
                    <Download className="h-4 w-4 mr-2" />
                    {language === "ru" ? "Экспорт" : "Export"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => clearMutation.mutate()} disabled={clearMutation.isPending || totalMessages === 0} className="text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    {language === "ru" ? "Очистить" : "Clear"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 px-4 py-2 border-b bg-muted/30">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                disabled={currentPage >= totalPages}
                data-testid="button-older-messages"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                {language === "ru" ? "Старые" : "Older"}
              </Button>
              <span className="text-xs text-muted-foreground px-2">
                {language === "ru" ? `Стр. ${currentPage} из ${totalPages}` : `Page ${currentPage} of ${totalPages}`}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                disabled={currentPage <= 1}
                data-testid="button-newer-messages"
              >
                {language === "ru" ? "Новые" : "Newer"}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}

          <ScrollArea className="flex-1 relative" ref={scrollAreaRef}>
            {/* Timeline grid background */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{
              backgroundImage: `
                linear-gradient(90deg, currentColor 1px, transparent 1px),
                linear-gradient(currentColor 1px, transparent 1px)
              `,
              backgroundSize: '40px 40px'
            }} />
            <div className="p-4 space-y-4 pb-6 relative">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
                    <p className="text-sm text-muted-foreground">
                      {language === "ru" ? "Загрузка..." : "Loading..."}
                    </p>
                  </div>
                </div>
              ) : allMessages.length === 0 && !streamingContent ? (
                <div className="flex flex-col items-center justify-center py-8 px-4">
                  <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-4">
                    <Sparkles className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2 text-center">
                    {language === "ru" ? "Привет! Я ваш видео-ассистент" : "Hi! I'm your video assistant"}
                  </h3>
                  <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">
                    {language === "ru"
                      ? "Спросите меня о видеомонтаже, съемке, истории кино или создании контента"
                      : "Ask me about video editing, filmmaking, cinema history, or content creation"}
                  </p>
                  
                  <div className="flex flex-wrap gap-2 justify-center">
                    {quickPrompts.map((prompt, i) => (
                      <Button
                        key={i}
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => {
                          setInput(prompt);
                          textareaRef.current?.focus();
                        }}
                        data-testid={`button-quick-prompt-${i}`}
                      >
                        <MessageSquare className="h-3 w-3 mr-1.5" />
                        {prompt}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {allMessages.map((msg, idx) => (
                    <div
                      key={msg.id || idx}
                      className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                      data-testid={`chat-message-${msg.id || idx}`}
                    >
                      <Avatar className="w-8 h-8 flex-shrink-0">
                        <AvatarFallback className={msg.role === "user" 
                          ? "bg-accent text-accent-foreground" 
                          : "bg-gradient-to-br from-primary to-primary/70 text-primary-foreground"
                        }>
                          {msg.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                        </AvatarFallback>
                      </Avatar>
                      
                      <div className={`flex flex-col max-w-[80%] ${msg.role === "user" ? "items-end" : "items-start"}`}>
                        <div
                          className={`px-4 py-2.5 rounded-2xl text-sm ${
                            msg.role === "user"
                              ? "bg-primary text-primary-foreground rounded-br-md"
                              : "bg-muted rounded-bl-md"
                          }`}
                        >
                          {msg.role === "assistant" ? (
                            <div className="prose prose-sm dark:prose-invert max-w-none">
                              {formatContent(msg.content)}
                            </div>
                          ) : (
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground mt-1 px-1">
                          {formatTime(msg.createdAt)}
                        </span>
                      </div>
                    </div>
                  ))}
                  
                  {streamingContent && (
                    <div className="flex gap-3 flex-row">
                      <Avatar className="w-8 h-8 flex-shrink-0">
                        <AvatarFallback className="bg-gradient-to-br from-primary to-primary/70 text-primary-foreground">
                          <Bot className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                      
                      <div className="flex flex-col max-w-[80%] items-start">
                        <div className="px-4 py-2.5 rounded-2xl rounded-bl-md text-sm bg-muted">
                          <div className="prose prose-sm dark:prose-invert max-w-none">
                            {formatContent(streamingContent)}
                          </div>
                        </div>
                        <span className="text-[10px] text-muted-foreground mt-1 px-1 flex items-center gap-1">
                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          {language === "ru" ? "Печатает..." : "Typing..."}
                        </span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </ScrollArea>

          <div className="p-3 border-t bg-card/50 backdrop-blur-sm flex-shrink-0">
            <div className="flex gap-2 items-end">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  language === "ru"
                    ? "Напишите сообщение..."
                    : "Type a message..."
                }
                className="min-h-[44px] max-h-32 resize-none rounded-xl"
                disabled={isStreaming}
                data-testid="input-chat-message"
              />
              <Button
                onClick={sendMessage}
                disabled={!input.trim() || isStreaming}
                size="icon"
                className="rounded-xl flex-shrink-0"
                data-testid="button-send-message"
              >
                {isStreaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-col w-80 gap-4 h-full">
          <Card className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b bg-gradient-to-r from-amber-500/10 to-orange-500/10">
              <div className="w-8 h-8 rounded-md bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                <StickyNote className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1">
                <h2 className="text-sm font-semibold">
                  {language === "ru" ? "Заметки" : "Notes"}
                </h2>
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  {notesSaved ? (
                    <>
                      <Save className="h-2.5 w-2.5" />
                      {language === "ru" ? "Сохранено" : "Saved"}
                    </>
                  ) : (
                    <>
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      {language === "ru" ? "Сохранение..." : "Saving..."}
                    </>
                  )}
                </p>
              </div>
              
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    disabled={notes.length === 0}
                    data-testid="button-clear-notes"
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {language === "ru" ? "Очистить заметки?" : "Clear notes?"}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {language === "ru" 
                        ? "Все ваши заметки будут удалены. Это действие нельзя отменить."
                        : "All your notes will be deleted. This action cannot be undone."
                      }
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-cancel-clear-notes">
                      {language === "ru" ? "Отмена" : "Cancel"}
                    </AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={() => handleNotesChange("")}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid="button-confirm-clear-notes"
                    >
                      {language === "ru" ? "Очистить" : "Clear"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            
            <div className="flex-1 min-h-0 overflow-hidden">
              <Textarea
                value={notes}
                onChange={(e) => handleNotesChange(e.target.value)}
                placeholder={language === "ru" 
                  ? "Записывайте важные идеи, ссылки, советы из чата..."
                  : "Write down important ideas, links, tips from the chat..."
                }
                className="h-full w-full resize-none border-0 rounded-none bg-card focus-visible:ring-0 text-sm leading-relaxed p-3 overflow-y-auto notes-scrollbar"
                data-testid="input-notes"
              />
            </div>
            
            <div className="px-4 py-2 border-t bg-muted/30">
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <FileText className="h-3 w-3" />
                <span>
                  {notes.length > 0 
                    ? (language === "ru" ? `${notes.length} символов` : `${notes.length} characters`)
                    : (language === "ru" ? "Пусто" : "Empty")
                  }
                </span>
              </div>
            </div>
          </Card>
          
          <Card className="flex flex-col flex-shrink-0 overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b bg-gradient-to-r from-primary/10 to-primary/5">
              <div className="w-8 h-8 rounded-md bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
                <FolderDown className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="flex-1">
                <h2 className="text-sm font-semibold">
                  {language === "ru" ? "Полезные файлы" : "Useful Files"}
                </h2>
                <p className="text-[10px] text-muted-foreground">
                  {language === "ru" ? "Шаблоны и ресурсы" : "Templates & resources"}
                </p>
              </div>
            </div>
            
            <div className="p-2 space-y-1">
              {[
                { 
                  icon: FileType, 
                  name: language === "ru" ? "Шаблон сценария" : "Script Template",
                  file: "script-template.txt",
                  color: "text-blue-500"
                },
                { 
                  icon: FileCheck, 
                  name: language === "ru" ? "ОТК ТВ правила" : "TV QC Rules",
                  file: "otk-tv-rules.pdf",
                  color: "text-green-500"
                },
                { 
                  icon: FileVideo, 
                  name: language === "ru" ? "Проект Premiere (подкасты)" : "Premiere Project (podcasts)",
                  file: "podcast-premiere-template.prproj",
                  color: "text-purple-500"
                },
                { 
                  icon: FileText, 
                  name: language === "ru" ? "Чек-лист монтажа" : "Editing Checklist",
                  file: "editing-checklist.pdf",
                  color: "text-orange-500"
                },
              ].map((item) => (
                  <Button
                    key={item.file}
                    variant="ghost"
                    className="w-full justify-start gap-3 h-auto py-2.5 px-3"
                    onClick={() => {
                      const link = document.createElement("a");
                      link.href = `/files/${item.file}`;
                      link.download = item.file;
                      link.click();
                    }}
                    data-testid={`button-download-${item.file}`}
                  >
                    <item.icon className={`h-4 w-4 flex-shrink-0 ${item.color}`} />
                    <span className="text-sm text-left truncate">{item.name}</span>
                    <Download className="h-3.5 w-3.5 ml-auto text-muted-foreground flex-shrink-0" />
                  </Button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
