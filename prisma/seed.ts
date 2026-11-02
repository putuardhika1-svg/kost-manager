import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

if (process.env.CONFIRM_DESTRUCTIVE_SEED !== "1" && !process.argv.includes("--force")) {
  console.error(
    "Seed demo MENGHAPUS seluruh data. Jalankan dengan CONFIRM_DESTRUCTIVE_SEED=1 jika benar-benar yakin.",
  );
  process.exit(1);
}

const DAY = 86_400_000;

function utc(year: number, month: number, day = 1): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function periodEnd(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

function money(value: number): number {
  return value;
}

async function main() {
  console.log("Membersihkan data lama...");
  await prisma.notificationLog.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoiceItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.maintenance.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.room.deleteMany();
  await prisma.property.deleteMany();
  await prisma.userProperty.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
  await prisma.setting.deleteMany();

  console.log("Membuat pengguna demo...");
  const [ownerHash, adminHash, staffHash, tenantHash] = await Promise.all([
    bcrypt.hash("owner12345", 10),
    bcrypt.hash("admin12345", 10),
    bcrypt.hash("staff12345", 10),
    bcrypt.hash("tenant12345", 10),
  ]);

  const owner = await prisma.user.create({
    data: {
      name: "Budi Santoso",
      email: "owner@kost.local",
      passwordHash: ownerHash,
      phone: "081200000001",
      role: "owner",
    },
  });

  const admin = await prisma.user.create({
    data: {
      name: "Rina Wati",
      email: "admin@kost.local",
      passwordHash: adminHash,
      phone: "081200000002",
      role: "admin",
    },
  });

  const staff = await prisma.user.create({
    data: {
      name: "Joko Prasetyo",
      email: "staff@kost.local",
      passwordHash: staffHash,
      phone: "081200000003",
      role: "staff",
    },
  });

  console.log("Membuat properti & kamar...");
  const mawar = await prisma.property.create({
    data: {
      name: "Kost Mawar",
      code: "MWR",
      address: "Jl. Kaliurang KM 5 No. 12",
      city: "Yogyakarta",
      notes: "Kost putri, 8 kamar, dekat kampus.",
    },
  });

  const melati = await prisma.property.create({
    data: {
      name: "Kost Melati",
      code: "MLT",
      address: "Jl. Dipatiukur No. 88",
      city: "Bandung",
      notes: "Kost campur, 6 kamar, dekat pusat kota.",
    },
  });

  await prisma.userProperty.createMany({
    data: [
      { userId: admin.id, propertyId: mawar.id },
      { userId: staff.id, propertyId: mawar.id },
      { userId: staff.id, propertyId: melati.id },
    ],
  });

  const mawarRooms = [
    { number: "101", floor: 1, price: 1_200_000, type: "Standard" },
    { number: "102", floor: 1, price: 1_200_000, type: "Standard" },
    { number: "103", floor: 1, price: 1_200_000, type: "Standard" },
    { number: "104", floor: 1, price: 1_350_000, type: "Standard Plus" },
    { number: "201", floor: 2, price: 1_500_000, type: "Deluxe" },
    { number: "202", floor: 2, price: 1_500_000, type: "Deluxe" },
    { number: "203", floor: 2, price: 1_500_000, type: "Deluxe" },
    { number: "204", floor: 2, price: 1_500_000, type: "Deluxe" },
  ];

  const melatiRooms = [
    { number: "A1", floor: 1, price: 900_000, type: "Standard" },
    { number: "A2", floor: 1, price: 900_000, type: "Standard" },
    { number: "A3", floor: 1, price: 900_000, type: "Standard" },
    { number: "B1", floor: 2, price: 1_000_000, type: "Standard Plus" },
    { number: "B2", floor: 2, price: 1_000_000, type: "Standard Plus" },
    { number: "B3", floor: 2, price: 1_000_000, type: "Standard Plus" },
  ];

  const facilities = JSON.stringify(["Kasur", "Lemari", "Meja", "Kamar mandi dalam"]);

  const roomRecords = [];
  for (const room of mawarRooms) {
    roomRecords.push(
      await prisma.room.create({
        data: {
          propertyId: mawar.id,
          number: room.number,
          floor: room.floor,
          type: room.type,
          monthlyPrice: room.price,
          status: "kosong",
          facilities,
        },
      }),
    );
  }
  for (const room of melatiRooms) {
    roomRecords.push(
      await prisma.room.create({
        data: {
          propertyId: melati.id,
          number: room.number,
          floor: room.floor,
          type: room.type,
          monthlyPrice: room.price,
          status: "kosong",
          facilities,
        },
      }),
    );
  }

  console.log("Membuat penyewa & kontrak...");
  const tenantSeed = [
    { name: "Sari Dewi", phone: "081234567801", email: "sari@mail.com", origin: "Sleman" },
    { name: "Andi Kurniawan", phone: "081234567802", email: "andi@mail.com", origin: "Klaten" },
    { name: "Maya Lestari", phone: "081234567803", email: "maya@mail.com", origin: "Bantul" },
    { name: "Rizky Ramadhan", phone: "081234567804", email: "rizky@mail.com", origin: "Solo" },
    { name: "Nadia Putri", phone: "081234567805", email: "nadia@mail.com", origin: "Semarang" },
    { name: "Fajar Nugroho", phone: "081234567806", email: "fajar@mail.com", origin: "Cimahi" },
  ];

  const tenants = [];
  for (const item of tenantSeed) {
    tenants.push(
      await prisma.tenant.create({
        data: {
          name: item.name,
          phone: item.phone,
          email: item.email,
          idNumber: `3404${Math.floor(Math.random() * 1_000_000)}`,
          emergencyContact: item.phone,
          addressOrigin: item.origin,
          status: "aktif",
        },
      }),
    );
  }

  await prisma.user.create({
    data: {
      name: tenants[0].name,
      email: "tenant@kost.local",
      passwordHash: tenantHash,
      phone: tenants[0].phone,
      role: "tenant",
      tenantId: tenants[0].id,
    },
  });

  const now = new Date();
  const current = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
  const startPeriod = shiftMonth(current.year, current.month, -3);

  const contracts = [];
  for (let index = 0; index < tenants.length; index += 1) {
    const room = roomRecords[index];
    const tenant = tenants[index];
    const contract = await prisma.contract.create({
      data: {
        tenantId: tenant.id,
        roomId: room.id,
        startDate: utc(startPeriod.year, startPeriod.month, 1),
        endDate: utc(startPeriod.year + 1, startPeriod.month, 28),
        rentAmount: room.monthlyPrice,
        deposit: room.monthlyPrice,
        billingDay: 1,
        status: "active",
        notes: "Kontrak demo 12 bulan",
      },
    });
    await prisma.room.update({ where: { id: room.id }, data: { status: "terisi" } });
    contracts.push({ contract, room, tenant });
  }

  console.log("Membuat tagihan & pembayaran...");
  const periods = [
    shiftMonth(current.year, current.month, -2),
    shiftMonth(current.year, current.month, -1),
    current,
  ];

  const sequence = new Map<string, number>();

  for (const { contract, room, tenant } of contracts) {
    const propertyCode = room.propertyId === mawar.id ? "MWR" : "MLT";

    for (const period of periods) {
      const isCurrent = period.year === current.year && period.month === current.month;
      const periodStart = utc(period.year, period.month, 1);
      const periodEndDate = periodEnd(period.year, period.month);
      const dueDate = utc(period.year, period.month, contract.billingDay);
      const key = `${propertyCode}-${period.year}${period.month}`;
      const seq = (sequence.get(key) ?? 0) + 1;
      sequence.set(key, seq);

      const invoiceNo = `INV/${propertyCode}/${period.year}${String(period.month).padStart(2, "0")}/${String(seq).padStart(3, "0")}`;
      const total = money(contract.rentAmount);

      const invoice = await prisma.invoice.create({
        data: {
          contractId: contract.id,
          invoiceNo,
          periodStart,
          periodEnd: periodEndDate,
          issueDate: periodStart,
          dueDate,
          subtotal: total,
          additionalTotal: 0,
          total,
          paidTotal: 0,
          status: isCurrent ? "unpaid" : "unpaid",
          source: "auto",
          items: {
            create: [
              {
                description: `Sewa kamar ${room.number} periode ${period.month}/${period.year}`,
                type: "rent",
                amount: total,
              },
            ],
          },
        },
      });

      await prisma.notificationLog.create({
        data: {
          invoiceId: invoice.id,
          tenantId: tenant.id,
          channel: "whatsapp",
          templateKey: "N-01",
          payload: JSON.stringify({ nama: tenant.name, jumlah: total }),
          status: "sent",
          sentAt: periodStart,
        },
      });

      if (!isCurrent) {
        const paidAt = new Date(dueDate.getTime() - 2 * DAY);
        await prisma.payment.create({
          data: {
            invoiceId: invoice.id,
            method: seq % 2 === 0 ? "cash" : "transfer",
            amount: total,
            paidAt,
            status: "verified",
            verifiedById: admin.id,
            verifiedAt: paidAt,
            notes: "Pembayaran demo",
          },
        });
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: { paidTotal: total, status: "paid" },
        });
      } else if (seq === 2) {
        // satu pembayaran menunggu verifikasi sebagai contoh antrean
        await prisma.payment.create({
          data: {
            invoiceId: invoice.id,
            method: "transfer",
            amount: total,
            paidAt: new Date(now.getTime() - 2 * DAY),
            status: "pending",
            notes: "Menunggu verifikasi admin",
          },
        });
      }
    }
  }

  console.log("Menandai tunggakan & membuat tiket perbaikan...");
  await prisma.invoice.updateMany({
    where: { status: "unpaid", dueDate: { lt: new Date() } },
    data: { status: "overdue" },
  });

  await prisma.maintenance.createMany({
    data: [
      {
        roomId: roomRecords[4].id,
        tenantId: tenants[4].id,
        title: "AC tidak dingin",
        description: "AC menyala tetapi tidak dingin sejak dua hari lalu.",
        category: "listrik",
        priority: "tinggi",
        status: "diproses",
        assignedTo: "Teknisi AC Pak Anto",
      },
      {
        roomId: roomRecords[1].id,
        tenantId: tenants[1].id,
        title: "Kran kamar mandi bocor",
        description: "Air menetes terus walau kran sudah ditutup.",
        category: "air",
        priority: "sedang",
        status: "baru",
      },
    ],
  });

  await prisma.setting.createMany({
    data: [
      { key: "app.name", value: "KostManager" },
      { key: "billing.dueDay", value: "1" },
      { key: "notification.channel", value: "whatsapp" },
    ],
  });

  await prisma.auditLog.create({
    data: {
      userId: owner.id,
      action: "seed.run",
      entity: "System",
      payload: JSON.stringify({ at: new Date().toISOString() }),
    },
  });

  const counts = {
    users: await prisma.user.count(),
    properties: await prisma.property.count(),
    rooms: await prisma.room.count(),
    tenants: await prisma.tenant.count(),
    contracts: await prisma.contract.count(),
    invoices: await prisma.invoice.count(),
    payments: await prisma.payment.count(),
  };
  console.log("Seed selesai:", counts);
}

main()
  .catch((error) => {
    console.error("Seed gagal:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
