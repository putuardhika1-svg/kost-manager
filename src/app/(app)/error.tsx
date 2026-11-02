"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] error boundary:", error);
  }, [error]);

  return (
    <section className="card">
      <div className="card-body">
        <h1>Terjadi kesalahan</h1>
        <p className="muted small" style={{ marginTop: 8 }}>
          Halaman gagal dimuat. Coba muat ulang; jika masih gagal, hubungi admin dengan kode
          referensi di bawah.
        </p>
        {error.digest ? <p className="mono small">Ref: {error.digest}</p> : null}
        <div className="form-actions">
          <button className="btn btn-primary" type="button" onClick={reset}>
            Coba lagi
          </button>
          <a className="btn" href="/dashboard">
            Ke dashboard
          </a>
        </div>
      </div>
    </section>
  );
}
