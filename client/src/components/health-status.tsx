import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RefreshCcw, AlertTriangle, CheckCircle, Clock, X } from "lucide-react";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";

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
  ui?: {
    setup_complete: boolean;
    should_prompt: boolean;
    suppress_until: number;
  };
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
  const queryClient = useQueryClient();

  // Fetch health status with polling every 30 seconds
  const { data: health, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/health'],
    refetchInterval: 30000, // Poll every 30 seconds
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });

  // Suppress prompts mutation
  const suppressMutation = useMutation({
    mutationFn: async (days: number) => {
      const response = await apiRequest('POST', '/api/secrets/suppress', { days });
      return await response.json();
    },
    onSuccess: (data) => {
      // Update local storage as backup cache
      localStorage.setItem('envSuppressUntil', String(data.suppress_until));
      // Refresh health data
      refetch();
    }
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 500); // Visual feedback
  };

  const handleSuppressPrompts = async (days: number = 30) => {
    try {
      await suppressMutation.mutateAsync(days);
    } catch (error) {
      console.error('Failed to suppress prompts:', error);
    }
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

  // Banner logic: Separate from badge display
  const serverPrompt = !!healthData?.ui?.should_prompt;
  const serverSuppressUntil = Number(healthData?.ui?.suppress_until || 0);
  
  // Local storage backup cache (for server restarts)
  const localUntil = Number(localStorage.getItem('envSuppressUntil') || '0');
  const now = Date.now();
  const shouldPrompt = serverPrompt && now >= Math.max(serverSuppressUntil, localUntil);

  return (
    <div className="space-y-3">
      {/* Health Status Badges (always visible) */}
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

      {/* API Key Setup Banner (conditional display) */}
      {shouldPrompt && (
        <Alert className="border-yellow-200 bg-yellow-50" data-testid="env-prompt">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="flex items-center justify-between">
            <span className="text-sm">
              API 키/환경설정을 확인해 주세요. 시스템이 완전히 작동하려면 모든 서비스 키가 필요합니다.
            </span>
            <div className="flex gap-2 ml-4">
              <Button
                size="sm"
                variant="outline"
                onClick={handleRefresh}
                disabled={isRefreshing}
                data-testid="button-recheck-env"
              >
                {isRefreshing ? (
                  <RefreshCcw className="w-3 h-3 animate-spin mr-1" />
                ) : (
                  <RefreshCcw className="w-3 h-3 mr-1" />
                )}
                다시 확인
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleSuppressPrompts(30)}
                disabled={suppressMutation.isPending}
                data-testid="button-suppress-env"
              >
                {suppressMutation.isPending ? (
                  <Clock className="w-3 h-3 animate-pulse mr-1" />
                ) : (
                  <X className="w-3 h-3 mr-1" />
                )}
                30일간 묻지 않기
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}