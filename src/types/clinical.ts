export type TabId = 'monitor' | 'evaluation' | 'ai' | 'connection';

export type TelemetryStatus = 'Normal' | 'Spasticity Alert';

export type MqttConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export type ExerciseIntensity =
  | 'Pasif Terbantu'
  | 'Aktif Asistif'
  | 'Aktif Mandiri'
  | 'Relaksasi Tonus';

export interface PatientProfile {
  id: string;
  mrn: string;
  name: string;
  age: number;
  gender: 'Laki-laki' | 'Perempuan';
  affectedSide: string;
  strokeHistory: string;
  onsetDuration: string;
  targetRom: number;
  ashworthScore: string;
  ashworthNumeric: number;
  attendingPhysician: string;
  deviceId: string;
}

export interface TelemetrySample {
  id: string;
  timestamp: number;
  timeLabel: string;
  emg: number;
  rawSemg?: number;
  flex: number;
  status: TelemetryStatus;
  patientId?: string;
  source: 'mqtt';
}

export interface MqttSettings {
  brokerHost: string;
  port: number;
  useTls: boolean;
  path: string;
  username: string;
  password: string;
  telemetryTopic: string;
  screeningTopic: string;
  feedbackTopic: string;
}

export interface PrescriptionRecord {
  id: string;
  patientId: string;
  targetFlex: number;
  intensity: ExerciseIntensity;
  clinicalNote: string;
  physician: string;
  topic: string;
  sentAt: string;
  transport: 'mqtt';
}

export interface SpasticityEvent {
  id: string;
  timeLabel: string;
  emg: number;
  flex: number;
  source: 'mqtt';
}

export interface ScreeningSession {
  id: string;
  sessionId: string;
  patientId: string;
  dayNumber?: number;
  status: 'active' | 'completed';
  statusBadge?: string;
  startedAt: number;
  startedAtLabel: string;
  endedAt?: number;
  endedAtLabel?: string;
  durationSec: number;
  targetDurationSec?: number;
  durationLabel?: string;
  sampleCount: number;
  avgEmgMv: number;
  avgRawSemg?: number;
  peakEmgMv: number;
  peakRawSemg?: number;
  avgFlex: number;
  maxFlex: number;
  spasticityCount: number;
  patientNote?: string;
}

export interface ClinicalAnalysisResult {
  clinicalHeadline: string;
  riskLevel: string;
  emgTrendAnalysis: string;
  romEvaluation: string;
  recommendedTargetRom: number;
  actionableRecommendations: string[];
  generatedAt: string;
}
