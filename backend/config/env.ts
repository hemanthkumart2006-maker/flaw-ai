import dotenv from "dotenv";
import path from "path";
import crypto from "crypto";

// Ensure root .env is loaded
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

export const NODE_ENV = process.env.NODE_ENV || "development";
export const IS_PRODUCTION = NODE_ENV === "production";
export const PORT = Number(process.env.PORT) || 3000;

function validateSecrets(): { jwtSecret: string; encryptionSecret: string } {
  let jwtSecret = process.env.JWT_SECRET?.trim();
  let encryptionSecret = process.env.ENCRYPTION_SECRET?.trim();

  // In production, enforce strict presence and minimum complexity
  if (IS_PRODUCTION) {
    const missing: string[] = [];

    if (!jwtSecret) {
      missing.push("JWT_SECRET");
    } else if (jwtSecret.length < 32) {
      throw new Error(
        `[Config Fatal] JWT_SECRET must be at least 32 characters in production (currently ${jwtSecret.length} chars).`
      );
    }

    if (!encryptionSecret) {
      missing.push("ENCRYPTION_SECRET");
    } else if (encryptionSecret.length < 32) {
      throw new Error(
        `[Config Fatal] ENCRYPTION_SECRET must be at least 32 characters in production (currently ${encryptionSecret.length} chars).`
      );
    }

    if (missing.length > 0) {
      throw new Error(
        `[Config Fatal] Missing required environment variables in production: ${missing.join(", ")}. Please configure these in your production environment.`
      );
    }
  }

  // Development warnings & ephemeral fallback for non-production environments
  if (!jwtSecret) {
    console.warn(
      "\x1b[33m[SECURITY WARNING] JWT_SECRET is not set in environment. Generating an ephemeral dev key. Set JWT_SECRET in .env for persistent sessions.\x1b[0m"
    );
    jwtSecret = "dev-ephemeral-jwt-secret-" + crypto.randomBytes(16).toString("hex");
  }

  if (!encryptionSecret) {
    console.warn(
      "\x1b[33m[SECURITY WARNING] ENCRYPTION_SECRET is not set in environment. Generating an ephemeral dev key. Set ENCRYPTION_SECRET in .env for persistent encrypted storage.\x1b[0m"
    );
    encryptionSecret = "dev-ephemeral-encryption-secret-" + crypto.randomBytes(16).toString("hex");
  }

  return {
    jwtSecret,
    encryptionSecret,
  };
}

const validated = validateSecrets();
export const JWT_SECRET = validated.jwtSecret;
export const ENCRYPTION_SECRET = validated.encryptionSecret;
