import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Loader2,
  ShieldAlert,
  X,
} from 'lucide-react';
import {
  ClinicalAnalysisResult,
  PatientProfile,
  ScreeningSession,
  TelemetrySample,
} from '../types/clinical';

import { SavedAiAnalysis } from '../hooks/useClinicalCloud';

interface AiClinicalAssistantProps {
  patient: PatientProfile;
  samples: TelemetrySample[];
  spasticityCount: number;
  selectedScreening: ScreeningSession | null;
  archivedAnalyses: SavedAiAnalysis[];
  onSaveAnalysis: (patientId: string, result: ClinicalAnalysisResult) => Promise<void>;
  onClearSelectedScreening: () => void;
  onApplySuggestedTarget: (targetRom: number) => void;
}

export const AiClinicalAssistant: React.FC<AiClinicalAssistantProps> = ({
  patient,
  samples,
  spasticityCount,
  selectedScreening,
  archivedAnalyses,
  onSaveAnalysis,
  onClearSelectedScreening,
  onApplySuggestedTarget,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ClinicalAnalysisResult | null>(null);

  const latest = samples[samples.length - 1];
  const liveEmgAvg =
    samples.length > 0
      ? samples.reduce((acc, s) => acc + s.emg, 0) / samples.length
      : 0;
  const liveEmgPeak = samples.length > 0 ? Math.max(...samples.map((s) => s.emg)) : 0;
  const liveFlexAvg =
    samples.length > 0
      ? samples.reduce((acc, s) => acc + s.flex, 0) / samples.length
      : 0;
  const liveFlexPeak = samples.length > 0 ? Math.max(...samples.map((s) => s.flex)) : 0;

  const emgAvg = selectedScreening ? selectedScreening.avgEmgMv : liveEmgAvg;
  const emgPeak = selectedScreening ? selectedScreening.peakEmgMv : liveEmgPeak;
  const flexPeak = selectedScreening ? selectedScreening.maxFlex : liveFlexPeak;
  const flexAvg = selectedScreening ? selectedScreening.avgFlex : liveFlexAvg;
  const activeSpasticityCount = selectedScreening
    ? selectedScreening.spasticityCount
    : spasticityCount;
  const hasDataToAnalyze = Boolean(selectedScreening) || samples.length > 0;

  const handleGenerate = async () => {
    if (!hasDataToAnalyze) return;
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/clinical-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient: {
            name: patient.name,
            age: patient.age,
            strokeHistory: patient.strokeHistory,
            targetRom: patient.targetRom,
            ashworthScore: patient.ashworthScore,
            affectedSide: patient.affectedSide,
          },
          telemetrySummary: {
            sampleCount: selectedScreening
              ? Math.max(1, selectedScreening.sampleCount)
              : samples.length,
            emgAvg,
            emgPeak,
            emgLatest: latest?.emg ?? emgAvg,
            flexAvg,
            flexPeak,
            flexLatest: latest?.flex ?? flexPeak,
            spasticityAlerts: activeSpasticityCount,
            currentStatus:
              activeSpasticityCount > 0 ? 'Spasticity Alert' : latest?.status ?? 'Normal',
            recentWindow:
              samples.length > 0
                ? samples.slice(-15).map((s) => ({
                    emg: s.emg,
                    flex: s.flex,
                    status: s.status,
                    time: s.timeLabel,
                  }))
                : selectedScreening
                  ? [
                      {
                        emg: selectedScreening.avgEmgMv,
                        flex: selectedScreening.avgFlex,
                        status:
                          selectedScreening.spasticityCount > 0
                            ? 'Spasticity Alert'
                            : 'Normal',
                        time: selectedScreening.startedAtLabel,
                      },
                      {
                        emg: selectedScreening.peakEmgMv,
                        flex: selectedScreening.maxFlex,
                        status:
                          selectedScreening.spasticityCount > 0
                            ? 'Spasticity Alert'
                            : 'Normal',
                        time: selectedScreening.endedAtLabel ?? selectedScreening.startedAtLabel,
                      },
                    ]
                  : [],
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Gagal menghasilkan analisis klinis AI.');
      }

      const result = data as ClinicalAnalysisResult;
      setAnalysis(result);
      void onSaveAnalysis(patient.id, result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Terjadi kendala saat menghubungi layanan AI.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const renderRiskBadge = (riskLevel: string) => {
    const normalized = riskLevel.toLowerCase();
    if (normalized.includes('waspada') || normalized.includes('spast')) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700">
          <ShieldAlert className="w-4 h-4 text-red-600" aria-hidden="true" />
          {riskLevel}
        </span>
      );
    }
    if (normalized.includes('pantau')) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700">
          <AlertTriangle className="w-4 h-4 text-amber-600" aria-hidden="true" />
          {riskLevel}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
        <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-hidden="true" />
        {riskLevel}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_1px_3px_rgba(15,41,66,0.04)] p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-base sm:text-lg font-bold text-[#0F2942]">
              Asisten Analisis Klinis AI
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Sintesis tren sinyal sEMG dan sudut fleksi jari dari data MQTT SiPasien
            </p>
          </div>
          <BrainCircuit className="w-5 h-5 text-[#0066CC] shrink-0 mt-0.5" aria-hidden="true" />
        </div>

        {selectedScreening && (
          <div className="mt-3 rounded-xl bg-[#0066CC]/[0.05] border border-[#0066CC]/25 px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
            <span className="text-[#0F2942] font-medium">
              Fokus Sesi Skrining:{' '}
              <strong className="tabular-nums-mono text-[#0066CC]">
                {selectedScreening.sessionId}
              </strong>{' '}
              ({selectedScreening.endedAtLabel ?? selectedScreening.startedAtLabel})
            </span>
            <button
              type="button"
              onClick={onClearSelectedScreening}
              className="p-1 rounded-lg hover:bg-white text-slate-500 hover:text-[#0F2942]"
              aria-label="Kembali ke data live terbaru"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Telemetry Snapshot passed to AI */}
        <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-slate-400 block">Rata-rata sEMG</span>
            <span className="tabular-nums-mono text-sm font-bold text-[#0F2942] mt-0.5 block">
              {Math.round(emgAvg)} mV
            </span>
          </div>
          <div>
            <span className="text-slate-400 block">Puncak sEMG</span>
            <span className="tabular-nums-mono text-sm font-bold text-[#0F2942] mt-0.5 block">
              {Math.round(emgPeak)} mV
            </span>
          </div>
          <div>
            <span className="text-slate-400 block">Fleksi Puncak</span>
            <span className="tabular-nums-mono text-sm font-bold text-[#0F2942] mt-0.5 block">
              {flexPeak.toFixed(1)}° / {patient.targetRom}°
            </span>
          </div>
          <div>
            <span className="text-slate-400 block">Spasticity Alert</span>
            <span
              className={`tabular-nums-mono text-sm font-bold mt-0.5 block ${
                activeSpasticityCount > 0 ? 'text-red-600' : 'text-[#0F2942]'
              }`}
            >
              {activeSpasticityCount} kejadian
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={isLoading || !hasDataToAnalyze}
          className="mt-5 w-full min-h-[48px] px-5 py-3 rounded-xl bg-[#0066CC] hover:bg-[#0052A3] active:scale-[0.99] disabled:opacity-50 transition-all text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-sm"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              <span>Menganalisis Tren Neuromuskular...</span>
            </>
          ) : !hasDataToAnalyze ? (
            <span>Menunggu Data MQTT Live / Hasil Skrining SiPasien</span>
          ) : (
            <>
              <Activity className="w-4 h-4" aria-hidden="true" />
              <span>Generate Analisis Klinis AI</span>
            </>
          )}
        </button>

        {error && (
          <div className="mt-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700">
            {error}
          </div>
        )}
      </section>

      <AnimatePresence mode="wait">
        {isLoading && (
          <motion.div
            key="ai-loading"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="rounded-2xl bg-white border border-slate-200/90 p-5 space-y-3"
          >
            <div className="h-4 w-1/3 bg-slate-200 rounded animate-pulse" />
            <div className="h-5 w-4/5 bg-slate-100 rounded animate-pulse" />
            <div className="h-16 w-full bg-slate-100 rounded animate-pulse" />
            <div className="h-16 w-full bg-slate-100 rounded animate-pulse" />
          </motion.div>
        )}

        {!isLoading && analysis && (
          <motion.section
            key={analysis.generatedAt}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_1px_3px_rgba(15,41,66,0.04)] p-4 sm:p-6 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
              {renderRiskBadge(analysis.riskLevel)}
              <span className="tabular-nums-mono text-[11px] text-slate-400">
                {new Date(analysis.generatedAt).toLocaleTimeString('id-ID', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>

            <div>
              <h3 className="font-display text-base font-bold text-[#0F2942] leading-snug">
                {analysis.clinicalHeadline}
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
              <div>
                <h4 className="text-xs font-semibold text-[#0F2942] mb-1">
                  Analisis Aktivasi Otot (sEMG)
                </h4>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  {analysis.emgTrendAnalysis}
                </p>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-[#0F2942] mb-1">
                  Evaluasi ROM &amp; Fleksi Jari
                </h4>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  {analysis.romEvaluation}
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100">
              <h4 className="text-xs font-semibold text-[#0F2942] mb-2">
                Rekomendasi Medis untuk Dokter &amp; Fisioterapis
              </h4>
              <ul className="space-y-2">
                {analysis.actionableRecommendations.map((rec, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-700 leading-relaxed"
                  >
                    <span className="tabular-nums-mono text-xs font-bold text-[#0066CC] mt-0.5">
                      0{idx + 1}.
                    </span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs text-slate-500 block">Saran Target ROM Berikutnya</span>
                <span className="tabular-nums-mono text-lg font-bold text-[#0F2942]">
                  {analysis.recommendedTargetRom}°
                </span>
              </div>
              <button
                type="button"
                onClick={() => onApplySuggestedTarget(analysis.recommendedTargetRom)}
                className="min-h-[44px] px-4 py-2.5 rounded-xl border border-[#0066CC]/30 bg-[#0066CC]/5 hover:bg-[#0066CC]/10 text-xs font-semibold text-[#0066CC] inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                <span>Terapkan ke Panel Resep</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {archivedAnalyses.length > 0 && (
        <section className="rounded-2xl bg-white border border-slate-200/80 p-4 sm:p-5">
          <h3 className="font-display text-sm font-semibold text-[#0F2942]">
            Arsip Analisis AI (Cloud)
          </h3>
          <div className="mt-3 divide-y divide-slate-100">
            {archivedAnalyses.slice(0, 5).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setAnalysis(item)}
                className="w-full text-left py-2.5 first:pt-1 last:pb-0 flex items-center justify-between gap-3 hover:bg-slate-50/70 rounded-lg px-1.5 transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[#0F2942] truncate">
                    {item.clinicalHeadline}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {item.riskLevel} <span aria-hidden="true">·</span> Saran ROM {item.recommendedTargetRom}°
                  </div>
                </div>
                <span className="tabular-nums-mono text-[11px] text-slate-400 shrink-0">
                  {new Date(item.generatedAt).toLocaleTimeString('id-ID', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
