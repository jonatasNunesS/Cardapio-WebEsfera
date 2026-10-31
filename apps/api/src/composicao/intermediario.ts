import type { RelatorDeErros } from '@cardapio/aplicacao';
import {
  criarAssinanteRedis,
  criarRepositorioDaEquipe,
  criarRepositorioDaPlataforma,
  enviadorConviteManual,
  type AcessoAoBanco,
} from '@cardapio/infraestrutura';
import type { DependenciasDeIdentidade } from '../identidade/dependencias.ts';
import type { OpcoesDoIntermediario } from '../intermediario/registrar.ts';

export interface AmbienteDoIntermediario {
  readonly URL_REDIS: string;
  readonly DOMINIO_CARDAPIO: string;
  readonly URL_PAINEL: string;
  readonly URL_SENTRY_DO_ADMIN?: string | undefined;
}

// INTERMEDIARIO: composição da fila, do tempo real e do admin mínimo: docs/adr/0017-intermediario-essencial.md
export function comporIntermediario(
  ambiente: AmbienteDoIntermediario,
  banco: AcessoAoBanco,
  identidade: DependenciasDeIdentidade,
  relator: RelatorDeErros,
): OpcoesDoIntermediario {
  const relogio = { agora: () => new Date() };
  return {
    equipe: { equipe: criarRepositorioDaEquipe(banco), relogio },
    assinante: criarAssinanteRedis(ambiente.URL_REDIS, relator),
    hostPublico: ambiente.DOMINIO_CARDAPIO,
    plataforma: {
      dependencias: {
        plataforma: criarRepositorioDaPlataforma(banco),
        enviador: enviadorConviteManual,
        segredos: identidade.segredos,
        cofre: identidade.cofre,
        senhasVazadas: identidade.senhasVazadas,
        relogio,
        urlDoConvite: `${ambiente.URL_PAINEL}/convite`,
      },
      linkDoSentry: ambiente.URL_SENTRY_DO_ADMIN ?? null,
    },
  };
}
