"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="id">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
        <h1>KostManager mengalami gangguan</h1>
        <p>Silakan muat ulang halaman.</p>
        {error.digest ? <p style={{ fontFamily: "monospace" }}>Ref: {error.digest}</p> : null}
        <button type="button" onClick={reset}>
          Coba lagi
        </button>
      </body>
    </html>
  );
}
