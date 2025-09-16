import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface RankTrendChartProps {
  data: Array<{
    date: string;
    rank: number;
    score?: number;
    events?: Array<{ type: string; message: string }>;
  }>;
  title?: string;
  showEvents?: boolean;
}

export function RankTrendChart({ data, title = "순위 추이", showEvents = false }: RankTrendChartProps) {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-sm text-primary">
            순위: <span className="font-bold">{payload[0].value}위</span>
          </p>
          {data.score && (
            <p className="text-sm text-chart-3">
              점수: <span className="font-bold">{data.score}점</span>
            </p>
          )}
          {data.events && data.events.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-muted-foreground">이벤트:</p>
              {data.events.map((event: any, index: number) => (
                <p key={index} className="text-xs text-yellow-400">
                  • {event.message}
                </p>
              ))}
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <div className="w-2 h-2 bg-primary rounded-full"></div>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis 
                dataKey="date" 
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
              />
              <YAxis 
                reversed
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                label={{ value: '순위', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip content={<CustomTooltip />} />
              
              {/* Reference lines for important rank positions */}
              <ReferenceLine y={10} stroke="hsl(var(--chart-2))" strokeDasharray="2 2" />
              <ReferenceLine y={20} stroke="hsl(var(--chart-3))" strokeDasharray="2 2" />
              
              <Line
                key="rank"
                type="monotone"
                dataKey="rank"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ fill: "hsl(var(--primary))", strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, fill: "hsl(var(--primary))" }}
              />
              
              {/* Events as dots */}
              {showEvents && (
                <Line
                  key="events"
                  type="monotone"
                  dataKey="events"
                  stroke="transparent"
                  dot={(props: any) => {
                    if (props.payload?.events?.length > 0) {
                      return (
                        <circle
                          cx={props.cx}
                          cy={props.cy}
                          r={3}
                          fill="hsl(var(--chart-4))"
                          stroke="hsl(var(--background))"
                          strokeWidth={2}
                        />
                      );
                    }
                    return <g />;
                  }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
