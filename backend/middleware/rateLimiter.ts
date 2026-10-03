import rateLimit from "express-rate-limit";

/**
 * Strict Rate Limiter for Authentication Endpoints (/api/auth/login, /api/auth/register)
 * Max 5 requests per 1 minute per IP to prevent brute-force attacks.
 */
export const authRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  standardHeaders: true, // Return standard RateLimit-* headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  statusCode: 429,
  message: {
    error: "Too many authentication requests from this IP. Please wait a minute before trying again.",
  },
});

/**
 * Moderate Rate Limiter for Resource-Intensive AI Chat Streams (/api/chat)
 * Max 30 requests per 1 minute per IP to mitigate DoS & API quota exhaustion.
 */
export const chatRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  statusCode: 429,
  message: {
    error: "AI generation rate limit exceeded. Please wait a moment before sending another message.",
  },
});
