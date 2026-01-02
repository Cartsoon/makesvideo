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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  ChevronUp,
  ChevronDown,
  StickyNote,
  Save,
  FileText,
  FolderDown,
  FileVideo,
  FileType,
  FileCheck
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

  return (
    <Layout title={language === "ru" ? "AI-Ассистент" : "AI Assistant"}>
      <div className="flex gap-4 h-[calc(100vh-10rem)] md:h-[calc(100vh-6rem)] mx-4 md:mx-6 md:my-4">
        <div className="flex flex-col flex-1 bg-background rounded-md border overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b bg-card/50 backdrop-blur-sm flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-9 h-9 rounded-md bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
                  <Clapperboard className="h-5 w-5 text-primary-foreground" />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-card" />
              </div>
              <div>
                <h1 className="text-sm font-semibold leading-tight">
                  {language === "ru" ? "AI-Ассистент" : "AI Assistant"}
                </h1>
                <p className="text-[10px] text-muted-foreground">
                  {totalMessages > 0 
                    ? (language === "ru" ? `${totalMessages} сообщений` : `${totalMessages} messages`)
                    : (language === "ru" ? "Эксперт по видеопроизводству" : "Video production expert")
                  }
                </p>
              </div>
            </div>
          
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSoundEnabled(!soundEnabled)}
                data-testid="button-toggle-sound"
                title={soundEnabled 
                  ? (language === "ru" ? "Выключить звук" : "Mute sounds")
                  : (language === "ru" ? "Включить звук" : "Enable sounds")
                }
              >
                {soundEnabled ? (
                  <Volume2 className="h-4 w-4" />
                ) : (
                  <VolumeX className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" data-testid="button-chat-menu">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={exportChat} disabled={totalMessages === 0}>
                    <Download className="h-4 w-4 mr-2" />
                    {language === "ru" ? "Экспорт чата" : "Export chat"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => clearMutation.mutate()}
                    disabled={clearMutation.isPending || totalMessages === 0}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {language === "ru" ? "Очистить историю" : "Clear history"}
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

          <ScrollArea className="flex-1" ref={scrollAreaRef}>
            <div className="p-4 space-y-4 pb-6">
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

          <div className="p-3 border-t bg-card/50 backdrop-blur-sm flex-shrink-0 safe-bottom">
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
          
          {/* Mobile Notes Panel */}
          <Collapsible 
            open={mobileNotesOpen} 
            onOpenChange={setMobileNotesOpen}
            className="lg:hidden mt-2 mx-2 mb-2 rounded-lg border overflow-hidden"
          >
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="w-full flex items-center justify-between gap-2 px-4 py-3 h-auto rounded-none bg-gradient-to-r from-amber-500/10 to-orange-500/10"
                data-testid="button-mobile-notes-toggle"
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-md bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                    <StickyNote className="h-3.5 w-3.5 text-white" />
                  </div>
                  <div className="text-left">
                    <span className="text-sm font-medium">
                      {language === "ru" ? "Заметки" : "Notes"}
                    </span>
                    <span className="text-[10px] text-muted-foreground ml-2">
                      {notes.length > 0 
                        ? (language === "ru" ? `${notes.length} симв.` : `${notes.length} chars`)
                        : (language === "ru" ? "Пусто" : "Empty")
                      }
                    </span>
                  </div>
                </div>
                {mobileNotesOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="relative h-40 border-t">
                <div className="absolute inset-0 bg-gradient-to-b from-amber-500/5 via-transparent to-orange-500/5 pointer-events-none z-0" />
                <Textarea
                  value={notes}
                  onChange={(e) => handleNotesChange(e.target.value)}
                  placeholder={language === "ru" 
                    ? "Записывайте важные идеи из чата..."
                    : "Write down important ideas from the chat..."
                  }
                  className="h-full w-full resize-none border-0 rounded-none bg-transparent focus-visible:ring-0 text-sm leading-relaxed relative z-10"
                  data-testid="input-notes-mobile"
                />
              </div>
              <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/30">
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
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
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleNotesChange("")}
                  disabled={notes.length === 0}
                  className="h-7 text-xs text-muted-foreground"
                  data-testid="button-clear-notes-mobile"
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  {language === "ru" ? "Очистить" : "Clear"}
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <div className="hidden lg:flex flex-col w-80 gap-4">
          <Card className="flex flex-col h-[45%] overflow-hidden">
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
            
            <div className="flex-1 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-b from-amber-500/5 via-transparent to-orange-500/5 pointer-events-none z-0" />
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-amber-500/10 to-transparent rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none z-0" />
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-orange-500/10 to-transparent rounded-full translate-y-1/2 -translate-x-1/2 pointer-events-none z-0" />
              
              <ScrollArea className="h-full w-full [&_[data-radix-scroll-area-thumb]]:bg-gradient-to-b [&_[data-radix-scroll-area-thumb]]:from-amber-500 [&_[data-radix-scroll-area-thumb]]:to-orange-500 [&_[data-radix-scroll-area-thumb]]:rounded-full [&_[data-radix-scroll-area-scrollbar]]:w-2 [&_[data-radix-scroll-area-scrollbar]]:bg-amber-500/10">
                <Textarea
                  value={notes}
                  onChange={(e) => handleNotesChange(e.target.value)}
                  placeholder={language === "ru" 
                    ? "Записывайте важные идеи, ссылки, советы из чата..."
                    : "Write down important ideas, links, tips from the chat..."
                  }
                  className="min-h-full w-full resize-none border-0 rounded-none bg-transparent focus-visible:ring-0 text-sm leading-relaxed relative z-10"
                  data-testid="input-notes"
                />
              </ScrollArea>
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
          
          <Card className="flex flex-col flex-1 overflow-hidden">
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
            
            <ScrollArea className="flex-1">
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
            </ScrollArea>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
