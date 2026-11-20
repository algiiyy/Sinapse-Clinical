import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

interface AnalysisRequestBody {
  patient: {
    name: string;
    age: number;
    strokeHistory: string;
    targetRom: number;
    ashworthScore: string;
    affectedSide: string;
  };
  telemetrySummary: {
    sampleCount: number;
    emgAvg: number;
    emgPeak: number;
    emgLatest: number;
    flexAvg: number;
    flexPeak: number;
    flexLatest: number;
    spasticityAlerts: number;
    currentStatus: string;
    recentWindow: Array<{ emg: number; flex: number; status: string; time: string }>;
  };
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY belum dikonfigurasi pada environment server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'synapse-clinical' });
  });

  app.post('/api/clinical-analysis', async (req, res) => {
    try {
      const body = req.body as AnalysisRequestBody;
      if (!body?.patient || !body?.telemetrySummary) {
        res.status(400).json({ error: 'Payload data pasien dan telemetri tidak lengkap.' });
        return;
      }

      const ai = getGeminiClient();
      const { patient, telemetrySummary } = body;

      const prompt = `Anda adalah dokter spesialis rehabilitasi medik dan konsultan neuro-rehabilitasi untuk sistem SYNAPSE Clinical (sarung tangan pintar pasca-stroke NeuroHand-IoT).
Analisis data telemetri pasien berikut secara objektif, ringkas, dan klinis dalam Bahasa Indonesia yang profesional untuk dokter/fisioterapis.

DATA PASIEN:
- Nama: ${patient.name} (${patient.age} tahun)
- Sisi Terdampak: ${patient.affectedSide}
- Riwayat Stroke: ${patient.strokeHistory}
- Target ROM Fleksi Jari: ${patient.targetRom}°
- Skor Skala Ashworth (Spastisitas): ${patient.ashworthScore}

RINGKASAN TELEMETRI SAAT INI (${telemetrySummary.sampleCount} sampel terakhir, skala SiPasien 0–3300 mV / 0–4095 ADC, ambang spastisitas 2256 mV / 2800 ADC):
- Sinyal sEMG Saat Ini: ${Math.round(telemetrySummary.emgLatest)} mV (Rata-rata: ${Math.round(telemetrySummary.emgAvg)} mV, Puncak: ${Math.round(telemetrySummary.emgPeak)} mV)
- Sudut Fleksi Jari Saat Ini: ${telemetrySummary.flexLatest.toFixed(1)}° (Rata-rata: ${telemetrySummary.flexAvg.toFixed(1)}°, Puncak: ${telemetrySummary.flexPeak.toFixed(1)}°, Rentang 0–180°)
- Status Terkini: ${telemetrySummary.currentStatus}
- Jumlah Lonjakan Spastisitas (Spasticity Alert): ${telemetrySummary.spasticityAlerts} kejadian

SAMPEL JENDELA TERKINI (urutan kronologis):
${telemetrySummary.recentWindow
  .slice(-12)
  .map((s) => `[${s.time}] sEMG=${Math.round(s.emg)}mV, Fleksi=${s.flex.toFixed(1)}°, Status=${s.status}`)
  .join('\n')}

Berikan evaluasi klinis terstruktur yang langsung dapat ditindaklanjuti oleh dokter atau fisioterapis.`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'Berikan analisis medis rehabilitasi pasca-stroke berbasis bukti yang ringkas, presisi, tanpa basa-basi. Fokus pada pola aktivasi otot sEMG, pencapaian ROM fleksi jari terhadap target, risiko spastisitas, dan rekomendasi parameter latihan berikutnya.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              clinicalHeadline: {
                type: Type.STRING,
                description: 'Ringkasan status neuromuskular dalam 1 kalimat singkat dan tegas.',
              },
              riskLevel: {
                type: Type.STRING,
                description: 'Salah satu dari: Stabil, Perlu Pemantauan, Waspada Spastisitas',
              },
              emgTrendAnalysis: {
                type: Type.STRING,
                description: 'Analisis pola aktivasi sinyal bio-potensial sEMG (mV) dalam 2-3 kalimat.',
              },
              romEvaluation: {
                type: Type.STRING,
                description: 'Evaluasi sudut fleksi jari dibandingkan target ROM pasien dalam 2-3 kalimat.',
              },
              recommendedTargetRom: {
                type: Type.INTEGER,
                description: 'Saran target sudut fleksi (derajat, rentang 20-100) untuk sesi berikutnya.',
              },
              actionableRecommendations: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '3 rekomendasi klinis konkret untuk dokter/fisioterapis.',
              },
            },
            required: [
              'clinicalHeadline',
              'riskLevel',
              'emgTrendAnalysis',
              'romEvaluation',
              'recommendedTargetRom',
              'actionableRecommendations',
            ],
          },
        },
      });

      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText);

      res.json({
        ...parsed,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Terjadi kesalahan saat memproses analisis klinis AI.';
      const statusCode = message.includes('GEMINI_API_KEY') ? 500 : 502;
      res.status(statusCode).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('/{*path}', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SYNAPSE Clinical server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
