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
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
  RotateCcw,
  Pencil,
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
  chunks: { 
    id: string; 
    chunkIndex: number; 
    preview: string; 
    contentHash: string;
    level?: string;
    anchor?: string;
  }[];
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

function FileTreeNode({ node, selectedPath, onSelect, expandedPaths, toggleExpand, onRename, language = "ru", level = 0 }: {
  node: FileNode;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  expandedPaths: Set<string>;
  toggleExpand: (path: string) => void;
  onRename?: (path: string, name: string) => void;
  language?: "ru" | "en";
  level?: number;
}) {
  const isExpanded = expandedPaths.has(node.path);
  const isSelected = selectedPath === node.path;

  const handleClick = () => {
    if (node.type === "folder") {
      toggleExpand(node.path);
    } else {
      onSelect(node.path);
    }
  };

  const nodeContent = (
    <div
      className={cn(
        "flex items-center gap-1 px-2 py-1 rounded-sm cursor-pointer text-sm",
        "hover-elevate active-elevate-2",
        isSelected && "bg-accent"
      )}
      style={{ paddingLeft: `${8 + level * 12}px` }}
      onClick={handleClick}
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
  );

  return (
    <div>
      {node.type === "file" && onRename ? (
        <ContextMenu>
          <ContextMenuTrigger asChild>
            {nodeContent}
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onClick={() => onRename(node.path, node.name)}>
              <Pencil className="w-4 h-4 mr-2" />
              Переименовать
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ) : (
        nodeContent
      )}
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
              onRename={onRename}
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
  const [activeTab, setActiveTab] = useState<"editor" | "preview" | "chunks">("editor");
  const [activePanel, setActivePanel] = useState<"index" | "search">("index");

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
  const [editingChunkLevel, setEditingChunkLevel] = useState<string>("normal");
  const [editingChunkAnchor, setEditingChunkAnchor] = useState<string>("general");
  const [chunkPreviewOpen, setChunkPreviewOpen] = useState(false);
  const [previewChunks, setPreviewChunks] = useState<string[]>([]);
  
  // AI chunk generation state
  const [aiChunksDialogOpen, setAiChunksDialogOpen] = useState(false);
  const [aiChunkCount, setAiChunkCount] = useState(5);
  const [aiGeneratedChunks, setAiGeneratedChunks] = useState<{
    content: string;
    level: string;
    anchor: string;
    summary: string;
    chunkIndex: number;
  }[]>([]);
  const [aiChunksDocId, setAiChunksDocId] = useState<string | null>(null);
  const [aiChunksDocTitle, setAiChunksDocTitle] = useState("");
  const [isGeneratingAiChunks, setIsGeneratingAiChunks] = useState(false);
  const [editingAiChunkIndex, setEditingAiChunkIndex] = useState<number | null>(null);
  const [aiChunksSourceContent, setAiChunksSourceContent] = useState("");
  const [regeneratingChunkIndex, setRegeneratingChunkIndex] = useState<number | null>(null);
  const [newChunkContent, setNewChunkContent] = useState("");
  const [newChunkLevel, setNewChunkLevel] = useState("normal");
  const [newChunkAnchor, setNewChunkAnchor] = useState("general");
  
  // Current file's document and chunks
  const [currentFileDoc, setCurrentFileDoc] = useState<IndexDoc | null>(null);
  const [currentFileChunks, setCurrentFileChunks] = useState<{
    id: string;
    content: string;
    level: string;
    anchor: string;
    chunkIndex: number;
  }[]>([]);
  const [isLoadingChunks, setIsLoadingChunks] = useState(false);
  const [newFileChunkContent, setNewFileChunkContent] = useState("");
  const [newFileChunkLevel, setNewFileChunkLevel] = useState("normal");
  const [newFileChunkAnchor, setNewFileChunkAnchor] = useState("general");
  
  // Rename dialog state
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renamingFilePath, setRenamingFilePath] = useState<string | null>(null);
  const [renamingFileName, setRenamingFileName] = useState("");
  const [renameReindex, setRenameReindex] = useState(true);
  
  const CHUNK_LEVELS = [
    { value: "critical", label: { ru: "Критический (+50%)", en: "Critical (+50%)" } },
    { value: "important", label: { ru: "Важный (+25%)", en: "Important (+25%)" } },
    { value: "normal", label: { ru: "Обычный", en: "Normal" } },
    { value: "supplementary", label: { ru: "Дополнительный (-25%)", en: "Supplementary (-25%)" } },
  ];
  
  const CHUNK_ANCHORS = [
    { value: "hooks", label: { ru: "Хуки", en: "Hooks" } },
    { value: "scripts", label: { ru: "Сценарии", en: "Scripts" } },
    { value: "storyboard", label: { ru: "Раскадровка", en: "Storyboard" } },
    { value: "montage", label: { ru: "Монтаж", en: "Montage" } },
    { value: "sfx", label: { ru: "Звуковые эффекты", en: "SFX" } },
    { value: "music", label: { ru: "Музыка", en: "Music" } },
    { value: "voice", label: { ru: "Озвучка", en: "Voice" } },
    { value: "style", label: { ru: "Стили", en: "Style" } },
    { value: "platform", label: { ru: "Платформы", en: "Platform" } },
    { value: "trends", label: { ru: "Тренды", en: "Trends" } },
    { value: "workflow", label: { ru: "Процессы", en: "Workflow" } },
    { value: "general", label: { ru: "Общее", en: "General" } },
  ];
  
  
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

  const renameFileMutation = useMutation({
    mutationFn: async ({ from, to, reindex }: { from: string; to: string; reindex: boolean }) => {
      const res = await apiRequest("POST", "/api/kb-admin/fs/rename", { from, to, reindex });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      setRenameDialogOpen(false);
      setRenamingFilePath(null);
      setRenamingFileName("");
      refetchTree();
      refetchIndex();
      // Update selected path to new path
      if (selectedPath === variables.from) {
        setSelectedPath(variables.to);
      }
      toast({ 
        title: language === "ru" ? "Файл переименован" : "File renamed",
        description: renameReindex 
          ? (language === "ru" ? "Файл переиндексирован" : "File reindexed")
          : undefined
      });
    },
    onError: () => {
      toast({ title: language === "ru" ? "Ошибка переименования" : "Rename error", variant: "destructive" });
    },
  });

  const handleRenameFile = (path: string, currentName: string) => {
    setRenamingFilePath(path);
    setRenamingFileName(currentName);
    setRenameReindex(true);
    setRenameDialogOpen(true);
  };

  const handleConfirmRename = () => {
    if (!renamingFilePath || !renamingFileName.trim()) return;
    
    // Get directory and build new path
    const dir = renamingFilePath.substring(0, renamingFilePath.lastIndexOf('/') + 1);
    const newPath = dir + renamingFileName.trim();
    
    if (newPath === renamingFilePath) {
      setRenameDialogOpen(false);
      return;
    }
    
    renameFileMutation.mutate({ from: renamingFilePath, to: newPath, reindex: renameReindex });
  };

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
      setEditingChunkLevel(data.level || "normal");
      setEditingChunkAnchor(data.anchor || "general");
      setEditChunkDialogOpen(true);
    },
    onError: () => {
      toast({ title: language === "ru" ? "Ошибка загрузки чанка" : "Failed to load chunk", variant: "destructive" });
    },
  });
  
  const updateChunkMutation = useMutation({
    mutationFn: async ({ chunkId, content, level, anchor }: { chunkId: string; content: string; level: string; anchor: string }) => {
      const res = await apiRequest("PUT", `/api/kb-admin/index/chunk/${chunkId}`, { content, level, anchor });
      return res.json();
    },
    onSuccess: () => {
      setEditChunkDialogOpen(false);
      setEditingChunkId(null);
      setEditingChunkContent("");
      setEditingChunkLevel("normal");
      setEditingChunkAnchor("general");
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
  
  // AI Chunk generation handlers
  const handleGenerateAiChunks = async (docId: string, docTitle: string, filePath: string | null) => {
    if (!filePath) {
      toast({ title: language === "ru" ? "Файл не найден" : "File not found", variant: "destructive" });
      return;
    }
    
    setAiChunksDocId(docId);
    setAiChunksDocTitle(docTitle);
    setAiChunksDialogOpen(true);
    setIsGeneratingAiChunks(true);
    setAiGeneratedChunks([]);
    setNewChunkContent("");
    setNewChunkLevel("normal");
    setNewChunkAnchor("general");
    
    try {
      // First, load the file content
      const fileRes = await fetch(`/api/kb-admin/fs/file?path=${encodeURIComponent(filePath)}`);
      if (!fileRes.ok) throw new Error("Failed to load file");
      const fileData = await fileRes.json();
      setAiChunksSourceContent(fileData.content || "");
      
      // Generate chunks using AI
      const genRes = await apiRequest("POST", "/api/kb-admin/index/generateChunks", {
        content: fileData.content,
        chunkCount: aiChunkCount,
      });
      const genData = await genRes.json();
      
      if (genData.chunks) {
        setAiGeneratedChunks(genData.chunks);
        toast({
          title: language === "ru" ? "Чанки сгенерированы" : "Chunks generated",
          description: `${genData.chunks.length} chunks`,
        });
      }
    } catch (err: any) {
      toast({
        title: language === "ru" ? "Ошибка генерации" : "Generation error",
        description: err?.message || "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingAiChunks(false);
    }
  };
  
  const handleRegenerateChunk = async (index: number) => {
    if (!aiChunksSourceContent) return;
    
    setRegeneratingChunkIndex(index);
    try {
      const genRes = await apiRequest("POST", "/api/kb-admin/index/generateChunks", {
        content: aiChunksSourceContent,
        chunkCount: 1,
        context: `Regenerate chunk #${index + 1} based on source. Current chunk summary: ${aiGeneratedChunks[index]?.summary || ""}`,
      });
      const genData = await genRes.json();
      
      if (genData.chunks && genData.chunks.length > 0) {
        const newChunk = genData.chunks[0];
        updateAiChunk(index, {
          content: newChunk.content,
          summary: newChunk.summary,
        });
        toast({ title: language === "ru" ? "Чанк перегенерирован" : "Chunk regenerated" });
      }
    } catch (err: any) {
      toast({
        title: language === "ru" ? "Ошибка" : "Error",
        description: err?.message || "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRegeneratingChunkIndex(null);
    }
  };
  
  const handleAddNewChunk = () => {
    if (!newChunkContent.trim()) return;
    
    setAiGeneratedChunks(prev => [
      ...prev,
      {
        content: newChunkContent.trim(),
        level: newChunkLevel,
        anchor: newChunkAnchor,
        summary: "",
        chunkIndex: prev.length,
      }
    ]);
    setNewChunkContent("");
    setNewChunkLevel("normal");
    setNewChunkAnchor("general");
  };
  
  const handleSaveAiChunks = async () => {
    if (!aiChunksDocId || aiGeneratedChunks.length === 0) return;
    
    setIsGeneratingAiChunks(true);
    try {
      const res = await apiRequest("POST", "/api/kb-admin/index/saveGeneratedChunks", {
        docId: aiChunksDocId,
        chunks: aiGeneratedChunks,
      });
      const data = await res.json();
      
      if (data.success) {
        toast({
          title: language === "ru" ? "Чанки сохранены" : "Chunks saved",
          description: `${data.chunksCount} chunks with embeddings`,
        });
        setAiChunksDialogOpen(false);
        setAiGeneratedChunks([]);
        setAiChunksDocId(null);
        refetchIndex();
      }
    } catch (err: any) {
      toast({
        title: language === "ru" ? "Ошибка сохранения" : "Save error",
        description: err?.message || "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingAiChunks(false);
    }
  };
  
  const updateAiChunk = (index: number, updates: Partial<typeof aiGeneratedChunks[0]>) => {
    setAiGeneratedChunks(prev => 
      prev.map((chunk, i) => i === index ? { ...chunk, ...updates } : chunk)
    );
  };
  
  const deleteAiChunk = (index: number) => {
    setAiGeneratedChunks(prev => prev.filter((_, i) => i !== index));
  };

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

  const loadFileChunks = async (path: string) => {
    setIsLoadingChunks(true);
    setCurrentFileDoc(null);
    setCurrentFileChunks([]);
    try {
      // Find the document by file path from indexStats
      const doc = indexStats?.documents?.find(d => d.filePath === path);
      if (doc) {
        setCurrentFileDoc(doc);
        setCurrentFileChunks(doc.chunks?.map(c => ({
          id: c.id,
          content: c.content,
          level: c.level || "normal",
          anchor: c.anchor || "general",
          chunkIndex: c.chunkIndex,
        })) || []);
      }
    } catch (err) {
      console.error("Error loading chunks:", err);
    } finally {
      setIsLoadingChunks(false);
    }
  };

  const handleSelectFile = useCallback((path: string) => {
    setSelectedPath(path);
    loadFileMutation.mutate(path);
    loadFileChunks(path);
  }, [indexStats]);

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
                  onRename={handleRenameFile}
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
                      <TabsTrigger value="chunks" className="text-xs px-3 h-6">
                        <Layers className="w-3 h-3 mr-1" />
                        {language === "ru" ? "Чанки" : "Chunks"}
                        {currentFileChunks.length > 0 && (
                          <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                            {currentFileChunks.length}
                          </Badge>
                        )}
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
              ) : activeTab === "preview" ? (
                <ScrollArea className="h-full">
                  <div className="p-4 prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{editorContent}</ReactMarkdown>
                  </div>
                </ScrollArea>
              ) : (
                <ScrollArea className="h-full">
                  <div className="p-4 space-y-3">
                    {isLoadingChunks ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin" />
                      </div>
                    ) : currentFileChunks.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Layers className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">
                          {language === "ru" 
                            ? "Файл не индексирован или не имеет чанков" 
                            : "File not indexed or has no chunks"}
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2"
                          onClick={() => reindexFileMutation.mutate(selectedPath)}
                          disabled={reindexFileMutation.isPending}
                        >
                          {reindexFileMutation.isPending ? (
                            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4 mr-1" />
                          )}
                          {language === "ru" ? "Индексировать" : "Index"}
                        </Button>
                      </div>
                    ) : (
                      <>
                        {currentFileChunks.map((chunk, idx) => (
                          <Card key={chunk.id} className="p-3">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="secondary">#{idx + 1}</Badge>
                                <Select
                                  value={chunk.level}
                                  onValueChange={(v) => {
                                    setCurrentFileChunks(prev => 
                                      prev.map((c, i) => i === idx ? { ...c, level: v } : c)
                                    );
                                  }}
                                >
                                  <SelectTrigger className="h-6 w-auto text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {CHUNK_LEVELS.map((l) => (
                                      <SelectItem key={l.value} value={l.value}>
                                        {l.label[language]}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Select
                                  value={chunk.anchor}
                                  onValueChange={(v) => {
                                    setCurrentFileChunks(prev => 
                                      prev.map((c, i) => i === idx ? { ...c, anchor: v } : c)
                                    );
                                  }}
                                >
                                  <SelectTrigger className="h-6 w-auto text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {CHUNK_ANCHORS.map((a) => (
                                      <SelectItem key={a.value} value={a.value}>
                                        {a.label[language]}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <span className="text-xs text-muted-foreground">
                                  {chunk.content.length} {language === "ru" ? "симв." : "chars"}
                                </span>
                              </div>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 shrink-0"
                                onClick={() => {
                                  setEditingChunkId(chunk.id);
                                  setEditingChunkContent(chunk.content);
                                  setEditingChunkLevel(chunk.level);
                                  setEditingChunkAnchor(chunk.anchor);
                                  setEditChunkDialogOpen(true);
                                }}
                              >
                                <Edit3 className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-4">
                              {chunk.content}
                            </div>
                          </Card>
                        ))}
                        
                        {/* Add new chunk section */}
                        <Card className="p-3 border-dashed">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <Badge variant="outline">
                              <Plus className="w-3 h-3 mr-1" />
                              {language === "ru" ? "Новый" : "New"}
                            </Badge>
                            <Select
                              value={newFileChunkLevel}
                              onValueChange={setNewFileChunkLevel}
                            >
                              <SelectTrigger className="h-6 w-auto text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {CHUNK_LEVELS.map((l) => (
                                  <SelectItem key={l.value} value={l.value}>
                                    {l.label[language]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select
                              value={newFileChunkAnchor}
                              onValueChange={setNewFileChunkAnchor}
                            >
                              <SelectTrigger className="h-6 w-auto text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {CHUNK_ANCHORS.map((a) => (
                                  <SelectItem key={a.value} value={a.value}>
                                    {a.label[language]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <Textarea
                            value={newFileChunkContent}
                            onChange={(e) => setNewFileChunkContent(e.target.value)}
                            className="text-sm resize-none min-h-[60px] mb-2"
                            placeholder={language === "ru" ? "Текст нового чанка..." : "New chunk content..."}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              if (!newFileChunkContent.trim() || !currentFileDoc) return;
                              try {
                                const res = await apiRequest("POST", "/api/kb-admin/index/addChunk", {
                                  docId: currentFileDoc.id,
                                  content: newFileChunkContent.trim(),
                                  level: newFileChunkLevel,
                                  anchor: newFileChunkAnchor,
                                });
                                const data = await res.json();
                                if (data.success) {
                                  toast({ title: language === "ru" ? "Чанк добавлен" : "Chunk added" });
                                  setNewFileChunkContent("");
                                  refetchIndex();
                                  if (selectedPath) loadFileChunks(selectedPath);
                                }
                              } catch (err: any) {
                                toast({ title: err?.message || "Error", variant: "destructive" });
                              }
                            }}
                            disabled={!newFileChunkContent.trim() || !currentFileDoc}
                            className="w-full"
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            {language === "ru" ? "Добавить чанк" : "Add chunk"}
                          </Button>
                        </Card>
                      </>
                    )}
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
              <TabsList className="w-full grid grid-cols-2">
                <TabsTrigger value="index" className="text-xs">
                  <Database className="w-3 h-3 mr-1" />
                  {language === "ru" ? "Индекс" : "Index"}
                </TabsTrigger>
                <TabsTrigger value="search" className="text-xs">
                  <Search className="w-3 h-3 mr-1" />
                  {language === "ru" ? "Поиск" : "Search"}
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
                            <div className="flex items-center gap-1 flex-wrap">
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
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleGenerateAiChunks(doc.id, doc.title, doc.filePath)}
                                disabled={!doc.filePath}
                                title={!doc.filePath ? (language === "ru" ? "Файл не найден" : "File not found") : ""}
                                data-testid={`button-ai-chunks-${doc.id}`}
                              >
                                <Sparkles className="w-3 h-3 mr-1" />
                                {language === "ru" ? "AI чанки" : "AI Chunks"}
                              </Button>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <Label className="text-xs">{language === "ru" ? "Кол-во:" : "Count:"}</Label>
                              <Select
                                value={String(aiChunkCount)}
                                onValueChange={(v) => setAiChunkCount(Number(v))}
                              >
                                <SelectTrigger className="h-7 w-16 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {[3, 4, 5, 6, 7, 8, 10, 12, 15].map((n) => (
                                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              {doc.chunks?.slice(0, 5).map((chunk) => (
                                <div key={chunk.id} className="text-xs p-2 bg-muted rounded-sm flex items-start gap-2 group">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1 mb-0.5 flex-wrap">
                                      <span className="text-muted-foreground font-mono">#{chunk.chunkIndex}</span>
                                      {chunk.level && chunk.level !== "normal" && (
                                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                                          {chunk.level === "critical" ? "!!!" : chunk.level === "important" ? "!!" : "-"}
                                        </Badge>
                                      )}
                                      {chunk.anchor && chunk.anchor !== "general" && (
                                        <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
                                          {chunk.anchor}
                                        </Badge>
                                      )}
                                    </div>
                                    <span className="text-muted-foreground">{chunk.preview}</span>
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

      <Dialog open={renameDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setRenameDialogOpen(false);
          setRenamingFilePath(null);
          setRenamingFileName("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {language === "ru" ? "Переименовать файл" : "Rename file"}
            </DialogTitle>
            <DialogDescription>
              {language === "ru"
                ? "Введите новое имя файла"
                : "Enter the new file name"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>{language === "ru" ? "Новое имя" : "New name"}</Label>
              <Input
                value={renamingFileName}
                onChange={(e) => setRenamingFileName(e.target.value)}
                placeholder={language === "ru" ? "Имя файла" : "File name"}
                data-testid="input-rename-file"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="rename-reindex"
                checked={renameReindex}
                onChange={(e) => setRenameReindex(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="rename-reindex" className="text-sm cursor-pointer">
                {language === "ru" ? "Переиндексировать файл" : "Reindex file"}
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              {language === "ru" ? "Отмена" : "Cancel"}
            </Button>
            <Button
              onClick={handleConfirmRename}
              disabled={!renamingFileName.trim() || renameFileMutation.isPending}
              data-testid="button-rename-confirm"
            >
              {renameFileMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {language === "ru" ? "Переименовать" : "Rename"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editChunkDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setEditChunkDialogOpen(false);
          setEditingChunkId(null);
          setEditingChunkContent("");
          setEditingChunkLevel("normal");
          setEditingChunkAnchor("general");
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {language === "ru" ? "Редактирование чанка" : "Edit Chunk"}
            </DialogTitle>
            <DialogDescription>
              {language === "ru"
                ? "Отредактируйте содержимое, уровень и якорь чанка. Эмбеддинг будет пересоздан."
                : "Edit content, level and anchor. Embedding will be regenerated."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-hidden space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">{language === "ru" ? "Уровень" : "Level"}</Label>
                <Select value={editingChunkLevel} onValueChange={setEditingChunkLevel}>
                  <SelectTrigger data-testid="select-chunk-level">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHUNK_LEVELS.map((l) => (
                      <SelectItem key={l.value} value={l.value}>
                        {l.label[language]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1 block">{language === "ru" ? "Якорь" : "Anchor"}</Label>
                <Select value={editingChunkAnchor} onValueChange={setEditingChunkAnchor}>
                  <SelectTrigger data-testid="select-chunk-anchor">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHUNK_ANCHORS.map((a) => (
                      <SelectItem key={a.value} value={a.value}>
                        {a.label[language]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Textarea
              value={editingChunkContent}
              onChange={(e) => setEditingChunkContent(e.target.value)}
              className="h-52 resize-none font-mono text-sm"
              placeholder={language === "ru" ? "Содержимое чанка..." : "Chunk content..."}
              data-testid="textarea-edit-chunk"
            />
            <div className="flex items-center justify-between">
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
                  updateChunkMutation.mutate({ 
                    chunkId: editingChunkId, 
                    content: editingChunkContent,
                    level: editingChunkLevel,
                    anchor: editingChunkAnchor,
                  });
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

      <Dialog open={aiChunksDialogOpen} onOpenChange={setAiChunksDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              {language === "ru" ? "AI Генерация чанков" : "AI Chunk Generation"}
            </DialogTitle>
            <DialogDescription>
              {aiChunksDocTitle} - {aiGeneratedChunks.length} {language === "ru" ? "чанков" : "chunks"}
            </DialogDescription>
          </DialogHeader>
          
          {isGeneratingAiChunks && aiGeneratedChunks.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-8">
              <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  {language === "ru" ? "Генерация чанков..." : "Generating chunks..."}
                </p>
              </div>
            </div>
          ) : (
            <ScrollArea className="flex-1 min-h-0">
              <div className="space-y-3 pr-4">
                {aiGeneratedChunks.map((chunk, idx) => (
                  <Card key={idx} className="p-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary">#{idx + 1}</Badge>
                        <Select
                          value={chunk.level}
                          onValueChange={(v) => updateAiChunk(idx, { level: v })}
                        >
                          <SelectTrigger className="h-6 w-auto text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CHUNK_LEVELS.map((l) => (
                              <SelectItem key={l.value} value={l.value}>
                                {l.label[language]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={chunk.anchor}
                          onValueChange={(v) => updateAiChunk(idx, { anchor: v })}
                        >
                          <SelectTrigger className="h-6 w-auto text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CHUNK_ANCHORS.map((a) => (
                              <SelectItem key={a.value} value={a.value}>
                                {a.label[language]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <span className="text-xs text-muted-foreground">
                          {chunk.content.length} {language === "ru" ? "симв." : "chars"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => handleRegenerateChunk(idx)}
                          disabled={regeneratingChunkIndex !== null}
                          title={language === "ru" ? "Перегенерировать" : "Regenerate"}
                        >
                          {regeneratingChunkIndex === idx ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => deleteAiChunk(idx)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    {chunk.summary && (
                      <div className="text-xs text-muted-foreground mb-2 italic">
                        {chunk.summary}
                      </div>
                    )}
                    <Textarea
                      value={chunk.content}
                      onChange={(e) => updateAiChunk(idx, { content: e.target.value })}
                      className="text-sm resize-none min-h-[80px]"
                      data-testid={`textarea-ai-chunk-${idx}`}
                    />
                  </Card>
                ))}
                
                {/* New chunk input section */}
                <Card className="p-3 border-dashed">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Badge variant="outline">
                      <Plus className="w-3 h-3 mr-1" />
                      {language === "ru" ? "Новый" : "New"}
                    </Badge>
                    <Select
                      value={newChunkLevel}
                      onValueChange={setNewChunkLevel}
                    >
                      <SelectTrigger className="h-6 w-auto text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CHUNK_LEVELS.map((l) => (
                          <SelectItem key={l.value} value={l.value}>
                            {l.label[language]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={newChunkAnchor}
                      onValueChange={setNewChunkAnchor}
                    >
                      <SelectTrigger className="h-6 w-auto text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CHUNK_ANCHORS.map((a) => (
                          <SelectItem key={a.value} value={a.value}>
                            {a.label[language]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Textarea
                    value={newChunkContent}
                    onChange={(e) => setNewChunkContent(e.target.value)}
                    className="text-sm resize-none min-h-[60px] mb-2"
                    placeholder={language === "ru" ? "Введите текст нового чанка..." : "Enter new chunk content..."}
                    data-testid="textarea-new-chunk"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleAddNewChunk}
                    disabled={!newChunkContent.trim()}
                    className="w-full"
                    data-testid="button-add-chunk"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    {language === "ru" ? "Добавить чанк" : "Add chunk"}
                  </Button>
                </Card>
              </div>
            </ScrollArea>
          )}
          
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAiChunksDialogOpen(false)}>
              {language === "ru" ? "Отмена" : "Cancel"}
            </Button>
            <Button
              onClick={handleSaveAiChunks}
              disabled={isGeneratingAiChunks || aiGeneratedChunks.length === 0}
              data-testid="button-save-ai-chunks"
            >
              {isGeneratingAiChunks && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              <Save className="w-4 h-4 mr-1" />
              {language === "ru" ? `Сохранить ${aiGeneratedChunks.length} чанков` : `Save ${aiGeneratedChunks.length} chunks`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
