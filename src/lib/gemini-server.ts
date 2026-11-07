import { GoogleGenAI } from '@google/genai';

/**
 * Resolves the Gemini API key from the incoming request header or environment variables.
 * Allows users to provide their own key in the web UI header (x-gemini-api-key)
 * or default to the server's GEMINI_API_KEY from .env.local.
 */
export function resolveApiKey(customApiKey?: string | null): string {
  const key = customApiKey?.trim() || process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new Error(
      'Gemini API key is required. Please provide it via the "x-gemini-api-key" header or configure GEMINI_API_KEY in your environment.'
    );
  }
  return key;
}

/**
 * Extracts the custom API key header from Next.js Request if present.
 */
export function extractApiKeyFromRequest(request: Request): string | null {
  return request.headers.get('x-gemini-api-key') || null;
}

/**
 * Initializes and returns an official GoogleGenAI client and the resolved API key.
 */
export function getGeminiClient(customApiKey?: string | null) {
  const apiKey = resolveApiKey(customApiKey);
  const client = new GoogleGenAI({ apiKey });
  return { client, apiKey };
}
