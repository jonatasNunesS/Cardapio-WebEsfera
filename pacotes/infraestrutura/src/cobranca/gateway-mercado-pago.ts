import {
  CODIGOS,
  ErroDependenciaExterna,
  type AssinaturaNoProvedor,
  type CobrancaNoProvedor,
  type GatewayPagamento,
} from '@cardapio/aplicacao';
import type { SituacaoDaAssinatura, SituacaoDaCobranca } from '@cardapio/dominio';
import { z } from 'zod';

export const URL_DO_MERCADO_PAGO = 'https://api.mercadopago.com';
const POR_PAGINA = 50;
const PAGINAS_MAXIMAS = 20;

export interface ConfiguracaoDoMercadoPago {
  readonly url: string;
  readonly tokenDeAcesso: string;
  readonly tempoMaximoMs: number;
}

const identificador = z.union([z.string().min(1).max(64), z.number().int().nonnegative()]).transform(String);
const data = z.iso.datetime({ offset: true }).transform((valor) => new Date(valor));

const esquemaAssinatura = z.object({
  id: identificador,
  status: z.string(),
  external_reference: z.string().nullish(),
  init_point: z.url({ protocol: /^https$/, hostname: /(^|\.)mercadopago\.com(\.br)?$/ }),
  next_payment_date: data.nullish(),
});

const esquemaCobranca = z.object({
  id: identificador,
  preapproval_id: identificador,
  status: z.string(),
  transaction_amount: z.number().nonnegative(),
  debit_date: data,
  payment: z.object({ id: identificador, status: z.string() }).nullish(),
});

const esquemaBusca = z.object({ results: z.array(esquemaCobranca).default([]) });

const SITUACOES_DA_ASSINATURA: Readonly<Record<string, SituacaoDaAssinatura>> = {
  pending: 'pendente',
  authorized: 'autorizada',
  paused: 'pausada',
  cancelled: 'cancelada',
};

const SITUACOES_DA_COBRANCA: Readonly<Record<string, SituacaoDaCobranca>> = {
  scheduled: 'agendada',
  recycling: 'em_retentativa',
  cancelled: 'cancelada',
  processed: 'recusada',
};

function paraAssinatura(resposta: z.output<typeof esquemaAssinatura>): AssinaturaNoProvedor {
  return {
    id: resposta.id,
    situacao: SITUACOES_DA_ASSINATURA[resposta.status] ?? 'pendente',
    referenciaExterna: resposta.external_reference ?? null,
    initPoint: resposta.init_point,
    proximaCobrancaEm: resposta.next_payment_date ?? null,
  };
}

function paraCobranca(resposta: z.output<typeof esquemaCobranca>): CobrancaNoProvedor {
  const paga = resposta.payment?.status === 'approved';
  return {
    id: resposta.id,
    assinaturaId: resposta.preapproval_id,
    situacao: paga ? 'paga' : (SITUACOES_DA_COBRANCA[resposta.status] ?? 'agendada'),
    pagamentoId: resposta.payment?.id ?? null,
    valorCentavos: Math.round(resposta.transaction_amount * 100),
    venceEm: resposta.debit_date,
  };
}

function falha(
  operacao: string,
  codigo: string,
  statusHttp?: number,
  causa?: unknown,
): ErroDependenciaExterna {
  return new ErroDependenciaExterna(
    codigo,
    'O Mercado Pago não respondeu como esperado',
    { modulo: 'cobranca', casoDeUso: operacao },
    { provedor: 'mercado_pago', operacao, ...(statusHttp === undefined ? {} : { statusHttp }) },
    causa,
  );
}

interface Requisicao {
  readonly operacao: string;
  readonly caminho: string;
  readonly corpo?: unknown;
  readonly chaveDeIdempotencia?: string;
}

export function criarGatewayMercadoPago(configuracao: ConfiguracaoDoMercadoPago): GatewayPagamento {
  const base = configuracao.url.replace(/\/+$/, '');

  async function chamar(requisicao: Requisicao): Promise<Response> {
    try {
      return await fetch(`${base}${requisicao.caminho}`, {
        method: requisicao.corpo === undefined ? 'GET' : 'POST',
        headers: {
          authorization: `Bearer ${configuracao.tokenDeAcesso}`,
          accept: 'application/json',
          ...(requisicao.corpo === undefined ? {} : { 'content-type': 'application/json' }),
          ...(requisicao.chaveDeIdempotencia === undefined
            ? {}
            : { 'x-idempotency-key': requisicao.chaveDeIdempotencia }),
        },
        ...(requisicao.corpo === undefined ? {} : { body: JSON.stringify(requisicao.corpo) }),
        signal: AbortSignal.timeout(configuracao.tempoMaximoMs),
        redirect: 'error',
      });
    } catch (erro) {
      throw falha(requisicao.operacao, CODIGOS.PAGAMENTO_GATEWAY_REQUISICAO_FALHOU, undefined, erro);
    }
  }

  async function ler<E extends z.ZodType>(requisicao: Requisicao, esquema: E): Promise<z.output<E> | null> {
    const resposta = await chamar(requisicao);
    if (resposta.status === 404 && requisicao.corpo === undefined) {
      await resposta.body?.cancel();
      return null;
    }
    if (!resposta.ok) {
      await resposta.body?.cancel();
      throw falha(requisicao.operacao, CODIGOS.PAGAMENTO_GATEWAY_REQUISICAO_FALHOU, resposta.status);
    }
    const lido = esquema.safeParse(await resposta.json().catch(() => null));
    if (!lido.success) {
      throw falha(requisicao.operacao, CODIGOS.PAGAMENTO_GATEWAY_RESPOSTA_INVALIDA, resposta.status);
    }
    return lido.data;
  }

  async function exigir<E extends z.ZodType>(requisicao: Requisicao, esquema: E): Promise<z.output<E>> {
    const lido = await ler(requisicao, esquema);
    if (lido === null) {
      throw falha(requisicao.operacao, CODIGOS.PAGAMENTO_GATEWAY_RESPOSTA_INVALIDA, 404);
    }
    return lido;
  }

  const caminho = (prefixo: string, id: string) => `${prefixo}/${encodeURIComponent(id)}`;

  return {
    async criarAssinatura(pedido) {
      const resposta = await exigir(
        {
          operacao: 'criarAssinatura',
          caminho: '/preapproval',
          chaveDeIdempotencia: pedido.chaveDeIdempotencia,
          corpo: {
            reason: pedido.motivo,
            external_reference: pedido.referenciaExterna,
            payer_email: pedido.emailDoPagador,
            back_url: pedido.urlDeRetorno,
            status: 'pending',
            auto_recurring: {
              frequency: 1,
              frequency_type: 'months',
              transaction_amount: pedido.valorCentavos / 100,
              currency_id: 'BRL',
            },
          },
        },
        esquemaAssinatura,
      );
      return paraAssinatura(resposta);
    },
    async consultarAssinatura(id) {
      const resposta = await ler(
        { operacao: 'consultarAssinatura', caminho: caminho('/preapproval', id) },
        esquemaAssinatura,
      );
      return resposta === null ? null : paraAssinatura(resposta);
    },
    async consultarCobranca(id) {
      const resposta = await ler(
        { operacao: 'consultarCobranca', caminho: caminho('/authorized_payments', id) },
        esquemaCobranca,
      );
      return resposta === null ? null : paraCobranca(resposta);
    },
    async listarCobrancas(assinaturaId) {
      const cobrancas: CobrancaNoProvedor[] = [];
      for (let pagina = 0; pagina < PAGINAS_MAXIMAS; pagina += 1) {
        const parametros = new URLSearchParams({
          preapproval_id: assinaturaId,
          limit: String(POR_PAGINA),
          offset: String(pagina * POR_PAGINA),
        });
        const resposta = await exigir(
          { operacao: 'listarCobrancas', caminho: `/authorized_payments/search?${parametros.toString()}` },
          esquemaBusca,
        );
        cobrancas.push(...resposta.results.map(paraCobranca));
        if (resposta.results.length < POR_PAGINA) {
          break;
        }
      }
      return cobrancas;
    },
  };
}
