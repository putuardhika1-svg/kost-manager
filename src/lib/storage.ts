import "server-only";

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, "") ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
export const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "payment-proofs";

export function storageConfigured(): boolean {
  return Boolean(SUPABASE_URL && SERVICE_KEY);
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    Authorization: `Bearer ${SERVICE_KEY}`,
    apikey: SERVICE_KEY,
    ...extra,
  };
}

function objectPath(fileName: string): string {
  return `${STORAGE_BUCKET}/${encodeURIComponent(fileName)}`;
}

export async function uploadToStorage(
  fileName: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  if (!storageConfigured()) {
    throw new Error("Supabase Storage belum dikonfigurasi");
  }

  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${objectPath(fileName)}`, {
    method: "POST",
    headers: authHeaders({
      "Content-Type": contentType,
      "x-upsert": "false",
      "Cache-Control": "3600",
    }),
    body: new Uint8Array(body),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Gagal mengunggah bukti bayar ke storage (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
}

/** Membuat signed URL sementara untuk berkas privat di bucket. */
export async function createSignedUrl(fileName: string, expiresIn = 3600): Promise<string | null> {
  if (!storageConfigured()) return null;

  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${objectPath(fileName)}`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ expiresIn }),
  });

  if (!response.ok) return null;
  const data = (await response.json().catch(() => null)) as { signedURL?: string } | null;
  if (!data?.signedURL) return null;
  if (data.signedURL.startsWith("http")) return data.signedURL;
  return `${SUPABASE_URL}/storage/v1${data.signedURL}`;
}
