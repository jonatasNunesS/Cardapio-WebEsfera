import { pagoAtePelasCobrancas, situacaoPelaRegua } from '@cardapio/dominio';
import type { AssinaturaNoProvedor, CobrancaNoProvedor } from './portas/gateway-pagamento.ts';
import type {
  AssinaturaGuardada,
  CobrancaGuardada,
  EstadoTravado,
  EventoDeCobranca,
  MudancaDaCobranca,
} from './portas/repositorio-de-assinaturas.ts';

export interface ConsultaConfirmada {
  readonly assinatura: AssinaturaNoProvedor;
  readonly cobrancas: readonly CobrancaNoProvedor[];
}

type DadosDaAssinatura = Pick<AssinaturaGuardada, 'situacao' | 'pagoAte' | 'proximaCobrancaEm'>;

const mesmoInstante = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);

function cobrancaMudou(antiga: CobrancaGuardada, nova: CobrancaGuardada): boolean {
  return (
    antiga.situacao !== nova.situacao ||
    antiga.mpPagamentoId !== nova.mpPagamentoId ||
    antiga.valorCentavos !== nova.valorCentavos ||
    !mesmoInstante(antiga.venceEm, nova.venceEm)
  );
}

function mesclarCobrancas(
  guardadas: readonly CobrancaGuardada[],
  consultadas: readonly CobrancaNoProvedor[],
  agora: Date,
) {
  const porId = new Map(guardadas.map((cobranca) => [cobranca.mpCobrancaId, cobranca]));
  const alteradas: CobrancaGuardada[] = [];
  for (const consultada of consultadas) {
    const antiga = porId.get(consultada.id);
    const nova: CobrancaGuardada = {
      mpCobrancaId: consultada.id,
      mpPagamentoId: consultada.pagamentoId,
      valorCentavos: consultada.valorCentavos,
      situacao: consultada.situacao,
      venceEm: consultada.venceEm,
      pagaEm: consultada.situacao === 'paga' ? (antiga?.pagaEm ?? agora) : null,
    };
    if (antiga === undefined || cobrancaMudou(antiga, nova)) {
      alteradas.push(nova);
      porId.set(nova.mpCobrancaId, nova);
    }
  }
  return { todas: [...porId.values()], alteradas };
}

function assinaturaMudou(antiga: AssinaturaGuardada | null, nova: DadosDaAssinatura | null): boolean {
  if (antiga === null || nova === null) {
    return false;
  }
  return (
    antiga.situacao !== nova.situacao ||
    !mesmoInstante(antiga.pagoAte, nova.pagoAte) ||
    !mesmoInstante(antiga.proximaCobrancaEm, nova.proximaCobrancaEm)
  );
}

function maisTarde(a: Date | null, b: Date | null): Date | null {
  if (a === null || b === null) {
    return a ?? b;
  }
  return a > b ? a : b;
}

function montarMudanca(
  estado: EstadoTravado,
  nova: DadosDaAssinatura | null,
  cobrancas: readonly CobrancaGuardada[],
  agora: Date,
): MudancaDaCobranca | null {
  const pagoAte = maisTarde(estado.restaurante.pagoAte, nova?.pagoAte ?? null);
  const de = estado.restaurante.situacaoAtual;
  const para = situacaoPelaRegua({ ...estado.restaurante, pagoAte }, agora);
  const mudouAssinatura = assinaturaMudou(estado.assinatura, nova);
  if (!mudouAssinatura && cobrancas.length === 0 && para === de) {
    return null;
  }
  const eventos: EventoDeCobranca[] = [];
  if (estado.assinatura !== null && nova !== null && estado.assinatura.situacao !== nova.situacao) {
    eventos.push({
      tipo: 'AssinaturaAlterada',
      carga: { versao: 1, assinaturaId: estado.assinatura.id, situacao: nova.situacao },
    });
  }
  if (para !== de) {
    eventos.push({ tipo: 'RestauranteSituacaoAlterada', carga: { versao: 1, de, para } });
  }
  return {
    assinatura: mudouAssinatura ? nova : null,
    cobrancas,
    situacaoDoRestaurante: para === de ? null : para,
    eventos,
  };
}

export function decidirPelaConsulta(consulta: ConsultaConfirmada, agora: Date) {
  return (estado: EstadoTravado): MudancaDaCobranca | null => {
    const { todas, alteradas } = mesclarCobrancas(estado.cobrancas, consulta.cobrancas, agora);
    const nova: DadosDaAssinatura = {
      situacao: consulta.assinatura.situacao,
      pagoAte: pagoAtePelasCobrancas(todas),
      proximaCobrancaEm: consulta.assinatura.proximaCobrancaEm,
    };
    return montarMudanca(estado, nova, alteradas, agora);
  };
}

export function decidirPelaRegua(agora: Date) {
  return (estado: EstadoTravado): MudancaDaCobranca | null => montarMudanca(estado, null, [], agora);
}
