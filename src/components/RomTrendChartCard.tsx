import React, { useMemo, useRef, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { MAX_FLEX_ANGLE_DEG } from '../data/patients';
import { ScreeningSession } from '../types/clinical';

interface RomTrendChartCardProps {
  sessions: ScreeningSession[];
  targetRom: number;
  onInspectSession?: (session: ScreeningSession) => void;
}

function buildSmoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;

  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return path;
}

export const RomTrendChartCard: React.FC<RomTrendChartCardProps> = ({
  sessions,
  targetRom,
  onInspectSession,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Sort chronologically (oldest -> newest) and cap at last 12 sessions for crisp readability
  const orderedSessions = useMemo(() => {
    return [...sessions]
      .sort((a, b) => a.startedAt - b.startedAt)
      .slice(-12);
  }, [sessions]);

  const width = 560;
  const height = 185;
  const padLeft = 36;
  const padRight = 16;
  const padTop = 18;
  const padBottom = 26;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const { points, linePath, areaPath, targetY, yTicks, stats } = useMemo(() => {
    const maxObserved = orderedSessions.reduce((acc, s) => Math.max(acc, s.maxFlex), 0);
    const maxY = Math.min(
      MAX_FLEX_ANGLE_DEG,
      Math.max(90, Math.ceil(Math.max(targetRom, maxObserved) / 30) * 30)
    );
    const minY = 0;
    const range = Math.max(1, maxY - minY);

    const toY = (val: number) => {
      const normalized = Math.max(0, Math.min(1, (val - minY) / range));
      return padTop + plotHeight - normalized * plotHeight;
    };

    const pts = orderedSessions.map((session, idx) => {
      const x =
        orderedSessions.length <= 1
          ? padLeft + plotWidth / 2
          : padLeft + (idx / (orderedSessions.length - 1)) * plotWidth;
      const label = session.dayNumber ? `H${session.dayNumber}` : `S${idx + 1}`;
      return {
        x,
        y: toY(session.maxFlex),
        val: session.maxFlex,
        label,
        session,
      };
    });

    const line = buildSmoothPath(pts);
    const area =
      pts.length > 1
        ? `${line} L ${pts[pts.length - 1].x.toFixed(2)} ${(padTop + plotHeight).toFixed(2)} L ${pts[0].x.toFixed(2)} ${(padTop + plotHeight).toFixed(2)} Z`
        : '';

    const tY = toY(targetRom);
    const ticks = [0, 0.333, 0.666, 1].map((ratio) => {
      const val = Math.round(minY + range * ratio);
      return { val, y: toY(val) };
    });

    const firstVal = orderedSessions[0]?.maxFlex ?? 0;
    const latestVal = orderedSessions[orderedSessions.length - 1]?.maxFlex ?? 0;
    const avgVal =
      orderedSessions.length > 0
        ? orderedSessions.reduce((acc, s) => acc + s.maxFlex, 0) / orderedSessions.length
        : 0;
    const progressionDelta = orderedSessions.length >= 2 ? latestVal - firstVal : 0;

    return {
      points: pts,
      linePath: line,
      areaPath: area,
      targetY: tY,
      yTicks: ticks,
      stats: { firstVal, latestVal, avgVal, progressionDelta },
    };
  }, [orderedSessions, plotHeight, plotWidth, targetRom]);

  const handlePointerMove = (clientX: number) => {
    if (!svgRef.current || points.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * width;
    let closestIdx = 0;
    let minDist = Infinity;
    points.forEach((pt, idx) => {
      const dist = Math.abs(pt.x - relX);
      if (dist < minDist) {
        minDist = dist;
        closestIdx = idx;
      }
    });
    setHoverIndex(closestIdx);
  };

  const inspected = hoverIndex !== null ? points[hoverIndex] : null;
  const latestPoint = points[points.length - 1] ?? null;
  const activePoint = inspected ?? latestPoint;

  return (
    <section className="rounded-2xl bg-white border border-slate-200/80 p-4 sm:p-5 flex flex-col justify-between h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#0066CC] shrink-0" aria-hidden="true" />
            <h3 className="font-display text-sm sm:text-base font-semibold text-[#0F2942] truncate">
              Tren Perkembangan ROM
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 truncate">
            Progres sudut fleksi maksimal antar sesi vs target {targetRom}°
          </p>
        </div>

        <div className="text-right shrink-0">
          <div className="flex items-baseline justify-end gap-1">
            <span className="tabular-nums-mono text-xl sm:text-2xl font-bold text-[#0F2942] tracking-tight">
              {activePoint ? `${activePoint.val.toFixed(1)}°` : '—'}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 tabular-nums-mono">
            {activePoint
              ? `${activePoint.session.dayNumber ? `Hari ke-${activePoint.session.dayNumber}` : activePoint.session.sessionId} · ${activePoint.session.startedAtLabel}`
              : `${orderedSessions.length} sesi`}
          </p>
        </div>
      </div>

      {/* Chart Body */}
      <div className="mt-3 relative select-none">
        {orderedSessions.length === 0 ? (
          <div className="h-44 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 flex flex-col items-center justify-center px-4 text-center">
            <span className="text-xs font-semibold text-[#0F2942]">
              Belum Ada Data Tren ROM
            </span>
            <span className="text-[11px] text-slate-500 mt-1 max-w-xs">
              Kurva perkembangan fleksi antar sesi akan tergambar otomatis setelah pasien menyelesaikan skrining.
            </span>
          </div>
        ) : (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-44 overflow-visible cursor-crosshair touch-none"
            onMouseMove={(e) => handlePointerMove(e.clientX)}
            onMouseLeave={() => setHoverIndex(null)}
            onTouchMove={(e) => {
              if (e.touches[0]) handlePointerMove(e.touches[0].clientX);
            }}
            onTouchEnd={() => setHoverIndex(null)}
            onClick={() => {
              if (activePoint && onInspectSession) {
                onInspectSession(activePoint.session);
              }
            }}
            role="img"
            aria-label="Grafik tren perkembangan ROM antar sesi"
          >
            <defs>
              <linearGradient id="rom-trend-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0066CC" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#0066CC" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Horizontal Y gridlines */}
            {yTicks.map((tick, idx) => (
              <g key={idx}>
                <line
                  x1={padLeft}
                  y1={tick.y}
                  x2={width - padRight}
                  y2={tick.y}
                  stroke="#E2E8F0"
                  strokeWidth="1"
                  strokeDasharray={idx === 0 ? undefined : '2 4'}
                />
                <text
                  x={padLeft - 8}
                  y={tick.y + 3.5}
                  textAnchor="end"
                  className="fill-slate-400 text-[10px]"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {tick.val}°
                </text>
              </g>
            ))}

            {/* Target ROM dashed line */}
            {targetY >= padTop && targetY <= padTop + plotHeight && (
              <g>
                <line
                  x1={padLeft}
                  y1={targetY}
                  x2={width - padRight}
                  y2={targetY}
                  stroke="#0066CC"
                  strokeWidth="1.25"
                  strokeDasharray="5 4"
                  strokeOpacity="0.55"
                />
                <text
                  x={width - padRight}
                  y={targetY - 5}
                  textAnchor="end"
                  className="fill-[#0066CC] text-[10px] font-medium"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  Target {targetRom}°
                </text>
              </g>
            )}

            {/* Area + Smooth Curve */}
            {areaPath && <path d={areaPath} fill="url(#rom-trend-fill)" />}
            {points.length > 1 && linePath && (
              <path
                d={linePath}
                fill="none"
                stroke="#0066CC"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Session data points & X labels */}
            {points.map((pt, idx) => {
              const isSelected = activePoint?.session.id === pt.session.id;
              return (
                <g key={pt.session.id}>
                  {isSelected && (
                    <line
                      x1={pt.x}
                      y1={padTop}
                      x2={pt.x}
                      y2={padTop + plotHeight}
                      stroke="#0F2942"
                      strokeOpacity="0.2"
                      strokeWidth="1"
                    />
                  )}
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isSelected ? 5 : 3.2}
                    fill={isSelected ? '#0066CC' : '#FFFFFF'}
                    stroke="#0066CC"
                    strokeWidth={isSelected ? 2 : 2}
                  />
                  <text
                    x={pt.x}
                    y={height - 5}
                    textAnchor="middle"
                    className={`text-[10px] ${
                      isSelected ? 'fill-[#0F2942] font-semibold' : 'fill-slate-400'
                    }`}
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {pt.label}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {/* Unboxed Footer Summary */}
      <div className="mt-2 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <div className="flex flex-wrap items-center gap-3">
          <span>
            Rata ROM{' '}
            <strong className="tabular-nums-mono text-[#0F2942]">
              {orderedSessions.length > 0 ? `${stats.avgVal.toFixed(1)}°` : '—'}
            </strong>
          </span>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <span>
            Progres{' '}
            <strong
              className={`tabular-nums-mono ${
                stats.progressionDelta > 0
                  ? 'text-emerald-600'
                  : stats.progressionDelta < 0
                    ? 'text-red-600'
                    : 'text-[#0F2942]'
              }`}
            >
              {orderedSessions.length >= 2
                ? `${stats.progressionDelta >= 0 ? '+' : ''}${stats.progressionDelta.toFixed(1)}°`
                : '—'}
            </strong>
          </span>
        </div>
        <span className="text-[11px] text-slate-400">
          {orderedSessions.length === 1
            ? '1 sesi · butuh ≥2 sesi untuk garis tren'
            : `${orderedSessions.length} sesi terakhir`}
        </span>
      </div>
    </section>
  );
};
