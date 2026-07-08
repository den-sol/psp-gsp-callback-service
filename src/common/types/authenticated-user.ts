/** Attached by AuthGuard; `brandId` is the authoritative tenant context. */
export interface AuthenticatedUser {
  userId: string;
  brandId: string;
  sessionId: string;
}
