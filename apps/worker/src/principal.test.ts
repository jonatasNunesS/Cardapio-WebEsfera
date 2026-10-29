import { fork } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const PRINCIPAL = fileURLToPath(new URL('./principal.ts', import.meta.url));

const LIMITE_PARA_SUBIR_O_PROCESSO_MS = 20_000;

describe('worker', () => {
  it(
    'sobe e encerra com código 0 ao receber SIGTERM',
    { timeout: LIMITE_PARA_SUBIR_O_PROCESSO_MS },
    async () => {
      const processo = fork(PRINCIPAL, {
        env: {
          NODE_ENV: 'test',
          APP_ENV: 'local',
          URL_REDIS: 'redis://127.0.0.1:1',
          URL_BANCO_WORKER: 'postgres://cardapio_worker:x@127.0.0.1:1/cardapio',
          URL_ARMAZENAMENTO: 'http://127.0.0.1:1',
          REGIAO_ARMAZENAMENTO: 'garage',
          CHAVE_ARMAZENAMENTO: 'chave',
          SEGREDO_ARMAZENAMENTO: 'segredo',
          BUCKET_ORIGINAIS: 'midia-originais',
          BUCKET_PUBLICO: 'midia-publica',
          URL_PUBLICA_MIDIA: 'http://midia-publica.web.localhost:3902',
        },
        stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      });

      const [mensagem] = (await once(processo, 'message')) as unknown[];
      expect(mensagem).toEqual({ situacao: 'pronto' });

      processo.kill('SIGTERM');
      const [codigo] = (await once(processo, 'exit')) as unknown[];
      expect(codigo).toBe(0);
    },
  );
});
