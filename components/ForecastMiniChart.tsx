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
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(height || 260);
  const heightRef = useRef<number>(height || 260);

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
          if (rect.width > 100) {
            setContainerWidth(rect.width);
          }
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
          const newWidth = entry.contentRect.width;
          // Only update if we get a valid height that's not too small
          if (newHeight > 100) {
            setContainerHeight(newHeight);
            heightRef.current = newHeight;
          }
          if (newWidth > 100) {
            setContainerWidth(newWidth);
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

  // Measure once before paint to avoid the initial "small/letterboxed" render.
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.height > 100) {
      setContainerHeight(rect.height);
      heightRef.current = rect.height;
    }
    if (rect.width > 100) {
      setContainerWidth(rect.width);
    }
  }, []);

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

  // Use container height if available, otherwise use prop or default to 260px
  const chartHeight = containerHeight || height || 260;
  
  // Fixed padding/margins - adjust for RTL
  // In RTL, Y labels go on the right, so padRight needs more space
  const padLeft = isRTL ? 16 : 72;
  const padRight = isRTL ? 72 : 16;
  const padTop = 12;
  const padBottom = 28;

  // Chart dimensions
  // Match SVG viewBox aspect ratio to the container to avoid letterboxing (which looks "small"),
  // while using preserveAspectRatio="xMidYMid meet" to avoid stretching.
  // Use containerWidth directly to keep viewBox aspect aligned with the real container.
  // Avoid a large minimum (like 720) which can re-introduce letterboxing on narrow layouts.
  const width =
    containerWidth > 0 && chartHeight > 0
      ? Math.max(320, Math.round(containerWidth))
      : 800;
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
    displayPoints = [];
    const maxPoints = 120;
    const lastIdx = validPoints.length - 1;
    const seen = new Set<number>();
    for (let i = 0; i < maxPoints; i++) {
      const idx = Math.round((i * lastIdx) / (maxPoints - 1)); // guarantees 0 and lastIdx
      if (!seen.has(idx)) {
        seen.add(idx);
        displayPoints.push(validPoints[idx]);
      }
    }
  }

  // Calculate X-axis domain (time)
  // Requirements:
  // - daily: last 24h anchored to "now"
  // - weekly/monthly/yoy: show up to latest available point (no empty tail),
  //   and start at max(windowStart, oldestData) (no empty head).
  const nowMs = Date.now();
  const rangeWindowMs =
    range === 'daily'
      ? 24 * 60 * 60 * 1000
      : range === 'weekly'
        ? 7 * 24 * 60 * 60 * 1000
        : range === 'monthly'
          ? 30 * 24 * 60 * 60 * 1000
          : 365 * 24 * 60 * 60 * 1000; // yoy

  // IMPORTANT: domain must be computed from full data, not downsampled displayPoints,
  // otherwise we can "lose" the real last point and make it look like data didn't load.
  const dataMin = validPoints[0].t;
  const dataMax = validPoints[validPoints.length - 1].t;

  const domainEnd = range === 'daily' ? nowMs : dataMax;
  const domainStart = Math.max(domainEnd - rangeWindowMs, dataMin);

  const timeMin = domainStart;
  const timeMax = domainEnd;
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

  // Format X-axis time based on range
  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    if (range === 'daily') {
      // HH:mm for intraday
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    } else if (range === 'weekly') {
      // MMM DD for weekly (e.g., "Jan 14")
      const month = date.toLocaleDateString('en-US', { month: 'short' });
      const day = date.getDate();
      return `${month} ${day}`;
    } else if (range === 'monthly' || range === 'yoy') {
      // MMM DD for monthly/yearly (e.g., "Jan 14")
      const month = date.toLocaleDateString('en-US', { month: 'short' });
      const day = date.getDate();
      return `${month} ${day}`;
    } else {
      // Fallback: MM/DD
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
  // Adjust tick count based on range and width
  let maxXTickCount: number;
  if (range === 'daily') {
    maxXTickCount = w < 520 ? 4 : 6; // More ticks for intraday
  } else if (range === 'weekly') {
    maxXTickCount = w < 520 ? 4 : 5; // 4-5 ticks for weekly
  } else if (range === 'monthly' || range === 'yoy') {
    maxXTickCount = w < 520 ? 4 : 5; // 4-5 ticks for monthly/yearly
  } else {
    maxXTickCount = w < 520 ? 3 : 4;
  }
  
  // Generate X ticks from the *domain* (not from data points) so we never "lose" the end date
  // due to downsampling / sparse data.
  const xTickCandidates: Array<{ point: ChartPoint; index: number; x: number; label: string }> = [];
  const tickCount = Math.max(2, maxXTickCount);
  for (let i = 0; i < tickCount; i++) {
    const t = timeMin + (timeRange * i) / (tickCount - 1);
    const x = scaleX(t);
    xTickCandidates.push({
      point: { t, v: 0 },
      index: i,
      x,
      label: formatTime(t),
    });
  }
  
  // Filter ticks to avoid overlap
  // Approximate label width: ~40px for "HH:mm", ~60px for "MMM DD"
  const minLabelSpacing = range === 'daily' ? 50 : 70;
  let xTicks = xTickCandidates.reduce<Array<{ point: ChartPoint; x: number; label: string }>>((acc, candidate) => {
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

  // Ensure domain start/end labels are present
  if (displayPoints.length > 0) {
    const firstTickPoint = { t: timeMin, v: displayPoints[0].v };
    const lastTickPoint = { t: timeMax, v: displayPoints[displayPoints.length - 1].v };
    const firstTick = { point: firstTickPoint, x: scaleX(timeMin), label: formatTime(timeMin) };
    const lastTick = { point: lastTickPoint, x: scaleX(timeMax), label: formatTime(timeMax) };

    if (xTicks.length === 0) {
      xTicks = [firstTick, lastTick];
    } else {
      if (xTicks[0].point.t !== firstTick.point.t) {
        xTicks.unshift(firstTick);
      }

      const currentLast = xTicks[xTicks.length - 1];
      if (currentLast.point.t !== lastTick.point.t) {
        if (xTicks.length >= 2 && Math.abs(lastTick.x - currentLast.x) < minLabelSpacing) {
          xTicks[xTicks.length - 1] = lastTick;
        } else {
          xTicks.push(lastTick);
        }
      }
    }
  }

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

  // Convert screen coords -> SVG viewBox coords accounting for preserveAspectRatio="xMidYMid meet"
  // (defensive against any remaining letterboxing).
  const getSvgCoords = (clientX: number, clientY: number): { svgX: number; svgY: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;

    const rect = svg.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const scale = Math.min(rect.width / width, rect.height / chartHeight);
    const drawnW = width * scale;
    const drawnH = chartHeight * scale;
    const offsetX = (rect.width - drawnW) / 2;
    const offsetY = (rect.height - drawnH) / 2;

    const svgX = (x - offsetX) / scale;
    const svgY = (y - offsetY) / scale;
    return { svgX, svgY };
  };

  // Handle pointer move within plot area to find nearest point
  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current || displayPoints.length === 0) return;

    const coords = getSvgCoords(e.clientX, e.clientY);
    if (!coords) return;
    const { svgX, svgY } = coords;

    // Safety: ensure inside plot area bounds
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

  const handlePointerLeave = () => {
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
    
    // Convert SVG coordinates to pixel coordinates (account for preserveAspectRatio="xMidYMid meet")
    const scale = Math.min(rect.width / width, rect.height / chartHeight);
    const drawnW = width * scale;
    const drawnH = chartHeight * scale;
    const offsetX = (rect.width - drawnW) / 2;
    const offsetY = (rect.height - drawnH) / 2;
    const pixelX = offsetX + hover.svgX * scale;
    const pixelY = offsetY + hover.svgY * scale;
    
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
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${chartHeight}`}
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: '100%', display: 'block', position: 'relative' }}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerLeave}
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
