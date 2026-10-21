import { describe, expect, it } from 'vitest';
import { montarRelease } from './release.ts';

describe('montarRelease', () => {
  it('usa o app, a versão e o sha curto', () => {
    expect(montarRelease('api', '1.4.2', 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678')).toBe(
      'api@1.4.2+a1b2c3d',
    );
  });

  it('marca como local quando não há commit', () => {
    expect(montarRelease('painel', '0.0.0', undefined)).toBe('painel@0.0.0+local');
  });
});
