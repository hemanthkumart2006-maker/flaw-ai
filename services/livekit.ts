import dotenv from "dotenv";
dotenv.config();

export function getLiveKitConfigStatus() {
  const url = process.env.LIVEKIT_URL;
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;

  return {
    isConfigured: Boolean(url && key && secret),
    url: url || null,
  };
}

export async function createLiveKitToken(roomName: string, identity: string): Promise<{ token: string; url: string }> {
  const { isConfigured, url } = getLiveKitConfigStatus();
  if (!isConfigured || !url) {
    throw new Error("LiveKit environment variables (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET) are not fully configured.");
  }

  // Create a minimal JWT token for LiveKit WebRTC connection
  const apiKey = process.env.LIVEKIT_API_KEY!;
  const apiSecret = process.env.LIVEKIT_API_SECRET!;

  // Header
  const header = { alg: "HS256", typ: "JWT" };

  // Payload with 6 hour expiration
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: apiKey,
    sub: identity,
    nbf: now,
    exp: now + 24 * 60 * 60,
    video: {
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    },
  };

  // Base64URL encode
  const encodeBase64Url = (obj: object) => {
    const jsonStr = JSON.stringify(obj);
    const base64 = Buffer.from(jsonStr).toString("base64");
    return base64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  };

  const encodedHeader = encodeBase64Url(header);
  const encodedPayload = encodeBase64Url(payload);
  const tokenData = `${encodedHeader}.${encodedPayload}`;

  // Signature using HMAC SHA-256
  const crypto = await import("crypto");
  const signature = crypto
    .createHmac("sha256", apiSecret)
    .update(tokenData)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const token = `${tokenData}.${signature}`;

  return {
    token,
    url,
  };
}
