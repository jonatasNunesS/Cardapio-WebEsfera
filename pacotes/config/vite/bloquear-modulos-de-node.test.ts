import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'vite';
import { describe, expect, it } from 'vitest';
import { bloquearModulosDeNode, ehProibidoNoNavegador } from './bloquear-modulos-de-node.ts';

async function construirComEntrada(codigo: string): Promise<void> {
  const raiz = mkdtempSync(path.join(tmpdir(), 'bundle-web-'));
  writeFileSync(path.join(raiz, 'index.html'), '<script type="module" src="./entrada.js"></script>');
  writeFileSync(path.join(raiz, 'entrada.js'), codigo);
  try {
    await build({
      root: raiz,
      logLevel: 'silent',
      configFile: false,
      plugins: [bloquearModulosDeNode()],
      build: { write: false },
    });
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
}

describe('bloqueio de módulos de Node no navegador', () => {
  it.each([
    'node:fs',
    'fs',
    'node:async_hooks',
    'pino',
    'pino/file',
    '@sentry/node',
    '@cardapio/observabilidade/node',
  ])('recusa %s', (fonte) => {
    expect(ehProibidoNoNavegador(fonte)).toBe(true);
  });

  it('recusa os arquivos de Node do pacote de observabilidade', () => {
    expect(ehProibidoNoNavegador('/repo/pacotes/observabilidade/src/node/logger.ts')).toBe(true);
    expect(ehProibidoNoNavegador('/repo/pacotes/observabilidade/src/contexto.ts')).toBe(true);
  });

  it.each(['react', 'react-dom/client', '@sentry/react', '@cardapio/observabilidade/web', '@cardapio/ui'])(
    'aceita %s',
    (fonte) => {
      expect(ehProibidoNoNavegador(fonte)).toBe(false);
    },
  );
});

describe('build do Vite com o bloqueio', () => {
  it('falha quando o código do navegador importa node:fs', async () => {
    await expect(
      construirComEntrada("import { readFileSync } from 'node:fs';\nreadFileSync('x');\n"),
    ).rejects.toThrow(/não pode entrar no bundle do navegador/);
  });

  it('passa com código só de navegador', async () => {
    await expect(construirComEntrada("document.title = 'ok';\n")).resolves.toBeUndefined();
  });
});
