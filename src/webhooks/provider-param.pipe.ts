import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

const PROVIDER_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

/**
 * Validates the `:provider` path segment (slug, ≤64 chars — the column
 * length) so junk provider names get a 400 instead of reaching the DB.
 */
@Injectable()
export class ProviderParamPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!PROVIDER_PATTERN.test(value)) {
      throw new BadRequestException(
        'Provider must be alphanumeric (dashes/underscores allowed), max 64 characters',
      );
    }
    return value.toLowerCase();
  }
}
