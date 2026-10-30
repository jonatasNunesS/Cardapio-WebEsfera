import { receberAvisoDePagamento, type DependenciasDoAviso } from '@cardapio/aplicacao';
import { esquemaAvisoNaUrl, ROTAS_DA_COBRANCA } from '@cardapio/contratos';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { mascararIp } from '../http/ip.ts';
import { enviarFalhaDeNegocio } from '../http/problema.ts';
import { STATUS_DAS_FALHAS } from '../identidade/falhas.ts';
import { LIMITES } from '../identidade/limites.ts';
import { apenasNoHost } from '../identidade/sessao.ts';

export const TAMANHO_MAXIMO_DO_AVISO = 16 * 1024;

function cabecalho(requisicao: FastifyRequest, nome: string): string {
  const valor = requisicao.headers[nome];
  return typeof valor === 'string' ? valor : '';
}

export function registrarAvisoDePagamento(
  servidor: FastifyInstance,
  dependencias: DependenciasDoAviso,
  host: string,
): void {
  void servidor.register((publico, _opcoes, pronto) => {
    publico.addHook('onRequest', apenasNoHost(host));
    publico.post(
      ROTAS_DA_COBRANCA.aviso,
      { bodyLimit: TAMANHO_MAXIMO_DO_AVISO, config: { rateLimit: LIMITES.avisoDePagamento } },
      async (requisicao, resposta) => {
        const url = esquemaAvisoNaUrl.parse(requisicao.query);
        const origem = mascararIp(requisicao.ip);
        const resultado = await receberAvisoDePagamento(dependencias, {
          assinatura: cabecalho(requisicao, 'x-signature'),
          xRequestId: cabecalho(requisicao, 'x-request-id'),
          dataId: url['data.id'],
          topico: url.type,
          origem,
        });
        requisicao.log.info(
          { evento: 'pagamento.aviso', origem, desfecho: resultado.ok ? 'aceito' : resultado.erro.codigo },
          'aviso de pagamento',
        );
        if (!resultado.ok) {
          return enviarFalhaDeNegocio(requisicao, resposta, resultado.erro, STATUS_DAS_FALHAS);
        }
        return resposta.code(200).send();
      },
    );
    pronto();
  });
}
