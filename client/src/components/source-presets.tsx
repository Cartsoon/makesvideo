import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { 
  Loader2,
  Plus,
  Check,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { categoryPresets, getAvailableCategories, type CategoryId, type RSSSource } from "@/lib/category-presets";
import type { Source, SourceType } from "@shared/schema";

const SOURCES_PER_PAGE = 10;

export function SourcePresets() {
  const { toast } = useToast();
  const { t, language } = useI18n();
  const [selectedCategory, setSelectedCategory] = useState<CategoryId | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [addedSources, setAddedSources] = useState<Set<string>>(new Set());
  const [addingSource, setAddingSource] = useState<string | null>(null);

  const { data: existingSources } = useQuery<Source[]>({
    queryKey: ["/api/sources"],
  });

  const availableCategories = getAvailableCategories(language);

  const selectedCategoryData = selectedCategory 
    ? categoryPresets.find(c => c.id === selectedCategory)
    : null;

  const sources = selectedCategoryData?.sources[language] || [];
  const totalPages = Math.ceil(sources.length / SOURCES_PER_PAGE);
  const paginatedSources = sources.slice(
    currentPage * SOURCES_PER_PAGE,
    (currentPage + 1) * SOURCES_PER_PAGE
  );

  const isSourceAdded = (url: string) => {
    if (addedSources.has(url)) return true;
    return existingSources?.some(s => s.config?.url === url) || false;
  };

  const createMutation = useMutation({
    mutationFn: (data: { type: SourceType; name: string; config: { url?: string; description?: string }; isEnabled: boolean }) =>
      apiRequest("POST", "/api/sources", data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sources"] });
      setAddedSources(prev => new Set(prev).add(variables.config.url || ""));
      toast({ 
        title: language === "ru" ? "Источник добавлен" : "Source added",
        description: variables.name
      });
      setAddingSource(null);
    },
    onError: () => {
      toast({ 
        title: t("common.error"), 
        description: language === "ru" ? "Не удалось добавить источник" : "Failed to add source",
        variant: "destructive" 
      });
      setAddingSource(null);
    },
  });

  const handleAddSource = (source: RSSSource) => {
    if (isSourceAdded(source.url)) return;
    setAddingSource(source.url);
    createMutation.mutate({
      type: "rss" as SourceType,
      name: source.name,
      config: {
        url: source.url,
      },
      isEnabled: true,
    });
  };

  const handleCategorySelect = (categoryId: CategoryId) => {
    if (selectedCategory === categoryId) {
      setSelectedCategory(null);
    } else {
      setSelectedCategory(categoryId);
      setCurrentPage(0);
    }
  };

  const handlePrevPage = () => {
    setCurrentPage(prev => Math.max(0, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage(prev => Math.min(totalPages - 1, prev + 1));
  };

  return (
    <div className="relative overflow-hidden border border-neutral-700/50 bg-neutral-900/90">
      <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 via-transparent to-purple-500/5" />
      <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-violet-400/50" />
      <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-violet-400/50" />
      <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-purple-400/50" />
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-purple-400/50" />
      
      <div className="relative p-3 sm:p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-violet-400" />
          <h3 className="text-sm font-semibold text-white uppercase tracking-wide">
            {t("category.title")}
          </h3>
        </div>
        
        <p className="text-[11px] text-neutral-500 leading-relaxed">
          {t("category.description")}
        </p>
        
        <div className="flex flex-wrap gap-1.5">
          {availableCategories.map((category) => {
            const Icon = category.icon;
            const isSelected = selectedCategory === category.id;
            
            return (
              <button
                key={category.id}
                className={`group relative overflow-visible px-3 py-2 text-[10px] font-semibold uppercase tracking-wider flex items-center gap-2 transition-all ${
                  isSelected 
                    ? 'bg-gradient-to-r from-rose-500 to-amber-500 text-white shadow-lg shadow-rose-500/20' 
                    : 'bg-neutral-800/80 border border-neutral-600/50 text-neutral-400 hover:text-white hover:border-neutral-500 hover:bg-neutral-700/80'
                }`}
                onClick={() => handleCategorySelect(category.id)}
                data-testid={`button-category-${category.id}`}
              >
                {isSelected && (
                  <>
                    <div className="absolute top-0 left-0 w-1.5 h-1.5 border-t-2 border-l-2 border-white/40" />
                    <div className="absolute top-0 right-0 w-1.5 h-1.5 border-t-2 border-r-2 border-white/40" />
                    <div className="absolute bottom-0 left-0 w-1.5 h-1.5 border-b-2 border-l-2 border-white/40" />
                    <div className="absolute bottom-0 right-0 w-1.5 h-1.5 border-b-2 border-r-2 border-white/40" />
                  </>
                )}
                <Icon className={`h-3.5 w-3.5 flex-shrink-0 transition-colors ${isSelected ? 'text-white' : 'text-neutral-500 group-hover:text-violet-400'}`} />
                <span>{t(`category.${category.id}`)}</span>
              </button>
            );
          })}
        </div>
        
        {selectedCategory && paginatedSources.length > 0 && (
          <div className="space-y-3 pt-3 border-t border-neutral-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-neutral-500 font-mono">
                {language === "ru" 
                  ? `Страница ${currentPage + 1} из ${totalPages}`
                  : `Page ${currentPage + 1} of ${totalPages}`}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={handlePrevPage}
                  disabled={currentPage === 0}
                  className="p-1.5 bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={handleNextPage}
                  disabled={currentPage >= totalPages - 1}
                  className="p-1.5 bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                  data-testid="button-next-page"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            
            <div className="divide-y divide-neutral-800">
              {paginatedSources.map((source, index) => {
                const isAdded = isSourceAdded(source.url);
                const isAdding = addingSource === source.url;
                const globalIndex = currentPage * SOURCES_PER_PAGE + index + 1;
                const shortUrl = source.url.replace(/^https?:\/\//, '').split('/')[0];
                
                return (
                  <div 
                    key={`${selectedCategory}-${globalIndex}-${source.url}`}
                    className="flex items-center justify-between gap-2 sm:gap-3 py-2.5 hover:bg-neutral-800/30 transition-colors"
                    data-testid={`source-preset-${globalIndex}`}
                  >
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                      <span className="text-neutral-600 text-xs font-mono w-5 flex-shrink-0">
                        {globalIndex}.
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm text-neutral-100 truncate">
                          {source.name}
                        </div>
                        <div className="text-[10px] text-neutral-500 truncate font-mono hidden sm:block">
                          {source.url}
                        </div>
                        <div className="text-[10px] text-neutral-500 truncate font-mono sm:hidden">
                          {shortUrl}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleAddSource(source)}
                      disabled={isAdded || isAdding || createMutation.isPending}
                      className={`relative overflow-hidden px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide flex items-center gap-1.5 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${
                        isAdded 
                          ? 'bg-neutral-800 border border-neutral-700 text-neutral-400' 
                          : 'bg-gradient-to-r from-rose-500 to-amber-500 text-white hover-elevate active-elevate-2'
                      }`}
                      data-testid={`button-add-source-${globalIndex}`}
                    >
                      {isAdding ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : isAdded ? (
                        <>
                          <Check className="h-3 w-3" />
                          <span className="hidden sm:inline">{language === "ru" ? "Добавлен" : "Added"}</span>
                        </>
                      ) : (
                        <>
                          <Plus className="h-3 w-3" />
                          <span className="hidden sm:inline">{language === "ru" ? "Добавить" : "Add"}</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
            
            {totalPages > 1 && (
              <div className="flex justify-center gap-1 pt-2">
                {Array.from({ length: totalPages }, (_, i) => (
                  <button
                    key={i}
                    className={`w-7 h-7 text-[11px] font-medium ${
                      currentPage === i 
                        ? 'bg-gradient-to-r from-rose-500 to-amber-500 text-white' 
                        : 'bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-white'
                    }`}
                    onClick={() => setCurrentPage(i)}
                    data-testid={`button-page-${i + 1}`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
