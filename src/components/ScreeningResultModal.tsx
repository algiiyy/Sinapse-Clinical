import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BrainCircuit, CheckCircle2, ClipboardCheck, X } from 'lucide-react';
import { MAX_FLEX_ANGLE_DEG } from '../data/patients';
import { ScreeningSession } from '../types/clinical';

interface ScreeningResultModalProps {
  session: ScreeningSession | null;
  patientName: string;
  targetRom: number;
  onClose: () => void;
  onAnalyzeWithAi: (session: ScreeningSession) => void;
  onCreatePrescription: (session: ScreeningSession) => void;
}

function formatDurationText(session: ScreeningSession): string {
  if (session.durationLabel) return session.durationLabel;
  const secs = Math.max(1, session.durationSec);
  if (secs < 60) return `${secs} Detik (Screening)`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return rem > 0 ? `${mins} Menit ${rem} Detik (Screening)` : `${mins} Menit (Screening)`;
}

export const ScreeningResultModal: React.FC<ScreeningResultModalProps> = ({
  session,
  patientName,
  targetRom,
  onClose,
  onAnalyzeWithAi,
  onCreatePrescription,
}) => {
  const peakAdc = session
    ? (session.peakRawSemg ?? Math.round((session.peakEmgMv / 3300) * 4095))
    : 0;
  const avgAdc = session
    ? (session.avgRawSemg ?? Math.round((session.avgEmgMv / 3300) * 4095))
    : 0;
  const statusLabel = session
    ? session.statusBadge ||
      (session.maxFlex >= targetRom
        ? 'Target Tercapai'
        : session.maxFlex >= 30
          ? 'Fleksi Awal'
          : 'Perlu Latihan Bertahap')
    : '';

  // 3-segment SVG ring calculations (mirrors SiPasien Screening Selesai ring)
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const gap = 8;

  const flexShare = session
    ? Math.max(0.18, Math.min(0.45, session.maxFlex / MAX_FLEX_ANGLE_DEG))
    : 0.25;
  const emgShare = Math.max(0.18, Math.min(0.4, peakAdc / 4095));
  const signalShare = Math.max(0.15, 1 - flexShare - emgShare);

  const totalWeight = flexShare + emgShare + signalShare;
  const usable = circumference - gap * 3;
  const flexLen = (flexShare / totalWeight) * usable;
  const emgLen = (emgShare / totalWeight) * usable;
  const signalLen = (signalShare / totalWeight) * usable;

  const flexOffset = 0;
  const emgOffset = -(flexLen + gap);
  const signalOffset = -(flexLen + gap + emgLen + gap);

  const dayText = session
    ? session.dayNumber
      ? `Hari ke-${session.dayNumber}`
      : session.sessionId
    : '';

  return (
    <AnimatePresence>
      {session && (
        <motion.div
          key={`screening-result-backdrop-${session.id}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 bg-[#0F2942]/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="screening-result-title"
          onClick={onClose}
        >
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.97 }}
          transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        >
          {/* Header */}
          <div className="px-5 pt-5 pb-4 border-b border-slate-100 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2
                    id="screening-result-title"
                    className="font-display text-lg font-bold text-[#0F2942]"
                  >
                    Screening Selesai
                  </h2>
                  <span className="text-xs font-semibold text-[#0066CC]">
                    {statusLabel}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 truncate">
                  {patientName} <span aria-hidden="true">·</span> {dayText}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Durasi: {formatDurationText(session)}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] min-w-[40px] rounded-xl hover:bg-slate-100 text-slate-400 hover:text-[#0F2942] flex items-center justify-center transition-colors shrink-0"
              aria-label="Tutup hasil skrining"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Body */}
          <div className="px-5 py-5 overflow-y-auto space-y-5">
            {/* Multi-Segment Donut Ring */}
            <div className="flex flex-col items-center justify-center">
              <div className="relative w-36 h-36 flex items-center justify-center">
                <svg className="w-36 h-36 -rotate-90" viewBox="0 0 140 140" aria-hidden="true">
                  <circle
                    cx="70"
                    cy="70"
                    r={radius}
                    fill="none"
                    stroke="#F1F5F9"
                    strokeWidth="12"
                  />
                  {/* Segment 1: Kelenturan Jari */}
                  <circle
                    cx="70"
                    cy="70"
                    r={radius}
                    fill="none"
                    stroke="#10B981"
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeDasharray={`${flexLen} ${circumference}`}
                    strokeDashoffset={flexOffset}
                  />
                  {/* Segment 2: Sinyal sEMG */}
                  <circle
                    cx="70"
                    cy="70"
                    r={radius}
                    fill="none"
                    stroke="#F97316"
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeDasharray={`${emgLen} ${circumference}`}
                    strokeDashoffset={emgOffset}
                  />
                  {/* Segment 3: Spasme & Sinyal */}
                  <circle
                    cx="70"
                    cy="70"
                    r={radius}
                    fill="none"
                    stroke="#0066CC"
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeDasharray={`${signalLen} ${circumference}`}
                    strokeDashoffset={signalOffset}
                  />
                </svg>

                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="tabular-nums-mono text-2xl font-bold text-[#0F2942] tracking-tight">
                    {session.maxFlex.toFixed(1)}°
                  </span>
                  <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase mt-0.5">
                    MAX ROM
                  </span>
                </div>
              </div>
            </div>

            {/* 3 Clinical Breakdown Rows (Matches IMG_1366) */}
            <div className="space-y-2.5">
              <div className="rounded-2xl bg-slate-50/90 border border-slate-200/70 px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
                  <span className="text-xs font-semibold text-[#0F2942]">Kelenturan Jari</span>
                </div>
                <div className="text-right">
                  <div className="tabular-nums-mono text-sm font-bold text-[#0F2942]">
                    {session.maxFlex.toFixed(1)}°
                  </div>
                  <div className="tabular-nums-mono text-[11px] text-slate-500">
                    rata {session.avgFlex.toFixed(1)}°
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-slate-50/90 border border-slate-200/70 px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shrink-0" aria-hidden="true" />
                  <span className="text-xs font-semibold text-[#0F2942]">Sinyal sEMG</span>
                </div>
                <div className="text-right">
                  <div className="tabular-nums-mono text-sm font-bold text-[#0F2942]">
                    {peakAdc} ADC <span className="text-xs font-medium text-slate-500">({session.peakEmgMv} mV)</span>
                  </div>
                  <div className="tabular-nums-mono text-[11px] text-slate-500">
                    rata {avgAdc} ADC ({session.avgEmgMv} mV)
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-slate-50/90 border border-slate-200/70 px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#0066CC] shrink-0" aria-hidden="true" />
                  <span className="text-xs font-semibold text-[#0F2942]">Spasme &amp; Sinyal</span>
                </div>
                <div className="text-right">
                  <div
                    className={`tabular-nums-mono text-sm font-bold ${
                      session.spasticityCount > 0 ? 'text-red-600' : 'text-[#0F2942]'
                    }`}
                  >
                    {session.spasticityCount}x Spasme
                  </div>
                  <div className="tabular-nums-mono text-[11px] text-slate-500">
                    {session.sampleCount} pkt
                  </div>
                </div>
              </div>
            </div>

            {/* Summary Paragraph for Doctor */}
            <div className="rounded-2xl bg-[#F7F9FC] border border-slate-200/80 p-3.5 text-xs text-slate-600 leading-relaxed">
              Hasil screening ({session.sampleCount} sinyal terukur): Max ROM{' '}
              <strong className="text-[#0F2942]">{session.maxFlex.toFixed(1)}°</strong> (rata-rata{' '}
              {session.avgFlex.toFixed(1)}°), Peak sEMG{' '}
              <strong className="text-[#0F2942]">{peakAdc} ADC</strong> (rata-rata {avgAdc} ADC),{' '}
              tercatat{' '}
              <strong className={session.spasticityCount > 0 ? 'text-red-600' : 'text-[#0F2942]'}>
                {session.spasticityCount}x spasme
              </strong>
              .
              {session.patientNote && (
                <p className="mt-2 pt-2 border-t border-slate-200/70 text-slate-700">
                  Catatan pasien: {session.patientNote}
                </p>
              )}
            </div>
          </div>

          {/* Doctor Actions Footer */}
          <div className="px-5 pb-5 pt-3 border-t border-slate-100 space-y-2">
            <button
              type="button"
              onClick={() => onAnalyzeWithAi(session)}
              className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-[#0066CC] hover:bg-[#0052A3] text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
            >
              <BrainCircuit className="w-4 h-4" aria-hidden="true" />
              <span>Analisis Hasil dengan AI</span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onCreatePrescription(session)}
                className="min-h-[44px] px-3 py-2 rounded-xl bg-[#0F2942] hover:bg-[#163A5C] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                <ClipboardCheck className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Buat Resep</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-600 transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
