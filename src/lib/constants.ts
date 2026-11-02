export type Tone = "green" | "red" | "amber" | "blue" | "gray";

export const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  staff: "Staff",
  tenant: "Penyewa",
};

export const ROOM_STATUS: Record<string, { label: string; tone: Tone }> = {
  kosong: { label: "Kosong", tone: "green" },
  terisi: { label: "Terisi", tone: "blue" },
  booked: { label: "Booked", tone: "amber" },
  perbaikan: { label: "Perbaikan", tone: "amber" },
  nonaktif: { label: "Nonaktif", tone: "gray" },
};

export const INVOICE_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "gray" },
  unpaid: { label: "Belum bayar", tone: "amber" },
  overdue: { label: "Tunggakan", tone: "red" },
  paid: { label: "Lunas", tone: "green" },
  void: { label: "Dibatalkan", tone: "gray" },
};

export const PAYMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Menunggu verifikasi", tone: "amber" },
  verified: { label: "Terverifikasi", tone: "green" },
  rejected: { label: "Ditolak", tone: "red" },
};

export const PAYMENT_METHODS: Record<string, string> = {
  cash: "Tunai",
  transfer: "Transfer",
  gateway: "Payment gateway",
};

export const ITEM_TYPES: Record<string, string> = {
  rent: "Sewa",
  utility: "Utilitas",
  penalty: "Denda",
  other: "Lainnya",
};

export const MAINT_STATUS: Record<string, { label: string; tone: Tone }> = {
  baru: { label: "Baru", tone: "red" },
  diproses: { label: "Diproses", tone: "amber" },
  selesai: { label: "Selesai", tone: "green" },
  ditutup: { label: "Ditutup", tone: "gray" },
};

export const PRIORITIES: Record<string, { label: string; tone: Tone }> = {
  rendah: { label: "Rendah", tone: "gray" },
  sedang: { label: "Sedang", tone: "amber" },
  tinggi: { label: "Tinggi", tone: "red" },
};

export const MAINT_CATEGORIES = [
  "umum",
  "listrik",
  "air",
  "kebersihan",
  "perabot",
  "keamanan",
] as const;

export const NOTIFICATION_STATUS: Record<string, { label: string; tone: Tone }> = {
  queued: { label: "Antre", tone: "gray" },
  sent: { label: "Terkirim", tone: "green" },
  failed: { label: "Gagal", tone: "red" },
};
