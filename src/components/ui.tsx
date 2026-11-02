import type { ReactNode } from "react";
import type { Tone } from "@/lib/constants";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="row between" style={{ marginBottom: 18 }}>
      <div>
        <h1>{title}</h1>
        {subtitle ? <div className="muted small" style={{ marginTop: 4 }}>{subtitle}</div> : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </div>
  );
}

export function Card({
  title,
  actions,
  children,
  tight,
  description,
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  tight?: boolean;
  description?: string;
}) {
  return (
    <section className="card">
      {title || actions ? (
        <div className="card-header">
          <div>
            <h2>{title}</h2>
            {description ? <div className="muted small">{description}</div> : null}
          </div>
          {actions ? <div className="row">{actions}</div> : null}
        </div>
      ) : null}
      <div className={tight ? "card-body tight" : "card-body"}>{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint ? <div className="stat-hint">{hint}</div> : null}
    </div>
  );
}

export function Badge({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function StatusBadge({
  map,
  value,
}: {
  map: Record<string, { label: string; tone: Tone }>;
  value: string;
}) {
  const entry = map[value];
  if (!entry) return <Badge tone="gray">{value}</Badge>;
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}

export function Alert({ tone, message }: { tone: "error" | "success" | "info"; message?: string }) {
  if (!message) return null;
  return <div className={`alert alert-${tone}`}>{message}</div>;
}

export function Flash({
  error,
  ok,
}: {
  error?: string | string[];
  ok?: string | string[];
}) {
  const err = Array.isArray(error) ? error[0] : error;
  const success = Array.isArray(ok) ? ok[0] : ok;
  return (
    <>
      <Alert tone="error" message={err} />
      <Alert tone="success" message={success} />
    </>
  );
}

export function Empty({ title, description }: { title: string; description?: string }) {
  return (
    <div className="empty">
      <div className="empty-title">{title}</div>
      {description ? <div className="small">{description}</div> : null}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  full,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? "field full" : "field"}>
      <label>{label}</label>
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}
