import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RefreshCcw, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { useState } from "react";

// Type definitions for health response
type ServiceStatus = {
  ok: boolean;
  mode?: 'fallback' | 'partial' | 'searchads';
  lastCheck?: string;
  stats?: {
    requested: number;
    ok: number;
    fail: number;
    http: Record<string, number>;
  };
  reason?: string;
};

type HealthResponse = {
  openapi: ServiceStatus;
  searchads: ServiceStatus;
  keywordsdb: ServiceStatus;
};

function StatusBadge({ 
  service, 
  status, 
  label 
}: { 
  service: string;
  status: ServiceStatus;
  label: string;
}) {
  const getVariant = () => {
    if (!status.ok) return "destructive";
    if (status.mode === 'fallback') return "secondary";
    if (status.mode === 'partial') return "outline";
    return "default";
  };

  const getIcon = () => {
    if (!status.ok) return <AlertTriangle className="w-3 h-3" />;
    if (status.mode === 'fallback') return <Clock className="w-3 h-3" />;
    return <CheckCircle className="w-3 h-3" />;
  };

  const getStatusText = () => {
    if (!status.ok) return "FAIL";
    if (status.mode === 'fallback') return "FALLBACK";
    if (status.mode === 'partial') return "PARTIAL";
    return "OK";
  };

  const getTooltipContent = () => {
    return (
      <div className="space-y-1 text-xs">
        <div className="font-medium">{label}</div>
        <div>Status: {getStatusText()}</div>
        {status.lastCheck && (
          <div>Last Check: {new Date(status.lastCheck).toLocaleTimeString()}</div>
        )}
        {status.reason && (
          <div>Reason: {status.reason}</div>
        )}
        {status.stats && (
          <div className="mt-2 pt-1 border-t">
            <div>Requests: {status.stats.requested}</div>
            <div>Success: {status.stats.ok}</div>
            <div>Failed: {status.stats.fail}</div>
            {Object.keys(status.stats.http).length > 0 && (
              <div>HTTP: {Object.entries(status.stats.http).map(([code, count]) => `${code}:${count}`).join(', ')}</div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge 
          variant={getVariant()}
          className="cursor-pointer hover:opacity-80 transition-opacity"
          data-testid={`badge-${service}`}
        >
          {getIcon()}
          <span className="ml-1">{label}</span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        {getTooltipContent()}
      </TooltipContent>
    </Tooltip>
  );
}

export default function HealthStatus() {
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch health status with polling every 30 seconds
  const { data: health, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/health'],
    refetchInterval: 30000, // Poll every 30 seconds
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 500); // Visual feedback
  };

  if (isLoading) {
    return (
      <div className="flex items-center space-x-2" data-testid="health-status-loading">
        <div className="text-sm text-muted-foreground">System Health:</div>
        <Badge variant="outline" className="animate-pulse">
          <Clock className="w-3 h-3 mr-1" />
          Loading...
        </Badge>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center space-x-2" data-testid="health-status-error">
        <div className="text-sm text-muted-foreground">System Health:</div>
        <Badge variant="destructive">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Error
        </Badge>
        <button
          onClick={handleRefresh}
          className="p-1 text-muted-foreground hover:text-foreground"
          data-testid="button-refresh-health"
        >
          <RefreshCcw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>
    );
  }

  const healthData = health as HealthResponse;
  
  // Calculate overall status - all services must be OK
  const overallHealthy = healthData?.openapi?.ok && 
                         healthData?.searchads?.ok && 
                         healthData?.keywordsdb?.ok;

  return (
    <div className="flex items-center space-x-2" data-testid="health-status">
      <div className="text-sm text-muted-foreground">System Health:</div>
      
      {/* Overall status indicator */}
      <Badge 
        variant={overallHealthy ? "default" : "secondary"}
        className="font-medium"
        data-testid="badge-overall-health"
      >
        {overallHealthy ? (
          <>
            <CheckCircle className="w-3 h-3 mr-1 text-green-500" />
            HEALTHY
          </>
        ) : (
          <>
            <AlertTriangle className="w-3 h-3 mr-1 text-yellow-500" />
            DEGRADED
          </>
        )}
      </Badge>

      {/* Individual service status badges */}
      {healthData && (
        <>
          <StatusBadge 
            service="openapi"
            status={healthData.openapi}
            label="OpenAPI"
          />
          <StatusBadge 
            service="searchads"
            status={healthData.searchads}
            label="SearchAds"
          />
          <StatusBadge 
            service="keywordsdb"
            status={healthData.keywordsdb}
            label="KeywordsDB"
          />
        </>
      )}

      {/* Manual refresh button */}
      <button
        onClick={handleRefresh}
        className="p-1 text-muted-foreground hover:text-foreground transition-colors"
        title="Refresh health status"
        data-testid="button-refresh-health"
      >
        <RefreshCcw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
}