import { Repository } from 'typeorm';
import { IdempotencyKey } from '../persistence/entities/idempotency-key.entity';
import { IdempotencyService, stableStringify } from './idempotency.service';

describe('IdempotencyService (key derivation — no DB)', () => {
  // Derivation/hashing never touch the repository.
  const service = new IdempotencyService(
    undefined as unknown as Repository<IdempotencyKey>,
  );

  describe('deriveKey', () => {
    it('prefers the Idempotency-Key header over payload ids', () => {
      expect(
        service.deriveKey('  header-key-1  ', { id: 'evt-1', event_id: 'e2' }),
      ).toBe('header-key-1');
    });

    it('falls back to payload.id when no header is sent', () => {
      expect(service.deriveKey(undefined, { id: 'evt-42' })).toBe('evt-42');
    });

    it('falls back to payload.event_id when id is absent', () => {
      expect(service.deriveKey(undefined, { event_id: 'prov-7' })).toBe(
        'prov-7',
      );
    });

    it('prefers payload.id over payload.event_id', () => {
      expect(
        service.deriveKey(undefined, { id: 'first', event_id: 'second' }),
      ).toBe('first');
    });

    it('accepts numeric event ids', () => {
      expect(service.deriveKey(undefined, { id: 12345 })).toBe('12345');
    });

    it('ignores blank/whitespace header and ids', () => {
      expect(service.deriveKey('   ', { id: '  ', event_id: '' })).toBeNull();
    });

    it('ignores non-scalar ids (objects, booleans, NaN)', () => {
      expect(
        service.deriveKey(undefined, {
          id: { nested: true },
          event_id: NaN,
        }),
      ).toBeNull();
    });

    it('returns null when nothing usable is present', () => {
      expect(service.deriveKey(undefined, { amount: 10 })).toBeNull();
    });
  });

  describe('hashRequest', () => {
    it('is insensitive to object key order', () => {
      const a = service.hashRequest({ x: 1, y: { b: 2, a: 3 } });
      const b = service.hashRequest({ y: { a: 3, b: 2 }, x: 1 });
      expect(a).toBe(b);
    });

    it('differs for different payloads', () => {
      expect(service.hashRequest({ amount: 10 })).not.toBe(
        service.hashRequest({ amount: 11 }),
      );
    });
  });

  describe('stableStringify', () => {
    it('sorts keys recursively and preserves arrays in order', () => {
      expect(stableStringify({ b: [2, 1], a: { d: 4, c: 3 } })).toBe(
        '{"a":{"c":3,"d":4},"b":[2,1]}',
      );
    });
  });
});
