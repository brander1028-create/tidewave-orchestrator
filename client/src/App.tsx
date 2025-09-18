import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import MainLayout from "@/components/layout/main-layout";
import Dashboard from "@/pages/dashboard";
import Rank from "@/pages/rank";
import BlogRank from "@/pages/blog-rank";
import ShopRank from "@/pages/shop-rank";
import Reviews from "@/pages/reviews";
import Insights from "@/pages/insights";
import Inbox from "@/pages/inbox";
import Alerts from "@/pages/alerts";
import DatabasePage from "@/pages/database";
import Settings from "@/pages/settings";
import Exports from "@/pages/exports";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <MainLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/blog-rank" component={BlogRank} />
        <Route path="/shop-rank" component={ShopRank} />
        <Route path="/rank" component={Rank} />
        <Route path="/reviews" component={Reviews} />
        <Route path="/insights" component={Insights} />
        <Route path="/inbox" component={Inbox} />
        <Route path="/alerts" component={Alerts} />
        <Route path="/database" component={DatabasePage} />
        <Route path="/settings" component={Settings} />
        <Route path="/exports" component={Exports} />
        <Route component={NotFound} />
      </Switch>
    </MainLayout>
  );
}

function App() {
  // v7.19: localStorage 초기화는 main.tsx에서 미리 처리됨

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="dark">
          <Toaster />
          <Router />
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
