import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth-context";
import { getAvatarById } from "@/lib/avatars";
import editoAvatar from "@assets/ChatGPT_Image_3_янв._2026_г.,_15_37_10_1767443857410.png";
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
  ChevronUp,
  Archive,
  RotateCcw,
  Clock,
  ThumbsUp,
  ThumbsDown,
  Check,
  Plus,
  ChevronDown
} from "lucide-react";
import { feedbackReasons, type FeedbackReason } from "@shared/schema";
import { useI18n } from "@/lib/i18n";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { AssistantChat, AssistantNote, StockAsset, StockSearchResponse, StockMediaType } from "@shared/schema";
import { format } from "date-fns";
import { ru, enUS } from "date-fns/locale";
import { playSendSound, playReceiveSound } from "@/hooks/use-sound";
import { Layout } from "@/components/layout";
import ReactMarkdown from "react-markdown";
import { useAdminAccess } from "@/lib/admin-access";
import { useToast } from "@/hooks/use-toast";

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
  const { user } = useAuth();
  const { checkPassword, isUnlocked } = useAdminAccess();
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [optimisticMessages, setOptimisticMessages] = useState<OptimisticMessage[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeNoteContent, setActiveNoteContent] = useState("");
  const [notesSaved, setNotesSaved] = useState(true);
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState("");
  const [showNotesList, setShowNotesList] = useState(true);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem("assistant-sound-enabled");
    return saved !== "false";
  });
  const [mobileNotesOpen, setMobileNotesOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [mobileDrawerTab, setMobileDrawerTab] = useState<"notes" | "archive">("notes");
  const [showWelcome, setShowWelcome] = useState(() => {
    return !localStorage.getItem("assistant-welcome-seen");
  });
  
  const [pendingConsoleUnlock, setPendingConsoleUnlock] = useState(false);
  const [consoleMessageIds, setConsoleMessageIds] = useState<string[]>([]);
  const [stockSearching, setStockSearching] = useState(false);
  const [stockResults, setStockResults] = useState<StockAsset[]>([]);
  
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

  // Prevent body scroll on desktop for full-height layout
  useEffect(() => {
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
    if (isDesktop) {
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("assistant-sound-enabled", String(soundEnabled));
  }, [soundEnabled]);

  const { data: paginatedData, isLoading, isFetching } = useQuery<PaginatedResponse>({
    queryKey: ["/api/assistant/chat/page", currentPage],
    queryFn: async () => {
      const res = await fetch(`/api/assistant/chat/page/${currentPage}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    placeholderData: (previousData) => previousData,
  });

  const { data: allNotes = [] } = useQuery<AssistantNote[]>({
    queryKey: ["/api/assistant/notes"],
    select: (data) => Array.isArray(data) ? data : [],
  });
  
  const { data: activeNote } = useQuery<AssistantNote | null>({
    queryKey: ["/api/assistant/notes/active"],
  });

  const { data: archivedSessions = [] } = useQuery<{ archivedAt: string; messageCount: number; preview: string }[]>({
    queryKey: ["/api/assistant/chat/archived"],
  });

  useEffect(() => {
    if (activeNote?.content !== undefined) {
      setActiveNoteContent(activeNote.content);
    }
  }, [activeNote?.id, activeNote?.content]);

  const saveNotesMutation = useMutation({
    mutationFn: ({ noteId, content }: { noteId: number; content: string }) => 
      apiRequest("PATCH", `/api/assistant/notes/${noteId}`, { content }),
    onSuccess: () => {
      setNotesSaved(true);
      queryClient.invalidateQueries({ queryKey: ["/api/assistant/notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assistant/notes/active"] });
    },
  });
  
  const createNoteMutation = useMutation({
    mutationFn: (title: string) => apiRequest("POST", "/api/assistant/notes", { title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assistant/notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assistant/notes/active"] });
      setIsCreatingNote(false);
      setNewNoteTitle("");
      setActiveNoteContent("");
      setShowNotesList(false);
    },
  });
  
  const activateNoteMutation = useMutation({
    mutationFn: (noteId: number) => apiRequest("POST", `/api/assistant/notes/${noteId}/activate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assistant/notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assistant/notes/active"] });
      setActiveNoteContent("");
      setShowNotesList(false);
    },
  });
  
  const deleteNoteMutation = useMutation({
    mutationFn: (noteId: number) => apiRequest("DELETE", `/api/assistant/notes/${noteId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assistant/notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assistant/notes/active"] });
    },
  });

  const handleNotesChange = (value: string) => {
    setActiveNoteContent(value);
    setNotesSaved(false);
    
    if (notesTimeoutRef.current) {
      clearTimeout(notesTimeoutRef.current);
    }
    notesTimeoutRef.current = setTimeout(() => {
      if (activeNote?.id) {
        saveNotesMutation.mutate({ noteId: activeNote.id, content: value });
      }
    }, 1500);
  };

  const messages = paginatedData?.messages || [];
  const totalPages = paginatedData?.totalPages || 1;
  const totalMessages = paginatedData?.total || 0;

  const clearMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/assistant/chat");
      return res.json();
    },
    onSuccess: () => {
      setOptimisticMessages([]);
      setCurrentPage(1);
      setShowClearDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/assistant/chat/page", 1] });
      toast({
        title: language === "ru" ? "История очищена" : "Chat cleared",
        description: language === "ru" ? "Все сообщения удалены" : "All messages deleted",
      });
    },
    onError: (error) => {
      console.error("Clear chat error:", error);
      toast({
        title: language === "ru" ? "Ошибка" : "Error",
        description: language === "ru" ? "Не удалось очистить чат" : "Failed to clear chat",
        variant: "destructive",
      });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/assistant/chat/archive"),
    onSuccess: () => {
      setOptimisticMessages([]);
      setCurrentPage(1);
      queryClient.invalidateQueries({ queryKey: ["/api/assistant/chat/page", 1] });
      queryClient.invalidateQueries({ queryKey: ["/api/assistant/chat/archived"] });
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: (archivedAt: string) => apiRequest("POST", "/api/assistant/chat/unarchive", { archivedAt }),
    onSuccess: () => {
      setCurrentPage(1);
      queryClient.invalidateQueries({ queryKey: ["/api/assistant/chat/page", 1] });
      queryClient.invalidateQueries({ queryKey: ["/api/assistant/chat/archived"] });
    },
  });

  // Feedback state and mutation
  const [feedbackGiven, setFeedbackGiven] = useState<Record<number, "positive" | "negative">>({});
  const [showReasonDropdown, setShowReasonDropdown] = useState<number | null>(null);

  const feedbackMutation = useMutation({
    mutationFn: (data: { messageId: number; rating: "positive" | "negative"; reason?: string }) =>
      apiRequest("POST", "/api/assistant/feedback", data),
    onSuccess: (_, variables) => {
      setFeedbackGiven(prev => ({ ...prev, [variables.messageId]: variables.rating }));
      setShowReasonDropdown(null);
    },
  });

  // Add message content to notes (creates new note if none active)
  const addToNotes = useCallback(async (content: string) => {
    const timestamp = format(new Date(), "dd.MM.yyyy HH:mm", { locale: language === "ru" ? ru : enUS });
    const formattedNote = `[${timestamp}]\n${content}`;
    
    if (activeNote?.id) {
      const separator = activeNoteContent.length > 0 ? "\n\n---\n\n" : "";
      const updatedNotes = activeNoteContent + separator + formattedNote;
      setActiveNoteContent(updatedNotes);
      setNotesSaved(false);
      saveNotesMutation.mutate({ noteId: activeNote.id, content: updatedNotes });
      toast({
        title: language === "ru" ? "Добавлено в заметки" : "Added to notes",
        description: activeNote.title,
      });
    } else {
      const defaultTitle = language === "ru" ? "Заметки от " + format(new Date(), "dd.MM.yyyy") : "Notes from " + format(new Date(), "MM/dd/yyyy");
      try {
        const response = await apiRequest("POST", "/api/assistant/notes", { title: defaultTitle });
        const newNote = await response.json();
        await apiRequest("PATCH", `/api/assistant/notes/${newNote.id}`, { content: formattedNote });
        queryClient.invalidateQueries({ queryKey: ["/api/assistant/notes"] });
        queryClient.invalidateQueries({ queryKey: ["/api/assistant/notes/active"] });
        setActiveNoteContent(formattedNote);
        toast({
          title: language === "ru" ? "Создана новая заметка" : "New note created",
          description: defaultTitle,
        });
      } catch (error) {
        toast({
          title: language === "ru" ? "Ошибка" : "Error",
          description: language === "ru" ? "Не удалось создать заметку" : "Failed to create note",
          variant: "destructive",
        });
      }
    }
  }, [activeNote, activeNoteContent, language, saveNotesMutation, toast]);

  const feedbackReasonLabels: Record<FeedbackReason, { ru: string; en: string }> = {
    too_generic: { ru: "Слишком общий", en: "Too generic" },
    wrong_style: { ru: "Не по стилю", en: "Wrong style" },
    poor_structure: { ru: "Не структурно", en: "Poor structure" },
    no_practical: { ru: "Нет практики", en: "No practical tips" },
    not_trendy: { ru: "Не трендово", en: "Not trendy" },
  };

  const handleFeedback = (messageId: number, rating: "positive" | "negative", reason?: string) => {
    feedbackMutation.mutate({ messageId, rating, reason });
  };

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

  // Scroll to bottom on initial load when messages are ready
  const hasInitiallyScrolled = useRef(false);
  useEffect(() => {
    if (!isLoading && messages.length > 0 && currentPage === 1 && !hasInitiallyScrolled.current) {
      hasInitiallyScrolled.current = true;
      // Use multiple animation frames to ensure DOM is fully rendered
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollToBottom();
        });
      });
    }
  }, [isLoading, messages.length, currentPage, scrollToBottom]);

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
    
    const stockMatch = userMessage.match(/^\/stock\s+(.+)$/i);
    if (stockMatch) {
      const stockQuery = stockMatch[1].trim();
      const userMsgId = `stock-user-${Date.now()}`;
      const searchMsgId = `stock-search-${Date.now()}`;
      
      if (soundEnabled) {
        playSendSound();
      }
      
      setOptimisticMessages(prev => [
        ...prev,
        {
          id: userMsgId,
          role: "user",
          content: userMessage,
          createdAt: new Date().toISOString(),
          isOptimistic: true,
        },
        {
          id: searchMsgId,
          role: "assistant",
          content: language === "ru" ? `Ищу футажи по запросу "${stockQuery}"...` : `Searching for "${stockQuery}" footage...`,
          createdAt: new Date().toISOString(),
          isOptimistic: true,
        },
      ]);
      
      setInput("");
      setStockSearching(true);
      
      try {
        const [videoRes, photoRes, audioRes] = await Promise.all([
          fetch("/api/stock-search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: stockQuery, mediaType: "video", limit: 4 }) }).then(r => r.json()) as Promise<StockSearchResponse>,
          fetch("/api/stock-search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: stockQuery, mediaType: "photo", limit: 4 }) }).then(r => r.json()) as Promise<StockSearchResponse>,
          fetch("/api/stock-search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: stockQuery, mediaType: "audio", limit: 2 }) }).then(r => r.json()) as Promise<StockSearchResponse>,
        ]);
        
        const allAssets = [...videoRes.assets, ...photoRes.assets, ...audioRes.assets].slice(0, 10);
        setStockResults(allAssets);
        
        const translatedNote = videoRes.translatedQuery !== stockQuery 
          ? (language === "ru" ? ` (переведено: "${videoRes.translatedQuery}")` : ` (translated: "${videoRes.translatedQuery}")`)
          : "";
        
        const resultText = allAssets.length > 0
          ? (language === "ru" 
              ? `Найдено ${allAssets.length} футажей по запросу "${stockQuery}"${translatedNote}:\n\n${allAssets.map((a, i) => `${i + 1}. **${a.title}** (${a.provider}) - [Скачать](${a.downloadUrl})`).join("\n")}`
              : `Found ${allAssets.length} assets for "${stockQuery}"${translatedNote}:\n\n${allAssets.map((a, i) => `${i + 1}. **${a.title}** (${a.provider}) - [Download](${a.downloadUrl})`).join("\n")}`)
          : (language === "ru" ? `По запросу "${stockQuery}" ничего не найдено. Попробуйте другой запрос или настройте API-ключи стоков.` : `No results found for "${stockQuery}". Try a different query or configure stock API keys.`);
        
        setOptimisticMessages(prev => prev.map(m => 
          m.id === searchMsgId 
            ? { ...m, content: resultText }
            : m
        ));
        
        if (soundEnabled) {
          playReceiveSound();
        }
      } catch (error) {
        setOptimisticMessages(prev => prev.map(m => 
          m.id === searchMsgId 
            ? { ...m, content: language === "ru" ? "Ошибка поиска футажей. Попробуйте позже." : "Error searching for footage. Please try again." }
            : m
        ));
      }
      
      setStockSearching(false);
      return;
    }
    
    if (userMessage === "/console" && !pendingConsoleUnlock && !isUnlocked) {
      const userMsgId = `console-user-${Date.now()}`;
      const assistantMsgId = `console-assistant-${Date.now()}`;
      
      if (soundEnabled) {
        playSendSound();
      }
      
      setOptimisticMessages(prev => [
        ...prev,
        {
          id: userMsgId,
          role: "user",
          content: userMessage,
          createdAt: new Date().toISOString(),
          isOptimistic: true,
        },
        {
          id: assistantMsgId,
          role: "assistant",
          content: language === "ru" ? "Введите пароль для доступа к консоли администратора:" : "Enter password for admin console access:",
          createdAt: new Date().toISOString(),
          isOptimistic: true,
        },
      ]);
      
      setConsoleMessageIds([userMsgId, assistantMsgId]);
      setPendingConsoleUnlock(true);
      setInput("");
      return;
    }
    
    if (pendingConsoleUnlock) {
      const passwordMsgId = `password-user-${Date.now()}`;
      
      if (soundEnabled) {
        playSendSound();
      }
      
      setOptimisticMessages(prev => [
        ...prev,
        {
          id: passwordMsgId,
          role: "user",
          content: "••••••••",
          createdAt: new Date().toISOString(),
          isOptimistic: true,
        },
      ]);
      
      setInput("");
      
      if (checkPassword(userMessage)) {
        setTimeout(() => {
          setOptimisticMessages(prev => 
            prev.filter(m => !consoleMessageIds.includes(m.id) && m.id !== passwordMsgId)
          );
          setPendingConsoleUnlock(false);
          setConsoleMessageIds([]);
          
          toast({
            title: language === "ru" ? "Доступ разблокирован" : "Access unlocked",
            description: language === "ru" ? "Раздел 'База знаний' теперь доступен в меню" : "Knowledge Base section is now available in menu",
          });
        }, 300);
      } else {
        const errorMsgId = `error-assistant-${Date.now()}`;
        
        setOptimisticMessages(prev => [
          ...prev,
          {
            id: errorMsgId,
            role: "assistant",
            content: language === "ru" ? "Неверный пароль. Попробуйте снова:" : "Invalid password. Try again:",
            createdAt: new Date().toISOString(),
            isOptimistic: true,
          },
        ]);
        
        setConsoleMessageIds(prev => [...prev, passwordMsgId, errorMsgId]);
      }
      return;
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
                setStreamingContent("");
                setIsStreaming(false);
                setOptimisticMessages([]);
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

  const MarkdownContent = ({ content }: { content: string }) => {
    return (
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h1 className="text-lg font-bold mt-4 mb-2 text-foreground border-b border-border/50 pb-1">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-bold mt-4 mb-2 text-foreground">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold mt-3 mb-1.5 text-foreground">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-sm font-medium mt-2 mb-1 text-foreground">{children}</h4>
          ),
          p: ({ children }) => (
            <p className="mb-2 text-foreground/90 leading-relaxed">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="ml-4 mb-2 space-y-1 list-disc marker:text-primary/60">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="ml-4 mb-2 space-y-1 list-decimal marker:text-primary/60">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="text-foreground/90 leading-relaxed">{children}</li>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-foreground/80">{children}</em>
          ),
          a: ({ href, children }) => (
            <a 
              href={href} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
            >
              {children}
            </a>
          ),
          code: ({ children, className }) => {
            const isInline = !className;
            return isInline ? (
              <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono text-foreground">{children}</code>
            ) : (
              <code className="block p-3 rounded-md bg-muted text-sm font-mono text-foreground overflow-x-auto">{children}</code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-2 rounded-md bg-muted overflow-x-auto">{children}</pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-primary/40 pl-3 my-2 text-foreground/80 italic">{children}</blockquote>
          ),
          hr: () => (
            <hr className="my-3 border-border/50" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    );
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

  const [quickPromptsKey, setQuickPromptsKey] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setQuickPromptsKey(prev => prev + 1);
    }, 10000);
    return () => clearInterval(interval);
  }, []);
  
  const quickPrompts = useMemo(() => {
    const allRu = [
      "Как сделать крутой хук для видео?",
      "Расскажи про правило третей",
      "Лучшие переходы для Shorts",
      "Как выставить свет для интервью?",
      "Какие настройки камеры для съемки еды?",
      "Как делать плавные переходы в Premiere?",
      "Расскажи про цветокоррекцию в DaVinci",
      "Как снять таймлапс на телефон?",
      "Лучшие бесплатные саундтреки для видео",
      "Как записать качественный звук дома?",
      "Что такое B-roll и как его снимать?",
      "Как сделать кинематографичный кадр?",
      "Советы по съемке на стабилизаторе",
      "Как редактировать видео для TikTok?",
      "Какой микрофон выбрать для влога?",
      "Как убрать шум с видео?",
      "Расскажи про композицию в кадре",
      "Как снимать вертикальное видео?",
      "Лучшие эффекты для Reels",
      "Как делать субтитры для видео?",
      "Расскажи про slow motion съемку",
      "Как работать с зеленым экраном?",
      "Советы по ночной съемке видео",
      "Как сделать стоп-моушен анимацию?",
    ];
    const allEn = [
      "How to make a great video hook?",
      "Tell me about the rule of thirds",
      "Best transitions for Shorts",
      "How to set up lighting for interviews?",
      "Camera settings for food videography?",
      "How to make smooth transitions in Premiere?",
      "Tell me about color grading in DaVinci",
      "How to shoot timelapse on phone?",
      "Best free soundtracks for videos",
      "How to record quality audio at home?",
      "What is B-roll and how to shoot it?",
      "How to create a cinematic shot?",
      "Tips for shooting with gimbal",
      "How to edit videos for TikTok?",
      "Which mic to choose for vlogging?",
      "How to remove noise from video?",
      "Tell me about frame composition",
      "How to shoot vertical video?",
      "Best effects for Reels",
      "How to add subtitles to video?",
      "Tell me about slow motion shooting",
      "How to work with green screen?",
      "Tips for night video shooting",
      "How to make stop motion animation?",
    ];
    const pool = language === "ru" ? allRu : allEn;
    const indices = new Set<number>();
    while (indices.size < 3) {
      indices.add(Math.floor(Math.random() * pool.length));
    }
    return Array.from(indices).map(i => pool[i]);
  }, [language, quickPromptsKey]);

  const closeWelcome = () => {
    localStorage.setItem("assistant-welcome-seen", "true");
    setShowWelcome(false);
  };

  return (
    <Layout title="VIDEO AI" fullHeight hideBottomNav>
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
                <Archive className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs font-medium">
                  {language === "ru" ? "Архив чатов" : "Chat Archive"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {language === "ru" 
                    ? "Сохраняйте разговоры для продолжения"
                    : "Save conversations to continue later"
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
      <div className="lg:hidden flex flex-col h-full bg-background">
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
                <DropdownMenuItem 
                  onClick={() => archiveMutation.mutate()}
                  disabled={archiveMutation.isPending || totalMessages === 0}
                >
                  <Archive className="h-4 w-4 mr-2" />
                  {language === "ru" ? "Архивировать" : "Archive"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={() => setShowClearDialog(true)}
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

        {/* Clear Chat Confirmation Dialog */}
        <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {language === "ru" ? "Очистить историю чата?" : "Clear chat history?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {language === "ru" 
                  ? "Вся история переписки с ассистентом будет удалена. Это действие нельзя отменить."
                  : "All conversation history with the assistant will be deleted. This action cannot be undone."
                }
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-clear-chat">
                {language === "ru" ? "Отмена" : "Cancel"}
              </AlertDialogCancel>
              <AlertDialogAction 
                onClick={(e) => {
                  e.preventDefault();
                  clearMutation.mutate();
                }}
                disabled={clearMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-clear-chat"
              >
                {clearMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  language === "ru" ? "Очистить" : "Clear"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

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
                <img src={editoAvatar} alt="EDITO" className="w-16 h-16 rounded-lg mb-3 shadow-sm" />
                <h3 className="font-medium text-sm mb-1">EDITO</h3>
                <p className="text-xs text-muted-foreground text-center mb-4 px-2">
                  {language === "ru" 
                    ? "Спросите меня о фото и видео съёмке, монтаже, сценариях или подборе кадров" 
                    : "Ask me about photo and video shooting, editing, scripts, or finding the right shots"}
                </p>
                <div className="flex flex-col gap-1.5 w-full px-2">
                  {quickPrompts.slice(0, 2).map((prompt, i) => (
                    <Button key={i} variant="outline" size="sm" className="text-[10px] h-auto py-2 px-3 whitespace-normal text-left justify-start" onClick={() => { setInput(prompt); textareaRef.current?.focus(); }} data-testid={`button-quick-prompt-mobile-${i}`}>
                      {prompt}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {allMessages.map((msg, idx) => (
                  <div key={msg.id || idx} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`} data-testid={`chat-message-mobile-${msg.id || idx}`}>
                    {msg.role === "user" && user?.avatarId && user.avatarId > 0 ? (
                      <Avatar className="w-6 h-6 flex-shrink-0">
                        <AvatarImage src={getAvatarById(user.avatarId)} alt={user.nickname || "User"} className="object-cover" />
                        <AvatarFallback className="bg-accent text-[10px]">
                          {user?.nickname ? user.nickname.charAt(0).toUpperCase() : <User className="h-3 w-3" />}
                        </AvatarFallback>
                      </Avatar>
                    ) : msg.role === "assistant" ? (
                      <img src={editoAvatar} alt="EDITO" className="w-6 h-6 rounded flex-shrink-0" />
                    ) : (
                      <div className="w-6 h-6 rounded flex-shrink-0 flex items-center justify-center bg-accent">
                        {user?.nickname ? <span className="text-[10px]">{user.nickname.charAt(0).toUpperCase()}</span> : <User className="h-3 w-3" />}
                      </div>
                    )}
                    <div className={`flex flex-col max-w-[85%] ${msg.role === "user" ? "items-end" : "items-start"}`}>
                      <div className={`px-3 py-2 rounded-lg text-sm ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted/80 border border-border/50"}`}>
                        {msg.role === "assistant" ? (
                          <div className="prose prose-sm dark:prose-invert max-w-none text-xs"><MarkdownContent content={msg.content} /></div>
                        ) : (
                          <p className="whitespace-pre-wrap text-xs">{msg.content}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5 px-1">
                        <span className="text-[9px] text-muted-foreground font-mono">{formatTime(msg.createdAt)}</span>
                        {msg.role === "assistant" && typeof msg.id === "number" && (
                          <div className="flex items-center gap-0.5 ml-1">
                            {feedbackGiven[msg.id] ? (
                              <span className="text-[9px] text-green-500 flex items-center gap-0.5">
                                <Check className="h-2.5 w-2.5" />
                                {feedbackGiven[msg.id] === "positive" 
                                  ? (language === "ru" ? "Спасибо" : "Thanks") 
                                  : (language === "ru" ? "Записано" : "Noted")
                                }
                              </span>
                            ) : showReasonDropdown === msg.id ? (
                              <DropdownMenu open={true} onOpenChange={(open) => !open && setShowReasonDropdown(null)}>
                                <DropdownMenuTrigger asChild>
                                  <button className="h-4 w-4 flex items-center justify-center rounded text-destructive">
                                    <ThumbsDown className="h-2.5 w-2.5" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="min-w-[140px]">
                                  {feedbackReasons.map((reason) => (
                                    <DropdownMenuItem key={reason} onClick={() => handleFeedback(msg.id as number, "negative", reason)} className="text-xs">
                                      {feedbackReasonLabels[reason][language]}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : (
                              <>
                                <button 
                                  onClick={() => handleFeedback(msg.id as number, "positive")}
                                  className="h-4 w-4 flex items-center justify-center rounded text-muted-foreground/50 hover:text-green-500 transition-colors"
                                  data-testid={`button-feedback-up-${msg.id}`}
                                >
                                  <ThumbsUp className="h-2.5 w-2.5" />
                                </button>
                                <button 
                                  onClick={() => setShowReasonDropdown(msg.id as number)}
                                  className="h-4 w-4 flex items-center justify-center rounded text-muted-foreground/50 hover:text-destructive transition-colors"
                                  data-testid={`button-feedback-down-${msg.id}`}
                                >
                                  <ThumbsDown className="h-2.5 w-2.5" />
                                </button>
                                <button 
                                  onClick={() => addToNotes(msg.content)}
                                  className="h-4 w-4 flex items-center justify-center rounded text-muted-foreground/50 hover:text-amber-500 transition-colors"
                                  data-testid={`button-add-to-notes-${msg.id}`}
                                  title={language === "ru" ? "Добавить в заметки" : "Add to notes"}
                                >
                                  <StickyNote className="h-2.5 w-2.5" />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {isStreaming && !streamingContent && (
                  <div className="flex gap-2">
                    <img src={editoAvatar} alt="EDITO" className="w-6 h-6 rounded flex-shrink-0 animate-pulse" />
                    <div className="flex flex-col max-w-[85%]">
                      <div className="px-3 py-2 rounded-lg text-sm bg-muted/80 border border-primary/30 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-typing-dot" style={{ animationDelay: "0ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-typing-dot" style={{ animationDelay: "150ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-typing-dot" style={{ animationDelay: "300ms" }} />
                      </div>
                      <span className="text-[9px] text-primary mt-0.5 px-1 font-mono flex items-center gap-1">
                        {language === "ru" ? "думает..." : "thinking..."}
                      </span>
                    </div>
                  </div>
                )}
                {streamingContent && (
                  <div className="flex gap-2">
                    <img src={editoAvatar} alt="EDITO" className="w-6 h-6 rounded flex-shrink-0 animate-pulse" />
                    <div className="flex flex-col max-w-[85%]">
                      <div className="px-3 py-2 rounded-lg text-sm bg-muted/80 border border-primary/30">
                        <div className="prose prose-sm dark:prose-invert max-w-none text-xs"><MarkdownContent content={streamingContent} /></div>
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
              {activeNoteContent.length > 0 && (
                <span className="text-[9px] bg-amber-500/20 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full font-mono">{allNotes.length}</span>
              )}
            </button>
            <button
              onClick={() => { setMobileDrawerTab("archive"); setMobileDrawerOpen(true); }}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-md bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 active:scale-[0.98] transition-all"
              data-testid="button-open-archive-mobile"
            >
              <Archive className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-primary">
                {language === "ru" ? "Архив" : "Archive"}
              </span>
              {archivedSessions.length > 0 && (
                <span className="text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-mono">{archivedSessions.length}</span>
              )}
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
                  onClick={() => setMobileDrawerTab("archive")}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${mobileDrawerTab === "archive" ? "text-primary border-b-2 border-primary bg-primary/5" : "text-muted-foreground"}`}
                  data-testid="button-drawer-tab-archive"
                >
                  <Archive className="h-4 w-4" />
                  {language === "ru" ? "Архив" : "Archive"}
                </button>
              </div>

              {mobileDrawerTab === "notes" ? (
                <div className="flex flex-col h-[calc(70vh-48px)]">
                  {/* Notes List Header */}
                  <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-amber-500/5 to-orange-500/5 border-b border-amber-500/10">
                    <div className="flex items-center gap-2">
                      {activeNote && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => setShowNotesList(true)} 
                          className="h-7 text-xs gap-1"
                          data-testid="button-show-notes-list-mobile"
                        >
                          <Layers className="h-3 w-3" />
                          {language === "ru" ? "Все заметки" : "All notes"} ({allNotes.length})
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {activeNote && !showNotesList && (
                        <span className="text-[10px] text-muted-foreground">
                          {notesSaved ? <><Save className="h-3 w-3 inline text-green-500 mr-1" />{language === "ru" ? "Сохранено" : "Saved"}</> : <><Loader2 className="h-3 w-3 inline animate-spin mr-1" />{language === "ru" ? "..." : "..."}</>}
                        </span>
                      )}
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => { setIsCreatingNote(true); setShowNotesList(false); }}
                        className="h-7 text-xs"
                        data-testid="button-new-note-mobile"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        {language === "ru" ? "Новая" : "New"}
                      </Button>
                    </div>
                  </div>
                  
                  {/* Notes List or Active Note Editor */}
                  {isCreatingNote ? (
                    <div className="p-4 space-y-3">
                      <p className="text-sm text-muted-foreground">
                        {language === "ru" ? "Название новой заметки:" : "New note title:"}
                      </p>
                      <Input
                        value={newNoteTitle}
                        onChange={(e) => setNewNoteTitle(e.target.value)}
                        placeholder={language === "ru" ? "Моя заметка..." : "My note..."}
                        className="text-sm"
                        data-testid="input-new-note-title-mobile"
                      />
                      <div className="flex gap-2">
                        <Button
                          onClick={() => { createNoteMutation.mutate(newNoteTitle || (language === "ru" ? "Новая заметка" : "New note")); }}
                          disabled={createNoteMutation.isPending}
                          size="sm"
                          className="flex-1"
                          data-testid="button-create-note-mobile"
                        >
                          {createNoteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                          {language === "ru" ? "Создать" : "Create"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => { setIsCreatingNote(false); setNewNoteTitle(""); }}
                          size="sm"
                          data-testid="button-cancel-create-note-mobile"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ) : showNotesList || !activeNote ? (
                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                      {allNotes.length === 0 ? (
                        <div className="py-8 text-center text-sm text-muted-foreground">
                          <StickyNote className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          {language === "ru" ? "Нет заметок" : "No notes"}
                          <p className="text-xs mt-1">{language === "ru" ? "Создайте первую заметку" : "Create your first note"}</p>
                        </div>
                      ) : (
                        allNotes.map((note) => (
                          <button
                            key={note.id}
                            onClick={() => { activateNoteMutation.mutate(note.id); setShowNotesList(false); }}
                            disabled={activateNoteMutation.isPending}
                            className={`w-full flex items-start gap-3 p-3 rounded-lg transition-colors text-left ${activeNote?.id === note.id ? "bg-amber-500/20 border border-amber-500/30" : "bg-muted/50 hover:bg-muted"}`}
                            data-testid={`button-select-note-mobile-${note.id}`}
                          >
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${activeNote?.id === note.id ? "bg-amber-500" : "bg-amber-500/20"}`}>
                              <StickyNote className={`h-4 w-4 ${activeNote?.id === note.id ? "text-white" : "text-amber-600"}`} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{note.title}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {format(new Date(note.createdAt), "dd.MM.yyyy", { locale: language === "ru" ? ru : enUS })}
                                {note.content && ` • ${note.content.length} ${language === "ru" ? "симв." : "chars"}`}
                              </p>
                            </div>
                            {activeNote?.id === note.id && <Check className="h-4 w-4 text-amber-500 flex-shrink-0 mt-1" />}
                          </button>
                        ))
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col flex-1">
                      <div className="flex items-center justify-between px-4 py-1.5 border-b border-amber-500/10">
                        <span className="text-xs font-medium truncate max-w-[200px]">{activeNote.title}</span>
                        <Button variant="ghost" size="sm" onClick={() => handleNotesChange("")} disabled={activeNoteContent.length === 0} className="h-6 text-[10px] px-2" data-testid="button-clear-notes-drawer">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <Textarea
                        value={activeNoteContent}
                        onChange={(e) => handleNotesChange(e.target.value)}
                        placeholder={language === "ru" ? "Записывайте важные идеи из чата здесь..." : "Write down important ideas from chat here..."}
                        className="flex-1 resize-none border-0 rounded-none bg-gradient-to-b from-amber-500/5 via-transparent to-orange-500/5 focus-visible:ring-0 text-sm px-4 notes-scrollbar notebook-lined"
                        data-testid="input-notes-drawer"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 space-y-3 overflow-y-auto h-[calc(70vh-48px)]">
                  <p className="text-xs text-muted-foreground mb-3">
                    {language === "ru" ? "Нажмите, чтобы восстановить и продолжить" : "Tap to restore and continue"}
                  </p>
                  {archivedSessions.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      {language === "ru" ? "Нет архивированных чатов" : "No archived chats"}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {archivedSessions.map((session) => (
                        <button
                          key={session.archivedAt}
                          onClick={() => { unarchiveMutation.mutate(session.archivedAt); setMobileDrawerOpen(false); }}
                          disabled={unarchiveMutation.isPending}
                          className="w-full flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-left"
                          data-testid={`button-restore-archive-mobile-${session.archivedAt}`}
                        >
                          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center flex-shrink-0">
                            <Clock className="h-5 w-5 text-primary-foreground" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium line-clamp-2">
                              {session.preview.slice(0, 80)}{session.preview.length > 80 ? "..." : ""}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {format(new Date(session.archivedAt), "dd.MM.yyyy HH:mm", { locale: language === "ru" ? ru : enUS })}
                              {" • "}
                              {session.messageCount} {language === "ru" ? "сообщений" : "messages"}
                            </p>
                          </div>
                          <RotateCcw className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </SheetContent>
          </Sheet>
        </div>
      </div>
      {/* DESKTOP LAYOUT */}
      <div className="hidden lg:flex items-stretch gap-4 h-[calc(100vh-3.5rem)] mx-6 overflow-hidden ml-[24px] mr-[24px] mt-[16px] mb-[4px] pt-[0px] pb-[0px]">
        <div className="flex flex-col flex-1 bg-background rounded-md border overflow-hidden h-full">
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
                  <DropdownMenuItem 
                    onClick={() => archiveMutation.mutate()}
                    disabled={archiveMutation.isPending || totalMessages === 0}
                  >
                    <Archive className="h-4 w-4 mr-2" />
                    {language === "ru" ? "Архивировать" : "Archive"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setShowClearDialog(true)} disabled={clearMutation.isPending || totalMessages === 0} className="text-destructive">
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

          <ScrollArea className="flex-1 relative bg-card/40" ref={scrollAreaRef}>
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
                  <img src={editoAvatar} alt="EDITO" className="w-20 h-20 rounded-xl mb-4 shadow-md" />
                  <h3 className="font-semibold text-lg mb-2 text-center">
                    {language === "ru" ? "Привет! Я ваш видео-ассистент EDITO (Эдито)." : "Hi! I'm your video assistant EDITO."}
                  </h3>
                  <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">
                    {language === "ru"
                      ? "Вы можете меня просить о чем угодно связанном с фото и видео съемками, монтажем и улучшением. Так же я готов вам помочь в ваших сценариях, советами, или помочь найти подходящие кадры."
                      : "You can ask me about anything related to photo and video shooting, editing and enhancement. I'm also ready to help you with your scripts, advice, or finding the right shots."}
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
                      {msg.role === "assistant" ? (
                        <img src={editoAvatar} alt="EDITO" className="w-8 h-8 rounded-full flex-shrink-0" />
                      ) : (
                        <Avatar className="w-8 h-8 flex-shrink-0">
                          {user?.avatarId && user.avatarId > 0 ? (
                            <AvatarImage src={getAvatarById(user.avatarId)} alt={user.nickname || "User"} className="object-cover" />
                          ) : null}
                          <AvatarFallback className="bg-accent text-accent-foreground">
                            {user?.nickname ? user.nickname.charAt(0).toUpperCase() : <User className="h-4 w-4" />}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      
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
                              <MarkdownContent content={msg.content} />
                            </div>
                          ) : (
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 px-1">
                          <span className="text-[10px] text-muted-foreground">
                            {formatTime(msg.createdAt)}
                          </span>
                          {msg.role === "assistant" && typeof msg.id === "number" && (
                            <div className="flex items-center gap-1">
                              {feedbackGiven[msg.id] ? (
                                <span className="text-[10px] text-green-500 flex items-center gap-1">
                                  <Check className="h-3 w-3" />
                                  {feedbackGiven[msg.id] === "positive" 
                                    ? (language === "ru" ? "Спасибо" : "Thanks") 
                                    : (language === "ru" ? "Записано" : "Noted")
                                  }
                                </span>
                              ) : showReasonDropdown === msg.id ? (
                                <DropdownMenu open={true} onOpenChange={(open) => !open && setShowReasonDropdown(null)}>
                                  <DropdownMenuTrigger asChild>
                                    <button className="h-5 w-5 flex items-center justify-center rounded text-destructive">
                                      <ThumbsDown className="h-3 w-3" />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="start" className="min-w-[160px]">
                                    {feedbackReasons.map((reason) => (
                                      <DropdownMenuItem key={reason} onClick={() => handleFeedback(msg.id as number, "negative", reason)} className="text-xs">
                                        {feedbackReasonLabels[reason][language]}
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              ) : (
                                <>
                                  <button 
                                    onClick={() => handleFeedback(msg.id as number, "positive")}
                                    className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground/40 hover:text-green-500 transition-colors"
                                    data-testid={`button-feedback-up-desktop-${msg.id}`}
                                  >
                                    <ThumbsUp className="h-3 w-3" />
                                  </button>
                                  <button 
                                    onClick={() => setShowReasonDropdown(msg.id as number)}
                                    className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground/40 hover:text-destructive transition-colors"
                                    data-testid={`button-feedback-down-desktop-${msg.id}`}
                                  >
                                    <ThumbsDown className="h-3 w-3" />
                                  </button>
                                  <button 
                                    onClick={() => addToNotes(msg.content)}
                                    className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground/40 hover:text-amber-500 transition-colors"
                                    data-testid={`button-add-to-notes-desktop-${msg.id}`}
                                    title={language === "ru" ? "Добавить в заметки" : "Add to notes"}
                                  >
                                    <StickyNote className="h-3 w-3" />
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {isStreaming && !streamingContent && (
                    <div className="flex gap-3 flex-row">
                      <img src={editoAvatar} alt="EDITO" className="w-8 h-8 rounded-full flex-shrink-0 animate-pulse" />
                      
                      <div className="flex flex-col max-w-[80%] items-start">
                        <div className="px-4 py-2.5 rounded-2xl rounded-bl-md text-sm bg-muted flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-primary animate-typing-dot" style={{ animationDelay: "0ms" }} />
                          <span className="w-2 h-2 rounded-full bg-primary animate-typing-dot" style={{ animationDelay: "150ms" }} />
                          <span className="w-2 h-2 rounded-full bg-primary animate-typing-dot" style={{ animationDelay: "300ms" }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground mt-1 px-1 flex items-center gap-1">
                          {language === "ru" ? "Думает..." : "Thinking..."}
                        </span>
                      </div>
                    </div>
                  )}
                  {streamingContent && (
                    <div className="flex gap-3 flex-row">
                      <img src={editoAvatar} alt="EDITO" className="w-8 h-8 rounded-full flex-shrink-0 animate-pulse" />
                      
                      <div className="flex flex-col max-w-[80%] items-start">
                        <div className="px-4 py-2.5 rounded-2xl rounded-bl-md text-sm bg-muted">
                          <div className="prose prose-sm dark:prose-invert max-w-none">
                            <MarkdownContent content={streamingContent} />
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

          <div className="p-3 border-t bg-card/50 backdrop-blur-sm flex-shrink-0 pt-[5px] pb-[5px] pl-[10px] pr-[10px] ml-[0px] mr-[0px]">
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
            <div className="flex items-center gap-2 px-3 py-2 border-b bg-gradient-to-r from-amber-500/10 to-orange-500/10">
              {isCreatingNote ? (
                <div className="flex items-center gap-2 flex-1">
                  <Input
                    value={newNoteTitle}
                    onChange={(e) => setNewNoteTitle(e.target.value)}
                    placeholder={language === "ru" ? "Название..." : "Title..."}
                    className="h-8 text-sm flex-1"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newNoteTitle.trim()) {
                        createNoteMutation.mutate(newNoteTitle.trim());
                      } else if (e.key === "Escape") {
                        setIsCreatingNote(false);
                        setNewNoteTitle("");
                      }
                    }}
                    data-testid="input-new-note-title"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => {
                      if (newNoteTitle.trim()) {
                        createNoteMutation.mutate(newNoteTitle.trim());
                      }
                    }}
                    disabled={!newNoteTitle.trim() || createNoteMutation.isPending}
                    data-testid="button-confirm-create-note"
                  >
                    {createNoteMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4 text-green-500" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => { setIsCreatingNote(false); setNewNoteTitle(""); }}
                    data-testid="button-cancel-create-note"
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ) : showNotesList ? (
                <div className="flex items-center gap-2 flex-1">
                  <StickyNote className="h-4 w-4 text-amber-500 flex-shrink-0" />
                  <span className="text-sm font-medium flex-1">
                    {language === "ru" ? "Заметки" : "Notes"}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => setIsCreatingNote(true)}
                    data-testid="button-create-new-note"
                  >
                    <Plus className="h-4 w-4 text-amber-500" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setShowNotesList(true)}
                    data-testid="button-back-to-notes-list"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <StickyNote className="h-4 w-4 text-amber-500 flex-shrink-0" />
                  <span className="truncate text-sm font-medium flex-1">
                    {activeNote?.title || (language === "ru" ? "Заметка" : "Note")}
                  </span>
                  <span className="text-[9px] text-muted-foreground flex items-center">
                    {notesSaved ? <Save className="h-2.5 w-2.5 text-green-500" /> : <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                  </span>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        className="h-7 w-7"
                        disabled={activeNoteContent.length === 0}
                        data-testid="button-clear-notes"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {language === "ru" ? "Очистить содержимое?" : "Clear content?"}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {language === "ru" 
                            ? "Содержимое этой заметки будет удалено."
                            : "The content of this note will be deleted."
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
              )}
            </div>
            
            <div className="flex-1 min-h-0 overflow-hidden">
              {showNotesList && !isCreatingNote ? (
                <ScrollArea className="h-full">
                  <div className="p-2 space-y-1 max-w-full">
                    {allNotes.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <StickyNote className="h-10 w-10 text-amber-500/30 mb-3" />
                        <p className="text-sm text-muted-foreground mb-2">
                          {language === "ru" ? "Нет заметок" : "No notes yet"}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setIsCreatingNote(true)}
                          className="gap-2"
                          data-testid="button-create-first-note"
                        >
                          <Plus className="h-4 w-4" />
                          {language === "ru" ? "Создать первую" : "Create first"}
                        </Button>
                      </div>
                    ) : (
                      allNotes.map((note) => (
                        <div
                          key={note.id}
                          onClick={() => activateNoteMutation.mutate(note.id)}
                          className={`flex items-center gap-2 p-2.5 rounded-md cursor-pointer transition-colors max-w-full ${
                            note.isActive ? "bg-amber-500/10 border border-amber-500/30" : "bg-muted/30 hover:bg-muted/50"
                          }`}
                          data-testid={`button-select-note-${note.id}`}
                        >
                          <StickyNote className={`h-5 w-5 flex-shrink-0 ${note.isActive ? "text-amber-500" : "text-muted-foreground"}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{note.title}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {note.content ? note.content.substring(0, 50) + (note.content.length > 50 ? "..." : "") : (language === "ru" ? "Пусто" : "Empty")}
                            </p>
                          </div>
                          {note.isActive && <Check className="h-4 w-4 text-amber-500 flex-shrink-0" />}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 opacity-50 hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteNoteMutation.mutate(note.id);
                            }}
                            data-testid={`button-delete-note-${note.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              ) : (
                <Textarea
                  value={activeNoteContent}
                  onChange={(e) => handleNotesChange(e.target.value)}
                  placeholder={language === "ru" 
                    ? "Записывайте важные идеи, ссылки, советы из чата..."
                    : "Write down important ideas, links, tips from the chat..."
                  }
                  className="h-full w-full resize-none border-0 rounded-none bg-card focus-visible:ring-0 text-sm p-3 overflow-y-auto notes-scrollbar notebook-lined"
                  data-testid="input-notes"
                />
              )}
            </div>
            
            <div className="px-4 py-2 border-t bg-muted/30">
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <FileText className="h-3 w-3" />
                <span>
                  {activeNote 
                    ? (activeNoteContent.length > 0 
                      ? (language === "ru" ? `${activeNoteContent.length} символов` : `${activeNoteContent.length} characters`)
                      : (language === "ru" ? "Пусто" : "Empty"))
                    : (language === "ru" ? "Нет активной заметки" : "No active note")
                  }
                </span>
              </div>
            </div>
          </Card>
          
          <Card className="flex flex-col flex-shrink-0 overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b bg-gradient-to-r from-primary/10 to-primary/5">
              <div className="w-8 h-8 rounded-md bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
                <Archive className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="flex-1">
                <h2 className="text-sm font-semibold">
                  {language === "ru" ? "Архив чатов" : "Chat Archive"}
                </h2>
                <p className="text-[10px] text-muted-foreground">
                  {language === "ru" ? "Сохраненные разговоры" : "Saved conversations"}
                </p>
              </div>
            </div>
            
            <div className="p-2 space-y-1 max-h-[200px] overflow-y-auto notes-scrollbar">
              {archivedSessions.length === 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  {language === "ru" ? "Нет архивированных чатов" : "No archived chats"}
                </div>
              ) : (
                archivedSessions.map((session) => (
                  <Button
                    key={session.archivedAt}
                    variant="ghost"
                    className="w-full justify-start gap-3 h-auto py-2.5 px-3"
                    onClick={() => unarchiveMutation.mutate(session.archivedAt)}
                    disabled={unarchiveMutation.isPending}
                    data-testid={`button-restore-archive-${session.archivedAt}`}
                  >
                    <Clock className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm truncate">
                        {session.preview.slice(0, 50)}{session.preview.length > 50 ? "..." : ""}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {format(new Date(session.archivedAt), "dd.MM.yyyy HH:mm", { locale: language === "ru" ? ru : enUS })}
                        {" • "}
                        {session.messageCount} {language === "ru" ? "сообщ." : "msg"}
                      </p>
                    </div>
                    <RotateCcw className="h-3.5 w-3.5 ml-auto text-muted-foreground flex-shrink-0" />
                  </Button>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
