export type UserRole = "user" | "admin" | "coach";

export interface IdentityModel {
  userId: string;
  clientId?: string;
  role: UserRole;
}
