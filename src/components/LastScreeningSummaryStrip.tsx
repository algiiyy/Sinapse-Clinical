import React from 'react';
import { Activity, AlertTriangle, ArrowUpRight, Gauge } from 'lucide-react';
import { ScreeningSession } from '../types/clinical';

interface LastScreeningSummaryStripProps {
  latestSession: ScreeningSession | null;
  totalSessions: number;
  targetRom: number;
  onInspectLatest?: (session: ScreeningSession) => void;
}

export const LastScreeningSummaryStrip: React.FC<LastScreeningSummaryStripProps> = ({
  latestSession,
  totalSessions,
  targetRom,
  onInspectLatest,
}) => {
  const peakAdc = latestSession
    ? (latestSession.peakRawSemg ?? Math.round((latestSession.peakEmgMv / 3300) * 4095))
    : 0;
  const avgAdc = latestSession
    ? (latestSession.avgRawSemg ?? Math.round((latestSession.avgEmgMv / 3300) * 4095))
    : 0;
  const romDelta = latestSession ? latestSession.maxFlex - targetRom : 0;

  return (
    <section aria-label="Ringkasan Statistik Skrining Terakhir" className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
      {/* Card 1: Max ROM Terakhir */}
      <button
        type="button"
        disabled={!latestSession || !onInspectLatest}
        onClick={() => latestSession && onInspectLatest?.(latestSession)}
        className="text-left rounded-2xl bg-white border border-slate-200/80 p-4 transition-colors hover:border-[#0066CC]/40 disabled:hover:border-slate-200/80 disabled:cursor-default group"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-500">Max ROM Terakhir</span>
          <Gauge className="w-4 h-4 text-[#0066CC] shrink-0" aria-hidden="true" />
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="tabular-nums-mono text-2xl font-bold text-[#0F2942] tracking-tight">
            {latestSession ? `${latestSession.maxFlex.toFixed(1)}°` : '—'}
          </span>
          {latestSession && (
            <span
              className={`tabular-nums-mono text-xs font-semibold ${
                romDelta >= 0 ? 'text-emerald-600' : 'text-slate-500'
              }`}
            >
              {romDelta >= 0 ? `+${romDelta.toFixed(1)}°` : `${romDelta.toFixed(1)}°`} vs target
            </span>
          )}
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
          <span>
            {latestSession
              ? `Rata-rata ${latestSession.avgFlex.toFixed(1)}° · Target ${targetRom}°`
              : `Target aktif ${targetRom}°`}
          </span>
          {latestSession && (
            <span className="inline-flex items-center gap-0.5 text-[#0066CC] font-medium opacity-0 group-hover:opacity-100 transition-opacity">
              Detail <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
            </span>
          )}
        </div>
      </button>

      {/* Card 2: Peak sEMG Terakhir */}
      <button
        type="button"
        disabled={!latestSession || !onInspectLatest}
        onClick={() => latestSession && onInspectLatest?.(latestSession)}
        className="text-left rounded-2xl bg-white border border-slate-200/80 p-4 transition-colors hover:border-[#0066CC]/40 disabled:hover:border-slate-200/80 disabled:cursor-default"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-500">Peak sEMG Terakhir</span>
          <Activity className="w-4 h-4 text-[#0066CC] shrink-0" aria-hidden="true" />
        </div>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="tabular-nums-mono text-2xl font-bold text-[#0F2942] tracking-tight">
            {latestSession ? `${peakAdc}` : '—'}
          </span>
          {latestSession && (
            <span className="tabular-nums-mono text-xs font-semibold text-slate-500">
              ADC ({Math.round(latestSession.peakEmgMv)} mV)
            </span>
          )}
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400 tabular-nums-mono truncate">
          {latestSession
            ? `Rata-rata ${avgAdc} ADC · ${latestSession.sampleCount} sinyal`
            : 'Menunggu sesi skrining pertama'}
        </p>
      </button>

      {/* Card 3: Spasme & Total Sesi */}
      <button
        type="button"
        disabled={!latestSession || !onInspectLatest}
        onClick={() => latestSession && onInspectLatest?.(latestSession)}
        className="text-left rounded-2xl bg-white border border-slate-200/80 p-4 transition-colors hover:border-[#0066CC]/40 disabled:hover:border-slate-200/80 disabled:cursor-default"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-500">Spasme &amp; Total Sesi</span>
          <AlertTriangle
            className={`w-4 h-4 shrink-0 ${
              latestSession && latestSession.spasticityCount > 0 ? 'text-red-600' : 'text-slate-400'
            }`}
            aria-hidden="true"
          />
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span
            className={`tabular-nums-mono text-2xl font-bold tracking-tight ${
              latestSession && latestSession.spasticityCount > 0
                ? 'text-red-600'
                : 'text-[#0F2942]'
            }`}
          >
            {latestSession ? `${latestSession.spasticityCount}x` : '0x'}
          </span>
          <span className="text-xs text-slate-500 tabular-nums-mono">
            · {totalSessions} sesi tersimpan
          </span>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400 truncate">
          {latestSession
            ? `${latestSession.dayNumber ? `Hari ke-${latestSession.dayNumber}` : latestSession.sessionId} · ${latestSession.startedAtLabel}`
            : 'Belum ada riwayat evaluasi'}
        </p>
      </button>
    </section>
  );
};
