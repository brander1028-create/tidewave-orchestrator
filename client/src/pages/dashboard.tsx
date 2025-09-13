import { useState } from "react";
import KeywordInput from "@/components/keyword-input";
import SerpProgress from "@/components/serp-progress";
import SerpResults from "@/components/serp-results";
import { Navigation } from "@/components/navigation";

export default function Dashboard() {
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  const handleAnalysisStarted = (jobId: string) => {
    setCurrentJobId(jobId);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <Navigation />

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
