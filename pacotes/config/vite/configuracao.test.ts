import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { httpsDaRedeLocal } from './configuracao.ts';

describe('HTTPS do servidor de desenvolvimento na rede local', () => {
  it('sem certificado, fica só no computador, em HTTP', () => {
    expect(httpsDaRedeLocal({ APP_ENV: 'local' })).toEqual({});
  });

  it('com certificado e chave, abre para a rede em HTTPS', () => {
    const pasta = mkdtempSync(path.join(tmpdir(), 'https-local-'));
    writeFileSync(path.join(pasta, 'cert.pem'), 'CERT');
    writeFileSync(path.join(pasta, 'chave.pem'), 'CHAVE');
    const config = httpsDaRedeLocal({
      APP_ENV: 'local',
      HTTPS_LOCAL_CERTIFICADO: path.join(pasta, 'cert.pem'),
      HTTPS_LOCAL_CHAVE: path.join(pasta, 'chave.pem'),
    });
    expect(config).toMatchObject({ host: '0.0.0.0' });
    expect(String('https' in config ? config.https.cert : '')).toBe('CERT');
  });

  it('recusa fora do ambiente local ou com só um dos dois arquivos', () => {
    expect(() =>
      httpsDaRedeLocal({ APP_ENV: 'producao', HTTPS_LOCAL_CERTIFICADO: 'a', HTTPS_LOCAL_CHAVE: 'b' }),
    ).toThrow(/APP_ENV=local/);
    expect(() => httpsDaRedeLocal({ APP_ENV: 'local', HTTPS_LOCAL_CERTIFICADO: 'a' })).toThrow(/vão juntos/);
  });
});
