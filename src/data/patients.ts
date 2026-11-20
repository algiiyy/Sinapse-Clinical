import { MqttSettings, PatientProfile } from '../types/clinical';

export const INITIAL_PATIENTS: PatientProfile[] = [
  {
    id: 'patient01',
    mrn: 'RM-2026-0841',
    name: 'Akmal',
    age: 58,
    gender: 'Laki-laki',
    affectedSide: 'Tangan Kanan (Hemiparesis Dekstra)',
    strokeHistory: 'Stroke Iskemik Hemisfer Kiri · Fase Subakut Lanjut',
    onsetDuration: '14 Minggu Pasca-Onset',
    targetRom: 90,
    ashworthScore: 'MAS 2 (Tonus meningkat ringan-sedang)',
    ashworthNumeric: 2,
    attendingPhysician: 'dr. Nadia Pratiwi, Sp.KFR',
    deviceId: 'ESP32-NH-01',
  },
  {
    id: 'patient02',
    mrn: 'RM-2026-0917',
    name: 'Ibu Ratna Sari Dewi',
    age: 64,
    gender: 'Perempuan',
    affectedSide: 'Tangan Kiri (Hemiparesis Sinistra)',
    strokeHistory: 'Stroke Hemoragik Kapsula Interna · Pemulihan Motorik',
    onsetDuration: '20 Minggu Pasca-Onset',
    targetRom: 80,
    ashworthScore: 'MAS 1+ (Tahanan minimal pada akhir ROM)',
    ashworthNumeric: 1.5,
    attendingPhysician: 'dr. Nadia Pratiwi, Sp.KFR',
    deviceId: 'ESP32-NH-02',
  },
  {
    id: 'patient03',
    mrn: 'RM-2026-1024',
    name: 'Bpk. Ahmad Fauzi',
    age: 51,
    gender: 'Laki-laki',
    affectedSide: 'Tangan Kanan (Hemiparesis Dekstra)',
    strokeHistory: 'Stroke Iskemik Arteri Serebri Media · Rehabilitasi Intensif',
    onsetDuration: '8 Minggu Pasca-Onset',
    targetRom: 70,
    ashworthScore: 'MAS 3 (Peningkatan tonus nyata, fleksi pasif sulit)',
    ashworthNumeric: 3,
    attendingPhysician: 'dr. Bagus Santoso, Sp.N',
    deviceId: 'ESP32-NH-03',
  },
];

export const DEFAULT_MQTT_SETTINGS: MqttSettings = {
  brokerHost: 'broker.hivemq.com',
  port: 8884,
  useTls: true,
  path: '/mqtt',
  username: '',
  password: '',
  telemetryTopic: 'neurohand/telemetry/patient01',
  screeningTopic: 'neurohand/screening/patient01',
  feedbackTopic: 'neurohand/feedback/patient01',
};

// Synchronized with SiPasien ESP32 12-bit ADC (0..4095 -> 0..3300 mV)
// Spasticity threshold: rawSemg >= 2800 ADC => (2800 / 4095) * 3300 ≈ 2256 mV
export const EMG_RAW_ADC_THRESHOLD = 2800;
export const EMG_SPASTICITY_THRESHOLD_MV = 2256;
export const MAX_FLEX_ANGLE_DEG = 180;
