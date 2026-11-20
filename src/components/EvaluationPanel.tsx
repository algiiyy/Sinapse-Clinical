import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, Minus, Plus, Send } from 'lucide-react';
import { ExerciseIntensity, PrescriptionRecord } from '../types/clinical';

interface EvaluationPanelProps {
  patientName: string;
  currentTargetRom: number;
  feedbackTopic: string;
  isMqttConnected: boolean;
  prescriptions: PrescriptionRecord[];
  suggestedTargetRom?: number | null;
  onUpdateTargetRom: (newTarget: number) => void;
  onPublishPrescription: (payload: {
    targetFlex: number;
    intensity: ExerciseIntensity;
    clinicalNote: string;
  }) => Promise<{ ok: boolean; message: string }>;
}

const INTENSITY_OPTIONS: ExerciseIntensity[] = [
  'Pasif Terbantu',
  'Aktif Asistif',
  'Aktif Mandiri',
  'Relaksasi Tonus',
];

const QUICK_NOTES = [
  'Pertahankan ekstensi pergelangan netral saat fleksi jari bertahap.',
  'Kurangi kecepatan tarikan servo bila sEMG melebihi 2.0 mV.',
  'Tingkatkan repetisi fleksi-ekstensi lambat 12x per set.',
];

export const EvaluationPanel: React.FC<EvaluationPanelProps> = ({
  patientName,
  currentTargetRom,
  feedbackTopic,
  isMqttConnected,
  prescriptions,
  suggestedTargetRom,
  onUpdateTargetRom,
  onPublishPrescription,
}) => {
  const [targetFlex, setTargetFlex] = useState<number>(currentTargetRom);
  const [intensity, setIntensity] = useState<ExerciseIntensity>('Aktif Asistif');
  const [clinicalNote, setClinicalNote] = useState<string>(
    'Lanjutkan latihan fleksi bertahap menuju target ROM dengan jeda relaksasi 5 detik antar repetisi.'
  );
  const [isSending, setIsSending] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    setTargetFlex(currentTargetRom);
  }, [currentTargetRom]);

  useEffect(() => {
    if (typeof suggestedTargetRom === 'number' && suggestedTargetRom >= 20) {
      setTargetFlex(suggestedTargetRom);
    }
  }, [suggestedTargetRom]);

  const adjustTarget = (delta: number) => {
    setTargetFlex((prev) => Math.max(20, Math.min(180, prev + delta)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinicalNote.trim()) return;
    setIsSending(true);
    setFeedbackBanner(null);
    const result = await onPublishPrescription({
      targetFlex,
      intensity,
      clinicalNote,
    });
    onUpdateTargetRom(targetFlex);
    setIsSending(false);
    setFeedbackBanner({ ok: result.ok, message: result.message });
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_1px_3px_rgba(15,41,66,0.04)] p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-2 pb-4 border-b border-slate-100">
          <div>
            <h2 className="font-display text-base sm:text-lg font-bold text-[#0F2942]">
              Evaluasi &amp; Resep Latihan
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Komunikasi dua arah ke sarung tangan NeuroHand untuk {patientName}
            </p>
          </div>
          <div className="text-right">
            <span className="text-[11px] font-medium text-slate-500 block">
              Topic Feedback
            </span>
            <span className="tabular-nums-mono text-[11px] text-[#0066CC] break-all">
              {feedbackTopic}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          {/* Target ROM Angle Precision Control */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label
                htmlFor="target-flex-slider"
                className="text-xs sm:text-sm font-semibold text-[#0F2942]"
              >
                Target Sudut Fleksi Baru
              </label>
              <span className="tabular-nums-mono text-2xl font-bold text-[#0066CC]">
                {targetFlex}°
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => adjustTarget(-5)}
                className="min-h-[44px] min-w-[44px] rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 active:scale-95 transition-all flex items-center justify-center text-[#0F2942]"
                aria-label="Kurangi target fleksi 5 derajat"
              >
                <Minus className="w-4 h-4" />
              </button>

              <input
                id="target-flex-slider"
                type="range"
                min={20}
                max={180}
                step={1}
                value={targetFlex}
                onChange={(e) => setTargetFlex(Number(e.target.value))}
                className="clinical-slider flex-1"
              />

              <button
                type="button"
                onClick={() => adjustTarget(5)}
                className="min-h-[44px] min-w-[44px] rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 active:scale-95 transition-all flex items-center justify-center text-[#0F2942]"
                aria-label="Tambah target fleksi 5 derajat"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="flex justify-between text-[11px] text-slate-400 tabular-nums-mono mt-1.5 px-1">
              <span>20° (Minimal)</span>
              <span>90° (Fungsional)</span>
              <span>180° (Penuh)</span>
            </div>
          </div>

          {/* Exercise Mode Segmented Control */}
          <div>
            <span className="block text-xs sm:text-sm font-semibold text-[#0F2942] mb-2">
              Mode Bantuan Latihan Sarung Tangan
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-slate-100 rounded-xl">
              {INTENSITY_OPTIONS.map((option) => {
                const selected = intensity === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setIntensity(option)}
                    className={`relative min-h-[44px] px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap truncate ${
                      selected ? 'text-[#0F2942]' : 'text-slate-500 hover:text-[#0F2942]'
                    }`}
                  >
                    {selected && (
                      <motion.span
                        layoutId="intensity-active-bg"
                        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                        className="absolute inset-0 bg-white rounded-lg shadow-sm"
                      />
                    )}
                    <span className="relative z-10">{option}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Clinical Note & Quick Templates */}
          <div>
            <label
              htmlFor="clinical-note-input"
              className="block text-xs sm:text-sm font-semibold text-[#0F2942] mb-2"
            >
              Catatan Evaluasi Klinis &amp; Instruksi Fisioterapi
            </label>
            <textarea
              id="clinical-note-input"
              rows={3}
              value={clinicalNote}
              onChange={(e) => setClinicalNote(e.target.value)}
              placeholder="Tuliskan catatan klinis, observasi tonus otot, atau penyesuaian protokol latihan..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-[#0066CC] focus:ring-2 focus:ring-[#0066CC]/15 outline-none px-3.5 py-3 text-sm text-[#0F2942] transition-all resize-none"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {QUICK_NOTES.map((template, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => setClinicalNote(template)}
                  className="text-left text-[11px] text-[#0066CC] hover:text-[#0F2942] underline underline-offset-2 transition-colors py-1"
                >
                  + Templat {index + 1}
                </button>
              ))}
            </div>
          </div>

          {/* Submit Action */}
          <div className="pt-1">
            <button
              type="submit"
              disabled={isSending || !clinicalNote.trim() || !isMqttConnected}
              className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[#0F2942] hover:bg-[#163A5C] active:scale-[0.99] disabled:opacity-50 transition-all text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-sm"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
              <span>
                {isSending
                  ? 'Mengirim Resep via MQTT...'
                  : isMqttConnected
                    ? 'Kirim Resep ke SiPasien (MQTT Live)'
                    : 'Hubungkan MQTT untuk Mengirim Resep'}
              </span>
            </button>
          </div>

          <AnimatePresence>
            {feedbackBanner && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                className={`rounded-xl px-4 py-3 text-xs font-medium flex items-center gap-2.5 ${
                  feedbackBanner.ok
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{feedbackBanner.message}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </form>
      </section>

      {/* Dispatched Prescription History */}
      <section className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_1px_3px_rgba(15,41,66,0.04)] p-4 sm:p-5">
        <h3 className="font-display text-sm font-semibold text-[#0F2942]">
          Riwayat Resep Terkirim
        </h3>
        {prescriptions.length === 0 ? (
          <p className="text-xs text-slate-400 mt-2">
            Belum ada resep latihan yang dikirim pada sesi pemantauan ini.
          </p>
        ) : (
          <div className="mt-3 divide-y divide-slate-100">
            {prescriptions.map((item) => (
              <div key={item.id} className="py-3 first:pt-1 last:pb-0">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-[#0F2942]">
                    Target {item.targetFlex}° · {item.intensity}
                  </span>
                  <span className="tabular-nums-mono text-slate-400">
                    {item.sentAt} · MQTT Live
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  {item.clinicalNote}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
