import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { PatientProfile } from '../types/clinical';

interface PatientSummaryCardProps {
  patient: PatientProfile;
  patients: PatientProfile[];
  currentFlex: number;
  onSelectPatient: (patientId: string) => void;
}

export const PatientSummaryCard: React.FC<PatientSummaryCardProps> = ({
  patient,
  patients,
  currentFlex,
  onSelectPatient,
}) => {
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);

  const progressRatio = Math.min(1, Math.max(0, currentFlex / Math.max(1, patient.targetRom)));
  const progressPercent = Math.round(progressRatio * 100);
  const ringRadius = 21;
  const circumference = 2 * Math.PI * ringRadius;
  const strokeDashoffset = circumference * (1 - progressRatio);

  return (
    <section className="rounded-2xl bg-white border border-slate-200/80 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg sm:text-xl font-bold text-[#0F2942] tracking-tight truncate">
              {patient.name}
            </h2>
            <button
              type="button"
              onClick={() => setIsSelectorOpen((prev) => !prev)}
              className="min-h-[36px] px-2.5 py-1 rounded-lg hover:bg-slate-100 text-xs font-medium text-[#0066CC] inline-flex items-center gap-1 transition-colors shrink-0"
              aria-expanded={isSelectorOpen}
            >
              <span>Ganti</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  isSelectorOpen ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </button>
          </div>

          <p className="text-xs text-slate-500 mt-0.5 truncate">
            {patient.age} th <span aria-hidden="true">·</span> {patient.affectedSide}{' '}
            <span aria-hidden="true">·</span> MAS {patient.ashworthNumeric}
          </p>
          <p className="text-xs text-slate-400 mt-1 truncate">
            {patient.strokeHistory}
          </p>
        </div>

        {/* Minimalist ROM Ring */}
        <div className="flex items-center gap-3 shrink-0 pl-2">
          <div className="text-right hidden sm:block">
            <div className="text-[11px] text-slate-400">Target ROM</div>
            <div className="tabular-nums-mono text-base font-bold text-[#0F2942]">
              {patient.targetRom}°
            </div>
          </div>
          <div className="relative w-13 h-13 flex items-center justify-center">
            <svg className="w-13 h-13 -rotate-90" viewBox="0 0 52 52" aria-hidden="true">
              <circle
                cx="26"
                cy="26"
                r={ringRadius}
                fill="none"
                stroke="#E2E8F0"
                strokeWidth="4"
              />
              <circle
                cx="26"
                cy="26"
                r={ringRadius}
                fill="none"
                stroke="#0066CC"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-300 ease-out"
              />
            </svg>
            <span className="absolute tabular-nums-mono text-[10px] font-bold text-[#0F2942]">
              {progressPercent}%
            </span>
          </div>
        </div>
      </div>

      {/* Smooth collapsible patient selector */}
      <AnimatePresence initial={false}>
        {isSelectorOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-2">
              {patients.map((item) => {
                const isActive = item.id === patient.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelectPatient(item.id);
                      setIsSelectorOpen(false);
                    }}
                    className={`min-h-[44px] text-left px-3 py-2 rounded-xl border transition-all ${
                      isActive
                        ? 'border-[#0066CC] bg-[#0066CC]/[0.05] text-[#0F2942]'
                        : 'border-slate-200/80 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="text-xs font-semibold truncate">{item.name}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                      Target {item.targetRom}° <span aria-hidden="true">·</span> MAS {item.ashworthNumeric}
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};
