import { describe, expect, it } from 'vitest';
import { comandosDeEnvio } from './enviar-mapas-backend.ts';

describe('enviar-mapas-backend', () => {
  it('cria a release, envia os mapas do dist e finaliza', () => {
    expect(comandosDeEnvio('api', 'api@0.0.0+a1b2c3d', 'cardapio-backend')).toEqual([
      ['releases', 'new', 'api@0.0.0+a1b2c3d', '--project', 'cardapio-backend'],
      [
        'sourcemaps',
        'upload',
        '--release',
        'api@0.0.0+a1b2c3d',
        '--project',
        'cardapio-backend',
        'apps/api/dist',
      ],
      ['releases', 'finalize', 'api@0.0.0+a1b2c3d', '--project', 'cardapio-backend'],
    ]);
  });
});
