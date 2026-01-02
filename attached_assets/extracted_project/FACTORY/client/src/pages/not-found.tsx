import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FileQuestion, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="max-w-md w-full">
        <CardContent className="pt-8 pb-6 text-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-muted mx-auto mb-4">
            <FileQuestion className="h-8 w-8 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-bold mb-2" data-testid="text-404-title">
            Page Not Found
          </h1>
          <p className="text-muted-foreground mb-6" data-testid="text-404-description">
            The page you're looking for doesn't exist or has been moved.
          </p>
          <Link href="/">
            <Button data-testid="button-go-home">
              <Home className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
