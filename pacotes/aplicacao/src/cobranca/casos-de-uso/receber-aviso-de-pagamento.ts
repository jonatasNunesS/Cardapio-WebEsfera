import { CODIGOS, criarErroDeNegocio, ErroAplicacao, Resultado, type ErroDeNegocio } from '@cardapio/dominio';
import type { DependenciasDoAviso } from '../dependencias.ts';

export const AVISOS_INVALIDOS_ATE_O_ALERTA = 10;

export interface AvisoDoMercadoPago {
  readonly assinatura: string;
  readonly xRequestId: string;
  readonly dataId: string;
  readonly topico: string;
  readonly origem: string;
}

const PADRAO_DO_REQUEST_ID = /^[A-Za-z0-9_.:-]{1,128}$/;
const PADRAO_DO_RECURSO = /^[a-z0-9_-]{1,64}$/;
const PADRAO_DO_TOPICO = /^[a-z_.]{1,64}$/;

export const AVISO_RECUSADO = criarErroDeNegocio(
  CODIGOS.PAGAMENTO_AVISO_ASSINATURA_INVALIDA,
  'Assinatura do aviso inválida.',
);

async function registrarAvisoInvalido(dependencias: DependenciasDoAviso, origem: string): Promise<void> {
  const tentativas = await dependencias.tentativas.registrar(origem);
  if (tentativas === AVISOS_INVALIDOS_ATE_O_ALERTA) {
    dependencias.relator.reportar(
      new ErroAplicacao(
        CODIGOS.PAGAMENTO_AVISO_ASSINATURA_INVALIDA,
        'Muitos avisos de pagamento sem assinatura válida',
        {
          modulo: 'cobranca',
          casoDeUso: 'receberAvisoDePagamento',
          dados: { origem, tentativas },
        },
      ),
    );
  }
}

export async function receberAvisoDePagamento(
  dependencias: DependenciasDoAviso,
  aviso: AvisoDoMercadoPago,
): Promise<Resultado<{ readonly eventoId: string }, ErroDeNegocio>> {
  const dataId = aviso.dataId.toLowerCase();
  if (
    !dependencias.verificador.verificar({
      assinatura: aviso.assinatura,
      xRequestId: aviso.xRequestId,
      dataId,
    })
  ) {
    await registrarAvisoInvalido(dependencias, aviso.origem);
    return Resultado.falha(AVISO_RECUSADO);
  }
  if (
    !PADRAO_DO_REQUEST_ID.test(aviso.xRequestId) ||
    !PADRAO_DO_RECURSO.test(dataId) ||
    !PADRAO_DO_TOPICO.test(aviso.topico)
  ) {
    return Resultado.falha(
      criarErroDeNegocio(CODIGOS.PAGAMENTO_AVISO_DADOS_INVALIDOS, 'Aviso de pagamento fora do formato.'),
    );
  }
  const registrado = await dependencias.avisos.registrar({
    xRequestId: aviso.xRequestId,
    topico: aviso.topico,
    recursoId: dataId,
  });
  if (!registrado.processado) {
    await dependencias.processamento.avisar(registrado.eventoId);
  }
  return Resultado.ok({ eventoId: registrado.eventoId });
}
