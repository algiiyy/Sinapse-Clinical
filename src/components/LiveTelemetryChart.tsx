import React, { useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle } from 'lucide-react';
import { TelemetrySample } from '../types/clinical';

interface LiveTelemetryChartProps {
  title: string;
  subtitle: string;
  unit: string;
  samples: TelemetrySample[];
  valueKey: 'emg' | 'flex';
  minY: number;
  maxY: number;
  thresholdValue?: number;
  thresholdLabel?: string;
  accentColor: string;
  alertActive?: boolean;
  decimals?: number;
  isStreaming: boolean;
}

function buildSmoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

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

export const LiveTelemetryChart: React.FC<LiveTelemetryChartProps> = ({
  title,
  subtitle,
  unit,
  samples,
  valueKey,
  minY,
  maxY,
  thresholdValue,
  thresholdLabel,
  accentColor,
  alertActive = false,
  decimals = 2,
  isStreaming,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const width = 600;
  const height = 190;
  const padLeft = 40;
  const padRight = 14;
  const padTop = 16;
  const padBottom = 24;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const activeStroke = alertActive ? '#DC2626' : accentColor;
  const gradientId = useMemo(
    () => `chart-fill-${valueKey}-${alertActive ? 'alert' : 'normal'}`,
    [valueKey, alertActive]
  );

  const { points, linePath, areaPath, stats, thresholdY, yTicks } = useMemo(() => {
    const range = Math.max(0.001, maxY - minY);
    const toY = (val: number) => {
      const normalized = Math.max(0, Math.min(1, (val - minY) / range));
      return padTop + plotHeight - normalized * plotHeight;
    };

    const pts = samples.map((sample, idx) => {
      const x =
        samples.length <= 1
          ? padLeft + plotWidth
          : padLeft + (idx / (samples.length - 1)) * plotWidth;
      const val = sample[valueKey];
      return {
        x,
        y: toY(val),
        val,
        sample,
      };
    });

    const line = buildSmoothPath(pts);
    const area =
      pts.length > 1
        ? `${line} L ${pts[pts.length - 1].x.toFixed(2)} ${(padTop + plotHeight).toFixed(2)} L ${pts[0].x.toFixed(2)} ${(padTop + plotHeight).toFixed(2)} Z`
        : '';

    const values = samples.map((s) => s[valueKey]);
    const latest = values.length > 0 ? values[values.length - 1] : 0;
    const min = values.length > 0 ? Math.min(...values) : 0;
    const max = values.length > 0 ? Math.max(...values) : 0;
    const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;

    const tY = typeof thresholdValue === 'number' ? toY(thresholdValue) : null;

    const tickSteps = 4;
    const ticks = Array.from({ length: tickSteps + 1 }, (_, i) => {
      const val = minY + (range * i) / tickSteps;
      return {
        val,
        y: toY(val),
      };
    });

    return {
      points: pts,
      linePath: line,
      areaPath: area,
      stats: { latest, min, max, avg },
      thresholdY: tY,
      yTicks: ticks,
    };
  }, [samples, valueKey, minY, maxY, thresholdValue, plotHeight, plotWidth]);

  const handlePointerMove = (clientX: number) => {
    if (!svgRef.current || points.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * width;
    let closestIdx = 0;
    let minDist = Infinity;
    points.forEach((pt, i) => {
      const d = Math.abs(pt.x - relX);
      if (d < minDist) {
        minDist = d;
        closestIdx = i;
      }
    });
    setHoverIndex(closestIdx);
  };

  const inspectedPoint = hoverIndex !== null ? points[hoverIndex] : null;
  const activeSample = inspectedPoint ? inspectedPoint.sample : samples[samples.length - 1];
  const displayedValue = inspectedPoint ? inspectedPoint.val : stats.latest;

  return (
    <motion.section
      layout
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className={`rounded-2xl bg-white p-4 sm:p-5 transition-colors duration-200 ${
        alertActive
          ? 'border border-red-300 shadow-[0_4px_20px_rgba(220,38,38,0.08)]'
          : 'border border-slate-200/90 shadow-[0_1px_3px_rgba(15,41,66,0.04)]'
      }`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-sm sm:text-base font-semibold text-[#0F2942] truncate">
              {title}
            </h3>
            {alertActive && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 shrink-0">
                <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                Lonjakan Terdeteksi
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</p>
        </div>

        <div className="text-right shrink-0">
          <div className="flex items-baseline justify-end gap-1">
            <span
              className={`tabular-nums-mono text-2xl sm:text-[26px] font-bold tracking-tight transition-colors duration-200 ${
                alertActive ? 'text-red-600' : 'text-[#0F2942]'
              }`}
            >
              {displayedValue.toFixed(decimals)}
            </span>
            <span className="tabular-nums-mono text-xs font-medium text-slate-400">
              {unit}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 tabular-nums-mono">
            {valueKey === 'emg' && typeof activeSample?.rawSemg === 'number'
              ? `${activeSample.rawSemg}/4095 ADC · ${
                  activeSample.rawSemg >= 2800
                    ? 'SPASTICITY'
                    : activeSample.rawSemg >= 2500
                      ? 'Tonus Meningkat'
                      : activeSample.rawSemg >= 800
                        ? 'Kontraksi Normal'
                        : 'Otot Rileks'
                } · `
              : ''}
            {inspectedPoint ? inspectedPoint.sample.timeLabel : isStreaming ? 'Live' : 'Terakhir'}
          </p>
        </div>
      </div>

      {/* Precision SVG Waveform or Waiting State */}
      <div className="mt-3 relative select-none">
        {samples.length === 0 ? (
          <div className="h-44 sm:h-48 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 flex flex-col items-center justify-center px-4 text-center">
            <span className="text-xs font-semibold text-[#0F2942]">
              Menunggu Data MQTT Live dari SiPasien
            </span>
            <span className="text-[11px] text-slate-500 mt-1 max-w-xs">
              Grafik akan bergerak otomatis saat perangkat NeuroHand / SiPasien mengirim payload JSON.
            </span>
          </div>
        ) : (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-44 sm:h-48 overflow-visible cursor-crosshair touch-none"
            onMouseMove={(e) => handlePointerMove(e.clientX)}
            onMouseLeave={() => setHoverIndex(null)}
            onTouchMove={(e) => {
              if (e.touches[0]) handlePointerMove(e.touches[0].clientX);
            }}
            onTouchEnd={() => setHoverIndex(null)}
            role="img"
            aria-label={`Grafik ${title}`}
          >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={activeStroke} stopOpacity="0.18" />
              <stop offset="100%" stopColor={activeStroke} stopOpacity="0.0" />
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
                {decimals === 0 ? Math.round(tick.val) : tick.val.toFixed(1)}
              </text>
            </g>
          ))}

          {/* Clinical threshold / Target ROM dashed line */}
          {thresholdY !== null && thresholdY >= padTop && thresholdY <= padTop + plotHeight && (
            <g>
              <line
                x1={padLeft}
                y1={thresholdY}
                x2={width - padRight}
                y2={thresholdY}
                stroke={valueKey === 'emg' ? '#DC2626' : '#0066CC'}
                strokeWidth="1.25"
                strokeDasharray="5 4"
                strokeOpacity="0.65"
              />
              {thresholdLabel && (
                <text
                  x={width - padRight}
                  y={thresholdY - 5}
                  textAnchor="end"
                  className={`text-[10px] font-medium ${
                    valueKey === 'emg' ? 'fill-red-600' : 'fill-[#0066CC]'
                  }`}
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {thresholdLabel}
                </text>
              )}
            </g>
          )}

          {/* Area & Smooth Curve */}
          {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke={activeStroke}
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Latest active sample marker */}
          {points.length > 0 && !inspectedPoint && (
            <g>
              <circle
                cx={points[points.length - 1].x}
                cy={points[points.length - 1].y}
                r="6"
                fill={activeStroke}
                fillOpacity="0.18"
              />
              <circle
                cx={points[points.length - 1].x}
                cy={points[points.length - 1].y}
                r="3.2"
                fill={activeStroke}
                stroke="#FFFFFF"
                strokeWidth="1.5"
              />
            </g>
          )}

          {/* Hover / Touch Crosshair */}
          {inspectedPoint && (
            <g>
              <line
                x1={inspectedPoint.x}
                y1={padTop}
                x2={inspectedPoint.x}
                y2={padTop + plotHeight}
                stroke="#0F2942"
                strokeOpacity="0.25"
                strokeWidth="1"
              />
              <circle
                cx={inspectedPoint.x}
                cy={inspectedPoint.y}
                r="4.5"
                fill={activeStroke}
                stroke="#FFFFFF"
                strokeWidth="2"
              />
            </g>
          )}

          {/* X-axis start / mid / end time markers */}
          {samples.length > 2 && (
            <>
              <text
                x={padLeft}
                y={height - 4}
                textAnchor="start"
                className="fill-slate-400 text-[10px]"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {samples[0].timeLabel}
              </text>
              <text
                x={padLeft + plotWidth / 2}
                y={height - 4}
                textAnchor="middle"
                className="fill-slate-400 text-[10px]"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {samples[Math.floor(samples.length / 2)].timeLabel}
              </text>
              <text
                x={width - padRight}
                y={height - 4}
                textAnchor="end"
                className="fill-slate-400 text-[10px]"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {samples[samples.length - 1].timeLabel}
              </text>
              </>
            )}
          </svg>
        )}
      </div>

      {/* Unboxed tabular summary footer */}
      <div className="mt-2 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
          <span>
            Min <strong className="tabular-nums-mono text-[#0F2942]">{stats.min.toFixed(decimals)}</strong> {unit}
          </span>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <span>
            Rata-rata <strong className="tabular-nums-mono text-[#0F2942]">{stats.avg.toFixed(decimals)}</strong> {unit}
          </span>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <span>
            Puncak{' '}
            <strong
              className={`tabular-nums-mono ${
                valueKey === 'emg' && thresholdValue && stats.max >= thresholdValue
                  ? 'text-red-600'
                  : 'text-[#0F2942]'
              }`}
            >
              {stats.max.toFixed(decimals)}
            </strong>{' '}
            {unit}
          </span>
        </div>
      </div>
    </motion.section>
  );
};
