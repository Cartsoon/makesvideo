import { AppHeader } from "@/components/app-header";
import { BottomNav } from "@/components/bottom-nav";
import { DesktopSidebar } from "@/components/desktop-sidebar";
import { TipsBar } from "@/components/tips-bar";
import { Clapperboard, Camera, Film, Video, Play, Scissors } from "lucide-react";

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
  fullHeight?: boolean;
}

export function Layout({ children, title, fullHeight }: LayoutProps) {
  return (
    <div className={`min-h-screen bg-background relative ${fullHeight ? 'lg:h-screen lg:overflow-hidden' : ''}`}>
      <DesktopSidebar />
      
      <div className={`md:pl-56 ${fullHeight ? 'lg:h-screen lg:overflow-hidden lg:flex lg:flex-col' : ''}`}>
        <div className="md:hidden">
          <AppHeader title={title} />
        </div>
        
        {!fullHeight && <TipsBar />}
        
        <main className={`pb-20 md:pb-6 min-h-screen relative z-10 ${fullHeight ? 'lg:pb-0 lg:flex-1 lg:overflow-hidden lg:min-h-0' : ''}`}>
          {children}
        </main>
        
        <BottomNav />
      </div>

      <div className="video-bg-decorations hidden md:block">
        <Clapperboard className="video-decor-icon decor-clapperboard" size={140} />
        <Camera className="video-decor-icon decor-camera" size={100} />
        <Film className="video-decor-icon decor-film" size={160} />
        <Video className="video-decor-icon decor-video" size={80} />
        <Play className="video-decor-icon decor-play" size={60} />
        <Scissors className="video-decor-icon decor-scissors" size={90} />
      </div>
    </div>
  );
}
