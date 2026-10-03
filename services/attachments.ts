import fs from "fs";
import path from "path";
import crypto from "crypto";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export interface ProcessedAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  storagePath: string;
  extractedText?: string;
  isImage: boolean;
  base64Data?: string;
}

export async function processUploadedAttachment(
  filename: string,
  mimeType: string,
  base64Content: string
): Promise<ProcessedAttachment> {
  const cleanBase64 = base64Content.includes(",") ? base64Content.split(",")[1] : base64Content;
  const buffer = Buffer.from(cleanBase64, "base64");
  const size = buffer.length;

  const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB limit
  if (size > MAX_FILE_SIZE) {
    throw new Error("File exceeds maximum allowed size of 25MB.");
  }

  // Prevent path traversal and dangerous executable extensions
  const ext = path.extname(filename).toLowerCase();
  const blockedExtensions = [".exe", ".bat", ".cmd", ".msi", ".dll", ".so", ".bin", ".vbs", ".ps1", ".scr", ".com"];
  if (blockedExtensions.includes(ext)) {
    throw new Error("Executable file formats are not permitted for security reasons.");
  }

  const cleanName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
  const id = crypto.randomUUID();
  const safeFilename = `${id}_${cleanName}`;
  const storagePath = path.join(UPLOADS_DIR, safeFilename);

  // Verify path containment
  if (!path.resolve(storagePath).startsWith(path.resolve(UPLOADS_DIR))) {
    throw new Error("Invalid file path detected.");
  }

  // Write file to disk
  fs.writeFileSync(storagePath, buffer);

  const isImage = mimeType.startsWith("image/");
  let extractedText: string | undefined = undefined;

  if (isImage) {
    // Images are passed directly as inlineData to Gemini vision
    return {
      id,
      filename,
      mimeType,
      size,
      storagePath,
      isImage: true,
      base64Data: cleanBase64,
    };
  }

  // Text-based files: TXT, CSV, JSON, Markdown, Source Code
  const textExtensions = [
    ".txt", ".csv", ".json", ".md", ".js", ".ts", ".jsx", ".tsx",
    ".py", ".java", ".c", ".cpp", ".h", ".cs", ".go", ".rs", ".rb",
    ".php", ".html", ".css", ".scss", ".sql", ".sh", ".bash", ".yml",
    ".yaml", ".xml", ".env", ".log", ".ini"
  ];

  if (textExtensions.includes(ext) || mimeType.includes("text") || mimeType.includes("json")) {
    extractedText = buffer.toString("utf-8");
  } else if (ext === ".pdf" || mimeType === "application/pdf") {
    // Extract readable text from PDF streams
    extractedText = extractTextFromPdfBuffer(buffer);
  } else if (ext === ".docx" || ext === ".doc") {
    // Basic DOCX text extraction from raw document.xml stream
    extractedText = extractTextFromDocxBuffer(buffer);
  } else {
    // Fallback best-effort utf-8 extraction
    try {
      const sample = buffer.toString("utf-8", 0, Math.min(buffer.length, 100000));
      if (!/[\x00-\x08\x0E-\x1F]/.test(sample)) {
        extractedText = sample;
      }
    } catch {
      extractedText = undefined;
    }
  }

  return {
    id,
    filename,
    mimeType,
    size,
    storagePath,
    extractedText,
    isImage: false,
  };
}

// PDF Text Extraction Helper
function extractTextFromPdfBuffer(buffer: Buffer): string {
  try {
    const raw = buffer.toString("latin1");
    const textPieces: string[] = [];

    // Match text within BT ... ET blocks
    const btMatches = raw.match(/BT[\s\S]*?ET/g);
    if (btMatches) {
      for (const block of btMatches) {
        // Match string literals ( ... ) Tj or TJ
        const tjMatches = block.match(/\((.*?)\)\s*T[jJ]/g);
        if (tjMatches) {
          for (const m of tjMatches) {
            const strMatch = m.match(/\((.*?)\)/);
            if (strMatch && strMatch[1]) {
              textPieces.push(strMatch[1]);
            }
          }
        }
      }
    }

    if (textPieces.length > 0) {
      return textPieces.join(" ").replace(/\\([()\\])/g, "$1");
    }

    // Secondary fallback: clean text extraction
    const readable = buffer.toString("utf-8").replace(/[^\x20-\x7E\n\r\t]/g, " ");
    const words = readable.split(/\s+/).filter(w => w.length > 2 && /^[a-zA-Z0-9.,;:!?'"()-]+$/.test(w));
    if (words.length > 20) {
      return words.join(" ").slice(0, 30000);
    }
  } catch (e) {
    console.warn("PDF extraction warning:", e);
  }
  return "[PDF Document attached: binary stream parsed. Reference content summarized in query.]";
}

// DOCX Text Extraction Helper
function extractTextFromDocxBuffer(buffer: Buffer): string {
  try {
    const raw = buffer.toString("latin1");
    // In docx (zip file), document.xml contains <w:t>...</w:t> tags
    const wtMatches = raw.match(/<w:t[^>]*>(.*?)<\/w:t>/g);
    if (wtMatches) {
      const texts = wtMatches.map(m => m.replace(/<[^>]+>/g, ""));
      return texts.join(" ");
    }
  } catch (e) {
    console.warn("DOCX extraction warning:", e);
  }
  return "[Document file attached. Content reference prepared.]";
}
