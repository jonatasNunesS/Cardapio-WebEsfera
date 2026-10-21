import { isBuiltin } from 'node:module';
import type { Plugin } from 'vite';

const PACOTES_PROIBIDOS = ['pino', '@sentry/node', '@cardapio/observabilidade/node'];

export function ehProibidoNoNavegador(fonte: string): boolean {
  return (
    isBuiltin(fonte) ||
    PACOTES_PROIBIDOS.some((pacote) => fonte === pacote || fonte.startsWith(`${pacote}/`)) ||
    /observabilidade\/src\/(?:node\/|contexto\.ts)/.test(fonte)
  );
}

export function bloquearModulosDeNode(): Plugin {
  return {
    name: 'cardapio:bloquear-modulos-de-node',
    enforce: 'pre',
    resolveId(fonte, importador) {
      if (ehProibidoNoNavegador(fonte)) {
        this.error(
          `"${fonte}" (importado por ${importador ?? 'entrada'}) não pode entrar no bundle do navegador. Ver docs/adr/0005-observabilidade.md`,
        );
      }
      return null;
    },
  };
}
