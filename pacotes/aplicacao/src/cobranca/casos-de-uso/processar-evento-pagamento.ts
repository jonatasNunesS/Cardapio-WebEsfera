import { CODIGOS, ErroAplicacao } from '@cardapio/dominio';
import { ErroEstadoInconsistente } from '../../compartilhado/erros/erro-estado-inconsistente.ts';
import { decidirPelaConsulta, type ConsultaConfirmada } from '../decidir-mudanca.ts';
import type { DependenciasDoProcessamentoDePagamento } from '../dependencias.ts';
import type { EventoEmProcessamento } from '../portas/eventos-de-pagamento.ts';
import type { GatewayPagamento } from '../portas/gateway-pagamento.ts';

export const TOPICOS_DE_PAGAMENTO = {
  assinatura: 'subscription_preapproval',
  cobranca: 'subscription_authorized_payment',
} as const;

const PADRAO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type DesfechoDoPagamento =
  'ja-processado' | 'ignorado' | 'recurso-inexistente' | 'referencia-invalida' | 'aplicado' | 'sem-mudanca';

async function consultar(
  gateway: GatewayPagamento,
  evento: EventoEmProcessamento,
): Promise<ConsultaConfirmada | null> {
  if (evento.topico === TOPICOS_DE_PAGAMENTO.assinatura) {
    const assinatura = await gateway.consultarAssinatura(evento.recursoId);
    return assinatura === null ? null : { assinatura, cobrancas: [] };
  }
  const cobranca = await gateway.consultarCobranca(evento.recursoId);
  if (cobranca === null) {
    return null;
  }
  const assinatura = await gateway.consultarAssinatura(cobranca.assinaturaId);
  return assinatura === null ? null : { assinatura, cobrancas: [cobranca] };
}

export async function aplicarConsulta(
  dependencias: Pick<DependenciasDoProcessamentoDePagamento, 'assinaturas' | 'relogio'>,
  consulta: ConsultaConfirmada,
  casoDeUso: string,
): Promise<'aplicado' | 'sem-mudanca' | 'referencia-invalida'> {
  const restauranteId = consulta.assinatura.referenciaExterna ?? '';
  if (!PADRAO_UUID.test(restauranteId)) {
    return 'referencia-invalida';
  }
  const desfecho = await dependencias.assinaturas.alterarComTrava(
    { restauranteId, mpAssinaturaId: consulta.assinatura.id },
    decidirPelaConsulta(consulta, dependencias.relogio.agora()),
  );
  if (desfecho === 'assinatura-desconhecida') {
    throw new ErroEstadoInconsistente(
      CODIGOS.PAGAMENTO_PROCESSAR_ASSINATURA_DESCONHECIDA,
      'A assinatura consultada não existe neste restaurante',
      { modulo: 'cobranca', casoDeUso, restauranteId },
    );
  }
  return desfecho === 'aplicada' ? 'aplicado' : 'sem-mudanca';
}

function avisarReferenciaInvalida(dependencias: DependenciasDoProcessamentoDePagamento, eventoId: string) {
  dependencias.relator.reportar(
    new ErroAplicacao(CODIGOS.PAGAMENTO_PROCESSAR_REFERENCIA_INVALIDA, 'Assinatura sem restaurante válido', {
      modulo: 'cobranca',
      casoDeUso: 'processarEventoPagamento',
      dados: { eventoId },
    }),
  );
}

async function processar(
  dependencias: DependenciasDoProcessamentoDePagamento,
  eventoId: string,
  evento: EventoEmProcessamento,
): Promise<DesfechoDoPagamento> {
  const conhecido = Object.values<string>(TOPICOS_DE_PAGAMENTO).includes(evento.topico);
  if (!conhecido) {
    return 'ignorado';
  }
  const consulta = await consultar(dependencias.gateway, evento);
  if (consulta === null) {
    return 'recurso-inexistente';
  }
  const desfecho = await aplicarConsulta(dependencias, consulta, 'processarEventoPagamento');
  if (desfecho === 'referencia-invalida') {
    avisarReferenciaInvalida(dependencias, eventoId);
  }
  return desfecho;
}

export async function processarEventoPagamento(
  dependencias: DependenciasDoProcessamentoDePagamento,
  eventoId: string,
): Promise<DesfechoDoPagamento> {
  const evento = await dependencias.eventos.iniciar(eventoId, dependencias.relogio.agora());
  if (evento === null) {
    return 'ja-processado';
  }
  const desfecho = await processar(dependencias, eventoId, evento);
  await dependencias.eventos.concluir(eventoId, dependencias.relogio.agora());
  return desfecho;
}
