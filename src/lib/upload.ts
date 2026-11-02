import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { storageConfigured, uploadToStorage } from "./storage";

// Vercel Functions membatasi body request ±4,5 MB.
const MAX_BYTES = 4 * 1024 * 1024; // 4 MB

const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

export const UPLOAD_DIR = path.join(process.cwd(), ".data", "uploads");

/**
 * Menyimpan bukti pembayaran ke Supabase Storage (produksi) atau `.data/uploads`
 * (fallback lokal). URL yang dikembalikan mengarah ke route terautentikasi.
 */
export async function saveUpload(
  file: unknown,
  prefix = "bukti",
): Promise<string | null> {
  if (!file || typeof file === "string") return null;
  const upload = file as File;
  if (typeof upload.size !== "number" || upload.size === 0) return null;
  if (upload.size > MAX_BYTES) throw new Error("Ukuran berkas maksimal 4 MB");

  const ext = MIME_EXT[upload.type];
  if (!ext) throw new Error("Format berkas harus JPG, PNG, WEBP, atau PDF");

  const safePrefix = prefix.replace(/[^a-z0-9-]/gi, "").slice(0, 20) || "bukti";
  const fileName = `${safePrefix}-${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;
  const buffer = Buffer.from(await upload.arrayBuffer());

  if (storageConfigured()) {
    await uploadToStorage(fileName, buffer, upload.type);
  } else {
    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(path.join(UPLOAD_DIR, fileName), buffer);
  }

  return `/api/uploads/${fileName}`;
}
