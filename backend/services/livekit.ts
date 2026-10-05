import dotenv from "dotenv";
import { AccessToken } from "livekit-server-sdk";

dotenv.config();

export interface LiveKitConfigStatus {
  isConfigured: boolean;
  url: string | null;
  hasKey: boolean;
  hasSecret: boolean;
}

/**
 * Returns configuration status of LiveKit without exposing secrets.
 */
export function getLiveKitConfigStatus(): LiveKitConfigStatus {
  const url = process.env.LIVEKIT_URL?.trim();
  const key = process.env.LIVEKIT_API_KEY?.trim();
  const secret = process.env.LIVEKIT_API_SECRET?.trim();

  const isConfigured = Boolean(
    url &&
    key &&
    secret &&
    !key.startsWith("YOUR_") &&
    !secret.startsWith("YOUR_") &&
    url.length > 5 &&
    key.length > 3 &&
    secret.length > 5
  );

  return {
    isConfigured,
    url: isConfigured ? url : null,
    hasKey: Boolean(key && !key.startsWith("YOUR_")),
    hasSecret: Boolean(secret && !secret.startsWith("YOUR_")),
  };
}

export interface LiveKitTokenOptions {
  roomName: string;
  identity: string;
  name?: string;
  metadata?: Record<string, any>;
  ttlSeconds?: number;
  canPublish?: boolean;
  canSubscribe?: boolean;
}

/**
 * Generates a secure, deterministic room name for a user conversation.
 * Example: flaw-user123-conv456
 */
export function generateVoiceRoomName(userId: string | null | undefined, conversationId?: string | null): string {
  const safeUser = (userId || "guest").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
  const safeConv = (conversationId || "main").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
  return `flaw-${safeUser}-${safeConv}`;
}

/**
 * Generates a LiveKit Access Token using the official livekit-server-sdk.
 * Compatible with both parameter signatures:
 * 1. createLiveKitToken(roomName, identity)
 * 2. createLiveKitToken({ roomName, identity, ... })
 */
export async function createLiveKitToken(
  optionsOrRoomName: string | LiveKitTokenOptions,
  identityArg?: string
): Promise<{ token: string; url: string; roomName: string; identity: string }> {
  const { isConfigured, url } = getLiveKitConfigStatus();
  if (!isConfigured || !url) {
    const err = new Error("LiveKit environment variables (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET) are not fully configured.");
    (err as any).code = "LIVEKIT_NOT_CONFIGURED";
    (err as any).statusCode = 503;
    throw err;
  }

  const apiKey = process.env.LIVEKIT_API_KEY!.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET!.trim();

  let roomName: string;
  let identity: string;
  let name: string | undefined;
  let metadata: Record<string, any> | undefined;
  let ttlSeconds: number = 3600; // 1-hour short-lived participant token
  let canPublish: boolean = true;
  let canSubscribe: boolean = true;

  if (typeof optionsOrRoomName === "string") {
    roomName = optionsOrRoomName;
    identity = identityArg || `user-${Date.now()}`;
  } else {
    roomName = optionsOrRoomName.roomName;
    identity = optionsOrRoomName.identity;
    name = optionsOrRoomName.name;
    metadata = optionsOrRoomName.metadata;
    if (optionsOrRoomName.ttlSeconds) ttlSeconds = optionsOrRoomName.ttlSeconds;
    if (optionsOrRoomName.canPublish !== undefined) canPublish = optionsOrRoomName.canPublish;
    if (optionsOrRoomName.canSubscribe !== undefined) canSubscribe = optionsOrRoomName.canSubscribe;
  }

  // Create token with livekit-server-sdk
  const at = new AccessToken(apiKey, apiSecret, {
    identity,
    name: name || identity,
    ttl: `${ttlSeconds}s`,
    metadata: metadata ? JSON.stringify(metadata) : undefined,
  });

  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish,
    canSubscribe,
    canPublishData: true,
  });

  const token = await at.toJwt();

  return {
    token,
    url,
    roomName,
    identity,
  };
}
