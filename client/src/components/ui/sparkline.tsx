import * as React from "react";
import { cn } from "@/lib/utils";

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
  trend?: "up" | "down" | "stable";
}

export function Sparkline({ 
  data, 
  width = 60, 
  height = 20, 
  className,
  trend 
}: SparklineProps) {
  const svgRef = React.useRef<SVGSVGElement>(null);

  React.useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const svg = svgRef.current;
    const pathElement = svg.querySelector('path');
    if (!pathElement) return;

    const maxValue = Math.max(...data);
    const minValue = Math.min(...data);
    const valueRange = maxValue - minValue || 1;
    const stepX = width / (data.length - 1);

    const pathData = data
      .map((value, index) => {
        const x = index * stepX;
        const y = height - ((value - minValue) / valueRange) * height;
        return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');

    pathElement.setAttribute('d', pathData);
  }, [data, width, height]);

  const getColor = () => {
    if (trend === "up") return "text-green-500";
    if (trend === "down") return "text-red-500";
    return "text-gray-500";
  };

  if (data.length === 0) {
    return (
      <div className={cn("sparkline-container", className)}>
        <div className="text-xs text-muted-foreground">-</div>
      </div>
    );
  }

  return (
    <div className={cn("sparkline-container", className)}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="overflow-visible"
      >
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={getColor()}
        />
      </svg>
    </div>
  );
}
