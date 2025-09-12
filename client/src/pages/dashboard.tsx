import { useState, useEffect } from "react";
import { Bell, Settings, User, TrendingUp } from "lucide-react";
import URLInput from "@/components/url-input";
import AnalysisProgress from "@/components/analysis-progress";
import RecentPosts from "@/components/recent-posts";
import KeywordExtraction from "@/components/keyword-extraction";
import SearchRankings from "@/components/search-rankings";
import DataVisualization from "@/components/data-visualization";
import ExportSection from "@/components/export-section";

export default function Dashboard() {
  const [currentBlogId, setCurrentBlogId] = useState<string | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  const handleAnalysisStarted = (blogId: string, jobId: string) => {
    setCurrentBlogId(blogId);
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
                <TrendingUp className="text-primary-foreground h-4 w-4" />
              </div>
              <h1 className="text-xl font-bold text-foreground">블로그 키워드 분석</h1>
            </div>
            <div className="flex items-center space-x-4">
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
        {/* URL Input Section */}
        <URLInput onAnalysisStarted={handleAnalysisStarted} />

        {/* Analysis Progress */}
        {currentJobId && (
          <AnalysisProgress jobId={currentJobId} />
        )}

        {/* Recent Posts */}
        {currentBlogId && (
          <RecentPosts blogId={currentBlogId} />
        )}

        {/* Main Content Grid */}
        {currentBlogId && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            <KeywordExtraction blogId={currentBlogId} />
            <SearchRankings blogId={currentBlogId} />
          </div>
        )}

        {/* Data Visualization */}
        {currentBlogId && (
          <DataVisualization blogId={currentBlogId} />
        )}

        {/* Export Section */}
        {currentBlogId && (
          <ExportSection blogId={currentBlogId} />
        )}
      </main>
    </div>
  );
}
