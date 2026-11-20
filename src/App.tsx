import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  ClipboardCheck,
  Radio,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { AiClinicalAssistant } from './components/AiClinicalAssistant';
import { EvaluationPanel } from './components/EvaluationPanel';
import { LiveTelemetryChart } from './components/LiveTelemetryChart';
import { MqttSettingsPanel } from './components/MqttSettingsPanel';
import { PatientSummaryCard } from './components/PatientSummaryCard';
import { ScreeningFocusView } from './components/ScreeningFocusView';
import { ScreeningResultModal } from './components/ScreeningResultModal';
import { ScreeningTrackerCard } from './components/ScreeningTrackerCard';
import {
  DEFAULT_MQTT_SETTINGS,
  EMG_SPASTICITY_THRESHOLD_MV,
  INITIAL_PATIENTS,
  MAX_FLEX_ANGLE_DEG,
} from './data/patients';
import { useClinicalCloud } from './hooks/useClinicalCloud';
import { useNeuroHandMqtt } from './hooks/useNeuroHandMqtt';
import {
  MqttSettings,
  PatientProfile,
  PrescriptionRecord,
  ScreeningSession,
  TabId,
} from './types/clinical';

interface NavTab {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_TABS: NavTab[] = [
  { id: 'monitor', label: 'Monitor', icon: Activity },
  { id: 'evaluation', label: 'Evaluasi', icon: ClipboardCheck },
  { id: 'ai', label: 'Analisis AI', icon: BrainCircuit },
  { id: 'connection', label: 'Koneksi', icon: Radio },
];

export default function App() {
  const [patients, setPatients] = useState<PatientProfile[]>(INITIAL_PATIENTS);
  const [activePatientId, setActivePatientId] = useState<string>(INITIAL_PATIENTS[0].id);
  const [mqttSettings, setMqttSettings] = useState<MqttSettings>(DEFAULT_MQTT_SETTINGS);
  const [activeTab, setActiveTab] = useState<TabId>('monitor');
  const [tabDirection, setTabDirection] = useState<number>(1);
  const [suggestedTargetRom, setSuggestedTargetRom] = useState<number | null>(null);
  const [selectedScreeningForAi, setSelectedScreeningForAi] =
    useState<ScreeningSession | null>(null);
  const [audioAlarmEnabled, setAudioAlarmEnabled] = useState<boolean>(true);
  const [dismissedFocusSessionId, setDismissedFocusSessionId] = useState<string | null>(null);
  const [inspectedScreeningResult, setInspectedScreeningResult] =
    useState<ScreeningSession | null>(null);

  const persistedScreeningIdsRef = useRef<Set<string>>(new Set());

  const {
    user,
    isAutoCloudActive,
    cloudPatients,
    cloudScreenings,
    cloudPrescriptions,
    cloudAnalyses,
    savePatientTargetRom,
    saveScreeningReport,
    savePrescription,
    saveAiAnalysis,
    removeScreeningReport,
  } = useClinicalCloud(activePatientId, audioAlarmEnabled);

  // Merge cloud-persisted patient targetRom/ashworth with local patient profiles
  const mergedPatients = useMemo(() => {
    return patients.map((p) => {
      const cloudOverride = cloudPatients[p.id];
      return cloudOverride ? { ...p, ...cloudOverride } : p;
    });
  }, [patients, cloudPatients]);

  const activePatient = useMemo(
    () => mergedPatients.find((p) => p.id === activePatientId) ?? mergedPatients[0],
    [mergedPatients, activePatientId]
  );

  const {
    connectionState,
    connectionMessage,
    samples,
    prescriptions: livePrescriptions,
    activeScreening,
    completedScreenings: liveCompletedScreenings,
    justCompletedScreening,
    lastRawPayload,
    brokerLogs,
    connectMqtt,
    disconnectMqtt,
    publishPrescription,
    resetForPatient,
    finishActiveScreeningLocally,
    clearJustCompletedScreening,
  } = useNeuroHandMqtt({
    settings: mqttSettings,
    patientId: activePatient.id,
    physicianName: user?.displayName || activePatient.attendingPhysician,
    audioAlarmEnabled,
  });

  const isScreeningFocusMode = Boolean(
    activeScreening && dismissedFocusSessionId !== activeScreening.id
  );

  // Auto-save newly completed SiPasien screening reports automatically (no login required)
  useEffect(() => {
    if (!isAutoCloudActive || liveCompletedScreenings.length === 0) return;

    liveCompletedScreenings.forEach((session) => {
      if (!persistedScreeningIdsRef.current.has(session.id)) {
        persistedScreeningIdsRef.current.add(session.id);
        void saveScreeningReport(session);
      }
    });
  }, [isAutoCloudActive, liveCompletedScreenings, saveScreeningReport]);

  // Merge live session screenings + cloud screenings for active patient (deduplicated)
  const visibleScreenings = useMemo(() => {
    const bySession = new Map<string, ScreeningSession>();
    cloudScreenings
      .filter((s) => s.patientId === activePatient.id)
      .forEach((s) => bySession.set(s.sessionId + s.startedAtLabel, s));
    liveCompletedScreenings
      .filter((s) => s.patientId === activePatient.id)
      .forEach((s) => {
        const key = s.sessionId + s.startedAtLabel;
        if (!bySession.has(key)) {
          bySession.set(key, s);
        }
      });
    return Array.from(bySession.values());
  }, [activePatient.id, cloudScreenings, liveCompletedScreenings]);

  // Merge live + cloud prescriptions for active patient
  const visiblePrescriptions = useMemo(() => {
    const byId = new Map<string, PrescriptionRecord>();
    cloudPrescriptions
      .filter((rx) => rx.patientId === activePatient.id)
      .forEach((rx) => byId.set(rx.sentAt + rx.clinicalNote, rx));
    livePrescriptions
      .filter((rx) => rx.patientId === activePatient.id)
      .forEach((rx) => {
        const key = rx.sentAt + rx.clinicalNote;
        if (!byId.has(key)) {
          byId.set(key, rx);
        }
      });
    return Array.from(byId.values());
  }, [activePatient.id, cloudPrescriptions, livePrescriptions]);

  const visibleAnalyses = useMemo(
    () => cloudAnalyses.filter((a) => a.patientId === activePatient.id),
    [activePatient.id, cloudAnalyses]
  );

  const latestSample = samples[samples.length - 1];
  const isSpasticityAlert = latestSample?.status === 'Spasticity Alert';
  const isConnected = connectionState === 'connected';

  const handleSelectTab = (nextTab: TabId) => {
    if (nextTab === activeTab) return;
    const prevIdx = NAV_TABS.findIndex((t) => t.id === activeTab);
    const nextIdx = NAV_TABS.findIndex((t) => t.id === nextTab);
    setTabDirection(nextIdx >= prevIdx ? 1 : -1);
    setActiveTab(nextTab);
  };

  const handleSelectPatient = (patientId: string) => {
    const nextPatient = mergedPatients.find((p) => p.id === patientId);
    if (!nextPatient) return;
    setActivePatientId(patientId);
    setSuggestedTargetRom(null);
    setSelectedScreeningForAi(null);
    setMqttSettings((prev) => ({
      ...prev,
      telemetryTopic: `neurohand/telemetry/${patientId}`,
      screeningTopic: `neurohand/screening/${patientId}`,
      feedbackTopic: `neurohand/feedback/${patientId}`,
    }));
    resetForPatient(patientId);
  };

  const handleUpdateTargetRom = (newTarget: number) => {
    setPatients((prev) =>
      prev.map((p) => (p.id === activePatient.id ? { ...p, targetRom: newTarget } : p))
    );
    void savePatientTargetRom(activePatient, newTarget);
  };

  const handlePublishPrescription = async (payload: {
    targetFlex: number;
    intensity: PrescriptionRecord['intensity'];
    clinicalNote: string;
  }) => {
    const result = await publishPrescription(payload);
    if (result.ok) {
      void savePrescription({
        id: `rx-${Date.now()}`,
        patientId: activePatient.id,
        targetFlex: payload.targetFlex,
        intensity: payload.intensity,
        clinicalNote: payload.clinicalNote.trim(),
        physician: user?.displayName || activePatient.attendingPhysician,
        topic: mqttSettings.feedbackTopic,
        sentAt: new Date().toLocaleTimeString('id-ID', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        transport: 'mqtt',
      });
    }
    return result;
  };

  const handleApplySuggestedTarget = (recommendedRom: number) => {
    setSuggestedTargetRom(recommendedRom);
    handleSelectTab('evaluation');
  };

  const handleAnalyzeScreening = (session: ScreeningSession) => {
    setSelectedScreeningForAi(session);
    clearJustCompletedScreening();
    setInspectedScreeningResult(null);
    handleSelectTab('ai');
  };

  const handlePrescribeFromScreening = (session: ScreeningSession) => {
    if (session.maxFlex > 0) {
      const nextTarget = Math.min(180, Math.max(25, Math.round(session.maxFlex + 5)));
      setSuggestedTargetRom(nextTarget);
    }
    clearJustCompletedScreening();
    setInspectedScreeningResult(null);
    handleSelectTab('evaluation');
  };

  const modalScreeningSession = justCompletedScreening ?? inspectedScreeningResult;

  const handleCloseResultModal = () => {
    clearJustCompletedScreening();
    setInspectedScreeningResult(null);
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-[#F7F9FC] text-[#0F2942] flex flex-col">
        {/* Minimalist 3-Zone Top Bar */}
        <header className="sticky top-0 z-30 h-12 lg:h-15 bg-white/85 backdrop-blur-md border-b border-slate-200/70">
          <div className="max-w-6xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-8">
            {/* Zone 1: Brand */}
            <button
              type="button"
              onClick={() => handleSelectTab('monitor')}
              className="font-display text-base sm:text-lg font-bold tracking-tight text-[#0F2942] whitespace-nowrap shrink-0 text-left"
            >
              SYNAPSE Clinical
            </button>

            {/* Zone 2: Desktop Single-Line Navigation (hidden during dedicated screening mode) */}
            {!isScreeningFocusMode && (
              <nav aria-label="Navigasi Utama" className="hidden lg:flex items-center gap-7 h-full">
                {NAV_TABS.map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => handleSelectTab(tab.id)}
                      className={`relative h-full px-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 flex items-center ${
                        isActive ? 'text-[#0066CC]' : 'text-slate-500 hover:text-[#0F2942]'
                      }`}
                    >
                      <span>{tab.label}</span>
                      {isActive && (
                        <motion.span
                          layoutId="desktop-nav-underline"
                          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0066CC] rounded-full"
                        />
                      )}
                    </button>
                  );
                })}
              </nav>
            )}

            {/* Zone 3: Quiet Audio Alarm Control */}
            <div className="flex items-center shrink-0">
              <button
                type="button"
                onClick={() => setAudioAlarmEnabled((prev) => !prev)}
                className="min-h-[36px] px-2.5 py-1.5 rounded-xl hover:bg-slate-100 text-xs font-medium text-slate-600 hover:text-[#0F2942] whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 transition-colors"
                aria-label={audioAlarmEnabled ? 'Matikan alarm spastisitas' : 'Nyalakan alarm spastisitas'}
              >
                {audioAlarmEnabled ? (
                  <Volume2 className="w-4 h-4 text-[#0066CC]" aria-hidden="true" />
                ) : (
                  <VolumeX className="w-4 h-4 text-slate-400" aria-hidden="true" />
                )}
                <span className="hidden sm:inline">
                  {audioAlarmEnabled ? 'Alarm On' : 'Alarm Off'}
                </span>
              </button>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-24 lg:pb-10">

          {/* Global Spasticity Alert Banner */}
          <AnimatePresence>
            {isSpasticityAlert && (
              <motion.div
                key="spasticity-alert-banner"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                role="alert"
                className="mb-4 rounded-2xl bg-red-600 text-white px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
                  <div className="text-xs sm:text-sm font-semibold">
                    Spasticity Alert · sEMG {Math.round(latestSample?.emg ?? 0)} mV ({latestSample?.rawSemg ?? 0} ADC) · Fleksi {latestSample?.flex.toFixed(1)}°
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleSelectTab('evaluation')}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-white text-red-700 text-xs font-semibold whitespace-nowrap shrink-0 self-start sm:self-center"
                >
                  Sesuaikan ROM
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Animated Views: Dedicated Screening Mode vs Normal Clinical Tabs */}
          <AnimatePresence mode="wait" initial={false}>
            {isScreeningFocusMode && activeScreening ? (
              <ScreeningFocusView
                key={`focus-${activeScreening.id}`}
                patient={activePatient}
                session={activeScreening}
                samples={samples}
                isMqttConnected={isConnected}
                onMinimizeToDashboard={() => setDismissedFocusSessionId(activeScreening.id)}
                onFinishScreeningNow={finishActiveScreeningLocally}
              />
            ) : activeTab === 'monitor' ? (
              <motion.div
                key="tab-monitor"
                initial={{ opacity: 0, x: tabDirection * 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: tabDirection * -16 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-4"
              >
                {/* Minimalist Patient Profile Header */}
                <PatientSummaryCard
                  patient={activePatient}
                  patients={mergedPatients}
                  currentFlex={latestSample?.flex ?? visibleScreenings[0]?.maxFlex ?? 0}
                  onSelectPatient={handleSelectPatient}
                />

                {/* Screening History First */}
                <ScreeningTrackerCard
                  activeScreening={activeScreening}
                  completedScreenings={visibleScreenings}
                  targetRom={activePatient.targetRom}
                  onEnterFocusMode={() => setDismissedFocusSessionId(null)}
                  onOpenScreeningResult={(session) => setInspectedScreeningResult(session)}
                  onAnalyzeScreening={handleAnalyzeScreening}
                  onPrescribeFromScreening={handlePrescribeFromScreening}
                  onDeleteScreening={(docId) => void removeScreeningReport(docId)}
                />

                {/* Live sEMG & Flexion Charts appear only after patient clicks Mulai Screening */}
                <AnimatePresence>
                  {activeScreening && (
                    <motion.div
                      key="active-monitor-charts"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                      className="grid grid-cols-1 lg:grid-cols-2 gap-4"
                    >
                      <LiveTelemetryChart
                        title="Sinyal sEMG"
                        subtitle="Bio-potensial otot (0–3300 mV)"
                        unit="mV"
                        samples={samples}
                        valueKey="emg"
                        minY={0}
                        maxY={3300}
                        thresholdValue={EMG_SPASTICITY_THRESHOLD_MV}
                        thresholdLabel={`Ambang ${EMG_SPASTICITY_THRESHOLD_MV} mV`}
                        accentColor="#0066CC"
                        alertActive={isSpasticityAlert}
                        decimals={0}
                        isStreaming={isConnected}
                      />

                      <LiveTelemetryChart
                        title="Sudut Fleksi Jari"
                        subtitle="Rentang gerak aktif (0°–180°)"
                        unit="°"
                        samples={samples}
                        valueKey="flex"
                        minY={0}
                        maxY={MAX_FLEX_ANGLE_DEG}
                        thresholdValue={activePatient.targetRom}
                        thresholdLabel={`Target ${activePatient.targetRom}°`}
                        accentColor="#0F2942"
                        decimals={1}
                        isStreaming={isConnected}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ) : activeTab === 'evaluation' ? (
              <motion.div
                key="tab-evaluation"
                initial={{ opacity: 0, x: tabDirection * 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: tabDirection * -16 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start"
              >
                <div className="lg:col-span-4">
                  <section className="rounded-2xl bg-white border border-slate-200/80 p-4 sm:p-5">
                    <div className="text-xs text-slate-400">Pasien Aktif</div>
                    <h3 className="font-display text-base font-bold text-[#0F2942] mt-0.5">
                      {activePatient.name}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">{activePatient.ashworthScore}</p>

                    <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-[11px] text-slate-400 block">sEMG Terkini</span>
                        <span
                          className={`tabular-nums-mono text-lg font-bold ${
                            isSpasticityAlert ? 'text-red-600' : 'text-[#0F2942]'
                          }`}
                        >
                          {Math.round(latestSample?.emg ?? 0)} mV
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-400 block">Fleksi Terkini</span>
                        <span className="tabular-nums-mono text-lg font-bold text-[#0F2942]">
                          {(latestSample?.flex ?? 0).toFixed(1)}°
                        </span>
                      </div>
                    </div>
                  </section>
                </div>

                <div className="lg:col-span-8">
                  <EvaluationPanel
                    patientName={activePatient.name}
                    currentTargetRom={activePatient.targetRom}
                    feedbackTopic={mqttSettings.feedbackTopic}
                    isMqttConnected={isConnected}
                    prescriptions={visiblePrescriptions}
                    suggestedTargetRom={suggestedTargetRom}
                    onUpdateTargetRom={handleUpdateTargetRom}
                    onPublishPrescription={handlePublishPrescription}
                  />
                </div>
              </motion.div>
            ) : activeTab === 'ai' ? (
              <motion.div
                key="tab-ai"
                initial={{ opacity: 0, x: tabDirection * 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: tabDirection * -16 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="max-w-3xl mx-auto"
              >
                <AiClinicalAssistant
                  patient={activePatient}
                  samples={samples}
                  spasticityCount={
                    samples.filter((s) => s.status === 'Spasticity Alert').length
                  }
                  selectedScreening={selectedScreeningForAi}
                  archivedAnalyses={visibleAnalyses}
                  onSaveAnalysis={saveAiAnalysis}
                  onClearSelectedScreening={() => setSelectedScreeningForAi(null)}
                  onApplySuggestedTarget={handleApplySuggestedTarget}
                />
              </motion.div>
            ) : activeTab === 'connection' ? (
              <motion.div
                key="tab-connection"
                initial={{ opacity: 0, x: tabDirection * 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: tabDirection * -16 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="max-w-3xl mx-auto"
              >
                <MqttSettingsPanel
                  settings={mqttSettings}
                  patientId={activePatient.id}
                  connectionState={connectionState}
                  connectionMessage={connectionMessage}
                  audioAlarmEnabled={audioAlarmEnabled}
                  lastRawPayload={lastRawPayload}
                  brokerLogs={brokerLogs}
                  onChangeSettings={setMqttSettings}
                  onConnect={() => connectMqtt(mqttSettings)}
                  onDisconnect={disconnectMqtt}
                  onToggleAudioAlarm={() => setAudioAlarmEnabled((prev) => !prev)}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </main>

        {/* Doctor Screening Result Pop-up Modal */}
        <ScreeningResultModal
          session={modalScreeningSession}
          patientName={activePatient.name}
          targetRom={activePatient.targetRom}
          onClose={handleCloseResultModal}
          onAnalyzeWithAi={handleAnalyzeScreening}
          onCreatePrescription={handlePrescribeFromScreening}
        />

        {/* Minimalist Mobile Bottom Navigation (hidden during dedicated screening mode) */}
        {!isScreeningFocusMode && (
          <nav
            aria-label="Menu Navigasi Bawah"
            className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/92 backdrop-blur-md border-t border-slate-200/80 pb-safe"
          >
            <div className="grid grid-cols-4 h-14 max-w-lg mx-auto">
              {NAV_TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => handleSelectTab(tab.id)}
                    className={`relative min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
                      isActive ? 'text-[#0066CC]' : 'text-slate-400 hover:text-[#0F2942]'
                    }`}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="mobile-tab-indicator"
                        transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                        className="absolute top-0 w-7 h-0.5 rounded-full bg-[#0066CC]"
                      />
                    )}
                    <Icon className="w-5 h-5" aria-hidden="true" />
                    <span className="text-[10px] font-semibold tracking-tight whitespace-nowrap">
                      {tab.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>
        )}
      </div>
    </MotionConfig>
  );
}
