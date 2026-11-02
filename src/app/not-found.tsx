import Link from "next/link";

export default function NotFound() {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-title">Halaman tidak ditemukan</div>
        <div className="auth-sub">Data atau halaman yang Anda cari tidak tersedia.</div>
        <Link className="btn btn-primary" href="/dashboard" style={{ width: "100%" }}>
          Kembali ke dashboard
        </Link>
      </div>
    </div>
  );
}
