/**
 * Guards de RBAC para server actions e route handlers.
 * Importar apenas em ficheiros server-only (actions, route.ts, queries).
 */
import "server-only";

import { auth } from "@/app/(auth)/auth";
import { can, type Permission, type Role } from "./roles";

// ─── Erro ────────────────────────────────────────────────────────────────────

export class RbacError extends Error {
  readonly permission: Permission;
  readonly userRole: string | null;

  constructor(permission: Permission, userRole: string | null) {
    const roleStr = userRole ?? "sem perfil";
    super(
      `Permissão insuficiente para "${permission}". Perfil actual: ${roleStr}.`
    );
    this.name = "RbacError";
    this.permission = permission;
    this.userRole = userRole;
  }
}

// ─── Helpers públicos ─────────────────────────────────────────────────────────

/**
 * Lê o role da sessão actual a partir do JWT (sem hit à BD).
 * Retorna null se não autenticado ou sem role atribuído.
 */
export async function getSessionRole(): Promise<{
  userId: string | null;
  role: Role | null;
}> {
  const session = await auth();
  if (!session?.user?.id) {
    return { userId: null, role: null };
  }
  return {
    userId: session.user.id,
    role: (session.user.role as Role | null | undefined) ?? null,
  };
}

/**
 * Verifica se o utilizador tem permissão para a acção.
 * Lança RbacError se não tiver (para uso em server actions com try/catch).
 * Retorna { userId, role } para uso subsequente.
 */
export async function requirePermission(permission: Permission): Promise<{
  userId: string;
  role: Role | null;
}> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new RbacError(permission, null);
  }
  const role = (session.user.role as Role | null | undefined) ?? null;
  if (!can(role, permission)) {
    throw new RbacError(permission, role);
  }
  return { userId: session.user.id, role };
}

/**
 * Versão que retorna resultado em vez de lançar excepção.
 * Útil para condicionais em componentes de servidor.
 */
export async function checkPermission(
  permission: Permission
): Promise<boolean> {
  try {
    await requirePermission(permission);
    return true;
  } catch {
    return false;
  }
}
