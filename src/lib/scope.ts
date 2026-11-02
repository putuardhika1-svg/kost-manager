import type { Prisma } from "@prisma/client";

/** Filter properti sesuai scope user. null = owner (semua properti). */
export function propertyScopeWhere(scope: string[] | null): Prisma.PropertyWhereInput {
  return scope === null ? {} : { id: { in: scope } };
}

export function roomScopeWhere(scope: string[] | null): Prisma.RoomWhereInput {
  return scope === null ? {} : { propertyId: { in: scope } };
}

export function contractScopeWhere(scope: string[] | null): Prisma.ContractWhereInput {
  return scope === null ? {} : { room: { propertyId: { in: scope } } };
}

export function invoiceScopeWhere(scope: string[] | null): Prisma.InvoiceWhereInput {
  return scope === null ? {} : { contract: { room: { propertyId: { in: scope } } } };
}

export function paymentScopeWhere(scope: string[] | null): Prisma.PaymentWhereInput {
  return scope === null
    ? {}
    : { invoice: { contract: { room: { propertyId: { in: scope } } } } };
}

export function maintenanceScopeWhere(scope: string[] | null): Prisma.MaintenanceWhereInput {
  return scope === null ? {} : { room: { propertyId: { in: scope } } };
}

export function tenantScopeWhere(scope: string[] | null): Prisma.TenantWhereInput {
  if (scope === null) return {};
  return {
    OR: [
      { contracts: { none: {} } },
      { contracts: { some: { room: { propertyId: { in: scope } } } } },
    ],
  };
}

/** Filter tagihan milik satu penyewa (portal penyewa). */
export function tenantInvoiceWhere(tenantId: string): Prisma.InvoiceWhereInput {
  return { contract: { tenantId } };
}

export function tenantMaintenanceWhere(tenantId: string): Prisma.MaintenanceWhereInput {
  return { tenantId };
}
