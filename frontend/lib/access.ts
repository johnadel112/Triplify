import type { User, UserRole } from "./types";
export function accessDecision(
  user: User | null,
  path: string,
  roles?: UserRole[],
) {
  if (!user) return "login";
  if (
    !["USER", "ADMIN", "AIRLINE_MODERATOR", "HOTEL_MODERATOR"].includes(
      user.role,
    ) ||
    user.status !== "ACTIVE"
  )
    return "denied";
  if (user.mustChangePassword && path !== "/account/security")
    return "password";
  if (roles && !roles.includes(user.role)) return "denied";
  return "allow";
}
