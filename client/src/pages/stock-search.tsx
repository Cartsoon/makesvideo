import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Search, 
  Video, 
  Image, 
  Music, 
  ExternalLink, 
  Download, 
  Play, 
  User,
  Clock,
  AlertCircle,
  Loader2,
  X,
  Maximize2
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n";
import { apiRequest } from "@/lib/queryClient";
import type { StockAsset, StockMediaType, StockOrientation, StockSearchResponse } from "@shared/schema";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Smartphone, Monitor } from "lucide-react";

export default function StockSearch() {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [mediaType, setMediaType] = useState<StockMediaType>("video");
  const [orientation, setOrientation] = useState<StockOrientation>("all");
  const [results, setResults] = useState<StockSearchResponse | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [allAssets, setAllAssets] = useState<StockAsset[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [previewAsset, setPreviewAsset] = useState<StockAsset | null>(null);

  const searchMutation = useMutation({
    mutationFn: async ({ query, mediaType, orientation, page }: { query: string; mediaType: StockMediaType; orientation: StockOrientation; page: number }) => {
      const res = await fetch("/api/stock-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, mediaType, orientation, limit: 30, page }),
      });
      if (!res.ok) throw new Error("Search failed");
      return res.json() as Promise<StockSearchResponse>;
    },
    onSuccess: (data, variables) => {
      if (variables.page === 1) {
        setAllAssets(data.assets);
      } else {
        setAllAssets(prev => [...prev, ...data.assets]);
      }
      setResults(data);
      setIsLoadingMore(false);
    },
  });

  const handleSearch = () => {
    if (!query.trim()) return;
    setCurrentPage(1);
    setAllAssets([]);
    searchMutation.mutate({ query: query.trim(), mediaType, orientation, page: 1 });
  };

  const handleLoadMore = () => {
    if (!query.trim() || isLoadingMore) return;
    setIsLoadingMore(true);
    const nextPage = currentPage + 1;
    setCurrentPage(nextPage);
    searchMutation.mutate({ query: query.trim(), mediaType, orientation, page: nextPage });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const getProviderColor = (provider: string) => {
    switch (provider) {
      case "pexels": return "bg-green-500/20 text-green-600 dark:text-green-400";
      case "pixabay": return "bg-blue-500/20 text-blue-600 dark:text-blue-400";
      case "unsplash": return "bg-purple-500/20 text-purple-600 dark:text-purple-400";
      case "freesound": return "bg-orange-500/20 text-orange-600 dark:text-orange-400";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return null;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : `${secs}s`;
  };

  return (
    <Layout title={t("stock.title")}>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">{t("stock.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("stock.subtitle")}</p>
        </div>

        <Tabs value={mediaType} onValueChange={(v) => setMediaType(v as StockMediaType)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="video" className="gap-2" data-testid="tab-video">
              <Video className="h-4 w-4" />
              <span className="hidden sm:inline">{t("stock.videos")}</span>
            </TabsTrigger>
            <TabsTrigger value="photo" className="gap-2" data-testid="tab-photo">
              <Image className="h-4 w-4" />
              <span className="hidden sm:inline">{t("stock.photos")}</span>
            </TabsTrigger>
            <TabsTrigger value="audio" className="gap-2" data-testid="tab-audio">
              <Music className="h-4 w-4" />
              <span className="hidden sm:inline">{t("stock.audio")}</span>
            </TabsTrigger>
          </TabsList>

          <div className="mt-4 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t("stock.searchPlaceholder")}
                className="pl-10"
                data-testid="input-stock-query"
              />
            </div>
            <Button 
              onClick={handleSearch} 
              disabled={!query.trim() || searchMutation.isPending}
              data-testid="button-stock-search"
            >
              {searchMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              <span className="ml-2 hidden sm:inline">{t("stock.search")}</span>
            </Button>
          </div>

          {mediaType !== "audio" && (
            <div className="flex flex-wrap gap-4 mt-3">
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="orientation-portrait" 
                  checked={orientation === "portrait" || orientation === "all"}
                  onCheckedChange={(checked) => {
                    if (checked && orientation === "landscape") setOrientation("all");
                    else if (checked) setOrientation("portrait");
                    else if (orientation === "all") setOrientation("landscape");
                    else setOrientation("all");
                  }}
                  data-testid="checkbox-portrait"
                />
                <Label htmlFor="orientation-portrait" className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <Smartphone className="h-4 w-4" />
                  {t("stock.portrait")}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="orientation-landscape" 
                  checked={orientation === "landscape" || orientation === "all"}
                  onCheckedChange={(checked) => {
                    if (checked && orientation === "portrait") setOrientation("all");
                    else if (checked) setOrientation("landscape");
                    else if (orientation === "all") setOrientation("portrait");
                    else setOrientation("all");
                  }}
                  data-testid="checkbox-landscape"
                />
                <Label htmlFor="orientation-landscape" className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <Monitor className="h-4 w-4" />
                  {t("stock.landscape")}
                </Label>
              </div>
            </div>
          )}

          {results && results.translatedQuery !== results.query && (
            <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {t("stock.translatedTo")}: <span className="font-medium">"{results.translatedQuery}"</span>
            </div>
          )}

          <TabsContent value="video" className="mt-4">
            <ResultsGrid 
              assets={allAssets.filter(a => a.mediaType === "video")} 
              isLoading={searchMutation.isPending && !isLoadingMore && mediaType === "video"}
              mediaType="video"
              getProviderColor={getProviderColor}
              formatDuration={formatDuration}
              t={t}
              hasMore={results?.hasMore}
              isLoadingMore={isLoadingMore}
              onLoadMore={handleLoadMore}
              onOpenPreview={setPreviewAsset}
            />
          </TabsContent>
          <TabsContent value="photo" className="mt-4">
            <ResultsGrid 
              assets={allAssets.filter(a => a.mediaType === "photo")} 
              isLoading={searchMutation.isPending && !isLoadingMore && mediaType === "photo"}
              mediaType="photo"
              getProviderColor={getProviderColor}
              formatDuration={formatDuration}
              t={t}
              hasMore={results?.hasMore}
              isLoadingMore={isLoadingMore}
              onLoadMore={handleLoadMore}
              onOpenPreview={setPreviewAsset}
            />
          </TabsContent>
          <TabsContent value="audio" className="mt-4">
            <ResultsGrid 
              assets={allAssets.filter(a => a.mediaType === "audio")} 
              isLoading={searchMutation.isPending && !isLoadingMore && mediaType === "audio"}
              mediaType="audio"
              getProviderColor={getProviderColor}
              formatDuration={formatDuration}
              t={t}
              hasMore={results?.hasMore}
              isLoadingMore={isLoadingMore}
              onLoadMore={handleLoadMore}
              onOpenPreview={setPreviewAsset}
            />
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={!!previewAsset} onOpenChange={(open) => !open && setPreviewAsset(null)}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden bg-card border-2 border-primary/20 gap-0" hideCloseButton>
          {previewAsset && (
            <div className="flex flex-col">
              {/* Corner markers - top */}
              <div className="absolute top-0 left-0 w-6 h-6 border-l-2 border-t-2 border-primary/60 rounded-tl-md z-10" />
              <div className="absolute top-0 right-0 w-6 h-6 border-r-2 border-t-2 border-primary/60 rounded-tr-md z-10" />
              
              {/* Media container with close button inside */}
              <div className="relative bg-black flex items-center justify-center min-h-[300px] max-h-[60vh]">
                {/* Close button - positioned on the video */}
                <button
                  onClick={() => setPreviewAsset(null)}
                  className="absolute top-3 right-3 z-30 bg-black/60 hover:bg-black/80 backdrop-blur-sm text-white p-2.5 rounded-full border-2 border-white/30 hover:border-white/60 transition-all shadow-lg"
                  data-testid="button-close-preview"
                >
                  <X className="h-5 w-5" />
                </button>
                {previewAsset.mediaType === "video" ? (
                  <video
                    src={previewAsset.previewUrl}
                    className="w-full h-full max-h-[60vh] object-contain"
                    autoPlay
                    controls
                    loop
                    playsInline
                    controlsList="nodownload"
                  />
                ) : previewAsset.mediaType === "photo" ? (
                  <img
                    src={previewAsset.downloadUrl || previewAsset.previewUrl}
                    alt={previewAsset.title}
                    className="w-full h-full max-h-[60vh] object-contain"
                  />
                ) : null}
              </div>
              
              {/* Info panel - separate from video */}
              <div className="p-4 bg-gradient-to-r from-primary/5 via-transparent to-accent/5 border-t border-border">
                {/* Title and author */}
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate">
                      {previewAsset.title}
                    </h3>
                    {previewAsset.author && (
                      <button
                        onClick={() => previewAsset.authorUrl && window.open(previewAsset.authorUrl, "_blank")}
                        className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 mt-0.5"
                      >
                        <User className="h-3 w-3" />
                        {previewAsset.author}
                      </button>
                    )}
                  </div>
                  
                  {/* Provider badge */}
                  <Badge 
                    variant="outline" 
                    className={`${getProviderColor(previewAsset.provider)} shrink-0`}
                  >
                    {previewAsset.provider}
                  </Badge>
                </div>
                
                {/* Meta info */}
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mb-3">
                  {previewAsset.duration && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDuration(previewAsset.duration)}
                    </span>
                  )}
                  {previewAsset.width && previewAsset.height && (
                    <span>{previewAsset.width}x{previewAsset.height}</span>
                  )}
                  {previewAsset.license && (
                    <span className="text-green-600 dark:text-green-400">{previewAsset.license}</span>
                  )}
                </div>
                
                {/* Tags */}
                {previewAsset.tags && previewAsset.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {previewAsset.tags.slice(0, 6).map((tag, i) => (
                      <Badge key={i} variant="secondary" className="text-xs px-2 py-0">
                        {tag}
                      </Badge>
                    ))}
                    {previewAsset.tags.length > 6 && (
                      <Badge variant="secondary" className="text-xs px-2 py-0">
                        +{previewAsset.tags.length - 6}
                      </Badge>
                    )}
                  </div>
                )}
                
                {/* Action buttons */}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="bg-gradient-to-r from-primary to-accent text-primary-foreground"
                    onClick={() => window.open(previewAsset.downloadUrl, "_blank")}
                    data-testid="button-download-preview"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {t("stock.download")}
                  </Button>
                  {previewAsset.sourceUrl && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(previewAsset.sourceUrl, "_blank")}
                      data-testid="button-source-preview"
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      {t("stock.openSource")}
                    </Button>
                  )}
                </div>
              </div>
              
              {/* Corner markers - bottom */}
              <div className="absolute bottom-0 left-0 w-6 h-6 border-l-2 border-b-2 border-accent/60 rounded-bl-md" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-r-2 border-b-2 border-accent/60 rounded-br-md" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

interface ResultsGridProps {
  assets: StockAsset[];
  isLoading: boolean;
  mediaType: StockMediaType;
  getProviderColor: (provider: string) => string;
  formatDuration: (seconds?: number) => string | null;
  t: (key: string) => string;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  onOpenPreview: (asset: StockAsset) => void;
}

function ResultsGrid({ assets, isLoading, mediaType, getProviderColor, formatDuration, t, hasMore, isLoadingMore, onLoadMore, onOpenPreview }: ResultsGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <Skeleton className="aspect-[9/16] w-full" />
            <div className="p-2 space-y-1">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>{t("stock.noResults")}</p>
        <p className="text-sm mt-1">{t("stock.tryDifferent")}</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[calc(100vh-280px)]">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 pb-4">
        {assets.map((asset) => (
          <AssetCard 
            key={asset.id} 
            asset={asset} 
            getProviderColor={getProviderColor}
            formatDuration={formatDuration}
            t={t}
            onOpenPreview={onOpenPreview}
          />
        ))}
      </div>
      
      {hasMore && onLoadMore && (
        <div className="flex justify-center py-4">
          <Button 
            variant="outline" 
            onClick={onLoadMore}
            disabled={isLoadingMore}
            data-testid="button-load-more"
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t("stock.loading")}
              </>
            ) : (
              t("stock.loadMore")
            )}
          </Button>
        </div>
      )}
    </ScrollArea>
  );
}

interface AssetCardProps {
  asset: StockAsset;
  getProviderColor: (provider: string) => string;
  formatDuration: (seconds?: number) => string | null;
  t: (key: string) => string;
  onOpenPreview: (asset: StockAsset) => void;
}

function AssetCard({ asset, getProviderColor, formatDuration, t, onOpenPreview }: AssetCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [thumbnailError, setThumbnailError] = useState(false);
  const [thumbnailLoaded, setThumbnailLoaded] = useState(false);

  const thumbnailSrc = thumbnailError 
    ? asset.previewUrl 
    : (asset.thumbnailUrl || asset.previewUrl);

  const handleVideoClick = () => {
    if (isPlaying) {
      onOpenPreview(asset);
    }
  };

  return (
    <Card 
      className="overflow-hidden group hover-elevate"
      data-testid={`card-asset-${asset.id}`}
    >
      <div className="relative aspect-[9/16] bg-muted">
        {asset.mediaType === "video" ? (
          isPlaying ? (
            <video
              src={asset.previewUrl}
              className="w-full h-full object-cover cursor-pointer"
              autoPlay
              muted
              loop
              playsInline
              onClick={handleVideoClick}
              onEnded={() => setIsPlaying(false)}
            />
          ) : (
            <>
              {!thumbnailLoaded && !thumbnailError && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted">
                  <Video className="h-8 w-8 text-muted-foreground/50" />
                </div>
              )}
              <img
                src={thumbnailSrc}
                alt={asset.title}
                className={`w-full h-full object-cover transition-opacity ${thumbnailLoaded ? 'opacity-100' : 'opacity-0'}`}
                loading="lazy"
                onLoad={() => setThumbnailLoaded(true)}
                onError={() => {
                  setThumbnailError(true);
                  setThumbnailLoaded(true);
                }}
              />
              <button
                onClick={() => setIsPlaying(true)}
                className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity"
                data-testid={`button-play-${asset.id}`}
              >
                <Play className="h-10 w-10 text-white" fill="white" />
              </button>
            </>
          )
        ) : asset.mediaType === "photo" ? (
          <img
            src={asset.previewUrl}
            alt={asset.title}
            className="w-full h-full object-cover cursor-pointer"
            loading="lazy"
            onClick={() => onOpenPreview(asset)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-accent/20">
            <Music className="h-12 w-12 text-primary/60" />
            {asset.previewUrl && (
              <audio
                src={asset.previewUrl}
                className="absolute bottom-2 left-2 right-2"
                controls
                preload="none"
              />
            )}
          </div>
        )}

        {asset.duration && (
          <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDuration(asset.duration)}
          </div>
        )}

        <Badge 
          className={`absolute top-2 left-2 text-[10px] ${getProviderColor(asset.provider)}`}
        >
          {asset.provider}
        </Badge>
        
        {isPlaying && (
          <button
            onClick={() => onOpenPreview(asset)}
            className="absolute top-2 right-2 bg-black/70 text-white p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            data-testid={`button-fullscreen-${asset.id}`}
          >
            <Maximize2 className="h-3 w-3" />
          </button>
        )}
      </div>

      <div className="p-2 space-y-1">
        <p className="text-xs font-medium line-clamp-2" title={asset.title}>
          {asset.title}
        </p>
        
        {asset.author && (
          <button 
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors cursor-pointer"
            onClick={() => asset.authorUrl && window.open(asset.authorUrl, "_blank")}
            data-testid={`button-author-collection-${asset.id}`}
          >
            <User className="h-3 w-3" />
            <span className="truncate">{asset.author}</span>
          </button>
        )}

        <div className="flex gap-1 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-7 text-xs"
            onClick={() => window.open(asset.downloadUrl, "_blank")}
            data-testid={`button-download-${asset.id}`}
          >
            <Download className="h-3 w-3 mr-1" />
            {t("stock.download")}
          </Button>
          {asset.sourceUrl && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => window.open(asset.sourceUrl, "_blank")}
              data-testid={`button-source-${asset.id}`}
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
