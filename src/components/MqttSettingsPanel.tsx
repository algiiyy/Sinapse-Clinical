import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Check,
  ChevronDown,
  Copy,
  PlugZap,
  Power,
  RotateCcw,
  ShieldCheck,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { DEFAULT_MQTT_SETTINGS } from '../data/patients';
import { MqttConnectionState, MqttSettings } from '../types/clinical';

interface MqttSettingsPanelProps {
  settings: MqttSettings;
  patientId: string;
  connectionState: MqttConnectionState;
  connectionMessage: string;
  audioAlarmEnabled: boolean;
  lastRawPayload: string;
  brokerLogs: Array<{ id: string; time: string; message: string }>;
  onChangeSettings: (next: MqttSettings) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onToggleAudioAlarm: () => void;
}

export const MqttSettingsPanel: React.FC<MqttSettingsPanelProps> = ({
  settings,
  patientId,
  connectionState,
  connectionMessage,
  audioAlarmEnabled,
  lastRawPayload,
  brokerLogs,
  onChangeSettings,
  onConnect,
  onDisconnect,
  onToggleAudioAlarm,
}) => {
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [showSnippet, setShowSnippet] = useState(false);
  const isConnected = connectionState === 'connected';
  const isConnecting = connectionState === 'connecting';

  const updateField = <K extends keyof MqttSettings>(key: K, value: MqttSettings[K]) => {
    onChangeSettings({ ...settings, [key]: value });
  };

  const applySiPasienPreset = () => {
    onChangeSettings({
      ...DEFAULT_MQTT_SETTINGS,
      telemetryTopic: `neurohand/telemetry/${patientId}`,
      screeningTopic: `neurohand/screening/${patientId}`,
      feedbackTopic: `neurohand/feedback/${patientId}`,
    });
  };

  const siPasienSnippet = `// 1) Subscribe feedback resep di onSuccess connectMqtt() SiPasien:
mqttClient.subscribe("${settings.feedbackTopic}", { qos: 0 });

// 2) Tangani pesan resep dokter di mqttClient.onMessageArrived SiPasien:
mqttClient.onMessageArrived = function (msg) {
  try {
    const data = JSON.parse(msg.payloadString);
    if (msg.destinationName === "${settings.feedbackTopic}" || data.clinical_note) {
      createAbnormalNotification({
        type: 'spasticity',
        severity: 'perhatian',
        title: 'Resep Dokter (' + (data.physician || 'Dokter') + ')',
        message: data.clinical_note || 'Target latihan baru diperbarui oleh dokter.',
        semg: 0,
        flexAngle: Number(data.target_flex || data.target_rom || 75),
        recommendation: 'Target ROM: ' + (data.target_flex || 75) + '° · Mode: ' + (data.intensity || 'Aktif Asistif')
      });
      return;
    }
    processIncomingTelemetry(data);
  } catch (err) { console.error(err); }
};

// 3) Kirim event skrining ke dokter dari startScreeningSession() & completeScreeningSession():
function publishScreeningToDoctor(eventName, extraData = {}) {
  if (!mqttClient || !mqttClient.isConnected()) return;
  const payload = JSON.stringify({
    patient_id: "${patientId}",
    event: eventName,
    ...extraData
  });
  const msg = new Paho.MQTT.Message(payload);
  msg.destinationName = "${settings.screeningTopic}";
  mqttClient.send(msg);
}`;

  const handleCopySnippet = async () => {
    try {
      await navigator.clipboard.writeText(siPasienSnippet);
      setCopiedSnippet(true);
      window.setTimeout(() => setCopiedSnippet(false), 2000);
    } catch {
      // Ignore clipboard failures in restricted environments
    }
  };

  return (
    <div className="space-y-4">
      {/* Live Status & Broker Configuration */}
      <section className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_1px_3px_rgba(15,41,66,0.04)] p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <h2 className="font-display text-base sm:text-lg font-bold text-[#0F2942]">
              Koneksi MQTT Live SiPasien (HiveMQ)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{connectionMessage}</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onToggleAudioAlarm}
              className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all inline-flex items-center gap-1.5 ${
                audioAlarmEnabled
                  ? 'bg-[#0F2942] border-[#0F2942] text-white'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {audioAlarmEnabled ? (
                <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <VolumeX className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>Alarm {audioAlarmEnabled ? 'On' : 'Off'}</span>
            </button>

            <div className="inline-flex items-center gap-1.5 text-xs font-semibold">
              {isConnected ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true" />
                  <Wifi className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                  <span className="text-emerald-700">Connected</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-slate-400" aria-hidden="true" />
                  <WifiOff className="w-4 h-4 text-slate-500" aria-hidden="true" />
                  <span className="text-slate-600">
                    {isConnecting ? 'Connecting...' : 'Disconnected'}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (isConnected) {
              onDisconnect();
            } else {
              onConnect();
            }
          }}
          className="mt-5 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-[#0F2942]">
              Pengaturan Broker &amp; Topic SiPasien
            </h3>
            <button
              type="button"
              onClick={applySiPasienPreset}
              className="text-xs text-[#0066CC] hover:text-[#0F2942] inline-flex items-center gap-1 py-1 shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Preset SiPasien</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="mqtt-host" className="block text-xs font-medium text-slate-600 mb-1">
                Host Broker MQTT
              </label>
              <input
                id="mqtt-host"
                type="text"
                value={settings.brokerHost}
                onChange={(e) => updateField('brokerHost', e.target.value)}
                placeholder="broker.hivemq.com"
                className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/60 focus:bg-white focus:border-[#0066CC] outline-none px-3 text-sm tabular-nums-mono text-[#0F2942]"
              />
            </div>

            <div>
              <label htmlFor="mqtt-port" className="block text-xs font-medium text-slate-600 mb-1">
                Port WebSocket
              </label>
              <input
                id="mqtt-port"
                type="number"
                value={settings.port}
                onChange={(e) => updateField('port', Number(e.target.value))}
                placeholder="8884"
                className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/60 focus:bg-white focus:border-[#0066CC] outline-none px-3 text-sm tabular-nums-mono text-[#0F2942]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="mqtt-sub" className="block text-xs font-medium text-slate-600 mb-1">
                Topic Telemetri (Subscribe)
              </label>
              <input
                id="mqtt-sub"
                type="text"
                value={settings.telemetryTopic}
                onChange={(e) => updateField('telemetryTopic', e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/60 focus:bg-white focus:border-[#0066CC] outline-none px-3 text-xs tabular-nums-mono text-[#0F2942]"
              />
            </div>

            <div>
              <label htmlFor="mqtt-screen" className="block text-xs font-medium text-slate-600 mb-1">
                Topic Skrining (Subscribe)
              </label>
              <input
                id="mqtt-screen"
                type="text"
                value={settings.screeningTopic}
                onChange={(e) => updateField('screeningTopic', e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/60 focus:bg-white focus:border-[#0066CC] outline-none px-3 text-xs tabular-nums-mono text-[#0F2942]"
              />
            </div>

            <div>
              <label htmlFor="mqtt-pub" className="block text-xs font-medium text-slate-600 mb-1">
                Topic Feedback Resep (Publish)
              </label>
              <input
                id="mqtt-pub"
                type="text"
                value={settings.feedbackTopic}
                onChange={(e) => updateField('feedbackTopic', e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/60 focus:bg-white focus:border-[#0066CC] outline-none px-3 text-xs tabular-nums-mono text-[#0F2942]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="mqtt-user" className="block text-xs font-medium text-slate-600 mb-1">
                Username (Opsional)
              </label>
              <input
                id="mqtt-user"
                type="text"
                value={settings.username}
                onChange={(e) => updateField('username', e.target.value)}
                placeholder="Kosongkan untuk HiveMQ publik"
                className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/60 focus:bg-white focus:border-[#0066CC] outline-none px-3 text-sm text-[#0F2942]"
              />
            </div>

            <div>
              <label htmlFor="mqtt-pass" className="block text-xs font-medium text-slate-600 mb-1">
                Password (Opsional)
              </label>
              <input
                id="mqtt-pass"
                type="password"
                value={settings.password}
                onChange={(e) => updateField('password', e.target.value)}
                placeholder="••••••••"
                className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/60 focus:bg-white focus:border-[#0066CC] outline-none px-3 text-sm text-[#0F2942]"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <label className="inline-flex items-center gap-2.5 text-xs font-medium text-slate-700 cursor-pointer min-h-[44px]">
              <input
                type="checkbox"
                checked={settings.useTls}
                onChange={(e) => updateField('useTls', e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-[#0066CC] focus:ring-[#0066CC]"
              />
              <ShieldCheck className="w-4 h-4 text-[#0066CC]" aria-hidden="true" />
              <span>Gunakan WSS (WebSocket Secure / TLS)</span>
            </label>

            <button
              type="submit"
              disabled={isConnecting}
              className={`min-h-[48px] px-6 py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                isConnected
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-[#0F2942] hover:bg-[#163A5C] text-white'
              }`}
            >
              {isConnected ? (
                <>
                  <Power className="w-4 h-4" aria-hidden="true" />
                  <span>Putuskan Koneksi MQTT</span>
                </>
              ) : (
                <>
                  <PlugZap className="w-4 h-4" aria-hidden="true" />
                  <span>{isConnecting ? 'Menghubungkan...' : 'Terapkan & Hubungkan Ulang'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </section>

      {/* Collapsible SiPasien Screening Integration Snippet */}
      <section className="rounded-2xl bg-white border border-slate-200/80 p-4 sm:p-5">
        <button
          type="button"
          onClick={() => setShowSnippet((prev) => !prev)}
          className="w-full min-h-[40px] flex items-center justify-between gap-2 text-left"
          aria-expanded={showSnippet}
        >
          <div>
            <h3 className="font-display text-xs sm:text-sm font-semibold text-[#0F2942]">
              Kode Integrasi Skrining SiPasien (Paho MQTT)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Salin skrip untuk tombol Mulai &amp; Selesai Skrining di SiPasien
            </p>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ${
              showSnippet ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          />
        </button>

        <AnimatePresence initial={false}>
          {showSnippet && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="pt-3 mt-3 border-t border-slate-100 space-y-2.5">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleCopySnippet}
                    className="min-h-[36px] px-3 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-[#0066CC] inline-flex items-center gap-1.5 transition-colors"
                  >
                    {copiedSnippet ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                        <span className="text-emerald-700">Tersalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Salin Kode</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="rounded-xl bg-[#0B1726] text-slate-100 p-3.5 text-[11px] leading-relaxed tabular-nums-mono overflow-x-auto">
                  {siPasienSnippet}
                </pre>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Live JSON Payload & Event Log */}
      <section className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_1px_3px_rgba(15,41,66,0.04)] p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <h3 className="font-display text-xs font-semibold text-[#0F2942] mb-2">
            Payload JSON Terakhir Diterima
          </h3>
          <pre className="rounded-xl bg-slate-50 border border-slate-200/70 p-3 text-xs tabular-nums-mono text-[#0F2942] overflow-x-auto">
            {lastRawPayload}
          </pre>
        </div>

        <div>
          <h3 className="font-display text-xs font-semibold text-[#0F2942] mb-2">
            Log Aktivitas MQTT Live
          </h3>
          <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-3 max-h-40 overflow-y-auto space-y-1.5">
            {brokerLogs.length === 0 ? (
              <p className="text-xs text-slate-400">Belum ada aktivitas.</p>
            ) : (
              brokerLogs.map((log) => (
                <div key={log.id} className="text-[11px] leading-snug text-slate-600">
                  <span className="tabular-nums-mono text-slate-400 mr-2">{log.time}</span>
                  <span>{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
