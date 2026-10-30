import {
  aplicarInadimplencia,
  conciliarAssinatura,
  conciliarCobrancas,
  processarEventoPagamento,
  registrarEsgotamentoDoEvento,
  type FilaDeJobs,
  type RelatorDeErros,
} from '@cardapio/aplicacao';
import { JOBS } from '@cardapio/contratos';
import {
  criarEventosDePagamento,
  criarGatewayMercadoPago,
  criarRepositorioDeAssinaturas,
  criarRestaurantesParaCobranca,
  type AcessoAoBanco,
  type Processador,
} from '@cardapio/infraestrutura';
import { monitorarRotina } from '@cardapio/observabilidade/node';
import type { AmbienteWorker } from '../ambiente.ts';

export const TEMPO_MAXIMO_DO_MERCADO_PAGO_MS = 10_000;
const MONITOR_DIARIO = { aCadaMinutos: 24 * 60, margemMinutos: 60, duracaoMaximaMinutos: 30 };

export interface CobrancaDoWorker {
  readonly processadores: Readonly<Record<string, Processador>>;
  aoEsgotarTentativas(nome: string, dados: unknown): Promise<void>;
}

export function comporCobranca(
  ambiente: Pick<AmbienteWorker, 'URL_MERCADO_PAGO' | 'MP_ACCESS_TOKEN'>,
  banco: AcessoAoBanco,
  filas: FilaDeJobs,
  relator: RelatorDeErros,
): CobrancaDoWorker {
  const relogio = { agora: () => new Date() };
  const assinaturas = criarRepositorioDeAssinaturas(banco);
  const eventos = criarEventosDePagamento(banco);
  const restaurantes = criarRestaurantesParaCobranca(banco);
  const gateway = criarGatewayMercadoPago({
    url: ambiente.URL_MERCADO_PAGO,
    tokenDeAcesso: ambiente.MP_ACCESS_TOKEN,
    tempoMaximoMs: TEMPO_MAXIMO_DO_MERCADO_PAGO_MS,
  });
  const processamento = { assinaturas, gateway, eventos, relator, relogio };
  const rotinas = { assinaturas, eventos, restaurantes, filas, relogio };
  return {
    processadores: {
      'processar-evento-pagamento': ({ dados }) =>
        processarEventoPagamento(
          processamento,
          JOBS['processar-evento-pagamento'].esquema.parse(dados).eventoId,
        ),
      'conciliar-assinatura': ({ dados }) =>
        conciliarAssinatura(
          processamento,
          JOBS['conciliar-assinatura'].esquema.parse(dados).restauranteId ?? '',
        ),
      'conciliar-cobrancas': () =>
        monitorarRotina('rotinas-conciliar-cobrancas', MONITOR_DIARIO, () => conciliarCobrancas(rotinas)),
      'aplicar-inadimplencia': () =>
        monitorarRotina('rotinas-aplicar-inadimplencia', MONITOR_DIARIO, () => aplicarInadimplencia(rotinas)),
    },
    async aoEsgotarTentativas(nome, dados) {
      if (nome === 'processar-evento-pagamento') {
        const { eventoId } = JOBS['processar-evento-pagamento'].esquema.parse(dados);
        await registrarEsgotamentoDoEvento({ eventos }, eventoId);
      }
    },
  };
}
