import type { RelatorDeErros } from '@cardapio/aplicacao';
import { criarAssinanteRedis, criarRepositorioDaEquipe, type AcessoAoBanco } from '@cardapio/infraestrutura';
import type { OpcoesDoIntermediario } from '../intermediario/registrar.ts';

// INTERMEDIARIO: composição da fila e do tempo real: docs/adr/0017-intermediario-essencial.md
export function comporIntermediario(
  ambiente: { readonly URL_REDIS: string; readonly DOMINIO_CARDAPIO: string },
  banco: AcessoAoBanco,
  relator: RelatorDeErros,
): OpcoesDoIntermediario {
  return {
    equipe: { equipe: criarRepositorioDaEquipe(banco), relogio: { agora: () => new Date() } },
    assinante: criarAssinanteRedis(ambiente.URL_REDIS, relator),
    hostPublico: ambiente.DOMINIO_CARDAPIO,
  };
}
