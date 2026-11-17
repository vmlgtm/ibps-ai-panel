import { NextResponse } from 'next/server';
import { extractApiKeyFromRequest, resolveApiKey } from '@/lib/gemini-server';
import { GoogleGenAI } from '@google/genai';

const DEFAULT_LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';
const PREFERRED_LIVE_MODELS = [
  'gemini-2.5-flash-native-audio-preview-12-2025',
  'gemini-2.5-flash-native-audio-preview-09-2025',
  'gemini-3.8-live',
  'gemini-3.1-flash-live-preview',
  'gemini-2.0-flash-live-001',
  'gemini-2.0-flash-exp',
];

const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;
const cachedModelsResult = new Map<
  string,
  { liveModels: string[]; preferredLiveModel: string; cachedAt: number }
>();

export async function POST(request: Request) {
  try {
    const customKey = extractApiKeyFromRequest(request);
    const apiKey = resolveApiKey(customKey);
    const cacheKey = customKey ? `custom:${apiKey}` : 'default';

    let liveModels: string[] = [];
    let preferredLiveModel = DEFAULT_LIVE_MODEL;

    const cached = cachedModelsResult.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < MODEL_CACHE_TTL_MS) {
      liveModels = cached.liveModels;
      preferredLiveModel = cached.preferredLiveModel;
    } else {
      // Check available models supporting bidirectional content generation
      try {
        const client = new GoogleGenAI({
          apiKey,
          httpOptions: {
            apiVersion: apiKey.startsWith('auth_tokens/') ? 'v1alpha' : 'v1beta',
          },
        });

        const listPromise = (async () => {
          const pager = await client.models.list();
          const found: string[] = [];
          for await (const m of pager) {
            const rawName = m.name || '';
            const cleanName = rawName.replace(/^models\//, '');
            const modelObj = m as {
              supportedActions?: string[];
              supportedGenerationMethods?: string[];
            };
            const actions =
              modelObj.supportedActions || modelObj.supportedGenerationMethods || [];
            if (
              actions.includes('bidiGenerateContent') ||
              cleanName.includes('native-audio') ||
              cleanName.includes('flash-live') ||
              cleanName.endsWith('-live')
            ) {
              found.push(cleanName);
            }
          }
          return found;
        })();

        const timeoutPromise = new Promise<string[]>((_, reject) =>
          setTimeout(() => reject(new Error('models.list timeout')), 3500)
        );

        liveModels = await Promise.race([listPromise, timeoutPromise]);

        if (liveModels.length > 0) {
          const matched = PREFERRED_LIVE_MODELS.find((pref) => liveModels.includes(pref));
          const nativeAudioFallback = liveModels.find((m) => m.includes('native-audio'));
          preferredLiveModel = matched || nativeAudioFallback || liveModels[0];
          cachedModelsResult.set(cacheKey, {
            liveModels,
            preferredLiveModel,
            cachedAt: Date.now(),
          });
        }
      } catch (listErr) {
        console.warn('models.list check failed or timed out, using fallback live models:', listErr);
        liveModels = [DEFAULT_LIVE_MODEL, ...PREFERRED_LIVE_MODELS.slice(1)];
        preferredLiveModel = DEFAULT_LIVE_MODEL;
      }
    }

    return NextResponse.json({
      token: apiKey,
      isEphemeral: false,
      model: preferredLiveModel,
      liveModels: liveModels.length > 0 ? liveModels : [DEFAULT_LIVE_MODEL],
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to retrieve Live session token';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
