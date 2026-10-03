import dotenv from "dotenv";
import { apiKeyManager } from "./apiKeys.js";
dotenv.config();

export interface TTSOptions {
  text: string;
  voice?: string;
  speed?: number;
}

export async function generateSpeechWithOpenAI(options: TTSOptions): Promise<ArrayBuffer> {
  const apiKey = apiKeyManager.getActiveKey("openai") || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured on the server.");
  }

  const model = process.env.OPENAI_TTS_MODEL || "tts-1";
  const voice = options.voice || process.env.OPENAI_TTS_VOICE || "nova";
  const speed = options.speed || 1.0;

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: options.text,
      voice,
      speed,
      response_format: "mp3",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("OpenAI TTS Error:", response.status, errorText);
    throw new Error(`OpenAI TTS failed with status ${response.status}`);
  }

  return await response.arrayBuffer();
}
