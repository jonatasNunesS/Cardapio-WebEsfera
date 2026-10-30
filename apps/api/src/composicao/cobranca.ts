import type { DependenciasDaAssinatura, RelatorDeErros } from '@cardapio/aplicacao';
import {
  criarChamadaDoProcessamento,
  criarContadorDeTentativas,
  criarFilasBullMQ,
  criarGatewayMercadoPago,
  criarRedis,
  criarRegistroDeAvisos,
  criarRepositorioDeAssinaturas,
  criarVerificadorDeAvisos,
  fecharRedis,
  type AcessoAoBanco,
} from '@cardapio/infraestrutura';
import type { OpcoesDaCobranca } from '../identidade/registrar.ts';

export const TEMPO_MAXIMO_DO_MERCADO_PAGO_MS = 8000;

export interface AmbienteDaCobranca {
  readonly URL_REDIS: string;
  readonly URL_PAINEL: string;
  readonly URL_MERCADO_PAGO: string;
  readonly MP_ACCESS_TOKEN: string;
  readonly MP_WEBHOOK_SECRET: string;
}

export interface CobrancaComposta {
  readonly opcoes: OpcoesDaCobranca;
  encerrar(): Promise<void>;
}

export function dependenciasDaAssinatura(
  ambiente: AmbienteDaCobranca,
  banco: AcessoAoBanco,
): DependenciasDaAssinatura {
  return {
    assinaturas: criarRepositorioDeAssinaturas(banco),
    gateway: criarGatewayMercadoPago({
      url: ambiente.URL_MERCADO_PAGO,
      tokenDeAcesso: ambiente.MP_ACCESS_TOKEN,
      tempoMaximoMs: TEMPO_MAXIMO_DO_MERCADO_PAGO_MS,
    }),
    relogio: { agora: () => new Date() },
    urlDeRetorno: new URL('/plano', ambiente.URL_PAINEL).toString(),
  };
}

export function comporCobranca(
  ambiente: AmbienteDaCobranca,
  banco: AcessoAoBanco,
  redis: ReturnType<typeof criarRedis>,
  relator: RelatorDeErros,
): CobrancaComposta {
  const produtora = criarRedis(ambiente.URL_REDIS, relator, {
    connectionName: 'filas-produtora-api',
    enableOfflineQueue: false,
  });
  const filas = criarFilasBullMQ({ conexao: produtora, relator });
  return {
    opcoes: {
      assinatura: dependenciasDaAssinatura(ambiente, banco),
      aviso: {
        verificador: criarVerificadorDeAvisos(ambiente.MP_WEBHOOK_SECRET),
        avisos: criarRegistroDeAvisos(banco),
        processamento: criarChamadaDoProcessamento(filas, relator),
        tentativas: criarContadorDeTentativas(redis, 'aviso_pagamento_invalido'),
        relator,
      },
    },
    async encerrar() {
      await filas.encerrar();
      await fecharRedis(produtora);
    },
  };
}
