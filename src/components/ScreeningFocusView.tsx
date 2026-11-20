import React from 'react';
import { motion } from 'motion/react';
import { Activity, ArrowLeft, CheckCircle2, Clock, ShieldAlert, ShieldCheck } from 'lucide-react';
import {
  EMG_RAW_ADC_THRESHOLD,
  EMG_SPASTICITY_THRESHOLD_MV,
  MAX_FLEX_ANGLE_DEG,
} from '../data/patients';
import { PatientProfile, ScreeningSession, TelemetrySample } from '../types/clinical';
import { LiveTelemetryChart } from './LiveTelemetryChart';

interface ScreeningFocusViewProps {
  patient: PatientProfile;
  session: ScreeningSession;
  samples: TelemetrySample[];
  isMqttConnected: boolean;
  onMinimizeToDashboard: () => void;
  onFinishScreeningNow: () => void;
}

function formatMmSs(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function getEmgLabel(rawAdc: number): string {
  if (rawAdc >= EMG_RAW_ADC_THRESHOLD) return 'SPASTICITY ALERT';
  if (rawAdc >= 2500) return 'Tonus Meningkat';
  if (rawAdc >= 800) return 'Kontraksi Normal';
  return 'Otot Rileks';
}

export const ScreeningFocusView: React.FC<ScreeningFocusViewProps> = ({
  patient,
  session,
  samples,
  isMqttConnected,
  onMinimizeToDashboard,
  onFinishScreeningNow,
}) => {
  const targetSec = session.targetDurationSec ?? 900;
  const remainingSec = Math.max(0, targetSec - session.durationSec);
  const progressPct = Math.min(100, Math.round((session.durationSec / Math.max(1, targetSec)) * 100));

  const latest = samples[samples.length - 1];
  const currentEmgMv = latest?.emg ?? 0;
  const currentRawAdc = latest?.rawSemg ?? Math.round((currentEmgMv / 3300) * 4095);
  const currentFlex = latest?.flex ?? 0;
  const isSpastic =
    latest?.status === 'Spasticity Alert' ||
    currentRawAdc >= EMG_RAW_ADC_THRESHOLD ||
    currentEmgMv >= EMG_SPASTICITY_THRESHOLD_MV;

  const emgPercent = Math.min(100, Math.round((currentRawAdc / 4095) * 100));
  const flexPercent = Math.min(100, Math.round((currentFlex / MAX_FLEX_ANGLE_DEG) * 100));

  return (
    <motion.div
      key={`screening-focus-${session.id}`}
      initial={{ opacity: 0, y: 12, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.985 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-4"
    >
      {/* Top Focus Header & 15:00 Countdown */}
      <section className="rounded-2xl bg-white border border-slate-200/90 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#0066CC]">
              <Activity className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Mode Skrining Aktif</span>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span className="text-emerald-700">Mengukur</span>
            </div>
            <h1 className="font-display text-lg sm:text-xl font-bold text-[#0F2942] mt-1 truncate">
              {patient.name} ({patient.id})
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Mengukur sinyal sEMG &amp; artikulasi fleksi jari secara real-time · Sesi {session.sessionId}
            </p>
          </div>

          <div className="text-right shrink-0">
            <div className="flex items-center justify-end gap-1.5 text-[11px] font-medium text-slate-400">
              <Clock className="w-3.5 h-3.5 text-[#0066CC]" aria-hidden="true" />
              <span>SISA DURASI</span>
            </div>
            <div className="tabular-nums-mono text-2xl sm:text-3xl font-bold tracking-tight text-[#0F2942] mt-0.5">
              {formatMmSs(remainingSec)}
            </div>
            <div className="tabular-nums-mono text-[11px] text-slate-400">
              Berjalan {formatMmSs(session.durationSec)} / {formatMmSs(targetSec)}
            </div>
          </div>
        </div>

        {/* 15-Minute Progress Track */}
        <div className="mt-4 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-[#0066CC] transition-all duration-500 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* 3 Clean Summary Counters (Mirrors SiPasien Screening Strip) */}
        <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-3 gap-3 text-center sm:text-left">
          <div>
            <span className="block text-[10px] sm:text-[11px] font-medium text-slate-400 tracking-wide">
              SINYAL TERUKUR
            </span>
            <span className="tabular-nums-mono text-base sm:text-lg font-bold text-[#0F2942] mt-0.5 block">
              {session.sampleCount} pkt
            </span>
          </div>

          <div>
            <span className="block text-[10px] sm:text-[11px] font-medium text-slate-400 tracking-wide">
              PEAK sEMG
            </span>
            <span className="tabular-nums-mono text-base sm:text-lg font-bold text-[#0F2942] mt-0.5 block">
              {session.peakRawSemg ?? Math.round((session.peakEmgMv / 3300) * 4095)} ADC
            </span>
          </div>

          <div>
            <span className="block text-[10px] sm:text-[11px] font-medium text-slate-400 tracking-wide">
              MAX ROM
            </span>
            <span className="tabular-nums-mono text-base sm:text-lg font-bold text-[#0066CC] mt-0.5 block">
              {session.maxFlex.toFixed(1)}°
            </span>
          </div>
        </div>
      </section>

      {/* Instant Telemetry Readout Cards (sEMG Signal + Flex Angle + Safety State) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl bg-white border border-slate-200/80 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold text-[#0F2942]">sEMG Signal</span>
            <span className="tabular-nums-mono">{emgPercent}%</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span
              className={`tabular-nums-mono text-2xl font-bold ${
                isSpastic ? 'text-red-600' : 'text-[#0F2942]'
              }`}
            >
              {currentRawAdc}
            </span>
            <span className="tabular-nums-mono text-xs text-slate-400">/4095 ADC</span>
          </div>
          <p className="text-xs text-slate-500 mt-1 tabular-nums-mono">
            {Math.round(currentEmgMv)} mV · {getEmgLabel(currentRawAdc)}
          </p>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200/80 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold text-[#0F2942]">Flex Angle</span>
            <span className="tabular-nums-mono">{flexPercent}%</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="tabular-nums-mono text-2xl font-bold text-[#0066CC]">
              {currentFlex.toFixed(1)}°
            </span>
            <span className="tabular-nums-mono text-xs text-slate-400">
              / {patient.targetRom}° Target
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {currentFlex >= patient.targetRom ? 'Target ROM Tercapai' : 'Artikulasi Fleksi Aktif'}
          </p>
        </div>

        <div
          className={`rounded-2xl border p-4 transition-colors ${
            isSpastic
              ? 'bg-red-50/70 border-red-200'
              : 'bg-white border-slate-200/80'
          }`}
        >
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[#0F2942]">Safety State</span>
            {isSpastic ? (
              <ShieldAlert className="w-4 h-4 text-red-600" aria-hidden="true" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-emerald-600" aria-hidden="true" />
            )}
          </div>
          <div
            className={`mt-2 text-xl font-bold ${
              isSpastic ? 'text-red-600' : 'text-emerald-700'
            }`}
          >
            {isSpastic ? 'Spasticity Alert' : 'Normal'}
          </div>
          <p className="text-xs text-slate-500 mt-1 tabular-nums-mono">
            {session.spasticityCount}x spasme tercatat sesi ini
          </p>
        </div>
      </div>

      {/* Focused Live Waveforms */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LiveTelemetryChart
          title="Sinyal sEMG Skrining"
          subtitle="Bio-potensial otot real-time (0–3300 mV)"
          unit="mV"
          samples={samples}
          valueKey="emg"
          minY={0}
          maxY={3300}
          thresholdValue={EMG_SPASTICITY_THRESHOLD_MV}
          thresholdLabel={`Ambang ${EMG_SPASTICITY_THRESHOLD_MV} mV`}
          accentColor="#0066CC"
          alertActive={isSpastic}
          decimals={0}
          isStreaming={isMqttConnected}
        />

        <LiveTelemetryChart
          title="Sudut Fleksi Jari Skrining"
          subtitle="Rentang gerak aktif pasien (0°–180°)"
          unit="°"
          samples={samples}
          valueKey="flex"
          minY={0}
          maxY={MAX_FLEX_ANGLE_DEG}
          thresholdValue={patient.targetRom}
          thresholdLabel={`Target ${patient.targetRom}°`}
          accentColor="#0F2942"
          decimals={1}
          isStreaming={isMqttConnected}
        />
      </div>

      {/* Minimalist Focus Footer Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
        <button
          type="button"
          onClick={onMinimizeToDashboard}
          className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-600 inline-flex items-center justify-center gap-2 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Kembali ke Dashboard Utama</span>
        </button>

        <button
          type="button"
          onClick={onFinishScreeningNow}
          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#0F2942] hover:bg-[#163A5C] text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors"
        >
          <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
          <span>Akhiri &amp; Lihat Hasil Dokter</span>
        </button>
      </div>
    </motion.div>
  );
};
