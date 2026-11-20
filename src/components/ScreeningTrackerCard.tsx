import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Activity, Clock, Trash2 } from 'lucide-react';
import { ScreeningSession } from '../types/clinical';

interface ScreeningTrackerCardProps {
  activeScreening: ScreeningSession | null;
  completedScreenings: ScreeningSession[];
  targetRom: number;
  onEnterFocusMode?: () => void;
  onOpenScreeningResult?: (session: ScreeningSession) => void;
  onAnalyzeScreening: (session: ScreeningSession) => void;
  onPrescribeFromScreening: (session: ScreeningSession) => void;
  onDeleteScreening?: (sessionId: string) => void;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const ScreeningTrackerCard: React.FC<ScreeningTrackerCardProps> = ({
  activeScreening,
  completedScreenings,
  targetRom,
  onEnterFocusMode,
  onOpenScreeningResult,
  onAnalyzeScreening,
  onPrescribeFromScreening,
  onDeleteScreening,
}) => {
  return (
    <section className="rounded-2xl bg-white border border-slate-200/80 p-4 sm:p-5 space-y-3.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-sm font-semibold text-[#0F2942]">
          Riwayat Skrining Pasien
        </h3>
      </div>

      {/* Active Screening Live Strip */}
      <AnimatePresence>
        {activeScreening && (
          <motion.button
            type="button"
            onClick={onEnterFocusMode}
            key={activeScreening.id}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="w-full text-left rounded-xl bg-[#0066CC]/[0.06] hover:bg-[#0066CC]/[0.1] border border-[#0066CC]/25 px-3.5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs transition-colors"
          >
            <div className="flex items-center gap-2 font-semibold text-[#0066CC]">
              <Activity className="w-4 h-4" aria-hidden="true" />
              <span>Skrining Berlangsung · Ketuk untuk Mode Fokus</span>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span className="tabular-nums-mono text-[#0F2942]">
                {activeScreening.sampleCount} pkt
              </span>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span className="tabular-nums-mono text-[#0F2942]">
                {activeScreening.maxFlex.toFixed(1)}°
              </span>
            </div>
            <div className="flex items-center gap-1 font-bold text-[#0F2942] tabular-nums-mono">
              <Clock className="w-3.5 h-3.5 text-[#0066CC]" aria-hidden="true" />
              <span>{formatDuration(activeScreening.durationSec)}</span>
            </div>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Completed Screening List */}
      {completedScreenings.length === 0 ? (
        <p className="text-xs text-slate-400 leading-relaxed">
          Belum ada riwayat skrining. Tampilan sinyal sEMG dan sudut fleksi jari akan muncul otomatis saat pasien menekan Mulai Screening di SiPasien.
        </p>
      ) : (
        <div className="divide-y divide-slate-100">
          <AnimatePresence initial={false}>
            {completedScreenings.map((session) => (
              <motion.div
                key={session.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="py-3 first:pt-1 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
              >
                <button
                  type="button"
                  onClick={() => onOpenScreeningResult?.(session)}
                  className="min-w-0 space-y-1 text-left group"
                >
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#0F2942] group-hover:text-[#0066CC] transition-colors">
                    <span className="tabular-nums-mono">{session.sessionId}</span>
                    {session.statusBadge && (
                      <>
                        <span aria-hidden="true" className="text-slate-300">·</span>
                        <span className="text-[#0066CC] font-medium">{session.statusBadge}</span>
                      </>
                    )}
                    <span aria-hidden="true" className="text-slate-300">·</span>
                    <span className="tabular-nums-mono text-slate-400 font-normal">
                      {session.durationLabel ?? formatDuration(session.durationSec)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                    <span>
                      ROM <strong className="tabular-nums-mono text-[#0F2942]">{session.maxFlex.toFixed(1)}°</strong>/{targetRom}°
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Peak <strong className="tabular-nums-mono text-[#0F2942]">{Math.round(session.peakEmgMv)} mV</strong>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className={session.spasticityCount > 0 ? 'text-red-600 font-medium' : ''}>
                      Spasme <strong className="tabular-nums-mono">{session.spasticityCount}x</strong>
                    </span>
                  </div>
                </button>

                <div className="flex items-center gap-3 shrink-0">
                  {onOpenScreeningResult && (
                    <button
                      type="button"
                      onClick={() => onOpenScreeningResult(session)}
                      className="min-h-[38px] text-xs font-semibold text-emerald-700 hover:text-emerald-800 transition-colors"
                    >
                      Hasil
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onAnalyzeScreening(session)}
                    className="min-h-[38px] text-xs font-semibold text-[#0066CC] hover:text-[#0F2942] transition-colors"
                  >
                    Analisis AI
                  </button>
                  <button
                    type="button"
                    onClick={() => onPrescribeFromScreening(session)}
                    className="min-h-[38px] text-xs font-semibold text-[#0F2942] hover:text-[#0066CC] transition-colors"
                  >
                    Resep
                  </button>
                  {onDeleteScreening && (
                    <button
                      type="button"
                      onClick={() => onDeleteScreening(session.id)}
                      className="min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-400 hover:text-red-600 transition-colors"
                      aria-label="Hapus riwayat skrining"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
};
