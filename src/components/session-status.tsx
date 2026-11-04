"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}j ${minutes}m`;
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

export function SessionStatus({ expiresAt }: { expiresAt: number | null }) {
  const router = useRouter();
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!expiresAt) return;

    const tick = () => {
      const left = expiresAt - Date.now();
      setRemaining(left);
      if (left <= 0) {
        router.replace("/login?err=Sesi+berakhir,+silakan+masuk+kembali");
        router.refresh();
      }
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt, router]);

  if (!expiresAt) {
    return <div className="sidebar-session">Sesi login aktif</div>;
  }

  return (
    <div className="sidebar-session">
      {remaining === null
        ? "Sesi login aktif"
        : remaining > 0
          ? `Sesi aktif · sisa ${formatRemaining(remaining)}`
          : "Sesi berakhir"}
    </div>
  );
}
