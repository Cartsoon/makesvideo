import { LucideIcon, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="relative flex flex-col items-center justify-center py-12 sm:py-16 px-6 text-center">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/3 to-transparent opacity-50" />
      
      <div className="relative mb-6">
        <div className="absolute inset-0 blur-2xl bg-primary/10 rounded-full scale-150" />
        <div className="relative flex items-center justify-center w-20 h-20 sm:w-24 sm:h-24">
          <div className="absolute inset-0 rounded-full border border-dashed border-muted-foreground/30 animate-[spin_20s_linear_infinite]" />
          <div className="absolute inset-2 rounded-full border border-muted-foreground/20" />
          <div className="absolute inset-4 rounded-full bg-gradient-to-br from-muted/80 to-muted/40 backdrop-blur-sm" />
          <Icon className="relative h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground/70" strokeWidth={1.5} />
        </div>
      </div>
      
      <h3 className="relative text-base sm:text-lg font-semibold mb-2 tracking-tight" data-testid="text-empty-title">
        {title}
      </h3>
      <p className="relative text-muted-foreground text-xs sm:text-sm max-w-xs mb-6 leading-relaxed" data-testid="text-empty-description">
        {description}
      </p>
      
      {action && (
        <Button 
          onClick={action.onClick} 
          className="relative gap-2 group"
          data-testid="button-empty-action"
        >
          <Plus className="h-4 w-4 transition-transform group-hover:rotate-90" />
          {action.label}
        </Button>
      )}
    </div>
  );
}
