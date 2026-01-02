import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Trash2, Bot, User, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { AssistantChat } from "@shared/schema";

export default function AssistantPage() {
  const { t, language } = useI18n();
  const [input, setInput] = useState("");
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: messages = [], isLoading } = useQuery<AssistantChat[]>({
    queryKey: ["/api/assistant/chat"],
  });

  const clearMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/assistant/chat"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assistant/chat"] });
    },
  });

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent]);

  const sendMessage = async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage = input.trim();
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
        throw new Error("Failed to send message");
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
                // Wait for state to update before clearing
                await queryClient.invalidateQueries({ queryKey: ["/api/assistant/chat"] });
              }
            } catch {}
          }
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      // Small delay to let the query refetch complete before clearing streaming content
      setTimeout(() => {
        setIsStreaming(false);
        setStreamingContent("");
      }, 100);
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
        return <p key={i} className="font-semibold mt-3 mb-1">{line.slice(2, -2)}</p>;
      }
      if (line.startsWith("- ")) {
        return <li key={i} className="ml-4 list-disc">{line.slice(2)}</li>;
      }
      if (line.trim() === "") {
        return <br key={i} />;
      }
      return <p key={i} className="mb-1">{line}</p>;
    });
  };

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-4rem)] md:max-h-screen">
      <div className="flex items-center justify-between gap-2 p-3 border-b flex-shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <h1 className="text-base font-semibold">
            {language === "ru" ? "AI-Ассистент" : "AI Assistant"}
          </h1>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => clearMutation.mutate()}
          disabled={clearMutation.isPending || messages.length === 0}
          data-testid="button-clear-chat"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 p-3" ref={scrollRef as any}>
        <div className="space-y-3 pb-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 && !streamingContent ? (
            <Card className="p-6 text-center">
              <Bot className="h-12 w-12 mx-auto mb-4 text-primary opacity-50" />
              <h3 className="font-medium mb-2">
                {language === "ru" ? "Привет! Я ваш видео-ассистент" : "Hi! I'm your video assistant"}
              </h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                {language === "ru"
                  ? "Задайте мне любой вопрос о кинопроизводстве, видеомонтаже, истории кино, технике съемки или создании контента."
                  : "Ask me anything about filmmaking, video editing, cinema history, shooting techniques, or content creation."}
              </p>
            </Card>
          ) : (
            <>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  data-testid={`chat-message-${msg.id}`}
                >
                  {msg.role === "assistant" && (
                    <div className="flex-shrink-0 w-7 h-7 rounded-sm bg-primary/10 flex items-center justify-center">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <Card
                    className={`max-w-[85%] p-3 text-sm ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        {formatContent(msg.content)}
                      </div>
                    ) : (
                      msg.content
                    )}
                  </Card>
                  {msg.role === "user" && (
                    <div className="flex-shrink-0 w-7 h-7 rounded-sm bg-accent flex items-center justify-center">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              ))}
              {streamingContent && (
                <div className="flex gap-2 justify-start">
                  <div className="flex-shrink-0 w-7 h-7 rounded-sm bg-primary/10 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <Card className="max-w-[85%] p-3 text-sm bg-muted">
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      {formatContent(streamingContent)}
                    </div>
                  </Card>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      <div className="p-3 border-t flex-shrink-0">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              language === "ru"
                ? "Спросите о видеомонтаже, кино, съемке..."
                : "Ask about video editing, filmmaking..."
            }
            className="min-h-[44px] max-h-32 resize-none"
            disabled={isStreaming}
            data-testid="input-chat-message"
          />
          <Button
            onClick={sendMessage}
            disabled={!input.trim() || isStreaming}
            size="icon"
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
            ? "Сохраняются последние 50 сообщений"
            : "Last 50 messages are saved"}
        </p>
      </div>
    </div>
  );
}
