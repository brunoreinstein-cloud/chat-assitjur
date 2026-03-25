/**
 * RBAC — perfis e permissões do AssistJur.
 *
 * Hierarquia (crescente de permissões):
 *   cliente < paralegal < adv_junior < adv_pleno < adv_senior < socio
 *
 * Utilizadores sem role atribuído (null) têm rank 0:
 *   - Não podem aceder a funcionalidades de processo.
 *   - Compatibilidade retroactiva: utilizadores criados antes do RBAC
 *     recebem adv_pleno via migração 0031.
 */

export const ROLES = [
  "cliente",
  "paralegal",
  "adv_junior",
  "adv_pleno",
  "adv_senior",
  "socio",
] as const;

export type Role = (typeof ROLES)[number];

/** Rank numérico por role — maior = mais permissões. */
const ROLE_RANK: Record<Role, number> = {
  cliente: 1,
  paralegal: 2,
  adv_junior: 3,
  adv_pleno: 4,
  adv_senior: 5,
  socio: 6,
};

/** Retorna o rank do role (0 se null/desconhecido). */
export function roleRank(role: Role | string | null | undefined): number {
  if (!role) {
    return 0;
  }
  return ROLE_RANK[role as Role] ?? 0;
}

/** Verifica se userRole atinge o nível mínimo exigido. */
export function hasMinRole(
  userRole: Role | string | null | undefined,
  minRole: Role
): boolean {
  return roleRank(userRole) >= roleRank(minRole);
}

// ─── Permissões ──────────────────────────────────────────────────────────────

export type Permission =
  | "processo:create"
  | "processo:update"
  | "processo:delete"
  | "verba:update"
  | "peca:create"
  | "peca:approve"
  | "passivo:view"
  | "users:manage";

/** Role mínimo exigido para cada permissão. */
const PERMISSION_MIN_ROLE: Record<Permission, Role> = {
  "processo:create": "adv_junior",
  "processo:update": "adv_junior",
  "processo:delete": "adv_senior",
  "verba:update": "adv_junior",
  "peca:create": "adv_junior",
  "peca:approve": "adv_senior", // Apenas adv_senior e sócio podem aprovar/protocolar peças.
  "passivo:view": "adv_senior",
  "users:manage": "socio",
};

/** Retorna true se o role tem permissão para a acção. */
export function can(
  role: Role | string | null | undefined,
  permission: Permission
): boolean {
  const min = PERMISSION_MIN_ROLE[permission];
  return hasMinRole(role, min);
}

// ─── Labels ──────────────────────────────────────────────────────────────────

export const ROLE_LABEL: Record<Role, string> = {
  cliente: "Cliente (leitura)",
  paralegal: "Paralegal",
  adv_junior: "Advogado Júnior",
  adv_pleno: "Advogado Pleno",
  adv_senior: "Advogado Sénior",
  socio: "Sócio",
};

/** Descrição resumida das capacidades de cada role. */
export const ROLE_DESC: Record<Role, string> = {
  cliente:
    "Leitura de processos e documentos; não pode criar chats nem editar dados.",
  paralegal:
    "Pode criar chats e usar agentes; não pode criar ou editar processos.",
  adv_junior:
    "Cria e edita processos, verbas e peças; acesso completo a todos os agentes.",
  adv_pleno: "Igual ao Júnior com acesso prioritário a modelos avançados.",
  adv_senior: "Pode apagar processos e ver o painel de passivo agregado.",
  socio: "Acesso total incluindo gestão de perfis de utilizadores.",
};
