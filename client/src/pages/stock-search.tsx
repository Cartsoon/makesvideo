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
  Loader2
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { apiRequest } from "@/lib/queryClient";
import type { StockAsset, StockMediaType, StockSearchResponse } from "@shared/schema";

export default function StockSearch() {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [mediaType, setMediaType] = useState<StockMediaType>("video");
  const [results, setResults] = useState<StockSearchResponse | null>(null);

  const searchMutation = useMutation({
    mutationFn: async ({ query, mediaType }: { query: string; mediaType: StockMediaType }) => {
      return apiRequest("POST", "/api/stock-search", { query, mediaType, limit: 30 }) as Promise<StockSearchResponse>;
    },
    onSuccess: (data) => {
      setResults(data);
    },
  });

  const handleSearch = () => {
    if (!query.trim()) return;
    searchMutation.mutate({ query: query.trim(), mediaType });
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

          {results && results.translatedQuery !== results.query && (
            <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {t("stock.translatedTo")}: <span className="font-medium">"{results.translatedQuery}"</span>
            </div>
          )}

          <TabsContent value="video" className="mt-4">
            <ResultsGrid 
              assets={results?.assets.filter(a => a.mediaType === "video") || []} 
              isLoading={searchMutation.isPending && mediaType === "video"}
              mediaType="video"
              getProviderColor={getProviderColor}
              formatDuration={formatDuration}
              t={t}
            />
          </TabsContent>
          <TabsContent value="photo" className="mt-4">
            <ResultsGrid 
              assets={results?.assets.filter(a => a.mediaType === "photo") || []} 
              isLoading={searchMutation.isPending && mediaType === "photo"}
              mediaType="photo"
              getProviderColor={getProviderColor}
              formatDuration={formatDuration}
              t={t}
            />
          </TabsContent>
          <TabsContent value="audio" className="mt-4">
            <ResultsGrid 
              assets={results?.assets.filter(a => a.mediaType === "audio") || []} 
              isLoading={searchMutation.isPending && mediaType === "audio"}
              mediaType="audio"
              getProviderColor={getProviderColor}
              formatDuration={formatDuration}
              t={t}
            />
          </TabsContent>
        </Tabs>
      </div>
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
}

function ResultsGrid({ assets, isLoading, mediaType, getProviderColor, formatDuration, t }: ResultsGridProps) {
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
          />
        ))}
      </div>
    </ScrollArea>
  );
}

interface AssetCardProps {
  asset: StockAsset;
  getProviderColor: (provider: string) => string;
  formatDuration: (seconds?: number) => string | null;
}

function AssetCard({ asset, getProviderColor, formatDuration }: AssetCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);

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
              className="w-full h-full object-cover"
              autoPlay
              muted
              loop
              onEnded={() => setIsPlaying(false)}
            />
          ) : (
            <>
              <img
                src={asset.thumbnailUrl || asset.previewUrl}
                alt={asset.title}
                className="w-full h-full object-cover"
                loading="lazy"
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
            className="w-full h-full object-cover"
            loading="lazy"
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
      </div>

      <div className="p-2 space-y-1">
        <p className="text-xs font-medium line-clamp-2" title={asset.title}>
          {asset.title}
        </p>
        
        {asset.author && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <User className="h-3 w-3" />
            <span className="truncate">{asset.author}</span>
          </div>
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
            Download
          </Button>
          {asset.authorUrl && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => window.open(asset.authorUrl, "_blank")}
              data-testid={`button-author-${asset.id}`}
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
