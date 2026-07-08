/**
 * Request-scoped identity attached by `AuthGuard` after a valid session token.
 * `brandId` here is the authoritative tenant context — queries scope by it,
 * never by a client-supplied value.
 */
export interface AuthenticatedUser {
  userId: string;
  brandId: string;
  sessionId: string;
}
