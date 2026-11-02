import "server-only";
import { prisma } from "./db";

type AuditInput = {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  payload?: unknown;
  ipAddress?: string | null;
};

/**
 * Mencatat aksi perubahan data. Tidak pernah melempar error ke pemanggil
 * agar kegagalan audit tidak menggagalkan transaksi bisnis.
 */
export async function logAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        payload: input.payload ? JSON.stringify(input.payload).slice(0, 4000) : null,
        ipAddress: input.ipAddress ?? null,
      },
    });
  } catch (error) {
    console.error("[audit] gagal mencatat log:", error);
  }
}
