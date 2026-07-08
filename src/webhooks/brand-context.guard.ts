import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

export const BRAND_ID_HEADER = 'x-brand-id';

/**
 * Webhooks carry no session, so tenant context comes from the `X-Brand-Id`
 * header — but only after validation against the configured brand list
 * (`KNOWN_BRANDS`, comma-separated). An unknown brand is rejected before
 * anything touches storage; downstream code reads `req.brandId` only.
 */
@Injectable()
export class BrandContextGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const brandId = req.header(BRAND_ID_HEADER)?.trim();
    if (!brandId) {
      throw new BadRequestException('Missing X-Brand-Id header');
    }
    if (!this.knownBrands().includes(brandId)) {
      throw new ForbiddenException('Unknown brand');
    }
    req.brandId = brandId;
    return true;
  }

  private knownBrands(): string[] {
    return (this.config.get<string>('KNOWN_BRANDS') ?? 'brand-a,brand-b')
      .split(',')
      .map((b) => b.trim())
      .filter(Boolean);
  }
}
