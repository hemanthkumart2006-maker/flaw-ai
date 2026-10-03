import dotenv from "dotenv";
import { apiKeyManager } from "./apiKeys.js";
dotenv.config();

export async function transcribeAudioWithSarvam(audioBuffer: Buffer, mimeType: string = "audio/wav"): Promise<string> {
  const apiKey = apiKeyManager.getActiveKey("sarvam") || process.env.SARVAM_API_KEY;
  if (!apiKey) {
    throw new Error("SARVAM_API_KEY is not configured on the server.");
  }

  // Build FormData manually or using fetch Blob
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
  const formData = new FormData();
  formData.append("file", blob, "audio_input.wav");
  formData.append("model", "saaras:v3"); // Sarvam Saaras v3 model identifier

  const response = await fetch("https://api.sarvam.ai/speech-to-text", {
    method: "POST",
    headers: {
      "api-subscription-key": apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Sarvam STT Error:", response.status, errorText);
    throw new Error(`Sarvam STT failed with status ${response.status}`);
  }

  const result = await response.json();
  return result.transcript || result.text || "";
}
