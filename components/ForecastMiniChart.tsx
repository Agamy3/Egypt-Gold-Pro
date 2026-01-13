/**
 * Lightweight SVG Chart Component
 * 
 * Simple line chart for forecast data - no external dependencies
 * 
 * Historical Data Sources Recommendation:
 * - Global XAUUSD: Use Metals-API (metals-api.com) or GoldAPI.io historical endpoints
 *   for daily OHLC data. Store in DB as daily aggregates.
 * - Local Market: Continue using snapshots DB (goldbullioneg + web sources) aggregated
 *   to daily points for historical analysis.
 * - Fallback: Alpha Vantage FX Daily/Intraday (if available), but avoid unofficial
 *   scrapers (Stooq/Yahoo Finance) due to ToS and stability concerns.
 */

'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { useLang } from './LanguageProvider';

interface ChartPoint {
  t: number; // timestamp (ms epoch)
  v: number; // value
}

interface ForecastMiniChartProps {
  points: ChartPoint[];
  unit?: 'EGP' | 'USD' | 'AED' | 'SAR';
  range?: 'daily' | 'weekly' | 'monthly' | 'yoy';
  height?: number;
  strokeColor?: string;
  loading?: boolean;
}

export default function ForecastMiniChart({
  points,
  unit = 'EGP',
  range = 'daily',
  height,
  strokeColor = '#3b82f6',
  loading = false,
}: ForecastMiniChartProps) {
  const { lang } = useLang();
  const isRTL = lang === 'ar';
  
  // Hover state for tooltip
  const [hover, setHover] = useState<{
    i: number;
    x: number;
    y: number;
    svgX: number;
    svgY: number;
    point: ChartPoint;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(height || 240);
  const heightRef = useRef<number>(height || 240);

  // Update height ref when prop changes
  useEffect(() => {
    if (height) {
      heightRef.current = height;
    }
  }, [height]);

  // Get actual container height on mount and resize
  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        // Only update if we get a valid height that's not too small
        if (rect.height > 100) {
          setContainerHeight(rect.height);
          heightRef.current = rect.height;
        } else {
          // Use the ref value to maintain previous height
          setContainerHeight(heightRef.current);
        }
      } else {
        // Use the ref value to maintain previous height
        setContainerHeight(heightRef.current);
      }
    };

    // Use requestAnimationFrame with a small delay to ensure DOM is fully rendered
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        updateHeight();
      });
    });
    
    // Use ResizeObserver if available for better performance
    if (containerRef.current && typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const newHeight = entry.contentRect.height;
          // Only update if we get a valid height that's not too small
          if (newHeight > 100) {
            setContainerHeight(newHeight);
            heightRef.current = newHeight;
          }
        }
      });
      resizeObserver.observe(containerRef.current);
      return () => resizeObserver.disconnect();
    } else {
      // Fallback to window resize
      window.addEventListener('resize', updateHeight);
      return () => window.removeEventListener('resize', updateHeight);
    }
  }, []); // Empty deps - only run on mount/unmount

  // Recalculate height when points change (after data loads)
  useEffect(() => {
    if (!loading && points && points.length > 0) {
      const updateHeight = () => {
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          if (rect.height > 100) {
            setContainerHeight(rect.height);
            heightRef.current = rect.height;
          }
        }
      };
      // Delay to ensure DOM has updated after data load
      const timeoutId = setTimeout(() => {
        requestAnimationFrame(() => {
          updateHeight();
        });
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [loading, points?.length]);

  // Use container height if available, otherwise use prop or default to 240px
  const chartHeight = containerHeight || height || 240;
  
  // Fixed padding/margins - adjust for RTL
  // In RTL, Y labels go on the right, so padRight needs more space
  const padLeft = isRTL ? 16 : 72;
  const padRight = isRTL ? 72 : 16;
  const padTop = 12;
  const padBottom = 28;

  // Chart dimensions
  const width = 800; // Base width, will be responsive via viewBox
  const w = width - padLeft - padRight;
  const h = chartHeight - padTop - padBottom;

  // Empty/loading states
  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <svg
          viewBox={`0 0 ${width} ${chartHeight}`}
          className="w-full h-full"
          preserveAspectRatio="xMidYMid meet"
        >
          <text
            x={width / 2}
            y={chartHeight / 2}
            textAnchor="middle"
            fontSize="14"
            fill="#6b7280"
          >
            Loading…
          </text>
        </svg>
      </div>
    );
  }

  if (!points || points.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <svg
          viewBox={`0 0 ${width} ${chartHeight}`}
          className="w-full h-full"
          preserveAspectRatio="xMidYMid meet"
        >
          <text
            x={width / 2}
            y={chartHeight / 2}
            textAnchor="middle"
            fontSize="14"
            fill="#6b7280"
          >
            {typeof window !== 'undefined' && (localStorage.getItem('egp_lang') === 'ar' ? 'لا توجد بيانات' : 'No data available')}
          </text>
        </svg>
      </div>
    );
  }

  // Filter and sort points
  const validPoints = points
    .filter(p => p && typeof p.v === 'number' && isFinite(p.v) && p.t > 0)
    .sort((a, b) => a.t - b.t);

  // Debug logging
  if (points.length > 0 && validPoints.length === 0) {
    console.warn('[ForecastMiniChart] Received', points.length, 'points but none are valid:', points.slice(0, 3));
  }

  if (validPoints.length < 2) {
    return (
      <div className="w-full h-full">
        <svg
          viewBox={`0 0 ${width} ${chartHeight}`}
          className="w-full h-full"
          preserveAspectRatio="xMidYMid meet"
          style={{ width: '100%', height: '100%' }}
        >
          <text
            x={width / 2}
            y={chartHeight / 2}
            textAnchor="middle"
            fontSize="14"
            fill="#6b7280"
          >
            {typeof window !== 'undefined' && (localStorage.getItem('egp_lang') === 'ar' ? 'بيانات غير كافية' : 'Not enough data')}
          </text>
        </svg>
      </div>
    );
  }

  // Calculate Y-axis range
  const values = validPoints.map(p => p.v);
  let minV = Math.min(...values);
  let maxV = Math.max(...values);
  
  // If equal, widen by ±1
  if (minV === maxV) {
    minV -= 1;
    maxV += 1;
  }
  
  // Add padding (5%)
  const rangeV = maxV - minV;
  minV -= rangeV * 0.05;
  maxV += rangeV * 0.05;

  // Downsample points if too many (for monthly/yoy ranges)
  let displayPoints = validPoints;
  if (validPoints.length > 120) {
    const step = validPoints.length / 120;
    displayPoints = [];
    for (let i = 0; i < 120; i++) {
      const idx = Math.floor(i * step);
      displayPoints.push(validPoints[idx]);
    }
  }

  // Calculate X-axis range (time) - use displayPoints for range calculation
  const timeMin = displayPoints[0].t;
  const timeMax = displayPoints[displayPoints.length - 1].t;
  const timeRange = timeMax - timeMin || 1;

  // Scale functions
  const scaleX = (timestamp: number) => {
    return padLeft + ((timestamp - timeMin) / timeRange) * w;
  };

  const scaleY = (value: number) => {
    return padTop + h - ((value - minV) / (maxV - minV)) * h;
  };

  // Format functions (defined before use)
  // Format Y-axis value with thousands separators
  const formatYValue = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits: (unit === 'USD' || unit === 'AED' || unit === 'SAR') ? 2 : 0,
      minimumFractionDigits: (unit === 'USD' || unit === 'AED' || unit === 'SAR') ? 2 : 0,
    }).format(value);
  };

  // Format X-axis time
  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    if (range === 'daily') {
      // HH:mm
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    } else {
      // MM/DD for weekly/monthly/yoy
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      return `${month}/${day}`;
    }
  };

  // Generate Y-axis ticks: 4 if height < 260px, otherwise 5
  const yTickCount = chartHeight < 260 ? 4 : 5;
  const yTicks: number[] = [];
  for (let i = 0; i < yTickCount; i++) {
    const value = minV + ((maxV - minV) * i) / (yTickCount - 1);
    yTicks.push(value);
  }

  // Generate X-axis ticks with collision detection
  // Start with a reasonable number, but will filter based on spacing
  const maxXTickCount = w < 520 ? 3 : 4;
  const xTickCandidates: Array<{ point: ChartPoint; index: number; x: number; label: string }> = [];
  
  // Generate candidate ticks
  const candidateIndices: number[] = [];
  if (maxXTickCount === 3) {
    candidateIndices.push(0, Math.floor(displayPoints.length / 2), displayPoints.length - 1);
  } else {
    candidateIndices.push(
      0,
      Math.floor(displayPoints.length / 3),
      Math.floor((displayPoints.length * 2) / 3),
      displayPoints.length - 1
    );
  }
  
  // Create candidates with their positions
  for (const idx of candidateIndices) {
    if (idx >= 0 && idx < displayPoints.length) {
      const point = displayPoints[idx];
      const x = scaleX(point.t);
      const label = formatTime(point.t);
      xTickCandidates.push({ point, index: idx, x, label });
    }
  }
  
  // Filter ticks to avoid overlap (minimum 60px spacing between labels)
  // Approximate label width: ~40px for "HH:mm" format, ~50px for "MM/DD" format
  const minLabelSpacing = range === 'daily' ? 50 : 60;
  const xTicks = xTickCandidates.reduce<Array<{ point: ChartPoint; x: number; label: string }>>((acc, candidate) => {
    if (acc.length === 0) {
      acc.push({ point: candidate.point, x: candidate.x, label: candidate.label });
    } else {
      // Check if this label would overlap with the last one
      const lastX = acc[acc.length - 1].x;
      if (Math.abs(candidate.x - lastX) >= minLabelSpacing) {
        acc.push({ point: candidate.point, x: candidate.x, label: candidate.label });
      }
    }
    return acc;
  }, []);

  // Generate path for line (using displayPoints for downsampled data)
  const pathData = displayPoints
    .map((point, index) => {
      const x = scaleX(point.t);
      const y = scaleY(point.v);
      return index === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    })
    .join(' ');

  // Determine if we should show circles (only if <= 60 points, check displayPoints length)
  const showCircles = displayPoints.length <= 60;

  // Handle mouse move to find nearest point
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || displayPoints.length === 0) return;

    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Convert to SVG coordinates (account for viewBox scaling)
    const svgX = (mouseX / rect.width) * width;
    const svgY = (mouseY / rect.height) * chartHeight;

    // Check if inside plot area
    if (svgX < padLeft || svgX > width - padRight || svgY < padTop || svgY > padTop + h) {
      setHover(null);
      return;
    }

    // Find nearest point by converting mouseX to time, then binary search
    const mouseTime = timeMin + ((svgX - padLeft) / w) * timeRange;
    
    // Binary search for nearest point
    let left = 0;
    let right = displayPoints.length - 1;
    let nearestIndex = 0;
    let minDistance = Infinity;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const pointTime = displayPoints[mid].t;
      const distance = Math.abs(pointTime - mouseTime);

      if (distance < minDistance) {
        minDistance = distance;
        nearestIndex = mid;
      }

      if (pointTime < mouseTime) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    // Check neighbors for closer match
    for (const offset of [-1, 1]) {
      const idx = nearestIndex + offset;
      if (idx >= 0 && idx < displayPoints.length) {
        const distance = Math.abs(displayPoints[idx].t - mouseTime);
        if (distance < minDistance) {
          minDistance = distance;
          nearestIndex = idx;
        }
      }
    }

    const nearestPoint = displayPoints[nearestIndex];
    const px = scaleX(nearestPoint.t);
    const py = scaleY(nearestPoint.v);

    setHover({
      i: nearestIndex,
      x: px,
      y: py,
      svgX: svgX,
      svgY: svgY,
      point: nearestPoint,
    });
  };

  const handleMouseLeave = () => {
    setHover(null);
  };

  // Format tooltip time (full date + time)
  const formatTooltipTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  };

  // Format tooltip value
  const formatTooltipValue = (value: number): string => {
    if (unit === 'EGP') {
      return new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 0,
        minimumFractionDigits: 0,
      }).format(value) + ' EGP';
    } else {
      return '$' + new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      }).format(value);
    }
  };

  // Calculate tooltip position relative to container
  const getTooltipPosition = () => {
    if (!hover || !containerRef.current || !svgRef.current) return { x: 0, y: 0 };
    
    const container = containerRef.current;
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    
    // Convert SVG coordinates to pixel coordinates
    const pixelX = (hover.svgX / width) * rect.width;
    const pixelY = (hover.svgY / chartHeight) * rect.height;
    
    // Tooltip dimensions (approximate)
    const tooltipWidth = 140;
    const tooltipHeight = 50;
    
    // Position tooltip to the left or right of cursor
    let tooltipX = pixelX + (hover.x > width / 2 ? -tooltipWidth - 10 : 20);
    let tooltipY = pixelY - tooltipHeight / 2;
    
    // Clamp Y within plot area
    tooltipY = Math.max(padTop, Math.min(tooltipY, padTop + h - tooltipHeight));
    
    return { x: tooltipX, y: tooltipY };
  };

  const tooltipPos = hover ? getTooltipPosition() : null;

  return (
    <div 
      ref={containerRef} 
      className="w-full h-full relative"
      style={{ width: '100%', height: '100%', minHeight: '240px', position: 'relative' }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${chartHeight}`}
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: '100%', display: 'block', position: 'relative' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Unit label (top-left or top-right inside plot area depending on RTL) */}
        <text
          x={isRTL ? width - padRight : padLeft}
          y={padTop + 10}
          fontSize="11"
          fill="#6b7280"
          fontWeight="500"
          textAnchor={isRTL ? 'end' : 'start'}
        >
          {unit}
        </text>

        {/* Horizontal grid lines */}
        {yTicks.map((value, index) => {
          const y = scaleY(value);
          return (
            <line
              key={`grid-h-${index}`}
              x1={padLeft}
              y1={y}
              x2={width - padRight}
              y2={y}
              stroke="#e5e7eb"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          );
        })}

        {/* Y-axis labels (positioned left or right based on RTL, with collision guard) */}
        {yTicks.reduce<Array<{ value: number; y: number }>>((acc, value, index) => {
          const y = scaleY(value);
          // Collision guard: only render if y distance from previous is >= 14px
          if (acc.length === 0 || Math.abs(y - acc[acc.length - 1].y) >= 14) {
            acc.push({ value, y });
          }
          return acc;
        }, []).map((item, index) => (
          <text
            key={`y-label-${index}`}
            x={isRTL ? width - padRight + 8 : padLeft - 8}
            y={item.y + 4}
            textAnchor={isRTL ? 'start' : 'end'}
            fontSize="11"
            fill="#6b7280"
          >
            {formatYValue(item.value)}
          </text>
        ))}

        {/* X-axis labels */}
        {xTicks.map((tick, index) => {
          let textAnchor: 'start' | 'middle' | 'end' = 'middle';
          if (index === 0) textAnchor = 'start';
          else if (index === xTicks.length - 1) textAnchor = 'end';

          return (
            <text
              key={`x-label-${index}`}
              x={tick.x}
              y={padTop + h + 20}
              textAnchor={textAnchor}
              fontSize="11"
              fill="#6b7280"
            >
              {tick.label}
            </text>
          );
        })}

        {/* Clip path for plot area */}
        <defs>
          <clipPath id="chart-clip">
            <rect x={padLeft} y={padTop} width={w} height={h} />
          </clipPath>
        </defs>

        {/* Chart line and points (clipped to plot area) */}
        <g clipPath="url(#chart-clip)">
          {/* Line */}
          <path
            d={pathData}
            fill="none"
            stroke={strokeColor}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Data points (only if <= 60, using displayPoints) */}
          {showCircles &&
            displayPoints.map((point, index) => {
              const x = scaleX(point.t);
              const y = scaleY(point.v);
              return (
                <circle
                  key={`point-${index}`}
                  cx={x}
                  cy={y}
                  r="2"
                  fill={strokeColor}
                >
                  <title>
                    {formatTime(point.t)}: {formatYValue(point.v)} {unit}
                  </title>
                </circle>
              );
            })}
        </g>

        {/* Hover overlay */}
        {hover && (
          <g pointerEvents="none">
            {/* Vertical guide line */}
            <line
              x1={hover.x}
              y1={padTop}
              x2={hover.x}
              y2={padTop + h}
              stroke="#94a3b8"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
            {/* Hover point dot */}
            <circle
              cx={hover.x}
              cy={hover.y}
              r="4"
              fill={strokeColor}
              stroke="white"
              strokeWidth="2"
            />
          </g>
        )}
      </svg>

      {/* Tooltip (rendered outside SVG for better positioning) */}
      {hover && tooltipPos && (
        <div
          className="absolute bg-gray-900 text-white text-xs rounded-lg shadow-lg px-3 py-2 pointer-events-none z-50"
          style={{
            left: `${tooltipPos.x}px`,
            top: `${tooltipPos.y}px`,
          }}
        >
          <div className="font-medium">{formatTooltipTime(hover.point.t)}</div>
          <div className="text-gray-300">{formatTooltipValue(hover.point.v)}</div>
        </div>
      )}
    </div>
  );
}
