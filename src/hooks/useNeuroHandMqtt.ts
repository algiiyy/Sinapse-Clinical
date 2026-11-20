import { useCallback, useEffect, useRef, useState } from 'react';
import mqtt, { MqttClient } from 'mqtt';
import {
  EMG_RAW_ADC_THRESHOLD,
  EMG_SPASTICITY_THRESHOLD_MV,
  MAX_FLEX_ANGLE_DEG,
} from '../data/patients';
import {
  MqttConnectionState,
  MqttSettings,
  PrescriptionRecord,
  ScreeningSession,
  SpasticityEvent,
  TelemetrySample,
  TelemetryStatus,
} from '../types/clinical';

interface UseNeuroHandMqttOptions {
  settings: MqttSettings;
  patientId: string;
  physicianName: string;
  audioAlarmEnabled: boolean;
}

const MAX_SAMPLES = 45;

function formatTimeLabel(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('id-ID', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function playClinicalAlarmBeep() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    [880, 1174.66].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.14);
      gain.gain.setValueAtTime(0.001, now + idx * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.12, now + idx * 0.14 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.14 + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.14);
      osc.stop(now + idx * 0.14 + 0.15);
    });

    window.setTimeout(() => {
      void ctx.close();
    }, 450);
  } catch {
    // Ignore autoplay restrictions before user gesture
  }
}

// Synchronized with SiPasien: raw ADC 0..4095 -> 0..3300 mV
function normalizeEmgToMv(rawValue: number): { emgMv: number; rawAdc?: number } {
  if (Number.isNaN(rawValue)) return { emgMv: 0 };
  if (rawValue > 10) {
    const adc = Math.max(0, Math.min(4095, Math.round(rawValue)));
    return {
      emgMv: Math.round((adc / 4095) * 3300),
      rawAdc: adc,
    };
  }
  const mv = Math.max(0, Math.min(3300, Math.round(rawValue * 1000)));
  return {
    emgMv: mv,
    rawAdc: Math.round((mv / 3300) * 4095),
  };
}

export function useNeuroHandMqtt({
  settings,
  patientId,
  physicianName,
  audioAlarmEnabled,
}: UseNeuroHandMqttOptions) {
  const [connectionState, setConnectionState] = useState<MqttConnectionState>('connecting');
  const [connectionMessage, setConnectionMessage] = useState<string>(
    `Menghubungkan ke ${settings.brokerHost}:${settings.port}...`
  );
  const [samples, setSamples] = useState<TelemetrySample[]>([]);
  const [spasticityEvents, setSpasticityEvents] = useState<SpasticityEvent[]>([]);
  const [prescriptions, setPrescriptions] = useState<PrescriptionRecord[]>([]);
  const [activeScreening, setActiveScreening] = useState<ScreeningSession | null>(null);
  const [completedScreenings, setCompletedScreenings] = useState<ScreeningSession[]>([]);
  const [justCompletedScreening, setJustCompletedScreening] = useState<ScreeningSession | null>(null);
  const [lastRawPayload, setLastRawPayload] = useState<string>(
    '// Menunggu payload JSON live dari SiPasien via MQTT...'
  );
  const [brokerLogs, setBrokerLogs] = useState<Array<{ id: string; time: string; message: string }>>([]);

  const clientRef = useRef<MqttClient | null>(null);
  const subscribedTopicsRef = useRef<{ telemetry: string; screening: string } | null>(null);
  const patientIdRef = useRef<string>(patientId);
  const audioAlarmRef = useRef<boolean>(audioAlarmEnabled);
  const lastAlarmAtRef = useRef<number>(0);
  const activeScreeningRef = useRef<ScreeningSession | null>(null);

  const screeningAccRef = useRef<{
    emgSum: number;
    rawAdcSum: number;
    flexSum: number;
    count: number;
    peakEmg: number;
    peakRawSemg: number;
    maxFlex: number;
    spasticityCount: number;
  }>({
    emgSum: 0,
    rawAdcSum: 0,
    flexSum: 0,
    count: 0,
    peakEmg: 0,
    peakRawSemg: 0,
    maxFlex: 0,
    spasticityCount: 0,
  });

  useEffect(() => {
    patientIdRef.current = patientId;
  }, [patientId]);

  useEffect(() => {
    audioAlarmRef.current = audioAlarmEnabled;
  }, [audioAlarmEnabled]);

  const appendLog = useCallback((message: string) => {
    const now = Date.now();
    setBrokerLogs((prev) => [
      { id: `${now}-${Math.random().toString(36).slice(2, 6)}`, time: formatTimeLabel(now), message },
      ...prev.slice(0, 19),
    ]);
  }, []);

  useEffect(() => {
    activeScreeningRef.current = activeScreening;
  }, [activeScreening]);

  useEffect(() => {
    if (!activeScreening) return;
    const timer = window.setInterval(() => {
      setActiveScreening((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          durationSec: Math.max(0, Math.floor((Date.now() - prev.startedAt) / 1000)),
        };
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeScreening?.id]);

  const handleScreeningEvent = useCallback(
    (parsed: Record<string, unknown>, rawJsonText: string) => {
      const now = Date.now();
      const eventRaw = String(
        parsed.event ?? parsed.screening_status ?? parsed.action ?? parsed.type ?? ''
      ).toLowerCase();
      const incomingPatientId = String(
        parsed.patient_id ?? parsed.patientId ?? patientIdRef.current
      );

      // Ignore events explicitly addressed to another patient
      if (
        (parsed.patient_id || parsed.patientId) &&
        incomingPatientId !== patientIdRef.current
      ) {
        return true;
      }

      const sessionId = String(
        parsed.session_id ??
          parsed.sessionId ??
          (parsed.dayNumber ? `Hari-${parsed.dayNumber}` : `SCR-${formatTimeLabel(now).replaceAll(':', '')}`)
      );

      setLastRawPayload(rawJsonText);

      const isStart =
        eventRaw.includes('start') ||
        eventRaw.includes('mulai') ||
        eventRaw === 'in_progress' ||
        eventRaw === 'measuring';
      const isCancel = eventRaw.includes('cancel') || eventRaw.includes('batal');
      const isComplete =
        eventRaw.includes('complete') ||
        eventRaw.includes('finish') ||
        eventRaw.includes('selesai') ||
        eventRaw.includes('done') ||
        eventRaw.includes('end') ||
        eventRaw.includes('stop') ||
        parsed.maxRom !== undefined ||
        parsed.statusBadge !== undefined;

      if (isCancel) {
        activeScreeningRef.current = null;
        setActiveScreening(null);
        appendLog(`Sesi skrining dibatalkan oleh ${incomingPatientId}.`);
        return true;
      }

      if (isStart) {
        screeningAccRef.current = {
          emgSum: 0,
          rawAdcSum: 0,
          flexSum: 0,
          count: 0,
          peakEmg: 0,
          peakRawSemg: 0,
          maxFlex: 0,
          spasticityCount: 0,
        };
        const targetSec =
          parsed.target_duration_sec !== undefined
            ? Math.max(60, Number(parsed.target_duration_sec))
            : parsed.durationMinutes !== undefined
              ? Math.max(60, Number(parsed.durationMinutes) * 60)
              : 900;
        const newSession: ScreeningSession = {
          id: `scr-${now}`,
          sessionId,
          patientId: incomingPatientId,
          dayNumber: parsed.dayNumber !== undefined ? Number(parsed.dayNumber) : undefined,
          status: 'active',
          startedAt: now,
          startedAtLabel: formatTimeLabel(now),
          durationSec: 0,
          targetDurationSec: targetSec,
          sampleCount: 0,
          avgEmgMv: 0,
          avgRawSemg: 0,
          peakEmgMv: 0,
          peakRawSemg: 0,
          avgFlex: 0,
          maxFlex: 0,
          spasticityCount: 0,
        };
        activeScreeningRef.current = newSession;
        setJustCompletedScreening(null);
        setActiveScreening(newSession);
        appendLog(`Skrining 15 menit dimulai oleh ${incomingPatientId} (${sessionId}).`);
        return true;
      }

      if (isComplete) {
        const acc = screeningAccRef.current;

        // Support both SiPasien dailyRecords keys (avgSemg, peakSemg, maxRom, avgFlex, packetCount, spasmCount, notes, statusBadge, dayNumber, durationMinutes, durationLabel)
        // and snake_case keys (avg_semg, peak_semg, max_flex, spasticity_count, patient_note, duration_sec)
        const parsedAvgEmg = parsed.avgSemg ?? parsed.avg_semg ?? parsed.avg_emg ?? parsed.emg_avg;
        const parsedPeakEmg = parsed.peakSemg ?? parsed.peak_semg ?? parsed.peak_emg ?? parsed.emg_peak;
        const parsedMaxFlex = parsed.maxRom ?? parsed.max_flex ?? parsed.max_flex_angle ?? parsed.flex_max;
        const parsedAvgFlex = parsed.avgFlex ?? parsed.avg_flex ?? parsed.flex_avg;
        const parsedDurationSec =
          parsed.duration_sec ??
          parsed.duration ??
          (parsed.durationMinutes !== undefined ? Number(parsed.durationMinutes) * 60 : undefined);
        const parsedSpasticity =
          parsed.spasmCount ?? parsed.spasticity_count ?? parsed.spasticity_alerts;
        const parsedPacketCount = parsed.packetCount ?? parsed.sample_count;
        const parsedStatusBadge =
          typeof parsed.statusBadge === 'string' ? parsed.statusBadge : undefined;
        const parsedDurationLabel =
          typeof parsed.durationLabel === 'string' ? parsed.durationLabel : undefined;
        const parsedDayNumber =
          parsed.dayNumber !== undefined ? Number(parsed.dayNumber) : undefined;
        const patientNote =
          typeof parsed.notes === 'string'
            ? parsed.notes
            : typeof parsed.patient_note === 'string'
              ? parsed.patient_note
              : typeof parsed.note === 'string'
                ? parsed.note
                : undefined;

        const avgEmgInfo =
          parsedAvgEmg !== undefined
            ? normalizeEmgToMv(Number(parsedAvgEmg))
            : {
                emgMv: acc.count > 0 ? Math.round(acc.emgSum / acc.count) : 0,
                rawAdc: acc.count > 0 ? Math.round(acc.rawAdcSum / acc.count) : 0,
              };
        const peakEmgInfo =
          parsedPeakEmg !== undefined
            ? normalizeEmgToMv(Number(parsedPeakEmg))
            : {
                emgMv: Math.round(acc.peakEmg),
                rawAdc: acc.peakRawSemg,
              };

        const prevActive = activeScreeningRef.current;
        const startedAt =
          prevActive?.startedAt ?? now - Number(parsedDurationSec || 0) * 1000;
        const startedAtLabel = prevActive?.startedAtLabel ?? formatTimeLabel(startedAt);
        const computedDuration =
          parsedDurationSec !== undefined
            ? Math.max(1, Math.round(Number(parsedDurationSec)))
            : Math.max(1, Math.round((now - startedAt) / 1000));

        const completedRecord: ScreeningSession = {
          id: `scr-done-${now}`,
          sessionId: prevActive?.sessionId ?? sessionId,
          patientId: incomingPatientId,
          dayNumber: parsedDayNumber ?? prevActive?.dayNumber,
          status: 'completed',
          statusBadge: parsedStatusBadge,
          startedAt,
          startedAtLabel,
          endedAt: now,
          endedAtLabel: formatTimeLabel(now),
          durationSec: computedDuration,
          targetDurationSec: prevActive?.targetDurationSec ?? 900,
          durationLabel: parsedDurationLabel,
          sampleCount: Number(parsedPacketCount ?? acc.count),
          avgEmgMv: avgEmgInfo.emgMv,
          avgRawSemg: avgEmgInfo.rawAdc,
          peakEmgMv: peakEmgInfo.emgMv,
          peakRawSemg: peakEmgInfo.rawAdc,
          avgFlex:
            parsedAvgFlex !== undefined
              ? Math.round(Number(parsedAvgFlex) * 10) / 10
              : acc.count > 0
                ? Math.round((acc.flexSum / acc.count) * 10) / 10
                : 0,
          maxFlex:
            parsedMaxFlex !== undefined
              ? Math.round(Number(parsedMaxFlex) * 10) / 10
              : Math.round(acc.maxFlex * 10) / 10,
          spasticityCount:
            parsedSpasticity !== undefined
              ? Number(parsedSpasticity)
              : acc.spasticityCount,
          patientNote,
        };

        activeScreeningRef.current = null;
        setActiveScreening(null);
        setCompletedScreenings((prev) => [completedRecord, ...prev.slice(0, 14)]);
        setJustCompletedScreening(completedRecord);
        appendLog(
          `Skrining selesai (${completedRecord.sessionId}) · Max ROM ${completedRecord.maxFlex}° · Peak sEMG ${completedRecord.peakRawSemg ?? completedRecord.peakEmgMv} ADC.`
        );

        return true;
      }

      return false;
    },
    [appendLog]
  );

  const finishActiveScreeningLocally = useCallback(() => {
    const current = activeScreeningRef.current;
    if (!current) return;
    const now = Date.now();
    const acc = screeningAccRef.current;
    const computedDuration = Math.max(1, Math.round((now - current.startedAt) / 1000));

    const completedRecord: ScreeningSession = {
      ...current,
      id: `scr-done-${now}`,
      status: 'completed',
      endedAt: now,
      endedAtLabel: formatTimeLabel(now),
      durationSec: computedDuration,
      sampleCount: acc.count,
      avgEmgMv: acc.count > 0 ? Math.round(acc.emgSum / acc.count) : current.avgEmgMv,
      avgRawSemg: acc.count > 0 ? Math.round(acc.rawAdcSum / acc.count) : current.avgRawSemg,
      peakEmgMv: Math.round(acc.peakEmg) || current.peakEmgMv,
      peakRawSemg: acc.peakRawSemg || current.peakRawSemg,
      avgFlex: acc.count > 0 ? Math.round((acc.flexSum / acc.count) * 10) / 10 : current.avgFlex,
      maxFlex: Math.round(acc.maxFlex * 10) / 10 || current.maxFlex,
      spasticityCount: acc.spasticityCount,
    };

    activeScreeningRef.current = null;
    setActiveScreening(null);
    setCompletedScreenings((prev) => [completedRecord, ...prev.slice(0, 14)]);
    setJustCompletedScreening(completedRecord);
    appendLog(`Sesi skrining (${completedRecord.sessionId}) diakhiri & diringkas untuk dokter.`);
  }, [appendLog]);

  const clearJustCompletedScreening = useCallback(() => {
    setJustCompletedScreening(null);
  }, []);

  const pushTelemetrySample = useCallback(
    (params: {
      emgValue: number;
      rawSemg?: number;
      flexValue: number;
      statusValue: TelemetryStatus;
      samplePatientId?: string;
      rawJsonText: string;
    }) => {
      const now = Date.now();
      const clampedEmg = Math.max(0, Math.min(3300, Math.round(params.emgValue)));
      const clampedFlex = Math.max(
        0,
        Math.min(MAX_FLEX_ANGLE_DEG, Math.round(params.flexValue * 10) / 10)
      );
      const computedStatus: TelemetryStatus =
        params.statusValue === 'Spasticity Alert' ||
        clampedEmg >= EMG_SPASTICITY_THRESHOLD_MV ||
        (typeof params.rawSemg === 'number' && params.rawSemg >= EMG_RAW_ADC_THRESHOLD)
          ? 'Spasticity Alert'
          : 'Normal';

      const newSample: TelemetrySample = {
        id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: now,
        timeLabel: formatTimeLabel(now),
        emg: clampedEmg,
        rawSemg: params.rawSemg,
        flex: clampedFlex,
        status: computedStatus,
        patientId: params.samplePatientId ?? patientIdRef.current,
        source: 'mqtt',
      };

      setSamples((prev) => [...prev.slice(-(MAX_SAMPLES - 1)), newSample]);
      setLastRawPayload(params.rawJsonText);

      setActiveScreening((prevActive) => {
        if (!prevActive) return null;
        const acc = screeningAccRef.current;
        acc.count += 1;
        acc.emgSum += clampedEmg;
        acc.rawAdcSum += params.rawSemg ?? Math.round((clampedEmg / 3300) * 4095);
        acc.flexSum += clampedFlex;
        if (clampedEmg > acc.peakEmg) acc.peakEmg = clampedEmg;
        if (typeof params.rawSemg === 'number' && params.rawSemg > acc.peakRawSemg) {
          acc.peakRawSemg = params.rawSemg;
        }
        if (clampedFlex > acc.maxFlex) acc.maxFlex = clampedFlex;
        if (computedStatus === 'Spasticity Alert') acc.spasticityCount += 1;

        return {
          ...prevActive,
          sampleCount: acc.count,
          avgEmgMv: Math.round(acc.emgSum / acc.count),
          avgRawSemg: Math.round(acc.rawAdcSum / acc.count),
          peakEmgMv: Math.round(acc.peakEmg),
          peakRawSemg: acc.peakRawSemg || undefined,
          avgFlex: Math.round((acc.flexSum / acc.count) * 10) / 10,
          maxFlex: Math.round(acc.maxFlex * 10) / 10,
          spasticityCount: acc.spasticityCount,
        };
      });

      if (computedStatus === 'Spasticity Alert') {
        setSpasticityEvents((prev) => [
          {
            id: newSample.id,
            timeLabel: newSample.timeLabel,
            emg: clampedEmg,
            flex: clampedFlex,
            source: 'mqtt',
          },
          ...prev.slice(0, 9),
        ]);

        if (audioAlarmRef.current && now - lastAlarmAtRef.current > 3000) {
          lastAlarmAtRef.current = now;
          playClinicalAlarmBeep();
        }
      }
    },
    []
  );

  const disconnectMqtt = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.removeAllListeners();
      clientRef.current.end(true);
      clientRef.current = null;
    }
    subscribedTopicsRef.current = null;
    setConnectionState('disconnected');
    setConnectionMessage('Koneksi broker MQTT diputus.');
    appendLog('Koneksi MQTT ditutup.');
  }, [appendLog]);

  const connectMqtt = useCallback(
    (overrideSettings?: MqttSettings) => {
      const cfg = overrideSettings ?? settings;
      if (clientRef.current) {
        clientRef.current.removeAllListeners();
        clientRef.current.end(true);
        clientRef.current = null;
      }

      const rawHost = cfg.brokerHost.trim();
      const hasProtocol = rawHost.startsWith('ws://') || rawHost.startsWith('wss://');
      const protocol = cfg.useTls ? 'wss' : 'ws';
      const normalizedPath = cfg.path.startsWith('/') ? cfg.path : `/${cfg.path}`;
      const brokerUrl = hasProtocol
        ? rawHost
        : `${protocol}://${rawHost}:${cfg.port}${normalizedPath}`;

      setConnectionState('connecting');
      setConnectionMessage(`Menghubungkan ke ${brokerUrl}...`);
      appendLog(`Menghubungkan ke ${brokerUrl}`);

      try {
        const client = mqtt.connect(brokerUrl, {
          clientId: `synapse_clinical_${Math.random().toString(16).slice(2, 8)}`,
          username: cfg.username.trim() || undefined,
          password: cfg.password || undefined,
          clean: true,
          connectTimeout: 8000,
          reconnectPeriod: 4000,
        });

        clientRef.current = client;

        client.on('connect', () => {
          setConnectionState('connected');
          setConnectionMessage(`Terhubung ke ${cfg.brokerHost}:${cfg.port} · SiPasien Live.`);
          appendLog(`Connected ke broker ${cfg.brokerHost}:${cfg.port}.`);

          const topicsToSubscribe = Array.from(
            new Set([cfg.telemetryTopic, cfg.screeningTopic, 'neurohand/screening'].filter(Boolean))
          );
          client.subscribe(topicsToSubscribe, { qos: 0 }, (err) => {
            if (err) {
              appendLog(`Gagal subscribe topic: ${err.message}`);
            } else {
              subscribedTopicsRef.current = {
                telemetry: cfg.telemetryTopic,
                screening: cfg.screeningTopic,
              };
              appendLog(`Subscribe aktif: ${cfg.telemetryTopic} & ${cfg.screeningTopic}`);
            }
          });
        });

        client.on('message', (topic, payloadBuffer) => {
          const text = payloadBuffer.toString();
          try {
            const parsed = JSON.parse(text) as Record<string, unknown>;
            let formattedJson = text;
            try {
              formattedJson = JSON.stringify(parsed, null, 2);
            } catch {
              formattedJson = text;
            }

            const hasScreeningEvent =
              topic === cfg.screeningTopic ||
              topic === 'neurohand/screening' ||
              Boolean(
                parsed.event ||
                  parsed.screening_status ||
                  parsed.action ||
                  parsed.maxRom !== undefined ||
                  parsed.statusBadge !== undefined
              );
            if (hasScreeningEvent && handleScreeningEvent(parsed, formattedJson)) {
              return;
            }

            const incomingPatientId =
              typeof parsed.patient_id === 'string'
                ? parsed.patient_id
                : typeof parsed.patientId === 'string'
                  ? parsed.patientId
                  : undefined;

            const rawSemgInput = Number(
              parsed.semg ?? parsed.emg ?? parsed.emg_mv ?? parsed.sEMG ?? 0
            );
            const { emgMv, rawAdc } = normalizeEmgToMv(rawSemgInput);

            const rawFlex = Number(
              parsed.flex_angle ?? parsed.flex ?? parsed.flex_deg ?? parsed.angle ?? 0
            );

            const statusCandidate = String(
              parsed.status ?? parsed.alert ?? parsed.state ?? parsed.condition ?? ''
            ).toLowerCase();
            const isSpasticText =
              statusCandidate.includes('spast') ||
              statusCandidate.includes('alert') ||
              statusCandidate.includes('detected');

            const parsedStatus: TelemetryStatus =
              isSpasticText ||
              (typeof rawAdc === 'number' && rawAdc >= EMG_RAW_ADC_THRESHOLD) ||
              emgMv >= EMG_SPASTICITY_THRESHOLD_MV
                ? 'Spasticity Alert'
                : 'Normal';

            if (!Number.isNaN(emgMv) && !Number.isNaN(rawFlex)) {
              pushTelemetrySample({
                emgValue: emgMv,
                rawSemg: rawAdc,
                flexValue: rawFlex,
                statusValue: parsedStatus,
                samplePatientId: incomingPatientId,
                rawJsonText: formattedJson,
              });
            }
          } catch {
            appendLog(`Payload non-JSON diterima pada ${topic}: ${text.slice(0, 60)}`);
          }
        });

        client.on('error', (err) => {
          setConnectionState('error');
          setConnectionMessage(`Kendala koneksi MQTT: ${err.message}`);
          appendLog(`MQTT error: ${err.message}`);
        });

        client.on('close', () => {
          setConnectionState((prev) => (prev === 'error' ? 'error' : 'disconnected'));
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'URL broker tidak valid.';
        setConnectionState('error');
        setConnectionMessage(msg);
        appendLog(`Gagal inisialisasi MQTT: ${msg}`);
      }
    },
    [appendLog, handleScreeningEvent, pushTelemetrySample, settings]
  );

  useEffect(() => {
    connectMqtt(settings);
    return () => {
      if (clientRef.current) {
        clientRef.current.removeAllListeners();
        clientRef.current.end(true);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const client = clientRef.current;
    if (!client || connectionState !== 'connected') return;
    const prev = subscribedTopicsRef.current;
    if (
      prev &&
      (prev.telemetry !== settings.telemetryTopic || prev.screening !== settings.screeningTopic)
    ) {
      client.unsubscribe([prev.telemetry, prev.screening].filter(Boolean));
      const nextTopics = [settings.telemetryTopic, settings.screeningTopic].filter(Boolean);
      client.subscribe(nextTopics, { qos: 0 }, (err) => {
        if (!err) {
          subscribedTopicsRef.current = {
            telemetry: settings.telemetryTopic,
            screening: settings.screeningTopic,
          };
          appendLog(
            `Berpindah subscribe: ${settings.telemetryTopic} & ${settings.screeningTopic}`
          );
        }
      });
    }
  }, [appendLog, connectionState, settings.screeningTopic, settings.telemetryTopic]);

  const publishPrescription = useCallback(
    async (payload: {
      targetFlex: number;
      intensity: PrescriptionRecord['intensity'];
      clinicalNote: string;
    }): Promise<{ ok: boolean; message: string }> => {
      if (connectionState !== 'connected' || !clientRef.current) {
        return {
          ok: false,
          message: 'MQTT belum terhubung. Hubungkan ke broker HiveMQ terlebih dahulu untuk mengirim resep.',
        };
      }

      const record: PrescriptionRecord = {
        id: `rx-${Date.now()}`,
        patientId: patientIdRef.current,
        targetFlex: payload.targetFlex,
        intensity: payload.intensity,
        clinicalNote: payload.clinicalNote.trim(),
        physician: physicianName,
        topic: settings.feedbackTopic,
        sentAt: formatTimeLabel(Date.now()),
        transport: 'mqtt',
      };

      const mqttBody = JSON.stringify({
        type: 'doctor_prescription',
        patient_id: record.patientId,
        target_flex: record.targetFlex,
        target_rom: record.targetFlex,
        intensity: record.intensity,
        clinical_note: record.clinicalNote,
        physician: record.physician,
        timestamp: new Date().toISOString(),
      });

      return new Promise((resolve) => {
        clientRef.current!.publish(
          settings.feedbackTopic,
          mqttBody,
          { qos: 1 },
          (err) => {
            if (err) {
              appendLog(`Gagal publish resep ke ${settings.feedbackTopic}: ${err.message}`);
              resolve({
                ok: false,
                message: `Gagal publish MQTT: ${err.message}`,
              });
            } else {
              setPrescriptions((prev) => [record, ...prev.slice(0, 9)]);
              appendLog(
                `Resep dikirim ke SiPasien (${settings.feedbackTopic}) · Target ${record.targetFlex}°.`
              );
              resolve({
                ok: true,
                message: `Resep berhasil dikirim via MQTT ke ${settings.feedbackTopic}.`,
              });
            }
          }
        );
      });
    },
    [appendLog, connectionState, physicianName, settings.feedbackTopic]
  );

  const resetForPatient = useCallback(
    (nextPatientId: string) => {
      setSamples([]);
      setSpasticityEvents([]);
      activeScreeningRef.current = null;
      setActiveScreening(null);
      setJustCompletedScreening(null);
      appendLog(`Pasien aktif diganti ke ${nextPatientId}. Menunggu stream MQTT live.`);
    },
    [appendLog]
  );

  return {
    connectionState,
    connectionMessage,
    samples,
    spasticityEvents,
    prescriptions,
    activeScreening,
    completedScreenings,
    justCompletedScreening,
    lastRawPayload,
    brokerLogs,
    connectMqtt,
    disconnectMqtt,
    publishPrescription,
    resetForPatient,
    finishActiveScreeningLocally,
    clearJustCompletedScreening,
  };
}
