import { useState, useCallback } from "react";

export function useLiveKit() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [roomToken, setRoomToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connectToLiveKit = useCallback(async (roomName: string = "friday-room") => {
    setIsConnecting(true);
    setError(null);

    try {
      const response = await fetch("/api/livekit/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomName, identity: `user-${Date.now()}` }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "LiveKit service unconfigured");
      }

      const { token, url } = await response.json();
      setRoomToken(token);
      setLivekitUrl(url);
      setIsConnected(true);
    } catch (err: any) {
      console.warn("LiveKit connection notice:", err.message);
      setError(err.message || "LiveKit configuration unavailable");
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnectFromLiveKit = useCallback(() => {
    setRoomToken(null);
    setIsConnected(false);
  }, []);

  return {
    isConnected,
    isConnecting,
    roomToken,
    livekitUrl,
    error,
    connectToLiveKit,
    disconnectFromLiveKit,
  };
}
