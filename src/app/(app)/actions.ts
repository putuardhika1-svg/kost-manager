"use server";

import { redirect } from "next/navigation";
import { clearSessionCookie, getSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function logoutAction(): Promise<void> {
  const session = await getSession();
  if (session) {
    await logAudit({ userId: session.sub, action: "auth.logout", entity: "User", entityId: session.sub });
  }
  await clearSessionCookie();
  redirect("/login");
}
