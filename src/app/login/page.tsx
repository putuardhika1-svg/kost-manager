import Link from "next/link";
import { Alert } from "@/components/ui";
import { loginAction } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; next?: string; ok?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand" style={{ padding: 0, marginBottom: 14 }}>
          <div className="brand-mark">KM</div>
          <div>
            <div className="brand-name" style={{ color: "var(--ink)" }}>
              KostManager
            </div>
            <div className="brand-sub">Sistem Manajemen Kost</div>
          </div>
        </div>

        <div className="auth-title">Masuk ke dashboard</div>
        <div className="auth-sub">Kelola kamar, tagihan, dan pembayaran kost Anda.</div>

        <Alert tone="error" message={params.err} />
        <Alert tone="success" message={params.ok} />

        <form action={loginAction}>
          <input type="hidden" name="next" value={params.next ?? "/dashboard"} />
          <div className="stack" style={{ gap: 14 }}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" autoComplete="email" required placeholder="nama@kost.local" />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" name="password" type="password" autoComplete="current-password" required placeholder="••••••••" />
            </div>
            <button className="btn btn-primary" type="submit" style={{ width: "100%", padding: "10px 14px" }}>
              Masuk
            </button>
          </div>
        </form>

        <div className="small muted" style={{ marginTop: 14, textAlign: "center" }}>
          Belum punya akun? <Link href="/daftar">Daftar sebagai penyewa</Link>
        </div>

        {process.env.NODE_ENV !== "production" ? (
          <div className="auth-demo">
            <strong>Akun demo (setelah seeding):</strong>
            <div>Owner — owner@kost.local / owner12345</div>
            <div>Admin — admin@kost.local / admin12345</div>
            <div>Staff — staff@kost.local / staff12345</div>
            <div>Penyewa — tenant@kost.local / tenant12345</div>
          </div>
        ) : null}

        <div className="small muted" style={{ marginTop: 14, textAlign: "center" }}>
          <Link href="/login">KostManager</Link> · MVP v0.1
        </div>
      </div>
    </div>
  );
}
