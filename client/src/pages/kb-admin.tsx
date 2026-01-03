import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import {
  File,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  RefreshCw,
  Save,
  Eye,
  Edit3,
  FileText,
  Database,
  Search,
  Loader2,
  Check,
  X,
  AlertCircle,
  FolderPlus,
  FilePlus,
  Layers,
  Sparkles,
  BookOpen,
  Settings2,
  ChevronLeft,
  SplitSquareVertical,
  Bot,
  RotateCcw,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/layout";
import ReactMarkdown from "react-markdown";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

interface FileNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: FileNode[];
  modifiedAt?: string;
  size?: number;
}

interface IndexDoc {
  id: string;
  title: string;
  filePath: string | null;
  tags: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  chunksCount: number;
  chunks: { id: string; chunkIndex: number; preview: string; contentHash: string }[];
}

interface IndexStats {
  documents: IndexDoc[];
  totalDocs: number;
  totalChunks: number;
  totalEmbeddings: number;
}

interface RetrievalResult {
  score: number;
  chunkId: string;
  docId: string;
  docTitle: string;
  filePath: string | null;
  preview: string;
  chunkIndex: number;
}

const TEMPLATES = [
  { key: "style_guide", label: { ru: "Гайд по стилю", en: "Style Guide" } },
  { key: "checklist", label: { ru: "Чеклист", en: "Checklist" } },
  { key: "template", label: { ru: "Шаблон", en: "Template" } },
  { key: "example", label: { ru: "Пример", en: "Example" } },
];

function FileTreeNode({ node, selectedPath, onSelect, expandedPaths, toggleExpand, level = 0 }: {
  node: FileNode;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  expandedPaths: Set<string>;
  toggleExpand: (path: string) => void;
  level?: number;
}) {
  const isExpanded = expandedPaths.has(node.path);
  const isSelected = selectedPath === node.path;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 px-2 py-1 rounded-sm cursor-pointer text-sm",
          "hover-elevate active-elevate-2",
          isSelected && "bg-accent"
        )}
        style={{ paddingLeft: `${8 + level * 12}px` }}
        onClick={() => {
          if (node.type === "folder") {
            toggleExpand(node.path);
          } else {
            onSelect(node.path);
          }
        }}
        data-testid={`tree-node-${node.path}`}
      >
        {node.type === "folder" ? (
          <>
            {isExpanded ? (
              <ChevronDown className="w-3 h-3 shrink-0" />
            ) : (
              <ChevronRight className="w-3 h-3 shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen className="w-4 h-4 shrink-0 text-amber-500" />
            ) : (
              <Folder className="w-4 h-4 shrink-0 text-amber-500" />
            )}
          </>
        ) : (
          <>
            <span className="w-3" />
            <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
          </>
        )}
        <span className="truncate">{node.name}</span>
      </div>
      {node.type === "folder" && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              selectedPath={selectedPath}
              onSelect={onSelect}
              expandedPaths={expandedPaths}
              toggleExpand={toggleExpand}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function KbAdminPage() {
  const { t, language } = useI18n();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [editorContent, setEditorContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<"editor" | "preview">("editor");
  const [activePanel, setActivePanel] = useState<"index" | "search" | "bot">("index");

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createFolderDialogOpen, setCreateFolderDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [newFileTitle, setNewFileTitle] = useState("");
  const [newFileTags, setNewFileTags] = useState("");
  const [newFileTemplate, setNewFileTemplate] = useState("");
  const [newFolderName, setNewFolderName] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<RetrievalResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());
  
  const [editChunkDialogOpen, setEditChunkDialogOpen] = useState(false);
  const [editingChunkId, setEditingChunkId] = useState<string | null>(null);
  const [editingChunkContent, setEditingChunkContent] = useState("");
  const [chunkPreviewOpen, setChunkPreviewOpen] = useState(false);
  const [previewChunks, setPreviewChunks] = useState<string[]>([]);
  
  // Bot settings state
  const [botName, setBotName] = useState("EDITO");
  const [botRole, setBotRole] = useState("");
  const [botPersonality, setBotPersonality] = useState("");
  const [botSystemPrompt, setBotSystemPrompt] = useState("");
  const [botResponseStyle, setBotResponseStyle] = useState("expert");
  const [botMaxHistory, setBotMaxHistory] = useState(20);
  const [botSettingsChanged, setBotSettingsChanged] = useState(false);
  
  const SUGGESTED_TAGS = [
    { tag: "style", label: { ru: "Стиль", en: "Style" } },
    { tag: "guide", label: { ru: "Гайд", en: "Guide" } },
    { tag: "checklist", label: { ru: "Чеклист", en: "Checklist" } },
    { tag: "template", label: { ru: "Шаблон", en: "Template" } },
    { tag: "example", label: { ru: "Пример", en: "Example" } },
    { tag: "монтаж", label: { ru: "Монтаж", en: "Editing" } },
    { tag: "shorts", label: { ru: "Shorts", en: "Shorts" } },
    { tag: "sfx", label: { ru: "SFX", en: "SFX" } },
    { tag: "music", label: { ru: "Музыка", en: "Music" } },
    { tag: "hooks", label: { ru: "Хуки", en: "Hooks" } },
    { tag: "scripts", label: { ru: "Скрипты", en: "Scripts" } },
  ];
  
  const SUGGESTED_FOLDERS = [
    { path: "style_guides", label: { ru: "Гайды по стилям", en: "Style Guides" } },
    { path: "checklists", label: { ru: "Чеклисты", en: "Checklists" } },
    { path: "templates", label: { ru: "Шаблоны", en: "Templates" } },
    { path: "examples", label: { ru: "Примеры", en: "Examples" } },
  ];

  const { data: treeData, refetch: refetchTree } = useQuery<{ tree: FileNode[]; root: string }>({
    queryKey: ["/api/kb-admin/fs/tree"],
  });

  const { data: indexStats, refetch: refetchIndex, isLoading: indexLoading } = useQuery<IndexStats>({
    queryKey: ["/api/kb-admin/index/stats"],
  });

  interface BotSettings {
    name: string;
    role: string;
    personality: string;
    systemPrompt: string;
    responseStyle: string;
    maxHistoryMessages: number;
    updatedAt?: string;
  }

  const { data: botSettings, refetch: refetchBotSettings, isLoading: botSettingsLoading } = useQuery<BotSettings>({
    queryKey: ["/api/kb-admin/bot/settings"],
  });

  useEffect(() => {
    if (botSettings) {
      setBotName(botSettings.name || "EDITO");
      setBotRole(botSettings.role || "");
      setBotPersonality(botSettings.personality || "");
      setBotSystemPrompt(botSettings.systemPrompt || "");
      setBotResponseStyle(botSettings.responseStyle || "expert");
      setBotMaxHistory(botSettings.maxHistoryMessages || 20);
      setBotSettingsChanged(false);
    }
  }, [botSettings]);

  const saveBotSettingsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/kb-admin/bot/settings", {
        name: botName,
        role: botRole,
        personality: botPersonality,
        systemPrompt: botSystemPrompt,
        responseStyle: botResponseStyle,
        maxHistoryMessages: botMaxHistory,
      });
      return res.json();
    },
    onSuccess: () => {
      setBotSettingsChanged(false);
      refetchBotSettings();
      toast({ title: language === "ru" ? "Настройки сохранены" : "Settings saved" });
    },
    onError: () => {
      toast({ title: language === "ru" ? "Ошибка сохранения" : "Save error", variant: "destructive" });
    },
  });

  const resetBotSettingsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/kb-admin/bot/settings/reset", {});
      return res.json();
    },
    onSuccess: () => {
      refetchBotSettings();
      toast({ title: language === "ru" ? "Настройки сброшены" : "Settings reset" });
    },
  });

  const loadFileMutation = useMutation({
    mutationFn: async (path: string) => {
      const res = await fetch(`/api/kb-admin/fs/file?path=${encodeURIComponent(path)}`);
      if (!res.ok) throw new Error("Failed to load file");
      return res.json();
    },
    onSuccess: (data) => {
      setEditorContent(data.content);
      setOriginalContent(data.content);
      setIsEditing(false);
    },
  });

  const saveFileMutation = useMutation({
    mutationFn: async ({ path, content }: { path: string; content: string }) => {
      const res = await apiRequest("POST", "/api/kb-admin/fs/file", { path, content });
      return res.json();
    },
    onSuccess: () => {
      setOriginalContent(editorContent);
      setIsEditing(false);
      toast({ title: language === "ru" ? "Файл сохранен" : "File saved" });
    },
    onError: () => {
      toast({ title: language === "ru" ? "Ошибка сохранения" : "Save error", variant: "destructive" });
    },
  });

  const createFileMutation = useMutation({
    mutationFn: async (data: { folderPath?: string; title: string; tags: string[]; templateKey?: string }) => {
      const res = await apiRequest("POST", "/api/kb-admin/fs/create", data);
      return res.json();
    },
    onSuccess: (data) => {
      setCreateDialogOpen(false);
      setNewFileTitle("");
      setNewFileTags("");
      setNewFileTemplate("");
      refetchTree();
      setSelectedPath(data.path);
      loadFileMutation.mutate(data.path);
      toast({ title: language === "ru" ? "Файл создан" : "File created" });
    },
    onError: () => {
      toast({ title: language === "ru" ? "Ошибка создания" : "Create error", variant: "destructive" });
    },
  });

  const createFolderMutation = useMutation({
    mutationFn: async (path: string) => {
      const res = await apiRequest("POST", "/api/kb-admin/fs/folder", { path });
      return res.json();
    },
    onSuccess: () => {
      setCreateFolderDialogOpen(false);
      setNewFolderName("");
      refetchTree();
      toast({ title: language === "ru" ? "Папка создана" : "Folder created" });
    },
  });

  const deleteFileMutation = useMutation({
    mutationFn: async (path: string) => {
      const res = await apiRequest("DELETE", "/api/kb-admin/fs/file", { path });
      return res.json();
    },
    onSuccess: () => {
      setDeleteDialogOpen(false);
      setSelectedPath(null);
      setEditorContent("");
      setOriginalContent("");
      refetchTree();
      toast({ title: language === "ru" ? "Файл удален" : "File deleted" });
    },
  });

  const reindexAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/kb-admin/index/reindexAll", {});
      return res.json();
    },
    onSuccess: (data) => {
      refetchIndex();
      toast({
        title: language === "ru" ? "Индексация завершена" : "Reindex complete",
        description: `${data.documentsIngested} docs, ${data.chunksCreated} chunks`,
      });
    },
    onError: (error: any) => {
      const msg = error?.message || (language === "ru" ? "Ошибка индексации" : "Reindex error");
      toast({ 
        title: language === "ru" ? "Ошибка индексации" : "Reindex error", 
        description: msg,
        variant: "destructive" 
      });
    },
  });
  
  const loadChunkMutation = useMutation({
    mutationFn: async (chunkId: string) => {
      const res = await fetch(`/api/kb-admin/index/chunk/${chunkId}`);
      if (!res.ok) throw new Error("Failed to load chunk");
      return res.json();
    },
    onSuccess: (data) => {
      setEditingChunkContent(data.content);
      setEditChunkDialogOpen(true);
    },
    onError: () => {
      toast({ title: language === "ru" ? "Ошибка загрузки чанка" : "Failed to load chunk", variant: "destructive" });
    },
  });
  
  const updateChunkMutation = useMutation({
    mutationFn: async ({ chunkId, content }: { chunkId: string; content: string }) => {
      const res = await apiRequest("PUT", `/api/kb-admin/index/chunk/${chunkId}`, { content });
      return res.json();
    },
    onSuccess: () => {
      setEditChunkDialogOpen(false);
      setEditingChunkId(null);
      setEditingChunkContent("");
      refetchIndex();
      toast({ title: language === "ru" ? "Чанк обновлен" : "Chunk updated" });
    },
    onError: (error: any) => {
      const msg = error?.message || (language === "ru" ? "Ошибка обновления" : "Update error");
      toast({ title: msg, variant: "destructive" });
    },
  });
  
  const previewChunksMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", "/api/kb-admin/index/previewChunks", { content });
      return res.json();
    },
    onSuccess: (data) => {
      setPreviewChunks(data.chunks);
      setChunkPreviewOpen(true);
    },
    onError: () => {
      toast({ title: language === "ru" ? "Ошибка предпросмотра" : "Preview error", variant: "destructive" });
    },
  });

  const reindexFileMutation = useMutation({
    mutationFn: async (path: string) => {
      const res = await apiRequest("POST", "/api/kb-admin/index/reindexFile", { path });
      return res.json();
    },
    onSuccess: (data) => {
      refetchIndex();
      toast({
        title: language === "ru" ? "Файл переиндексирован" : "File reindexed",
        description: `${data.chunksCount} chunks`,
      });
    },
    onError: () => {
      toast({ title: language === "ru" ? "Ошибка индексации" : "Reindex error", variant: "destructive" });
    },
  });

  const deleteDocMutation = useMutation({
    mutationFn: async ({ docId, keepFile }: { docId: string; keepFile: boolean }) => {
      const res = await apiRequest("DELETE", "/api/kb-admin/index/document", { docId, keepFile });
      return res.json();
    },
    onSuccess: () => {
      refetchIndex();
      toast({ title: language === "ru" ? "Документ удален из индекса" : "Document removed from index" });
    },
  });

  const toggleDocActive = useMutation({
    mutationFn: async ({ docId, isActive }: { docId: string; isActive: boolean }) => {
      const res = await apiRequest("POST", "/api/kb-admin/index/deactivate", { docId, isActive });
      return res.json();
    },
    onSuccess: () => {
      refetchIndex();
    },
  });

  const toggleExpand = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleSelectFile = useCallback((path: string) => {
    setSelectedPath(path);
    loadFileMutation.mutate(path);
  }, []);

  const handleSave = () => {
    if (selectedPath) {
      saveFileMutation.mutate({ path: selectedPath, content: editorContent });
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const response = await apiRequest("POST", "/api/kb-admin/retrieve", {
        query: searchQuery,
        topK: 10,
      });
      const res = await response.json();
      setSearchResults(res.results || []);
    } catch (err) {
      toast({ title: language === "ru" ? "Ошибка поиска" : "Search error", variant: "destructive" });
    } finally {
      setIsSearching(false);
    }
  };

  const hasUnsavedChanges = editorContent !== originalContent;

  const currentFolder = selectedPath ? selectedPath.split("/").slice(0, -1).join("/") : "";

  return (
    <Layout>
      <div className="hidden md:flex h-full">
        <div className="w-64 border-r flex flex-col shrink-0">
          <div className="p-3 border-b flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              <span className="font-medium text-sm">
                {language === "ru" ? "База знаний" : "Knowledge Base"}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setCreateDialogOpen(true)}
                    data-testid="button-create-file"
                  >
                    <FilePlus className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{language === "ru" ? "Новый файл" : "New file"}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setCreateFolderDialogOpen(true)}
                    data-testid="button-create-folder"
                  >
                    <FolderPlus className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{language === "ru" ? "Новая папка" : "New folder"}</TooltipContent>
              </Tooltip>
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2">
              {treeData?.tree?.map((node) => (
                <FileTreeNode
                  key={node.path}
                  node={node}
                  selectedPath={selectedPath}
                  onSelect={handleSelectFile}
                  expandedPaths={expandedPaths}
                  toggleExpand={toggleExpand}
                />
              ))}
              {(!treeData?.tree || treeData.tree.length === 0) && (
                <div className="text-sm text-muted-foreground p-4 text-center">
                  {language === "ru" ? "Нет файлов" : "No files"}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          <div className="p-3 border-b flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {selectedPath ? (
                <>
                  <FileText className="w-4 h-4 shrink-0" />
                  <span className="text-sm truncate">{selectedPath}</span>
                  {hasUnsavedChanges && (
                    <Badge variant="secondary" className="shrink-0">
                      {language === "ru" ? "изменено" : "modified"}
                    </Badge>
                  )}
                </>
              ) : (
                <span className="text-sm text-muted-foreground">
                  {language === "ru" ? "Выберите файл" : "Select a file"}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {selectedPath && (
                <>
                  <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="mr-2">
                    <TabsList className="h-8">
                      <TabsTrigger value="editor" className="text-xs px-3 h-6">
                        <Edit3 className="w-3 h-3 mr-1" />
                        {language === "ru" ? "Редактор" : "Editor"}
                      </TabsTrigger>
                      <TabsTrigger value="preview" className="text-xs px-3 h-6">
                        <Eye className="w-3 h-3 mr-1" />
                        {language === "ru" ? "Просмотр" : "Preview"}
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => previewChunksMutation.mutate(editorContent)}
                          disabled={previewChunksMutation.isPending || !editorContent.trim()}
                          data-testid="button-preview-chunks"
                        >
                          {previewChunksMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <SplitSquareVertical className="w-4 h-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {language === "ru" ? "Предпросмотр чанков" : "Preview Chunks"}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => reindexFileMutation.mutate(selectedPath)}
                          disabled={reindexFileMutation.isPending}
                          data-testid="button-reindex-file"
                        >
                          {reindexFileMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {language === "ru" ? "Переиндексировать" : "Reindex"}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleteDialogOpen(true)}
                    data-testid="button-delete-file"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={!hasUnsavedChanges || saveFileMutation.isPending}
                    data-testid="button-save-file"
                  >
                    {saveFileMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-1" />
                    )}
                    {language === "ru" ? "Сохранить" : "Save"}
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-hidden">
            {loadFileMutation.isPending ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : selectedPath ? (
              activeTab === "editor" ? (
                <Textarea
                  value={editorContent}
                  onChange={(e) => setEditorContent(e.target.value)}
                  className="w-full h-full resize-none rounded-none border-0 font-mono text-sm focus-visible:ring-0"
                  placeholder={language === "ru" ? "Содержимое файла..." : "File content..."}
                  data-testid="textarea-editor"
                />
              ) : (
                <ScrollArea className="h-full">
                  <div className="p-4 prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{editorContent}</ReactMarkdown>
                  </div>
                </ScrollArea>
              )
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4">
                <BookOpen className="w-12 h-12" />
                <p>{language === "ru" ? "Выберите файл для редактирования" : "Select a file to edit"}</p>
              </div>
            )}
          </div>
        </div>

        <div className="w-80 border-l flex flex-col shrink-0">
          <div className="p-3 border-b">
            <Tabs value={activePanel} onValueChange={(v) => setActivePanel(v as any)}>
              <TabsList className="w-full grid grid-cols-3">
                <TabsTrigger value="index" className="text-xs">
                  <Database className="w-3 h-3 mr-1" />
                  {language === "ru" ? "Индекс" : "Index"}
                </TabsTrigger>
                <TabsTrigger value="search" className="text-xs">
                  <Search className="w-3 h-3 mr-1" />
                  {language === "ru" ? "Поиск" : "Search"}
                </TabsTrigger>
                <TabsTrigger value="bot" className="text-xs">
                  <Bot className="w-3 h-3 mr-1" />
                  {language === "ru" ? "Бот" : "Bot"}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <ScrollArea className="flex-1">
            {activePanel === "index" ? (
              <div className="p-3 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm">
                    <span className="font-medium">{indexStats?.totalDocs || 0}</span>{" "}
                    <span className="text-muted-foreground">
                      {language === "ru" ? "документов" : "documents"}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => reindexAllMutation.mutate()}
                    disabled={reindexAllMutation.isPending}
                    data-testid="button-reindex-all"
                  >
                    {reindexAllMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-1" />
                    )}
                    {language === "ru" ? "Переиндексировать" : "Reindex All"}
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Card className="p-3">
                    <div className="text-lg font-semibold">{indexStats?.totalChunks || 0}</div>
                    <div className="text-xs text-muted-foreground">
                      {language === "ru" ? "чанков" : "chunks"}
                    </div>
                  </Card>
                  <Card className="p-3">
                    <div className="text-lg font-semibold">{indexStats?.totalEmbeddings || 0}</div>
                    <div className="text-xs text-muted-foreground">
                      {language === "ru" ? "эмбеддингов" : "embeddings"}
                    </div>
                  </Card>
                </div>

                <div className="space-y-2">
                  {indexStats?.documents?.map((doc) => (
                    <Collapsible
                      key={doc.id}
                      open={expandedDocs.has(doc.id)}
                      onOpenChange={() => {
                        setExpandedDocs((prev) => {
                          const next = new Set(prev);
                          if (next.has(doc.id)) {
                            next.delete(doc.id);
                          } else {
                            next.add(doc.id);
                          }
                          return next;
                        });
                      }}
                    >
                      <Card className={cn("overflow-hidden", !doc.isActive && "opacity-50")}>
                        <CollapsibleTrigger asChild>
                          <div className="p-2 flex items-start gap-2 cursor-pointer hover-elevate">
                            <div className="shrink-0 mt-0.5">
                              {expandedDocs.has(doc.id) ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{doc.title}</div>
                              <div className="text-xs text-muted-foreground truncate">
                                {doc.filePath || "N/A"}
                              </div>
                              <div className="flex items-center gap-1 mt-1 flex-wrap">
                                <Badge variant="secondary" className="text-xs">
                                  {doc.chunksCount} chunks
                                </Badge>
                                {doc.tags?.slice(0, 2).map((tag) => (
                                  <Badge key={tag} variant="outline" className="text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="p-2 pt-0 space-y-2 border-t">
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => toggleDocActive.mutate({ docId: doc.id, isActive: !doc.isActive })}
                              >
                                {doc.isActive ? <X className="w-3 h-3 mr-1" /> : <Check className="w-3 h-3 mr-1" />}
                                {doc.isActive
                                  ? language === "ru" ? "Деактивировать" : "Deactivate"
                                  : language === "ru" ? "Активировать" : "Activate"}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => deleteDocMutation.mutate({ docId: doc.id, keepFile: true })}
                              >
                                <Trash2 className="w-3 h-3 mr-1" />
                                {language === "ru" ? "Из индекса" : "From index"}
                              </Button>
                            </div>
                            <div className="space-y-1">
                              {doc.chunks?.slice(0, 5).map((chunk) => (
                                <div key={chunk.id} className="text-xs p-2 bg-muted rounded-sm flex items-start gap-2 group">
                                  <div className="flex-1 min-w-0">
                                    <span className="text-muted-foreground font-mono">#{chunk.chunkIndex}: </span>
                                    {chunk.preview}
                                  </div>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingChunkId(chunk.id);
                                      loadChunkMutation.mutate(chunk.id);
                                    }}
                                    data-testid={`button-edit-chunk-${chunk.id}`}
                                  >
                                    <Edit3 className="h-3 w-3" />
                                  </Button>
                                </div>
                              ))}
                              {doc.chunks?.length > 5 && (
                                <div className="text-xs text-muted-foreground text-center">
                                  +{doc.chunks.length - 5} {language === "ru" ? "ещё" : "more"}
                                </div>
                              )}
                            </div>
                          </div>
                        </CollapsibleContent>
                      </Card>
                    </Collapsible>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-3 space-y-4">
                <div className="flex items-center gap-2">
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={language === "ru" ? "Поисковый запрос..." : "Search query..."}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    data-testid="input-search-query"
                  />
                  <Button
                    size="icon"
                    onClick={handleSearch}
                    disabled={isSearching}
                    data-testid="button-search"
                  >
                    {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </Button>
                </div>

                <div className="space-y-2">
                  {searchResults.map((result, idx) => (
                    <Card key={result.chunkId} className="p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{result.docTitle}</div>
                          <div className="text-xs text-muted-foreground truncate">{result.filePath}</div>
                        </div>
                        <Badge variant="secondary" className="shrink-0">
                          {(result.score * 100).toFixed(0)}%
                        </Badge>
                      </div>
                      <div className="text-xs mt-2 text-muted-foreground line-clamp-3">
                        {result.preview}
                      </div>
                    </Card>
                  ))}
                  {searchResults.length === 0 && searchQuery && !isSearching && (
                    <div className="text-sm text-muted-foreground text-center py-4">
                      {language === "ru" ? "Ничего не найдено" : "No results"}
                    </div>
                  )}
                </div>
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      <div className="flex md:hidden items-center justify-center h-full p-8">
        <Card className="p-6 text-center">
          <Settings2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="font-semibold mb-2">
            {language === "ru" ? "Только для десктопа" : "Desktop Only"}
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            {language === "ru"
              ? "Админ-панель базы знаний доступна только на широких экранах"
              : "KB Admin panel is only available on wider screens"}
          </p>
          <Button variant="outline" onClick={() => navigate("/assistant")}>
            <ChevronLeft className="w-4 h-4 mr-1" />
            {language === "ru" ? "К ассистенту" : "Back to Assistant"}
          </Button>
        </Card>
      </div>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {language === "ru" ? "Создать документ" : "Create Document"}
            </DialogTitle>
            <DialogDescription>
              {language === "ru"
                ? "Новый файл будет добавлен в базу знаний"
                : "New file will be added to the knowledge base"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{language === "ru" ? "Название" : "Title"}</Label>
              <Input
                value={newFileTitle}
                onChange={(e) => setNewFileTitle(e.target.value)}
                placeholder={language === "ru" ? "Название документа" : "Document title"}
                data-testid="input-new-file-title"
              />
            </div>
            <div>
              <Label>{language === "ru" ? "Теги (через запятую)" : "Tags (comma separated)"}</Label>
              <Input
                value={newFileTags}
                onChange={(e) => setNewFileTags(e.target.value)}
                placeholder="style, guide, hooks"
                data-testid="input-new-file-tags"
              />
              <div className="flex flex-wrap gap-1 mt-2">
                {SUGGESTED_TAGS.map((st) => (
                  <Badge
                    key={st.tag}
                    variant="outline"
                    className="cursor-pointer text-xs"
                    onClick={() => {
                      const current = newFileTags.split(",").map(t => t.trim()).filter(Boolean);
                      if (!current.includes(st.tag)) {
                        setNewFileTags([...current, st.tag].join(", "));
                      }
                    }}
                    data-testid={`tag-suggestion-${st.tag}`}
                  >
                    + {st.label[language]}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <Label>{language === "ru" ? "Шаблон" : "Template"}</Label>
              <Select value={newFileTemplate} onValueChange={setNewFileTemplate}>
                <SelectTrigger data-testid="select-template">
                  <SelectValue placeholder={language === "ru" ? "Без шаблона" : "No template"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{language === "ru" ? "Без шаблона" : "No template"}</SelectItem>
                  {TEMPLATES.map((tpl) => (
                    <SelectItem key={tpl.key} value={tpl.key}>
                      {tpl.label[language]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              {language === "ru" ? "Отмена" : "Cancel"}
            </Button>
            <Button
              onClick={() =>
                createFileMutation.mutate({
                  folderPath: currentFolder,
                  title: newFileTitle,
                  tags: newFileTags.split(",").map((t) => t.trim()).filter(Boolean),
                  templateKey: newFileTemplate && newFileTemplate !== "none" ? newFileTemplate : undefined,
                })
              }
              disabled={!newFileTitle.trim() || createFileMutation.isPending}
              data-testid="button-create-confirm"
            >
              {createFileMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {language === "ru" ? "Создать" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createFolderDialogOpen} onOpenChange={setCreateFolderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {language === "ru" ? "Создать папку" : "Create Folder"}
            </DialogTitle>
          </DialogHeader>
          <div>
            <Label>{language === "ru" ? "Название папки" : "Folder name"}</Label>
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder={language === "ru" ? "Название" : "Name"}
              data-testid="input-new-folder-name"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateFolderDialogOpen(false)}>
              {language === "ru" ? "Отмена" : "Cancel"}
            </Button>
            <Button
              onClick={() => {
                const path = currentFolder ? `${currentFolder}/${newFolderName}` : newFolderName;
                createFolderMutation.mutate(path);
              }}
              disabled={!newFolderName.trim() || createFolderMutation.isPending}
              data-testid="button-create-folder-confirm"
            >
              {language === "ru" ? "Создать" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === "ru" ? "Удалить файл?" : "Delete file?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === "ru"
                ? "Файл будет удален без возможности восстановления"
                : "This file will be permanently deleted"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{language === "ru" ? "Отмена" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedPath && deleteFileMutation.mutate(selectedPath)}
              data-testid="button-delete-confirm"
            >
              {language === "ru" ? "Удалить" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={editChunkDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setEditChunkDialogOpen(false);
          setEditingChunkId(null);
          setEditingChunkContent("");
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {language === "ru" ? "Редактирование чанка" : "Edit Chunk"}
            </DialogTitle>
            <DialogDescription>
              {language === "ru"
                ? "Отредактируйте содержимое чанка. После сохранения эмбеддинг будет пересоздан."
                : "Edit chunk content. The embedding will be regenerated after saving."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-hidden">
            <Textarea
              value={editingChunkContent}
              onChange={(e) => setEditingChunkContent(e.target.value)}
              className="h-64 resize-none font-mono text-sm"
              placeholder={language === "ru" ? "Содержимое чанка..." : "Chunk content..."}
              data-testid="textarea-edit-chunk"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-muted-foreground">
                {editingChunkContent.length} {language === "ru" ? "символов" : "characters"}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditChunkDialogOpen(false)}>
              {language === "ru" ? "Отмена" : "Cancel"}
            </Button>
            <Button
              onClick={() => {
                if (editingChunkId) {
                  updateChunkMutation.mutate({ chunkId: editingChunkId, content: editingChunkContent });
                }
              }}
              disabled={!editingChunkContent.trim() || updateChunkMutation.isPending}
              data-testid="button-save-chunk"
            >
              {updateChunkMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {language === "ru" ? "Сохранить" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={chunkPreviewOpen} onOpenChange={setChunkPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {language === "ru" ? "Предпросмотр чанков" : "Chunk Preview"}
            </DialogTitle>
            <DialogDescription>
              {language === "ru"
                ? `Файл будет разбит на ${previewChunks.length} чанков`
                : `File will be split into ${previewChunks.length} chunks`}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-2 pr-4">
              {previewChunks.map((chunk, idx) => (
                <Card key={idx} className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="secondary">
                      {language === "ru" ? "Чанк" : "Chunk"} #{idx + 1}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {chunk.length} {language === "ru" ? "символов" : "chars"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-6">
                    {chunk}
                  </div>
                </Card>
              ))}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChunkPreviewOpen(false)}>
              {language === "ru" ? "Закрыть" : "Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
