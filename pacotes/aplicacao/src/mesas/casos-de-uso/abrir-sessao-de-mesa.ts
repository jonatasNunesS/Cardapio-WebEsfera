import {
  CODIGOS,
  criarErroDeNegocio,
  DURACAO_DA_SESSAO_DE_MESA_MS,
  ErroAplicacao,
  PADRAO_DO_CODIGO_DA_MESA,
  Resultado,
  type ErroDeNegocio,
} from '@cardapio/dominio';
import type { DependenciasDaSessaoDeMesa } from '../dependencias.ts';

export const TENTATIVAS_ATE_O_ALERTA = 20;

export interface LinkDaMesaPedido {
  readonly slug: string;
  readonly numero: number;
  readonly codigo: string;
  readonly origem: string;
}

export type MesaAberta =
  | {
      readonly tipo: 'sessao';
      readonly sessaoId: string;
      readonly expiraEm: Date;
      readonly restauranteId: string;
      readonly mesaId: string;
      readonly slug: string;
      readonly numero: number;
    }
  | {
      readonly tipo: 'redirecionar';
      readonly slug: string;
      readonly numero: number;
      readonly codigo: string;
    };

export const QR_INVALIDO = criarErroDeNegocio(
  CODIGOS.MESA_ABRIR_QR_INVALIDO,
  'Este QR Code não vale mais. Peça ajuda ao garçom.',
);

async function registrarTentativa(dependencias: DependenciasDaSessaoDeMesa, origem: string): Promise<void> {
  const tentativas = await dependencias.tentativas.registrar(origem);
  if (tentativas === TENTATIVAS_ATE_O_ALERTA) {
    dependencias.relator.reportar(
      new ErroAplicacao(CODIGOS.MESA_RESOLUCAO_CODIGO_DESCONHECIDO, 'Muitos códigos de mesa inexistentes', {
        modulo: 'mesas',
        casoDeUso: 'abrirSessaoDeMesa',
        dados: { origem, tentativas },
      }),
    );
  }
}

export async function abrirSessaoDeMesa(
  dependencias: DependenciasDaSessaoDeMesa,
  pedido: LinkDaMesaPedido,
): Promise<Resultado<MesaAberta, ErroDeNegocio>> {
  const resolucao = PADRAO_DO_CODIGO_DA_MESA.test(pedido.codigo)
    ? await dependencias.resolucao.resolverMesa(pedido.slug, pedido.numero, pedido.codigo)
    : ({ situacao: 'desconhecido' } as const);
  if (resolucao.situacao === 'desconhecido') {
    await registrarTentativa(dependencias, pedido.origem);
  }
  if (resolucao.situacao !== 'valida' && resolucao.situacao !== 'redirecionar') {
    return Resultado.falha(QR_INVALIDO);
  }
  const { slugAtual: slug, numeroAtual: numero } = resolucao;
  if (resolucao.situacao === 'redirecionar') {
    return Resultado.ok({ tipo: 'redirecionar', slug, numero, codigo: pedido.codigo });
  }
  const agora = dependencias.relogio.agora();
  const aberta = await dependencias.sessoes.abrirOuReusar(
    resolucao.restauranteId,
    resolucao.mesaId,
    agora,
    new Date(agora.getTime() + DURACAO_DA_SESSAO_DE_MESA_MS),
  );
  return Resultado.ok({
    tipo: 'sessao',
    ...aberta,
    restauranteId: resolucao.restauranteId,
    mesaId: resolucao.mesaId,
    slug,
    numero,
  });
}
