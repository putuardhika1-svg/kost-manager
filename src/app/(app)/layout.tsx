import { getSession, requireUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/constants";
import { NavLink } from "@/components/nav-link";
import { SessionStatus } from "@/components/session-status";
import { PhotoInput } from "@/components/photo-input";
import { logoutAction, removeAvatarAction, updateAvatarAction } from "./actions";

type NavItem = { href: string; label: string; roles: string[] };

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", roles: ["owner", "admin", "staff", "tenant"] },
  { href: "/properti", label: "Properti", roles: ["owner", "admin"] },
  { href: "/kamar", label: "Kamar", roles: ["owner", "admin", "staff"] },
  { href: "/penyewa", label: "Penyewa", roles: ["owner", "admin"] },
  { href: "/kontrak", label: "Kontrak", roles: ["owner", "admin"] },
  { href: "/tagihan", label: "Tagihan", roles: ["owner", "admin", "tenant"] },
  { href: "/meter", label: "Meter Listrik", roles: ["owner", "admin", "staff", "tenant"] },
  { href: "/pembayaran", label: "Pembayaran", roles: ["owner", "admin"] },
  { href: "/maintenance", label: "Perbaikan", roles: ["owner", "admin", "staff", "tenant"] },
  { href: "/laporan", label: "Laporan", roles: ["owner", "admin"] },
  { href: "/pengaturan", label: "Pengaturan", roles: ["owner"] },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const session = await getSession();
  const items = NAV.filter((item) => item.roles.includes(user.role));
  const roleLabel = ROLE_LABELS[user.role] ?? user.role;
  const expiresAt = session?.exp ? session.exp * 1000 : null;
  const initials =
    user.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "U";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-profile">
          <div className="profile-avatar">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt={`Foto ${user.name}`} />
            ) : (
              <span>{initials}</span>
            )}
          </div>
          <div className="profile-meta">
            <div className="profile-name">{user.name}</div>
            <div className="profile-role">{roleLabel}</div>
            <details className="profile-edit">
              <summary>Ganti foto</summary>
              <form action={updateAvatarAction}>
                <PhotoInput name="avatar" required facingMode="user" watermark={false} />
                <button className="btn btn-sm" type="submit">
                  Simpan foto
                </button>
              </form>
              {user.avatarUrl ? (
                <form action={removeAvatarAction}>
                  <button className="btn btn-sm btn-danger" type="submit">
                    Hapus foto
                  </button>
                </form>
              ) : null}
            </details>
          </div>
        </div>

        <div className="nav-section" style={{ paddingTop: 4 }}>
          Menu
        </div>
        <nav className="nav">
          {items.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} />
          ))}
        </nav>

        <div className="sidebar-footer">
          <SessionStatus expiresAt={expiresAt} />
          <form action={logoutAction}>
            <button className="btn btn-sm" type="submit">
              Keluar
            </button>
          </form>
        </div>
      </aside>

      <div className="main">
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
