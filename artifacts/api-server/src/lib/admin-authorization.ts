export type AdminAuthorizationPrincipal = {
  role?: string | null;
  active?: boolean | null;
  mfaEnabled?: boolean | null;
  mfaValid?: boolean;
};

export type AdminAuthorizationFailure = "authentication_required" | "admin_required" | "mfa_required" | null;

const ADMIN_ONLY_ROLES = new Set(["admin"]);

export function getAdminAuthorizationFailure(
  principal: AdminAuthorizationPrincipal,
  allowedRoles: ReadonlySet<string> = ADMIN_ONLY_ROLES,
): AdminAuthorizationFailure {
  if (!principal.role) return "authentication_required";
  if (!allowedRoles.has(principal.role) || principal.active !== true) return "admin_required";
  if (principal.mfaEnabled === true && principal.mfaValid !== true) return "mfa_required";
  return null;
}
