import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar, MobileMenuButton } from "@/components/sidebar";
import { useState } from "react";
import Dashboard from "@/pages/dashboard";
import KeywordsPage from "@/pages/keywords";
import TitleAnalysisPage from "@/pages/title-analysis";
import ResultsPage from "@/pages/results";
import HistoryPage from "@/pages/history";
import BlogDatabasePage from "@/pages/blog-database";
import AdminPage from "@/pages/admin";
import SandboxPage from "@/pages/sandbox";
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
      <Route path="/admin" component={AdminPage} />
      <Route path="/sandbox" component={SandboxPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onToggle={toggleSidebar} />
      
      {/* Main Content */}
      <div className="flex-1 lg:ml-64">
        {/* Mobile menu button */}
        <MobileMenuButton onClick={toggleSidebar} />
        
        {/* Page content */}
        <div className="h-full">
          <Router />
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AppLayout />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
