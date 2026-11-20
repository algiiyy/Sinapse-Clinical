import { useCallback, useEffect, useRef, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  OperationType,
  auth,
  db,
  handleFirestoreError,
  signInClinicianAnonymously,
  signInClinicianWithGoogle,
  signOutClinician,
} from '../firebase';
import {
  ClinicalAnalysisResult,
  PatientProfile,
  PrescriptionRecord,
  ScreeningSession,
} from '../types/clinical';

function clampString(value: string | undefined, maxLen: number): string {
  return (value ?? '').trim().slice(0, maxLen);
}

function sanitizeId(value: string, maxLen = 120): string {
  const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, maxLen);
  return cleaned || `id_${Date.now()}`;
}

export interface SavedAiAnalysis extends ClinicalAnalysisResult {
  id: string;
  patientId: string;
}

interface LocalCloudCache {
  patients: Record<string, Partial<PatientProfile>>;
  screenings: ScreeningSession[];
  prescriptions: PrescriptionRecord[];
  analyses: SavedAiAnalysis[];
}

const LOCAL_CACHE_KEY = 'synapse_clinical_cloud_cache_v1';

function readLocalCache(): LocalCloudCache {
  try {
    const raw = window.localStorage.getItem(LOCAL_CACHE_KEY);
    if (!raw) return { patients: {}, screenings: [], prescriptions: [], analyses: [] };
    const parsed = JSON.parse(raw) as Partial<LocalCloudCache>;
    return {
      patients: parsed.patients ?? {},
      screenings: Array.isArray(parsed.screenings) ? parsed.screenings : [],
      prescriptions: Array.isArray(parsed.prescriptions) ? parsed.prescriptions : [],
      analyses: Array.isArray(parsed.analyses) ? parsed.analyses : [],
    };
  } catch {
    return { patients: {}, screenings: [], prescriptions: [], analyses: [] };
  }
}

function writeLocalCache(cache: LocalCloudCache) {
  try {
    window.localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage quota restrictions
  }
}

export function useClinicalCloud(
  activePatientId: string,
  audioAlarmEnabled: boolean
) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [anonymousNeedsConsoleEnable, setAnonymousNeedsConsoleEnable] = useState(false);

  const initialCache = readLocalCache();
  const [cloudPatients, setCloudPatients] = useState<Record<string, Partial<PatientProfile>>>(
    initialCache.patients
  );
  const [cloudScreenings, setCloudScreenings] = useState<ScreeningSession[]>(
    initialCache.screenings
  );
  const [cloudPrescriptions, setCloudPrescriptions] = useState<PrescriptionRecord[]>(
    initialCache.prescriptions
  );
  const [cloudAnalyses, setCloudAnalyses] = useState<SavedAiAnalysis[]>(
    initialCache.analyses
  );
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const autoSignInAttemptedRef = useRef(false);
  const isCloudAuthorized = Boolean(user && (user.isAnonymous || user.emailVerified));

  // Automatically authenticate anonymously on startup so Cloud works with zero login screen
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      if (nextUser) {
        setUser(nextUser);
        setAuthReady(true);
        setAnonymousNeedsConsoleEnable(false);
        return;
      }

      if (!autoSignInAttemptedRef.current) {
        autoSignInAttemptedRef.current = true;
        try {
          const cred = await signInClinicianAnonymously();
          setUser(cred.user);
          setAnonymousNeedsConsoleEnable(false);
        } catch (err) {
          const code =
            typeof err === 'object' && err !== null && 'code' in err
              ? String((err as { code?: unknown }).code)
              : '';
          if (
            code === 'auth/operation-not-allowed' ||
            code === 'auth/admin-restricted-operation'
          ) {
            setAnonymousNeedsConsoleEnable(true);
          }
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setAuthReady(true);
    });

    return () => unsub();
  }, []);

  // Ensure clinician profile doc exists when anonymous or verified user is ready
  useEffect(() => {
    if (!authReady || !user || (!user.isAnonymous && !user.emailVerified)) return;

    const clinicianRef = doc(db, 'clinicians', user.uid);
    const syncClinician = async () => {
      try {
        const snap = await getDoc(clinicianRef);
        const includeVerifiedEmail = Boolean(user.emailVerified && user.email);
        if (!snap.exists()) {
          await setDoc(clinicianRef, {
            uid: user.uid,
            displayName: clampString(
              user.displayName || 'Dokter Rehabilitasi',
              120
            ),
            ...(includeVerifiedEmail && user.email
              ? { email: clampString(user.email, 160) }
              : {}),
            activePatientId: sanitizeId(activePatientId, 64),
            audioAlarmEnabled,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await updateDoc(clinicianRef, {
            ...(includeVerifiedEmail && user.email
              ? { email: clampString(user.email, 160) }
              : {}),
            activePatientId: sanitizeId(activePatientId, 64),
            audioAlarmEnabled,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `clinicians/${user.uid}`);
      }
    };

    void syncClinician();
  }, [activePatientId, audioAlarmEnabled, authReady, user]);

  // Real-time Firestore listeners when Firebase Auth session is active (anonymous or Google)
  useEffect(() => {
    if (!authReady || !user || (!user.isAnonymous && !user.emailVerified)) {
      return;
    }

    const markSynced = () => {
      setLastSyncedAt(
        new Date().toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      );
    };

    const qPatients = query(
      collection(db, 'patientConfigs'),
      where('ownerUid', '==', user.uid)
    );
    const unsubPatients = onSnapshot(
      qPatients,
      (snapshot) => {
        const map: Record<string, Partial<PatientProfile>> = {};
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (typeof data.patientId === 'string') {
            map[data.patientId] = {
              targetRom: Number(data.targetRom),
              ashworthScore: String(data.ashworthScore),
              ashworthNumeric: Number(data.ashworthNumeric),
            };
          }
        });
        setCloudPatients(map);
        const current = readLocalCache();
        writeLocalCache({ ...current, patients: map });
        markSynced();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'patientConfigs')
    );

    const qScreenings = query(
      collection(db, 'screeningReports'),
      where('ownerUid', '==', user.uid)
    );
    const unsubScreenings = onSnapshot(
      qScreenings,
      (snapshot) => {
        const items: Array<ScreeningSession & { _createdMs: number }> = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          const createdMs =
            typeof d.createdAt?.toMillis === 'function' ? d.createdAt.toMillis() : Date.now();
          items.push({
            id: docSnap.id,
            sessionId: String(d.sessionId ?? docSnap.id),
            patientId: String(d.patientId ?? 'patient01'),
            status: 'completed',
            statusBadge: typeof d.statusBadge === 'string' ? d.statusBadge : undefined,
            startedAt: createdMs - Number(d.durationSec ?? 0) * 1000,
            startedAtLabel: String(d.startedAtLabel ?? '-'),
            endedAt: createdMs,
            endedAtLabel: String(d.endedAtLabel ?? '-'),
            durationSec: Number(d.durationSec ?? 0),
            durationLabel: typeof d.durationLabel === 'string' ? d.durationLabel : undefined,
            sampleCount: Number(d.sampleCount ?? 0),
            avgEmgMv: Number(d.avgEmgMv ?? 0),
            peakEmgMv: Number(d.peakEmgMv ?? 0),
            peakRawSemg: typeof d.peakRawSemg === 'number' ? d.peakRawSemg : undefined,
            avgFlex: Number(d.avgFlex ?? 0),
            maxFlex: Number(d.maxFlex ?? 0),
            spasticityCount: Number(d.spasticityCount ?? 0),
            patientNote: typeof d.patientNote === 'string' ? d.patientNote : undefined,
            _createdMs: createdMs,
          });
        });
        items.sort((a, b) => b._createdMs - a._createdMs);
        setCloudScreenings(items);
        const current = readLocalCache();
        writeLocalCache({ ...current, screenings: items });
        markSynced();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'screeningReports')
    );

    const qPrescriptions = query(
      collection(db, 'prescriptions'),
      where('ownerUid', '==', user.uid)
    );
    const unsubPrescriptions = onSnapshot(
      qPrescriptions,
      (snapshot) => {
        const items: Array<PrescriptionRecord & { _createdMs: number }> = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          const createdMs =
            typeof d.createdAt?.toMillis === 'function' ? d.createdAt.toMillis() : Date.now();
          items.push({
            id: docSnap.id,
            patientId: String(d.patientId ?? 'patient01'),
            targetFlex: Number(d.targetFlex ?? 75),
            intensity: d.intensity as PrescriptionRecord['intensity'],
            clinicalNote: String(d.clinicalNote ?? ''),
            physician: String(d.physician ?? ''),
            topic: String(d.topic ?? ''),
            sentAt: String(d.sentAt ?? ''),
            transport: 'mqtt',
            _createdMs: createdMs,
          });
        });
        items.sort((a, b) => b._createdMs - a._createdMs);
        setCloudPrescriptions(items);
        const current = readLocalCache();
        writeLocalCache({ ...current, prescriptions: items });
        markSynced();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'prescriptions')
    );

    const qAnalyses = query(
      collection(db, 'aiAnalyses'),
      where('ownerUid', '==', user.uid)
    );
    const unsubAnalyses = onSnapshot(
      qAnalyses,
      (snapshot) => {
        const items: Array<SavedAiAnalysis & { _createdMs: number }> = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          const createdMs =
            typeof d.createdAt?.toMillis === 'function' ? d.createdAt.toMillis() : Date.now();
          items.push({
            id: docSnap.id,
            patientId: String(d.patientId ?? 'patient01'),
            clinicalHeadline: String(d.clinicalHeadline ?? ''),
            riskLevel: String(d.riskLevel ?? 'Stabil'),
            emgTrendAnalysis: String(d.emgTrendAnalysis ?? ''),
            romEvaluation: String(d.romEvaluation ?? ''),
            recommendedTargetRom: Number(d.recommendedTargetRom ?? 75),
            actionableRecommendations: Array.isArray(d.actionableRecommendations)
              ? d.actionableRecommendations.map(String)
              : [],
            generatedAt: new Date(createdMs).toISOString(),
            _createdMs: createdMs,
          });
        });
        items.sort((a, b) => b._createdMs - a._createdMs);
        setCloudAnalyses(items);
        const current = readLocalCache();
        writeLocalCache({ ...current, analyses: items });
        markSynced();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'aiAnalyses')
    );

    return () => {
      unsubPatients();
      unsubScreenings();
      unsubPrescriptions();
      unsubAnalyses();
    };
  }, [authReady, user]);

  const signIn = useCallback(async () => {
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      await signInClinicianWithGoogle();
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Gagal menghubungkan akun Google Cloud.'
      );
    } finally {
      setIsAuthenticating(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setAuthError(null);
    await signOutClinician();
  }, []);

  const savePatientTargetRom = useCallback(
    async (patient: PatientProfile, nextTargetRom: number) => {
      const boundedRom = Math.max(15, Math.min(180, Math.round(nextTargetRom)));

      // Always update local cache immediately
      setCloudPatients((prev) => {
        const next = {
          ...prev,
          [patient.id]: {
            targetRom: boundedRom,
            ashworthScore: patient.ashworthScore,
            ashworthNumeric: patient.ashworthNumeric,
          },
        };
        const cache = readLocalCache();
        writeLocalCache({ ...cache, patients: next });
        return next;
      });

      if (!user || (!user.isAnonymous && !user.emailVerified)) return;
      const docId = sanitizeId(`${user.uid}_${patient.id}`);
      const ref = doc(db, 'patientConfigs', docId);

      try {
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          await setDoc(ref, {
            ownerUid: user.uid,
            patientId: sanitizeId(patient.id, 64),
            mrn: clampString(patient.mrn, 64),
            name: clampString(patient.name, 120),
            age: Math.max(1, Math.min(120, Math.round(patient.age))),
            gender: patient.gender,
            affectedSide: clampString(patient.affectedSide, 120),
            strokeHistory: clampString(patient.strokeHistory, 240),
            onsetDuration: clampString(patient.onsetDuration, 100),
            targetRom: boundedRom,
            ashworthScore: clampString(patient.ashworthScore, 160),
            ashworthNumeric: Math.max(0, Math.min(4, patient.ashworthNumeric)),
            attendingPhysician: clampString(patient.attendingPhysician, 120),
            deviceId: clampString(patient.deviceId, 64),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await updateDoc(ref, {
            targetRom: boundedRom,
            ashworthScore: clampString(patient.ashworthScore, 160),
            ashworthNumeric: Math.max(0, Math.min(4, patient.ashworthNumeric)),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `patientConfigs/${docId}`);
      }
    },
    [user]
  );

  const saveScreeningReport = useCallback(
    async (session: ScreeningSession) => {
      setCloudScreenings((prev) => {
        if (prev.some((item) => item.id === session.id || item.sessionId === session.sessionId)) {
          return prev;
        }
        const next = [session, ...prev].slice(0, 30);
        const cache = readLocalCache();
        writeLocalCache({ ...cache, screenings: next });
        return next;
      });

      if (!user || (!user.isAnonymous && !user.emailVerified)) return;
      const docId = sanitizeId(`${user.uid}_${session.id}`);
      const ref = doc(db, 'screeningReports', docId);

      try {
        await setDoc(ref, {
          ownerUid: user.uid,
          patientId: sanitizeId(session.patientId, 64),
          sessionId: clampString(session.sessionId, 80) || docId,
          ...(session.statusBadge
            ? { statusBadge: clampString(session.statusBadge, 80) }
            : {}),
          startedAtLabel: clampString(session.startedAtLabel, 32) || '-',
          endedAtLabel: clampString(session.endedAtLabel ?? session.startedAtLabel, 32) || '-',
          durationSec: Math.max(0, Math.min(86400, Math.round(session.durationSec))),
          ...(session.durationLabel
            ? { durationLabel: clampString(session.durationLabel, 80) }
            : {}),
          sampleCount: Math.max(0, Math.min(1000000, Math.round(session.sampleCount))),
          avgEmgMv: Math.max(0, Math.min(3300, Math.round(session.avgEmgMv))),
          peakEmgMv: Math.max(0, Math.min(3300, Math.round(session.peakEmgMv))),
          ...(typeof session.peakRawSemg === 'number'
            ? { peakRawSemg: Math.max(0, Math.min(4095, Math.round(session.peakRawSemg))) }
            : {}),
          avgFlex: Math.max(0, Math.min(180, Math.round(session.avgFlex * 10) / 10)),
          maxFlex: Math.max(0, Math.min(180, Math.round(session.maxFlex * 10) / 10)),
          spasticityCount: Math.max(0, Math.min(100000, Math.round(session.spasticityCount))),
          ...(session.patientNote
            ? { patientNote: clampString(session.patientNote, 500) }
            : {}),
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `screeningReports/${docId}`);
      }
    },
    [user]
  );

  const savePrescription = useCallback(
    async (record: PrescriptionRecord) => {
      setCloudPrescriptions((prev) => {
        const next = [record, ...prev].slice(0, 30);
        const cache = readLocalCache();
        writeLocalCache({ ...cache, prescriptions: next });
        return next;
      });

      if (!user || (!user.isAnonymous && !user.emailVerified)) return;
      const docId = sanitizeId(`${user.uid}_${record.id}`);
      const ref = doc(db, 'prescriptions', docId);

      try {
        await setDoc(ref, {
          ownerUid: user.uid,
          patientId: sanitizeId(record.patientId, 64),
          targetFlex: Math.max(15, Math.min(180, Math.round(record.targetFlex))),
          intensity: record.intensity,
          clinicalNote: clampString(record.clinicalNote, 800) || '-',
          physician: clampString(record.physician, 120) || 'Dokter',
          topic: clampString(record.topic, 160) || 'neurohand/feedback/patient01',
          sentAt: clampString(record.sentAt, 32) || '-',
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `prescriptions/${docId}`);
      }
    },
    [user]
  );

  const saveAiAnalysis = useCallback(
    async (patientId: string, result: ClinicalAnalysisResult) => {
      const localItem: SavedAiAnalysis = {
        ...result,
        id: `local_ai_${Date.now()}`,
        patientId,
      };
      setCloudAnalyses((prev) => {
        const next = [localItem, ...prev].slice(0, 20);
        const cache = readLocalCache();
        writeLocalCache({ ...cache, analyses: next });
        return next;
      });

      if (!user || (!user.isAnonymous && !user.emailVerified)) return;
      const docId = sanitizeId(`${user.uid}_ai_${Date.now()}`);
      const ref = doc(db, 'aiAnalyses', docId);
      const safeRecs = (result.actionableRecommendations ?? [])
        .map((r) => clampString(r, 300))
        .filter(Boolean)
        .slice(0, 5);

      try {
        await setDoc(ref, {
          ownerUid: user.uid,
          patientId: sanitizeId(patientId, 64),
          clinicalHeadline: clampString(result.clinicalHeadline, 300) || 'Analisis Klinis',
          riskLevel: clampString(result.riskLevel, 64) || 'Stabil',
          emgTrendAnalysis: clampString(result.emgTrendAnalysis, 1000) || '-',
          romEvaluation: clampString(result.romEvaluation, 1000) || '-',
          recommendedTargetRom: Math.max(
            15,
            Math.min(180, Math.round(result.recommendedTargetRom || 75))
          ),
          actionableRecommendations:
            safeRecs.length > 0 ? safeRecs : ['Lanjutkan pemantauan berkala.'],
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `aiAnalyses/${docId}`);
      }
    },
    [user]
  );

  const removeScreeningReport = useCallback(
    async (docId: string) => {
      setCloudScreenings((prev) => {
        const next = prev.filter((item) => item.id !== docId);
        const cache = readLocalCache();
        writeLocalCache({ ...cache, screenings: next });
        return next;
      });

      if (!user || (!user.isAnonymous && !user.emailVerified)) return;
      if (docId.startsWith('scr-done-')) return;
      try {
        await deleteDoc(doc(db, 'screeningReports', docId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `screeningReports/${docId}`);
      }
    },
    [user]
  );

  return {
    user,
    authReady,
    isCloudSignedIn: isCloudAuthorized,
    isAutoCloudActive: true,
    isFirestoreConnected: isCloudAuthorized,
    anonymousNeedsConsoleEnable,
    isAuthenticating,
    authError,
    lastSyncedAt,
    cloudPatients,
    cloudScreenings,
    cloudPrescriptions,
    cloudAnalyses,
    signIn,
    signOut,
    savePatientTargetRom,
    saveScreeningReport,
    savePrescription,
    saveAiAnalysis,
    removeScreeningReport,
  };
}
