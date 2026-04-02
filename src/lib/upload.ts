import { writeFile, mkdir } from "fs/promises";
import path from "path";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Magic bytes for allowed file types
const MAGIC_BYTES: Record<string, number[][]> = {
  jpg: [
    [0xff, 0xd8, 0xff],
  ],
  png: [
    [0x89, 0x50, 0x4e, 0x47],
  ],
  pdf: [
    [0x25, 0x50, 0x44, 0x46], // %PDF
  ],
};

export function validateFileType(buffer: Buffer): { valid: boolean; detectedType: string | null } {
  for (const [type, signatures] of Object.entries(MAGIC_BYTES)) {
    for (const sig of signatures) {
      if (buffer.length >= sig.length && sig.every((byte, i) => buffer[i] === byte)) {
        return { valid: true, detectedType: type };
      }
    }
  }
  return { valid: false, detectedType: null };
}

export function validateFileSize(size: number): boolean {
  return size <= MAX_FILE_SIZE;
}

function getExtension(detectedType: string): string {
  switch (detectedType) {
    case "jpg": return ".jpg";
    case "png": return ".png";
    case "pdf": return ".pdf";
    default: return ".bin";
  }
}

export async function saveUploadedFile(
  buffer: Buffer,
  saleId: string
): Promise<{ success: true; filePath: string } | { success: false; error: string }> {
  if (!validateFileSize(buffer.length)) {
    return { success: false, error: "File size exceeds 5MB limit" };
  }

  const { valid, detectedType } = validateFileType(buffer);
  if (!valid || !detectedType) {
    return { success: false, error: "Invalid file type. Only JPG, PNG, and PDF are accepted" };
  }

  const dir = path.join(process.cwd(), "uploads", "bills", saleId);
  await mkdir(dir, { recursive: true });

  const fileName = `receipt${getExtension(detectedType)}`;
  const filePath = path.join(dir, fileName);
  await writeFile(filePath, buffer);

  return { success: true, filePath: `/uploads/bills/${saleId}/${fileName}` };
}

export async function saveKycFile(
  buffer: Buffer,
  userId: string,
  docType: "aadhar" | "pan" | "passport-photo"
): Promise<{ success: true; filePath: string } | { success: false; error: string }> {
  if (!validateFileSize(buffer.length)) {
    return { success: false, error: "File size exceeds 5MB limit" };
  }

  const { valid, detectedType } = validateFileType(buffer);
  if (!valid || !detectedType) {
    return { success: false, error: "Invalid file type. Only JPG, PNG, and PDF are accepted" };
  }

  const dir = path.join(process.cwd(), "uploads", "kyc", userId);
  await mkdir(dir, { recursive: true });

  const fileName = `${docType}${getExtension(detectedType)}`;
  const filePath = path.join(dir, fileName);
  await writeFile(filePath, buffer);

  return { success: true, filePath: `/uploads/kyc/${userId}/${fileName}` };
}
