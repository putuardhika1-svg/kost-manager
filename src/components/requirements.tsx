import { Badge } from "./ui";
import type { RequirementItem } from "@/lib/requirements";

export function RequirementList({
  items,
  waived,
}: {
  items: RequirementItem[];
  waived?: boolean;
}) {
  return (
    <div>
      {waived ? (
        <div className="alert alert-info" style={{ marginBottom: 10 }}>
          Syarat diterbitkan dengan override admin.
        </div>
      ) : null}
      <ul className="req-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {items.map((item) => (
          <li
            key={item.key}
            className="row between"
            style={{ gap: 12, padding: "8px 0", borderBottom: "1px solid #eceef1" }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>{item.label}</div>
              {item.detail ? <div className="small muted">{item.detail}</div> : null}
              {item.adminOnly ? <div className="small muted">Ditangani admin</div> : null}
            </div>
            <Badge tone={item.ok ? "green" : "amber"}>{item.ok ? "Lengkap" : "Belum"}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}
