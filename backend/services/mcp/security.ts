import { ToolPermissionLevel } from "./types.js";

// Max result size in characters to prevent token exhaustion and memory overflow (256 KB)
export const MAX_TOOL_RESULT_LENGTH = 262144;

// Default timeouts
export const DEFAULT_TOOL_TIMEOUT_MS = 15000;
export const DEFAULT_CONNECT_TIMEOUT_MS = 10000;

// Disallowed private / cloud metadata ranges for SSRF prevention
const BLOCKED_IP_PATTERNS = [
  /^169\.254\./,        // Cloud metadata (AWS, GCP, Azure, DigitalOcean)
  /^100\.64\./,         // Carrier-grade NAT
  /^0\.0\.0\.0/,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
];

/**
 * Validates endpoint URL for SSRF protection.
 * In production, blocks internal metadata services and forbidden IP ranges.
 */
export function validateEndpointUrl(endpointUrl: string): { valid: boolean; reason?: string } {
  try {
    const parsed = new URL(endpointUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { valid: false, reason: `Unsupported protocol: ${parsed.protocol}. Only http and https are permitted.` };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Check against blocked IP patterns
    for (const pattern of BLOCKED_IP_PATTERNS) {
      if (pattern.test(hostname)) {
        return { valid: false, reason: `Access to network address ${hostname} is blocked for security reasons.` };
      }
    }

    // Block cloud metadata hostnames
    if (
      hostname === "metadata.google.internal" ||
      hostname === "metadata" ||
      hostname === "169.254.169.254"
    ) {
      return { valid: false, reason: "Access to cloud metadata service is prohibited." };
    }

    return { valid: true };
  } catch (err: any) {
    return { valid: false, reason: `Malformed endpoint URL: ${err.message}` };
  }
}

/**
 * Validates stdio executable and arguments for command injection risks.
 */
export function validateStdioCommand(command: string, args: string[] = []): { valid: boolean; reason?: string } {
  const trimmed = command.trim();
  if (!trimmed) {
    return { valid: false, reason: "Command cannot be empty." };
  }

  // Detect shell chaining characters that could execute arbitrary commands
  const dangerousShellTokens = [";", "&&", "||", "|", "`", "$("];
  for (const token of dangerousShellTokens) {
    if (trimmed.includes(token)) {
      return { valid: false, reason: `Dangerous shell operator '${token}' is not allowed in stdio command.` };
    }
    for (const arg of args) {
      if (arg.includes(token)) {
        return { valid: false, reason: `Dangerous shell operator '${token}' in argument is not allowed.` };
      }
    }
  }

  return { valid: true };
}

/**
 * Validates tool call arguments against declared JSON schema.
 */
export function validateToolArguments(
  schema: Record<string, any> | undefined,
  args: Record<string, any>
): { valid: boolean; errors: string[] } {
  if (!schema || !schema.properties) {
    return { valid: true, errors: [] };
  }

  const errors: string[] = [];

  // Check required properties
  if (Array.isArray(schema.required)) {
    for (const reqField of schema.required) {
      if (args[reqField] === undefined || args[reqField] === null) {
        errors.push(`Missing required argument: '${reqField}'`);
      }
    }
  }

  // Type checks for top-level properties
  for (const [key, propDef] of Object.entries<any>(schema.properties)) {
    if (args[key] !== undefined && propDef?.type) {
      const val = args[key];
      const expectedType = String(propDef.type).toLowerCase();

      if (expectedType === "string" && typeof val !== "string") {
        errors.push(`Argument '${key}' expected string, received ${typeof val}`);
      } else if (expectedType === "number" && typeof val !== "number") {
        errors.push(`Argument '${key}' expected number, received ${typeof val}`);
      } else if (expectedType === "integer" && (!Number.isInteger(val))) {
        errors.push(`Argument '${key}' expected integer, received ${typeof val}`);
      } else if (expectedType === "boolean" && typeof val !== "boolean") {
        errors.push(`Argument '${key}' expected boolean, received ${typeof val}`);
      } else if (expectedType === "array" && !Array.isArray(val)) {
        errors.push(`Argument '${key}' expected array, received ${typeof val}`);
      } else if (expectedType === "object" && (typeof val !== "object" || Array.isArray(val) || val === null)) {
        errors.push(`Argument '${key}' expected object, received ${typeof val}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Sanitizes object by removing sensitive fields like passwords, secrets, api keys, tokens.
 */
export function sanitizeMetadata(data: any): any {
  if (!data || typeof data !== "object") return data;

  const SENSITIVE_KEYS = [
    "password",
    "secret",
    "apikey",
    "api_key",
    "authorization",
    "token",
    "bearertoken",
    "private_key",
    "privatekey",
  ];

  if (Array.isArray(data)) {
    return data.map(item => sanitizeMetadata(item));
  }

  const sanitized: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    const lowerKey = k.toLowerCase().replace(/[-_]/g, "");
    if (SENSITIVE_KEYS.some(sk => lowerKey.includes(sk))) {
      sanitized[k] = "••••••••";
    } else if (typeof v === "object" && v !== null) {
      sanitized[k] = sanitizeMetadata(v);
    } else {
      sanitized[k] = v;
    }
  }
  return sanitized;
}

/**
 * Truncates oversized tool results safely.
 */
export function normalizeAndTruncateResult(result: any, maxLength: number = MAX_TOOL_RESULT_LENGTH): any {
  let serialized: string;
  try {
    serialized = typeof result === "string" ? result : JSON.stringify(result, null, 2);
  } catch {
    serialized = String(result);
  }

  if (serialized.length > maxLength) {
    const truncatedSnippet = serialized.slice(0, maxLength);
    return {
      _truncated: true,
      originalLength: serialized.length,
      content: truncatedSnippet + `\n\n[Warning: Tool output truncated. Original length was ${serialized.length} characters.]`,
    };
  }

  return result;
}

/**
 * Checks permissions for a given tool.
 */
export function evaluateToolPermission(
  toolName: string,
  userPermission?: ToolPermissionLevel
): { allowed: boolean; status: "allowed" | "blocked" | "requires_approval" } {
  // Builtin dangerous tools default
  const defaultBlocked = ["execute_shell_command", "delete_database", "format_disk"];
  if (defaultBlocked.includes(toolName) && userPermission !== "AUTO") {
    return { allowed: false, status: "blocked" };
  }

  if (userPermission === "BLOCK") {
    return { allowed: false, status: "blocked" };
  }

  if (userPermission === "ASK") {
    return { allowed: true, status: "requires_approval" };
  }

  return { allowed: true, status: "allowed" };
}
