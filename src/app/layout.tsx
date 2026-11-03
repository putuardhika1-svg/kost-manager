import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#2b1e15",
};

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
