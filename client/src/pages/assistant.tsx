import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Clapperboard
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { AssistantChat } from "@shared/schema";
import { format } from "date-fns";
import { ru, enUS } from "date-fns/locale";

interface OptimisticMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  isOptimistic?: boolean;
}

export default function AssistantPage() {
  const { language } = useI18n();
  const [input, setInput] = useState("");
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [optimisticMessages, setOptimisticMessages] = useState<OptimisticMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: messages = [], isLoading } = useQuery<AssistantChat[]>({
    queryKey: ["/api/assistant/chat"],
  });

  const clearMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/assistant/chat"),
    onSuccess: () => {
      setOptimisticMessages([]);
      queryClient.invalidateQueries({ queryKey: ["/api/assistant/chat"] });
    },
  });

  const scrollToBottom = () => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, optimisticMessages]);

  useEffect(() => {
    if (messages.length > 0 && optimisticMessages.length > 0) {
      setOptimisticMessages(prev => 
        prev.filter(om => !messages.some(m => 
          m.content === om.content && m.role === om.role
        ))
      );
    }
  }, [messages]);

  const allMessages = [...messages, ...optimisticMessages];

  const sendMessage = async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage = input.trim();
    const tempId = `temp-user-${Date.now()}`;
    
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

    let assistantTempId = "";

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
                assistantTempId = `temp-assistant-${Date.now()}`;
                setOptimisticMessages(prev => [...prev, {
                  id: assistantTempId,
                  role: "assistant",
                  content: accumulated,
                  createdAt: new Date().toISOString(),
                  isOptimistic: true,
                }]);
                setStreamingContent("");
                setIsStreaming(false);
                queryClient.invalidateQueries({ queryKey: ["/api/assistant/chat"] });
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

  const exportChat = () => {
    const content = allMessages.map(m => 
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
    <div className="flex flex-col h-full max-h-[calc(100vh-4rem)] md:max-h-screen bg-background">
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
              {language === "ru" ? "Эксперт по видеопроизводству" : "Video production expert"}
            </p>
          </div>
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" data-testid="button-chat-menu">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={exportChat} disabled={allMessages.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              {language === "ru" ? "Экспорт чата" : "Export chat"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={() => clearMutation.mutate()}
              disabled={clearMutation.isPending || allMessages.length === 0}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {language === "ru" ? "Очистить историю" : "Clear history"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ScrollArea className="flex-1" ref={scrollRef}>
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
        <p className="text-[10px] text-muted-foreground mt-2 text-center">
          {language === "ru"
            ? "История сохраняется автоматически"
            : "History is saved automatically"}
        </p>
      </div>
    </div>
  );
}
