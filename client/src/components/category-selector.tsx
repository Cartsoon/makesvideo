import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, Check, Loader2, ChevronDown, ChevronUp
} from "lucide-react";
import { categoryPresets, defaultCategory, getAvailableCategories, type CategoryId, type CategoryPreset } from "@/lib/category-presets";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Source } from "@shared/schema";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export function CategorySelector() {
  const { t, language } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState<CategoryId | null>(null);
  const [addingCategory, setAddingCategory] = useState<CategoryId | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const { data: sources } = useQuery<Source[]>({
    queryKey: ["/api/sources"],
  });

  const existingSourceUrls = sources?.map(s => s.config.url).filter(Boolean) as string[] || [];

  const availableCategories = getAvailableCategories(language);
  const currentPreset = selectedCategory ? categoryPresets.find(p => p.id === selectedCategory) : null;

  const addSourceMutation = useMutation({
    mutationFn: async (source: { name: string; type: string; config: { url: string }; isEnabled: boolean; categoryId?: string }) => {
      return apiRequest("POST", "/api/sources", source);
    },
  });

  const handleAddCategory = async (categoryId: CategoryId) => {
    const preset = categoryPresets.find(p => p.id === categoryId);
    if (!preset) return;

    setAddingCategory(categoryId);
    const categorySources = preset.sources[language];
    
    let addedCount = 0;
    let skippedCount = 0;

    for (const source of categorySources) {
      if (existingSourceUrls.includes(source.url)) {
        skippedCount++;
        continue;
      }

      try {
        await addSourceMutation.mutateAsync({
          name: source.name,
          type: "rss",
          config: { url: source.url },
          isEnabled: true,
          categoryId: categoryId,
        });
        addedCount++;
      } catch (error) {
        console.error("Failed to add source:", source.name, error);
      }
    }

    await queryClient.invalidateQueries({ queryKey: ["/api/sources"] });
    setAddingCategory(null);

    if (addedCount > 0) {
      toast({
        title: t("category.sourcesAdded"),
        description: t("category.sourcesAddedDesc")
          .replace("{count}", String(addedCount))
          .replace("{category}", t(`category.${categoryId}`)),
      });
    } else if (skippedCount > 0) {
      toast({
        title: t("category.alreadyExists"),
        description: t("category.alreadyExistsDesc"),
      });
    }
  };

  const getCategorySourceCount = (preset: CategoryPreset): number => {
    const categorySources = preset.sources[language];
    const newSources = categorySources.filter(s => !existingSourceUrls.includes(s.url));
    return newSources.length;
  };

  const isFullyAdded = (preset: CategoryPreset): boolean => {
    const categorySources = preset.sources[language];
    return categorySources.length > 0 && categorySources.every(s => existingSourceUrls.includes(s.url));
  };

  const handleCategoryClick = (categoryId: CategoryId) => {
    if (selectedCategory === categoryId) {
      setSelectedCategory(null);
    } else {
      setSelectedCategory(categoryId);
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} data-testid="card-category-selector">
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-card/50 border border-border/50 hover:bg-card/80 transition-colors text-left">
          <div className="flex items-center gap-2 min-w-0">
            <Plus className="h-4 w-4 text-primary shrink-0" />
            <span className="font-medium text-sm truncate">{t("category.title")}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {availableCategories.length} {language === "ru" ? "категорий" : "categories"}
            </span>
            {isOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="px-3 py-3 bg-card/30 border-x border-b border-border/50 space-y-3">
          <p className="text-xs text-muted-foreground">
            {t("category.description")}
          </p>

          <div className="flex flex-wrap gap-1.5">
            {availableCategories.map((preset) => {
              const Icon = preset.icon;
              const isSelected = selectedCategory === preset.id;
              const isAdded = isFullyAdded(preset);
              const newCount = getCategorySourceCount(preset);
              const isLoading = addingCategory === preset.id;

              return (
                <button
                  key={preset.id}
                  onClick={() => handleCategoryClick(preset.id)}
                  disabled={isLoading}
                  className={`
                    inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium
                    border transition-all
                    ${isAdded 
                      ? "bg-primary/10 border-primary/30 text-primary/70" 
                      : isSelected
                        ? "bg-primary border-primary text-primary-foreground"
                        : "bg-background/80 border-border hover:border-primary/50 hover:bg-primary/5 text-foreground"
                    }
                    ${isLoading ? "opacity-50" : ""}
                  `}
                  data-testid={`button-category-${preset.id}`}
                >
                  {isLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : isAdded ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Icon className="h-3 w-3" />
                  )}
                  <span>{t(`category.${preset.id}`)}</span>
                  {!isAdded && newCount > 0 && (
                    <span className={`
                      ml-0.5 px-1 py-0 text-[10px] leading-tight
                      ${isSelected ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary/10 text-primary"}
                    `}>
                      +{newCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {currentPreset && (
            <div className="pt-2 border-t border-border/30 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-medium text-sm">{t(`category.${selectedCategory}`)}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {currentPreset.sources[language].length} {t("category.sources")}
                  </span>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleAddCategory(selectedCategory!)}
                  disabled={addingCategory !== null || isFullyAdded(currentPreset)}
                  className="shrink-0 h-7 text-xs"
                  data-testid="button-add-category-sources"
                >
                  {addingCategory === selectedCategory ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      {t("category.adding")}
                    </>
                  ) : isFullyAdded(currentPreset) ? (
                    <>
                      <Check className="h-3 w-3 mr-1" />
                      {t("category.added")}
                    </>
                  ) : (
                    <>
                      <Plus className="h-3 w-3 mr-1" />
                      {t("category.addAll")}
                    </>
                  )}
                </Button>
              </div>

              <div className="flex flex-wrap gap-1">
                {currentPreset.sources[language].map((source) => {
                  const isExisting = existingSourceUrls.includes(source.url);
                  return (
                    <span
                      key={source.url}
                      className={`
                        inline-flex items-center gap-1 px-2 py-0.5 text-xs
                        ${isExisting 
                          ? "bg-muted/30 text-muted-foreground" 
                          : "bg-muted/60 text-foreground"
                        }
                      `}
                      data-testid={`source-preview-${source.name.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      {isExisting && <Check className="h-2.5 w-2.5" />}
                      {source.name}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
