import "server-only";
import { prisma } from "./db";

export type NotificationTemplate = {
  key: string;
  channel: "whatsapp" | "email";
  title: string;
  body: string;
};

export const TEMPLATES: Record<string, NotificationTemplate> = {
  "N-01": {
    key: "N-01",
    channel: "whatsapp",
    title: "Tagihan terbit",
    body: "Halo {nama}, tagihan kost {kamar} periode {periode} sebesar {jumlah} telah terbit. Jatuh tempo {jatuh_tempo}. Detail: {link}. Terima kasih.",
  },
  "N-02": {
    key: "N-02",
    channel: "whatsapp",
    title: "Pengingat H-3",
    body: "Halo {nama}, pengingat tagihan {kamar} sebesar {jumlah} akan jatuh tempo pada {jatuh_tempo}. Mohon disiapkan. Detail: {link}.",
  },
  "N-03": {
    key: "N-03",
    channel: "whatsapp",
    title: "Jatuh tempo hari ini",
    body: "Halo {nama}, tagihan {kamar} sebesar {jumlah} jatuh tempo hari ini ({jatuh_tempo}). Detail: {link}.",
  },
  "N-04": {
    key: "N-04",
    channel: "whatsapp",
    title: "Lewat jatuh tempo H+1",
    body: "Halo {nama}, tagihan {kamar} sebesar {jumlah} telah melewati jatuh tempo pada {jatuh_tempo}. Mohon segera melakukan pembayaran. Detail: {link}.",
  },
  "N-05": {
    key: "N-05",
    channel: "whatsapp",
    title: "Tunggakan H+3",
    body: "Halo {nama}, tagihan {kamar} sebesar {jumlah} masih belum dibayar (jatuh tempo {jatuh_tempo}). Mohon konfirmasi pembayaran. Detail: {link}.",
  },
  "N-06": {
    key: "N-06",
    channel: "whatsapp",
    title: "Tunggakan H+7",
    body: "Halo {nama}, tagihan {kamar} sebesar {jumlah} telah menunggak lebih dari 7 hari. Mohon segera diselesaikan agar tidak dikenakan denda. Detail: {link}.",
  },
  "N-07": {
    key: "N-07",
    channel: "whatsapp",
    title: "Bukti bayar diterima",
    body: "Terima kasih {nama}, bukti pembayaran {kamar} sebesar {jumlah} telah kami terima dan sedang diverifikasi.",
  },
  "N-08": {
    key: "N-08",
    channel: "whatsapp",
    title: "Pembayaran diverifikasi",
    body: "Terima kasih {nama}, pembayaran sebesar {jumlah} untuk tagihan {kamar} telah kami verifikasi. Status tagihan: LUNAS.",
  },
  "N-09": {
    key: "N-09",
    channel: "whatsapp",
    title: "Pembayaran ditolak",
    body: "Halo {nama}, bukti pembayaran {kamar} sebesar {jumlah} tidak dapat kami verifikasi. Alasan: {alasan}. Mohon unggah ulang bukti yang benar.",
  },
  "N-10": {
    key: "N-10",
    channel: "whatsapp",
    title: "Kontrak berakhir H-30",
    body: "Halo {nama}, masa sewa kamar {kamar} berakhir pada {jatuh_tempo}. Silakan konfirmasi perpanjangan.",
  },
  "N-11": {
    key: "N-11",
    channel: "whatsapp",
    title: "Kontrak berakhir H-7",
    body: "Halo {nama}, masa sewa kamar {kamar} berakhir dalam 7 hari. Mohon konfirmasi perpanjangan atau persiapan check-out.",
  },
  "N-12": {
    key: "N-12",
    channel: "whatsapp",
    title: "Tiket prioritas tinggi",
    body: "Tiket baru prioritas tinggi: {kamar} - {judul}. Mohon segera ditindaklanjuti.",
  },
};

export function renderTemplate(key: string, variables: Record<string, string>): string {
  const template = TEMPLATES[key];
  if (!template) return "";
  return template.body.replace(/\{(\w+)\}/g, (_, name: string) => variables[name] ?? `{${name}}`);
}

type SendInput = {
  templateKey: string;
  invoiceId?: string | null;
  tenantId?: string | null;
  variables?: Record<string, string>;
  channel?: "whatsapp" | "email";
};

/**
 * Mengirim notifikasi. Pada MVP, pengiriman WhatsApp/email bersifat SIMULASI:
 * pesan dicatat ke NotificationLog dengan status `sent` (atau `failed` bila
 * nomor tujuan tidak tersedia). Untuk pengiriman nyata, integrasikan provider
 * WhatsApp Business API di fungsi ini (lihat DEPLOYMENT.md bagian Integrasi).
 */
export async function sendNotification(input: SendInput): Promise<void> {
  const template = TEMPLATES[input.templateKey];
  if (!template) return;

  let recipient = "";
  let email = "";
  if (input.tenantId) {
    const tenant = await prisma.tenant.findUnique({ where: { id: input.tenantId } });
    recipient = tenant?.phone ?? "";
    email = tenant?.email ?? "";
  }

  const channel = input.channel ?? template.channel;
  const body = renderTemplate(input.templateKey, input.variables ?? {});
  const hasProvider =
    channel === "whatsapp"
      ? Boolean(process.env.WA_PROVIDER_TOKEN)
      : Boolean(process.env.SMTP_HOST);

  const missingRecipient = channel === "whatsapp" ? !recipient : !email;
  const simulated = !hasProvider;

  try {
    await prisma.notificationLog.create({
      data: {
        invoiceId: input.invoiceId ?? null,
        tenantId: input.tenantId ?? null,
        channel,
        templateKey: input.templateKey,
        payload: JSON.stringify({ body, to: channel === "whatsapp" ? recipient : email, simulated }),
        status: missingRecipient && !simulated ? "failed" : "sent",
        errorMessage: missingRecipient && !simulated ? "Nomor/email penerima tidak tersedia" : null,
        sentAt: new Date(),
      },
    });
  } catch (error) {
    console.error("[notify] gagal mencatat notifikasi:", error);
  }
}
