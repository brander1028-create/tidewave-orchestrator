import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { 
  Search, 
  Database, 
  FileText, 
  History, 
  FolderOpen,
  Activity,
  Settings,
  TestTube,
  X,
  Menu,
  Workflow,
  Layers
} from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function Sidebar({ isOpen, onToggle }: SidebarProps) {
  const [location] = useLocation();

  // Simple health check for the sidebar indicator
  const { data: health } = useQuery<any>({
    queryKey: ["/api/health"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const menuItems = [
    {
      href: "/",
      label: "검색",
      icon: Search,
      description: "키워드 SERP 분석",
      active: location === "/" || location.startsWith("/dashboard"),
    },
    {
      href: "/stepwise-search",
      label: "단계별 검색",
      icon: Workflow,
      description: "3단계 블로그 분석 프로세스",
      active: location === "/stepwise-search" || location.startsWith("/stepwise-search"),
    },
    {
      href: "/keywords", 
      label: "키워드 관리",
      icon: Database,
      description: "키워드 데이터베이스",
      active: location === "/keywords" || location.startsWith("/keywords/"),
    },
    {
      href: "/title-analysis",
      label: "제목 분석", 
      icon: FileText,
      description: "블로그 제목 키워드 추출",
      active: location === "/title-analysis" || location.startsWith("/title-analysis/"),
    },
    {
      href: "/blog-database",
      label: "블로그 DB",
      icon: FolderOpen, 
      description: "블로그 데이터베이스 관리",
      active: location === "/blog-database" || location.startsWith("/blog-database"),
    },
    {
      href: "/stepwise-db",
      label: "단계별 DB",
      icon: Layers,
      description: "단계별 수집된 블로그 현황",
      active: location === "/stepwise-db" || location.startsWith("/stepwise-db"),
    },
    {
      href: "/history",
      label: "히스토리",
      icon: History,
      description: "분석 기록",
      active: location === "/history" || location.startsWith("/history"),
    },
    {
      href: "/sandbox",
      label: "샌드박스",
      icon: TestTube,
      description: "알고리즘 테스트 및 Canary 시스템",
      active: location === "/sandbox" || location.startsWith("/sandbox"),
    },
    {
      href: "/admin",
      label: "관리자",
      icon: Settings,
      description: "점수 엔진 설정 관리",
      active: location === "/admin" || location.startsWith("/admin"),
    },
  ];

  // Determine health status color
  const getHealthColor = () => {
    if (!health) return "bg-gray-400";
    
    // Check for issues in health response
    const hasIssues = health.degraded || 
                     (health.searcha && !health.searcha.ok) ||
                     (health.openapi && !health.openapi.ok);
    
    return hasIssues ? "bg-yellow-500" : "bg-green-500";
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onToggle}
        />
      )}
      
      {/* Sidebar */}
      <div className={`
        fixed top-0 left-0 h-full w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 z-50 transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:z-auto
      `}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Activity className="text-white h-4 w-4" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-gray-900 dark:text-white">SERP 분석</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">키워드 관리 도구</p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onToggle}
            className="lg:hidden"
            data-testid="close-sidebar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Menu Items */}
        <nav className="flex-1 px-2 py-4 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <Button
                  variant={item.active ? "secondary" : "ghost"}
                  className={`
                    w-full justify-start h-10 px-3 text-sm font-normal
                    ${item.active 
                      ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white' 
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }
                  `}
                  onClick={() => {
                    // Close sidebar on mobile after navigation
                    if (window.innerWidth < 1024) {
                      onToggle();
                    }
                  }}
                  data-testid={`sidebar-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <Icon className="mr-3 h-4 w-4" />
                  <span>{item.label}</span>
                </Button>
              </Link>
            );
          })}
        </nav>

        {/* Health Status - Simple indicator at bottom */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
            <div className={`w-2 h-2 rounded-full ${getHealthColor()}`} />
            <Activity className="h-4 w-4" />
            <span className="text-xs">시스템 상태</span>
          </div>
        </div>
      </div>
    </>
  );
}

{/* Mobile menu button component */}
export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="lg:hidden fixed top-4 left-4 z-30"
      data-testid="open-sidebar"
    >
      <Menu className="h-5 w-5" />
    </Button>
  );
}