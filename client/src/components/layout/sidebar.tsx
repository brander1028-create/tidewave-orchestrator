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
  Settings
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const navigation = [
  { name: "대시보드(블로그)", href: "/dashboard", icon: Home },
  { name: "블로그 순위", href: "/blog-rank", icon: TrendingUp },
  { name: "쇼핑몰 순위", href: "/shop-rank", icon: ShoppingCart },
  { name: "리뷰 랭킹", href: "/reviews", icon: Star },
  { name: "인사이트", href: "/insights", icon: BarChart3 },
  { name: "제출함", href: "/inbox", icon: Inbox, badge: "3" },
  { name: "알림", href: "/alerts", icon: Bell },
  { name: "데이터베이스", href: "/database", icon: Database },
  { name: "설정", href: "/settings", icon: Settings },
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

        <nav className="space-y-2">
          {navigation.map((item) => {
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
        </nav>
      </div>
    </aside>
  );
}
