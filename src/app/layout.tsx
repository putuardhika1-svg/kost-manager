import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KostManager — Sistem Manajemen Kost",
  description: "Kelola kamar, penyewa, tagihan, dan pembayaran kost dalam satu dashboard.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
