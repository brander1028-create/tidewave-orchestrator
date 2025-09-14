import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Database, Activity, FileText } from "lucide-react";
import HealthStatus from "@/components/health-status";

export function Navigation() {
  const [location] = useLocation();

  const navItems = [
    {
      href: "/",
      label: "SERP 분석",
      icon: Search,
      description: "네이버 검색 순위 분석",
      active: location === "/" || location.startsWith("/dashboard"),
    },
    {
      href: "/keywords",
      label: "키워드 관리",
      icon: Database,
      description: "키워드 데이터베이스 관리",
      active: location === "/keywords" || location.startsWith("/keywords/"),
    },
    {
      href: "/title-analysis",
      label: "제목 분석",
      icon: FileText,
      description: "블로그 제목 키워드 추출",
      active: location === "/title-analysis" || location.startsWith("/title-analysis/"),
    },
  ];

  return (
    <header className="bg-card border-b border-border sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo and Title */}
          <div className="flex items-center space-x-4">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Activity className="text-primary-foreground h-4 w-4" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Health Gate + SERP</h1>
              <p className="text-xs text-muted-foreground">통합 건강 모니터링 + 키워드 분석</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex items-center space-x-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Button
                  key={item.href}
                  asChild
                  variant={item.active ? "default" : "ghost"}
                  size="sm"
                  className="flex items-center space-x-2"
                  data-testid={`nav-${item.href === "/" ? "dashboard" : item.href === "/keywords" ? "keywords" : "title-analysis"}`}
                >
                  <Link 
                    href={item.href}
                    aria-current={item.active ? "page" : undefined}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{item.label}</span>
                    {item.active && (
                      <Badge variant="secondary" className="ml-1 px-1.5 py-0.5 text-xs">
                        활성
                      </Badge>
                    )}
                  </Link>
                </Button>
              );
            })}
          </nav>

          {/* Health Status and User Section */}
          <div className="flex items-center space-x-4">
            <HealthStatus />
            <div className="h-6 w-px bg-border" />
            <div className="w-8 h-8 bg-secondary rounded-full flex items-center justify-center">
              <Search className="text-secondary-foreground h-4 w-4" />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}