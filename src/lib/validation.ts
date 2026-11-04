import { z } from "zod";

const phoneRegex = /^(\+62|62|0)[0-9\s-]{8,16}$/;

export const propertySchema = z.object({
  name: z.string().min(3, "Nama properti minimal 3 karakter"),
  code: z
    .string()
    .min(2, "Kode properti minimal 2 karakter")
    .max(12, "Kode properti maksimal 12 karakter")
    .regex(/^[A-Za-z0-9-]+$/, "Kode hanya boleh huruf, angka, dan tanda hubung"),
  address: z.string().min(5, "Alamat minimal 5 karakter"),
  city: z.string().min(2, "Kota wajib diisi"),
  notes: z.string().optional(),
});

export const roomSchema = z.object({
  propertyId: z.string().min(1, "Properti wajib dipilih"),
  number: z.string().min(1, "Nomor kamar wajib diisi").max(10, "Nomor kamar maksimal 10 karakter"),
  floor: z.coerce.number().int().min(0, "Lantai tidak valid").max(50, "Lantai tidak valid"),
  type: z.string().max(60, "Tipe kamar maksimal 60 karakter").optional(),
  monthlyPrice: z.coerce.number().int().positive("Harga sewa harus lebih dari 0"),
  status: z.enum(["kosong", "terisi", "booked", "perbaikan", "nonaktif"]),
  facilities: z.string().max(500, "Fasilitas maksimal 500 karakter").optional(),
  meterSerial: z.string().max(60, "Nomor meter maksimal 60 karakter").optional(),
});

export const tenantStatusSchema = z.object({
  status: z.enum(["aktif", "nonaktif"]),
});

export const invoiceDueDateSchema = z.object({
  dueDate: z.string().min(1, "Tanggal jatuh tempo wajib diisi"),
});

export const tenantSchema = z.object({
  name: z.string().min(2, "Nama penyewa minimal 2 karakter"),
  phone: z.string().regex(phoneRegex, "Nomor telepon tidak valid (contoh: 081234567890)"),
  email: z.union([z.string().email("Format email tidak valid"), z.literal("")]).optional(),
  idNumber: z.string().optional(),
  emergencyContact: z.string().optional(),
  addressOrigin: z.string().optional(),
});

export const tenantRegistrationSchema = z
  .object({
    name: z.string().min(2, "Nama minimal 2 karakter").max(100, "Nama maksimal 100 karakter"),
    phone: z.string().regex(phoneRegex, "Nomor telepon tidak valid (contoh: 081234567890)"),
    email: z.string().email("Format email tidak valid"),
    password: z
      .string()
      .min(8, "Password minimal 8 karakter")
      .regex(/[A-Za-z]/, "Password harus mengandung huruf")
      .regex(/[0-9]/, "Password harus mengandung angka"),
    confirmPassword: z.string(),
    addressOrigin: z
      .string()
      .min(5, "Alamat asal minimal 5 karakter")
      .max(200, "Alamat asal maksimal 200 karakter"),
    idNumber: z.string().max(30, "NIK maksimal 30 karakter").optional(),
    emergencyContact: z
      .string()
      .max(100, "Kontak darurat maksimal 100 karakter")
      .optional(),
    roomId: z.string().min(1, "Kamar wajib dipilih"),
    startDate: z.string().min(1, "Tanggal mulai wajib diisi"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Konfirmasi password tidak sama",
    path: ["confirmPassword"],
  });

export const contractSchema = z
  .object({
    tenantId: z.string().min(1, "Penyewa wajib dipilih"),
    roomId: z.string().min(1, "Kamar wajib dipilih"),
    startDate: z.string().min(1, "Tanggal mulai wajib diisi"),
    endDate: z.string().min(1, "Tanggal berakhir wajib diisi"),
    rentAmount: z.coerce
      .number()
      .int()
      .positive("Harga sewa harus lebih dari 0")
      .max(999_999_999_999, "Harga sewa terlalu besar"),
    deposit: z.coerce.number().int().min(0, "Deposit tidak boleh negatif"),
    billingDay: z.coerce.number().int().min(1, "Tanggal tagih minimal 1").max(28, "Tanggal tagih maksimal 28"),
    electricityStartReading: z.coerce
      .number()
      .min(0, "Angka awal meter tidak boleh negatif")
      .max(9_999_999, "Angka meter terlalu besar")
      .optional(),
    notes: z.string().max(500, "Catatan maksimal 500 karakter").optional(),
  })
  .refine((data) => new Date(data.endDate) > new Date(data.startDate), {
    message: "Tanggal berakhir harus setelah tanggal mulai",
    path: ["endDate"],
  });

export const invoiceItemSchema = z.object({
  description: z.string().min(2, "Deskripsi minimal 2 karakter"),
  type: z.enum(["rent", "utility", "penalty", "other"]),
  amount: z.coerce.number().int().positive("Nominal harus lebih dari 0"),
});

export const paymentSchema = z.object({
  invoiceId: z.string().min(1, "Tagihan wajib dipilih"),
  method: z.enum(["cash", "transfer", "qris", "gateway"]),
  channelId: z.string().optional(),
  amount: z.coerce
    .number()
    .int()
    .positive("Nominal harus lebih dari 0")
    .max(999_999_999_999, "Nominal terlalu besar"),
  paidAt: z.string().optional(),
  proofUrl: z.string().max(500).optional(),
  notes: z.string().max(500, "Catatan maksimal 500 karakter").optional(),
});

export const reasonSchema = z
  .string()
  .trim()
  .min(5, "Alasan minimal 5 karakter")
  .max(300, "Alasan maksimal 300 karakter");

export const meterReadingSchema = z.object({
  currentReading: z.coerce
    .number()
    .min(0, "Angka meter tidak boleh negatif")
    .max(9_999_999, "Angka meter terlalu besar"),
  readingAt: z.string().optional(),
  notes: z.string().max(500, "Catatan maksimal 500 karakter").optional(),
});

export const propertyBillingSchema = z.object({
  electricityTariff: z.coerce
    .number()
    .int()
    .min(0, "Tarif tidak boleh negatif")
    .max(1_000_000, "Tarif terlalu besar"),
  requireMeterReading: z.boolean(),
  requireTenantProfile: z.boolean(),
});

export const paymentChannelSchema = z.object({
  type: z.enum(["bank", "qris", "cash"]),
  label: z.string().min(2, "Label minimal 2 karakter").max(80, "Label maksimal 80 karakter"),
  bankName: z.string().max(80).optional(),
  accountNumber: z.string().max(60).optional(),
  accountHolder: z.string().max(100).optional(),
  instructions: z.string().max(500, "Instruksi maksimal 500 karakter").optional(),
});

export const maintenanceSchema = z.object({
  roomId: z.string().min(1, "Kamar wajib dipilih"),
  tenantId: z.string().optional(),
  title: z.string().min(3, "Judul minimal 3 karakter").max(120, "Judul maksimal 120 karakter"),
  description: z.string().min(5, "Deskripsi minimal 5 karakter").max(1000, "Deskripsi maksimal 1000 karakter"),
  category: z.enum(["umum", "listrik", "air", "kebersihan", "perabot", "keamanan"]),
  priority: z.enum(["rendah", "sedang", "tinggi"]),
});

export const maintenanceUpdateSchema = z.object({
  title: z.string().min(3, "Judul minimal 3 karakter").max(120, "Judul maksimal 120 karakter"),
  description: z
    .string()
    .min(5, "Deskripsi minimal 5 karakter")
    .max(1000, "Deskripsi maksimal 1000 karakter"),
  category: z.enum(["umum", "listrik", "air", "kebersihan", "perabot", "keamanan"]),
  status: z.enum(["baru", "diproses", "selesai", "ditutup"]),
  priority: z.enum(["rendah", "sedang", "tinggi"]),
  assignedTo: z.string().max(120, "Nama teknisi maksimal 120 karakter").optional(),
  cost: z.coerce.number().int().min(0, "Biaya tidak boleh negatif").max(999_999_999_999),
});

export const userSchema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter").max(100),
  email: z.string().email("Format email tidak valid"),
  password: z
    .string()
    .min(8, "Password minimal 8 karakter")
    .regex(/[A-Za-z]/, "Password harus mengandung huruf")
    .regex(/[0-9]/, "Password harus mengandung angka"),
  role: z.enum(["owner", "admin", "staff", "tenant"]),
  phone: z.string().optional(),
  tenantId: z.string().optional(),
  propertyIds: z.array(z.string()).optional(),
});

export const userUpdateSchema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter").max(100),
  role: z.enum(["owner", "admin", "staff", "tenant"]),
  phone: z.string().optional(),
  isActive: z.boolean(),
  tenantId: z.string().optional(),
  propertyIds: z.array(z.string()).optional(),
});

export const passwordResetSchema = z
  .string()
  .min(8, "Password minimal 8 karakter")
  .regex(/[A-Za-z]/, "Password harus mengandung huruf")
  .regex(/[0-9]/, "Password harus mengandung angka");

export const generateSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  propertyId: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email("Format email tidak valid"),
  password: z.string().min(1, "Password wajib diisi"),
});

export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Data tidak valid";
}
