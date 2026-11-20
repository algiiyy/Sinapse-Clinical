import React from 'react';
import { ArrowRight, ClipboardCheck } from 'lucide-react';
import { PatientProfile, PrescriptionRecord } from '../types/clinical';

interface ActivePrescriptionCardProps {
  patient: PatientProfile;
  latestPrescription: PrescriptionRecord | null;
  onOpenEvaluation: () => void;
}

export const ActivePrescriptionCard: React.FC<ActivePrescriptionCardProps> = ({
  patient,
  latestPrescription,
  onOpenEvaluation,
}) => {
  const activeTarget = latestPrescription?.targetFlex ?? patient.targetRom;

  return (
    <section className="rounded-2xl bg-white border border-slate-200/80 p-4 sm:p-5 flex flex-col justify-between h-full">
      <div>
        <div className="flex items-start justify-between gap-3 pb-3.5 border-b border-slate-100">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-[#0066CC] shrink-0" aria-hidden="true" />
              <h3 className="font-display text-sm sm:text-base font-semibold text-[#0F2942] truncate">
                Resep &amp; Target Dokter
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {latestPrescription ? 'Protokol latihan aktif di SiPasien' : 'Target latihan standar pasien'}
            </p>
          </div>
          {latestPrescription && (
            <span className="tabular-nums-mono text-[11px] text-slate-400 shrink-0">
              {latestPrescription.sentAt}
            </span>
          )}
        </div>

        {/* Target & Mode Readout */}
        <div className="mt-4 grid grid-cols-2 gap-3 pb-3.5 border-b border-slate-100">
          <div>
            <span className="text-[11px] text-slate-400 block">Target Fleksi</span>
            <span className="tabular-nums-mono text-2xl font-bold text-[#0066CC] tracking-tight">
              {activeTarget}°
            </span>
          </div>
          <div>
            <span className="text-[11px] text-slate-400 block">Mode Latihan</span>
            <span className="text-sm font-semibold text-[#0F2942] mt-1 block truncate">
              {latestPrescription ? latestPrescription.intensity : 'Belum ditetapkan'}
            </span>
          </div>
        </div>

        {/* Clinical Note */}
        <div className="mt-3.5">
          <span className="text-[11px] font-medium text-slate-400 block">
            Instruksi Klinis Terkini
          </span>
          {latestPrescription ? (
            <p className="mt-1 text-xs sm:text-sm text-slate-600 leading-relaxed line-clamp-3">
              {latestPrescription.clinicalNote}
            </p>
          ) : (
            <p className="mt-1 text-xs text-slate-400 leading-relaxed">
              Belum ada resep latihan yang dikirim ke perangkat {patient.name}. Buat resep untuk mengirim target dan catatan ke menu notifikasi SiPasien.
            </p>
          )}
          {latestPrescription?.physician && (
            <p className="mt-2 text-[11px] text-slate-400 truncate">
              Oleh {latestPrescription.physician}
            </p>
          )}
        </div>
      </div>

      {/* Action CTA */}
      <div className="mt-4 pt-3 border-t border-slate-100">
        <button
          type="button"
          onClick={onOpenEvaluation}
          className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#0F2942] hover:bg-[#163A5C] text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors"
        >
          <span>{latestPrescription ? 'Perbarui Resep Latihan' : 'Buat Resep Latihan'}</span>
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
};
