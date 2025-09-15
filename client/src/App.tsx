import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "@/pages/dashboard";
import KeywordsPage from "@/pages/keywords";
import TitleAnalysisPage from "@/pages/title-analysis";
import ResultsPage from "@/pages/results";
import HistoryPage from "@/pages/history";
import BlogDatabasePage from "@/pages/blog-database";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/keywords" component={KeywordsPage} />
      <Route path="/title-analysis" component={TitleAnalysisPage} />
      <Route path="/results/:jobId" component={ResultsPage} />
      <Route path="/history" component={HistoryPage} />
      <Route path="/blog-database" component={BlogDatabasePage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
