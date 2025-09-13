import { useState } from "react";
import { Bell, Settings, User, Search, Database } from "lucide-react";
import { Link } from "wouter";
import KeywordInput from "@/components/keyword-input";
import SerpProgress from "@/components/serp-progress";
import SerpResults from "@/components/serp-results";
import HealthStatus from "@/components/health-status";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  const handleAnalysisStarted = (jobId: string) => {
    setCurrentJobId(jobId);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Search className="text-primary-foreground h-4 w-4" />
              </div>
              <h1 className="text-xl font-bold text-foreground">네이버 검색 순위 분석</h1>
            </div>
            <div className="flex items-center space-x-4">
              {/* Navigation */}
              <Link href="/keywords">
                <Button variant="outline" size="sm" data-testid="link-keywords">
                  <Database className="mr-2 h-4 w-4" />
                  키워드 관리
                </Button>
              </Link>
              
              {/* Health Status - Real-time monitoring badges */}
              <HealthStatus />
              
              <div className="h-6 w-px bg-border" /> {/* Separator */}
              
              <button 
                className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                data-testid="button-notifications"
              >
                <Bell className="h-4 w-4" />
              </button>
              <button 
                className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                data-testid="button-settings"
              >
                <Settings className="h-4 w-4" />
              </button>
              <div className="w-8 h-8 bg-secondary rounded-full flex items-center justify-center">
                <User className="text-secondary-foreground h-4 w-4" />
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Keyword Input Section */}
        <KeywordInput onAnalysisStarted={handleAnalysisStarted} />

        {/* Analysis Progress */}
        {currentJobId && (
          <SerpProgress jobId={currentJobId} />
        )}

        {/* Results Section */}
        {currentJobId && (
          <SerpResults jobId={currentJobId} />
        )}
      </main>
    </div>
  );
}
