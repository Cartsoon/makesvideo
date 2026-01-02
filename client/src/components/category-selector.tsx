import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Plus, Check, Loader2 } from "lucide-react";
import { categoryPresets, defaultCategory, getAvailableCategories, type CategoryId, type CategoryPreset } from "@/lib/category-presets";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Source } from "@shared/schema";

export function CategorySelector() {
  const { t, language } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState<CategoryId>(defaultCategory);
  const [addingCategory, setAddingCategory] = useState<CategoryId | null>(null);

  const { data: sources } = useQuery<Source[]>({
    queryKey: ["/api/sources"],
  });

  const existingSourceUrls = sources?.map(s => s.config.url).filter(Boolean) as string[] || [];

  const availableCategories = getAvailableCategories(language);
  const currentPreset = categoryPresets.find(p => p.id === selectedCategory);

  const addSourceMutation = useMutation({
    mutationFn: async (source: { name: string; type: string; config: { url: string }; isEnabled: boolean }) => {
      return apiRequest("POST", "/api/sources", source);
    },
  });

  const handleAddCategory = async () => {
    if (!currentPreset) return;

    setAddingCategory(selectedCategory);
    const sources = currentPreset.sources[language];
    
    let addedCount = 0;
    let skippedCount = 0;

    for (const source of sources) {
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
          .replace("{category}", t(`category.${selectedCategory}`)),
      });
    } else if (skippedCount > 0) {
      toast({
        title: t("category.alreadyExists"),
        description: t("category.alreadyExistsDesc"),
      });
    }
  };

  const getCategorySourceCount = (preset: CategoryPreset): number => {
    const sources = preset.sources[language];
    const newSources = sources.filter(s => !existingSourceUrls.includes(s.url));
    return newSources.length;
  };

  const isFullyAdded = (preset: CategoryPreset): boolean => {
    const sources = preset.sources[language];
    return sources.length > 0 && sources.every(s => existingSourceUrls.includes(s.url));
  };

  return (
    <Card data-testid="card-category-selector">
      <CardHeader className="pb-3">
        <CardTitle className="text-base sm:text-lg">{t("category.title")}</CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          {t("category.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ScrollArea className="w-full whitespace-nowrap">
          <div className="flex gap-2 pb-2">
            {availableCategories.map((preset) => {
              const Icon = preset.icon;
              const isSelected = selectedCategory === preset.id;
              const isAdded = isFullyAdded(preset);
              const newCount = getCategorySourceCount(preset);

              return (
                <Button
                  key={preset.id}
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(preset.id)}
                  className={`flex-shrink-0 gap-1.5 ${isAdded ? "opacity-60" : ""}`}
                  data-testid={`button-category-${preset.id}`}
                >
                  {isAdded ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Icon className="h-3.5 w-3.5" />
                  )}
                  <span className="text-xs sm:text-sm">{t(`category.${preset.id}`)}</span>
                  {!isAdded && newCount > 0 && (
                    <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                      {newCount}
                    </Badge>
                  )}
                </Button>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        {currentPreset && (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h4 className="font-medium text-sm">
                  {t(`category.${selectedCategory}`)}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {currentPreset.sources[language].length} {t("category.sources")}
                </p>
              </div>
              <Button
                size="sm"
                onClick={handleAddCategory}
                disabled={addingCategory !== null || isFullyAdded(currentPreset)}
                data-testid="button-add-category-sources"
              >
                {addingCategory === selectedCategory ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    <span className="text-xs sm:text-sm">{t("category.adding")}</span>
                  </>
                ) : isFullyAdded(currentPreset) ? (
                  <>
                    <Check className="h-4 w-4 mr-1.5" />
                    <span className="text-xs sm:text-sm">{t("category.added")}</span>
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-1.5" />
                    <span className="text-xs sm:text-sm">{t("category.addAll")}</span>
                  </>
                )}
              </Button>
            </div>

            <div className="grid gap-1.5">
              {currentPreset.sources[language].map((source) => {
                const isExisting = existingSourceUrls.includes(source.url);
                return (
                  <div
                    key={source.url}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${
                      isExisting 
                        ? "bg-muted/30 text-muted-foreground" 
                        : "bg-muted/50"
                    }`}
                    data-testid={`source-preview-${source.name.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {isExisting && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                    <span className="truncate text-xs sm:text-sm">{source.name}</span>
                    {isExisting && (
                      <Badge variant="outline" className="ml-auto text-xs shrink-0">
                        {t("category.exists")}
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
