import "server-only";
import { redirect } from "next/navigation";
import { getSessionUser, type SessionUser } from "@/lib/auth/session";
import { moduloPermitido, type ModuloKey } from "@/lib/auth/permissoes";

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function requireModulo(modulo: ModuloKey): Promise<SessionUser> {
  const user = await requireUser();
  if (!moduloPermitido(user, modulo)) {
    redirect("/");
  }
  return user;
}
