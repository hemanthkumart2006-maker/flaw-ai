import dotenv from "dotenv";
import { apiKeyManager } from "./apiKeys.js";

dotenv.config();

export interface SarvamSTTOptions {
  languageCode?: string;
  model?: string;
  mode?: "transcribe" | "translate" | "verbatim" | "translit" | "codemix";
}

/**
 * Transcribes audio buffer using Sarvam Saaras STT REST API.
 * Automatically handles API key rotation, cooldown, and sanitized error reporting.
 */
export async function transcribeAudioWithSarvam(
  audioBuffer: Buffer,
  mimeType: string = "audio/wav",
  options?: string | SarvamSTTOptions
): Promise<string> {
  const opts: SarvamSTTOptions = typeof options === "string" ? { languageCode: options } : options || {};

  // Register runtime SARVAM_API_KEY / SARVAM_API_KEYS if present in process.env
  const envKey = process.env.SARVAM_API_KEY?.trim();
  if (envKey && envKey.length > 5 && !envKey.startsWith("YOUR_")) {
    apiKeyManager.registerKey("sarvam", envKey);
  }
  const envKeys = process.env.SARVAM_API_KEYS?.trim();
  if (envKeys) {
    apiKeyManager.parseAndRegisterKeys("sarvam", envKeys);
  }

  const allActiveKeys = apiKeyManager.getAllKeysForProvider("sarvam");
  const fallbackKey = envKey && envKey.length > 5 && !envKey.startsWith("YOUR_") ? envKey : null;

  if (allActiveKeys.length === 0 && !fallbackKey) {
    const error = new Error("SARVAM_API_KEY is not configured on the server.");
    (error as any).code = "SARVAM_NOT_CONFIGURED";
    (error as any).statusCode = 503;
    throw error;
  }

  // Determine file extension from mimeType
  const cleanMime = mimeType.split(";")[0].toLowerCase().trim();
  let fileExt = "wav";
  if (cleanMime.includes("webm")) fileExt = "webm";
  else if (cleanMime.includes("ogg")) fileExt = "ogg";
  else if (cleanMime.includes("mp3") || cleanMime.includes("mpeg")) fileExt = "mp3";
  else if (cleanMime.includes("aac")) fileExt = "aac";
  else if (cleanMime.includes("m4a") || cleanMime.includes("mp4")) fileExt = "m4a";
  else if (cleanMime.includes("flac")) fileExt = "flac";

  const fileName = `audio_input.${fileExt}`;
  const model = opts.model || process.env.SARVAM_MODEL || "saaras:v4";
  const mode = opts.mode || "transcribe";

  // Build FormData for Sarvam Saaras STT
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: cleanMime || "audio/wav" });

  // Try candidate keys with rotation support
  const keysToTry = allActiveKeys.length > 0 ? [...allActiveKeys] : [fallbackKey!];
  let lastError: Error | null = null;

  for (let i = 0; i < keysToTry.length; i++) {
    const currentKey = apiKeyManager.getActiveKey("sarvam") || keysToTry[i];
    if (!currentKey) continue;

    const formData = new FormData();
    formData.append("file", blob, fileName);
    formData.append("model", model);
    formData.append("mode", mode);

    if (opts.languageCode && opts.languageCode !== "auto" && opts.languageCode !== "unknown") {
      formData.append("language_code", opts.languageCode);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s timeout

      const response = await fetch("https://api.sarvam.ai/speech-to-text", {
        method: "POST",
        headers: {
          "api-subscription-key": currentKey,
        },
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorDetails = "";
        try {
          const errJson = await response.json();
          errorDetails = errJson.message || errJson.error || errJson.detail || JSON.stringify(errJson);
        } catch {
          errorDetails = await response.text().catch(() => "");
        }

        // Report failure to ApiKeyManager for key rotation and cooldown
        apiKeyManager.reportKeyFailure("sarvam", currentKey, `Status ${response.status}: ${errorDetails.slice(0, 100)}`);
        console.warn(`[Sarvam STT] Request failed with key (...${currentKey.slice(-4)}): HTTP ${response.status}`);

        if (response.status === 401 || response.status === 403) {
          const authErr = new Error("Sarvam STT authentication failed. Please check your SARVAM_API_KEY.");
          (authErr as any).statusCode = 401;
          (authErr as any).code = "SARVAM_AUTH_ERROR";
          lastError = authErr;
          continue; // Try next key if available
        } else if (response.status === 429) {
          const rateErr = new Error("Sarvam STT rate limit exceeded. Please wait a moment and try again.");
          (rateErr as any).statusCode = 429;
          (rateErr as any).code = "SARVAM_RATE_LIMIT";
          lastError = rateErr;
          continue; // Try next key if available
        } else if (response.status >= 500) {
          const serverErr = new Error("Sarvam STT service is temporarily unavailable. Please try again later.");
          (serverErr as any).statusCode = 502;
          (serverErr as any).code = "SARVAM_SERVER_ERROR";
          lastError = serverErr;
          continue; // Try next key if available
        } else {
          const badReqErr = new Error(`Sarvam STT failed: ${errorDetails || "Invalid audio format or parameters."}`);
          (badReqErr as any).statusCode = response.status;
          (badReqErr as any).code = "SARVAM_BAD_REQUEST";
          throw badReqErr; // Don't retry client bad requests
        }
      }

      const result = (await response.json()) as { transcript?: string; text?: string; language_code?: string };
      apiKeyManager.reportKeySuccess("sarvam", currentKey);

      const transcript = (result.transcript || result.text || "").trim();
      return transcript;
    } catch (err: any) {
      if (err.name === "AbortError") {
        const timeoutErr = new Error("Sarvam STT request timed out. Please try again.");
        (timeoutErr as any).statusCode = 504;
        (timeoutErr as any).code = "SARVAM_TIMEOUT";
        lastError = timeoutErr;
      } else if (err.code === "SARVAM_BAD_REQUEST") {
        throw err;
      } else {
        apiKeyManager.reportKeyFailure("sarvam", currentKey, err.message || "Network error");
        lastError = err;
      }
    }
  }

  // If all keys exhausted
  if (lastError) {
    throw lastError;
  }

  throw new Error("Sarvam STT transcription failed. Please check server configuration.");
}
