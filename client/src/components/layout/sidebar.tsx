import { Link, useLocation } from "wouter";
import { 
  Home, 
  TrendingUp,
  ShoppingCart,
  Star, 
  BarChart3, 
  Inbox, 
  Bell, 
  Database,
  Settings,
  Activity,
  Search
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

// v7.12 개선: 대시보드 중심, 그룹화된 메뉴 구조  
interface NavigationItem {
  name: string;
  href: string;
  icon: any;
  badge?: string;
  description?: string;
}

interface NavigationGroup {
  title: string;
  items: NavigationItem[];
}

const navigationGroups: NavigationGroup[] = [
  {
    title: "대시보드",
    items: [
      { name: "대시보드", href: "/dashboard", icon: Home },
    ]
  },
  {
    title: "순위 모니터링",
    items: [
      { name: "블로그 순위", href: "/blog-rank", icon: Search },
      { name: "쇼핑몰 순위", href: "/shop-rank", icon: ShoppingCart },
      { name: "리뷰 랭킹", href: "/reviews", icon: Star },
      { name: "순위 체크 (통합)", href: "/rank", icon: Activity, description: "기존 통합 기능" },
    ]
  },
  {
    title: "분석 & 관리",
    items: [
      { name: "인사이트", href: "/insights", icon: BarChart3 },
      { name: "제출함", href: "/inbox", icon: Inbox, badge: "3" },
      { name: "알림", href: "/alerts", icon: Bell },
      { name: "데이터베이스", href: "/database", icon: Database },
    ]
  },
  {
    title: "설정",
    items: [
      { name: "설정", href: "/settings", icon: Settings },
    ]
  }
];

export default function Sidebar() {
  const [location] = useLocation();

  return (
    <aside className="w-64 bg-card border-r border-border flex-shrink-0">
      <div className="p-6">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">랭킹 모니터</h1>
        </div>

        <nav className="space-y-4">
          {navigationGroups.map((group) => (
            <div key={group.title} className="space-y-2">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3">
                {group.title}
              </h2>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const isActive = location === item.href || (location === "/" && item.href === "/dashboard");
                  const Icon = item.icon;
                  
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors",
                        isActive
                          ? "text-foreground bg-secondary"
                          : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                      )}
                      data-testid={`nav-${item.href.slice(1) || 'dashboard'}`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.name}</span>
                      {item.badge && (
                        <Badge variant="destructive" className="ml-auto">
                          {item.badge}
                        </Badge>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
}
