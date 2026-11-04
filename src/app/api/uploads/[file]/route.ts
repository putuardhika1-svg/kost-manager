import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { propertyScope, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { UPLOAD_DIR } from "@/lib/upload";
import { createSignedUrl, storageConfigured } from "@/lib/storage";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ file: string }> },
): Promise<NextResponse> {
  const user = await requireUser();
  const { file } = await context.params;

  if (!/^[a-z0-9-]+\.(jpg|jpeg|png|webp|pdf)$/i.test(file)) {
    return new NextResponse("Berkas tidak ditemukan", { status: 404 });
  }

  const proofUrl = `/api/uploads/${file}`;
  let allowed = false;

  const payment = await prisma.payment.findFirst({
    where: { proofUrl },
    select: {
      invoice: {
        select: {
          contract: {
            select: {
              tenantId: true,
              room: { select: { propertyId: true } },
            },
          },
        },
      },
    },
  });

  if (payment) {
    const contract = payment.invoice.contract;
    allowed =
      user.role === "owner" ||
      (user.role === "tenant" && user.tenant?.id === contract.tenantId);

    if (!allowed && (user.role === "admin" || user.role === "staff")) {
      const scope = await propertyScope(user);
      allowed = scope === null || scope.includes(contract.room.propertyId);
    }
  } else {
    const avatarOwner = await prisma.user.findFirst({
      where: { avatarUrl: proofUrl },
      select: { id: true },
    });

    if (avatarOwner) {
      allowed = true;
    } else {
      const channel = await prisma.paymentChannel.findFirst({
        where: { qrisUrl: proofUrl },
        select: { propertyId: true },
      });
      if (channel) {
        allowed = user.role === "owner";
        if (!allowed && (user.role === "admin" || user.role === "staff")) {
          const scope = await propertyScope(user);
          allowed = scope === null || scope.includes(channel.propertyId);
        }
        if (!allowed && user.role === "tenant" && user.tenant) {
          const contracts = await prisma.contract.count({
            where: {
              tenantId: user.tenant.id,
              room: { propertyId: channel.propertyId },
            },
          });
          allowed = contracts > 0;
        }
      } else {
        const reading = await prisma.meterReading.findFirst({
          where: { photoUrl: proofUrl },
          select: {
            tenantId: true,
            room: { select: { propertyId: true } },
          },
        });
        if (reading) {
          allowed =
            user.role === "owner" ||
            (user.role === "tenant" && user.tenant?.id === reading.tenantId);
          if (!allowed && (user.role === "admin" || user.role === "staff")) {
            const scope = await propertyScope(user);
            allowed = scope === null || scope.includes(reading.room.propertyId);
          }
        }
      }
    }
  }

  if (!allowed) {
    return new NextResponse("Berkas tidak ditemukan", { status: 404 });
  }

  if (storageConfigured()) {
    const signed = await createSignedUrl(file);
    if (!signed) {
      return new NextResponse("Berkas tidak ditemukan", { status: 404 });
    }
    return NextResponse.redirect(signed);
  }

  try {
    const data = await readFile(path.join(UPLOAD_DIR, path.basename(file)));
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream",
        "Content-Disposition": `inline; filename="${file}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new NextResponse("Berkas tidak ditemukan", { status: 404 });
  }
}
