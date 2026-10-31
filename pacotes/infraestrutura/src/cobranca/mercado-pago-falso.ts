import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { createServer, request, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { assinarAviso } from './verificador-de-avisos.ts';

export interface OpcoesDoMercadoPagoFalso {
  readonly tokenDeAcesso: string;
  readonly segredoDoWebhook: string;
  readonly webhook?: { readonly url: string; readonly host: string } | undefined;
}

interface AssinaturaFalsa {
  id: string;
  status: 'pending' | 'authorized' | 'paused' | 'cancelled';
  external_reference: string;
  payer_email: string;
  reason: string;
  init_point: string;
  next_payment_date: string | null;
  auto_recurring: { transaction_amount: number };
}

interface CobrancaFalsa {
  id: number;
  preapproval_id: string;
  status: 'scheduled' | 'processed' | 'recycling' | 'cancelled';
  transaction_amount: number;
  debit_date: string;
  payment: { id: number; status: string } | null;
}

export interface MercadoPagoFalso {
  readonly servidor: Server;
  readonly assinaturas: ReadonlyMap<string, AssinaturaFalsa>;
  readonly cobrancas: ReadonlyMap<string, CobrancaFalsa>;
  readonly avisosEnviados: readonly {
    readonly topico: string;
    readonly id: string;
    readonly status: number;
  }[];
  ouvir(porta?: number, host?: string): Promise<string>;
  autorizar(assinaturaId: string): Promise<void>;
  cobrar(assinaturaId: string, pagamento: 'approved' | 'rejected', vencimento?: Date): Promise<string>;
  definirFora(fora: boolean): void;
  encerrar(): Promise<void>;
}

const TOPICOS = {
  assinatura: 'subscription_preapproval',
  cobranca: 'subscription_authorized_payment',
} as const;

function responder(resposta: ServerResponse, status: number, corpo?: unknown): void {
  resposta.writeHead(status, { 'content-type': 'application/json' });
  resposta.end(corpo === undefined ? undefined : JSON.stringify(corpo));
}

async function lerCorpo(requisicao: IncomingMessage): Promise<Record<string, unknown>> {
  const partes: Buffer[] = [];
  for await (const parte of requisicao) {
    partes.push(parte as Buffer);
  }
  const texto = Buffer.concat(partes).toString('utf8');
  return texto === '' ? {} : (JSON.parse(texto) as Record<string, unknown>);
}

function enviarAviso(opcoes: OpcoesDoMercadoPagoFalso, topico: string, id: string): Promise<number> {
  const webhook = opcoes.webhook;
  if (webhook === undefined) {
    return Promise.resolve(0);
  }
  const ts = String(Math.floor(Date.now() / 1000));
  const xRequestId = randomUUID();
  const assinatura = assinarAviso(opcoes.segredoDoWebhook, id.toLowerCase(), xRequestId, ts);
  const url = new URL(webhook.url);
  url.searchParams.set('data.id', id);
  url.searchParams.set('type', topico);
  const corpo = JSON.stringify({ action: 'updated', type: topico, data: { id } });
  return new Promise((resolver, rejeitar) => {
    const saida = request(
      url,
      {
        method: 'POST',
        headers: {
          host: webhook.host,
          'content-type': 'application/json',
          'x-signature': `ts=${ts},v1=${assinatura}`,
          'x-request-id': xRequestId,
        },
      },
      (resposta) => {
        resposta.resume();
        resolver(resposta.statusCode ?? 0);
      },
    );
    saida.on('error', rejeitar);
    saida.end(corpo);
  });
}

export function criarMercadoPagoFalso(opcoes: OpcoesDoMercadoPagoFalso): MercadoPagoFalso {
  const assinaturas = new Map<string, AssinaturaFalsa>();
  const cobrancas = new Map<string, CobrancaFalsa>();
  const idempotencia = new Map<string, string>();
  const avisosEnviados: { topico: string; id: string; status: number }[] = [];
  let fora = false;
  let proximaCobranca = randomInt(1_000_000_000, 9_000_000_000);

  async function avisar(topico: string, id: string): Promise<void> {
    avisosEnviados.push({ topico, id, status: await enviarAviso(opcoes, topico, id) });
  }

  async function criarAssinatura(requisicao: IncomingMessage, resposta: ServerResponse): Promise<void> {
    const chave = requisicao.headers['x-idempotency-key'];
    const repetida = typeof chave === 'string' ? idempotencia.get(chave) : undefined;
    if (repetida !== undefined) {
      responder(resposta, 201, assinaturas.get(repetida));
      return;
    }
    const corpo = await lerCorpo(requisicao);
    const recorrencia = corpo.auto_recurring as { transaction_amount?: number } | undefined;
    if (typeof corpo.payer_email !== 'string' || typeof corpo.external_reference !== 'string') {
      responder(resposta, 400, { message: 'payer_email e external_reference são obrigatórios' });
      return;
    }
    const id = randomBytes(16).toString('hex');
    const assinatura: AssinaturaFalsa = {
      id,
      status: 'pending',
      external_reference: corpo.external_reference,
      payer_email: corpo.payer_email,
      reason: String(corpo.reason),
      init_point: `https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=${id}`,
      next_payment_date: null,
      auto_recurring: { transaction_amount: recorrencia?.transaction_amount ?? 0 },
    };
    assinaturas.set(id, assinatura);
    if (typeof chave === 'string') {
      idempotencia.set(chave, id);
    }
    responder(resposta, 201, assinatura);
  }

  function buscarCobrancas(url: URL, resposta: ServerResponse): void {
    const preapproval = url.searchParams.get('preapproval_id');
    const limite = Number(url.searchParams.get('limit') ?? '50');
    const inicio = Number(url.searchParams.get('offset') ?? '0');
    const todas = [...cobrancas.values()].filter((cobranca) => cobranca.preapproval_id === preapproval);
    responder(resposta, 200, {
      paging: { total: todas.length, limit: limite, offset: inicio },
      results: todas.slice(inicio, inicio + limite),
    });
  }

  async function controlar(url: URL, resposta: ServerResponse): Promise<void> {
    const [, , acao, id = ''] = url.pathname.split('/');
    if (acao === 'autorizar') {
      await controle.autorizar(id);
      responder(resposta, 200, { id });
      return;
    }
    if (acao === 'cobrar') {
      const pagamento = url.searchParams.get('pagamento') === 'rejected' ? 'rejected' : 'approved';
      responder(resposta, 200, { id: await controle.cobrar(id, pagamento) });
      return;
    }
    if (acao === 'fora') {
      fora = url.searchParams.get('valor') === '1';
      responder(resposta, 200, { fora });
      return;
    }
    if (acao === 'assinaturas') {
      responder(
        resposta,
        200,
        [...assinaturas.values()].map(({ id: chave, external_reference, status }) => ({
          id: chave,
          external_reference,
          status,
        })),
      );
      return;
    }
    responder(resposta, 404, { message: 'controle desconhecido' });
  }

  async function atender(requisicao: IncomingMessage, resposta: ServerResponse): Promise<void> {
    const url = new URL(requisicao.url ?? '/', 'http://falso');
    if (url.pathname.startsWith('/__falso/') && requisicao.method === 'POST') {
      await controlar(url, resposta);
      return;
    }
    if (requisicao.headers.authorization !== `Bearer ${opcoes.tokenDeAcesso}`) {
      responder(resposta, 401, { message: 'unauthorized' });
      return;
    }
    if (fora) {
      responder(resposta, 503, { message: 'indisponível' });
      return;
    }
    const [, recurso, id] = url.pathname.split('/');
    if (requisicao.method === 'POST' && url.pathname === '/preapproval') {
      await criarAssinatura(requisicao, resposta);
      return;
    }
    if (recurso === 'authorized_payments' && id === 'search') {
      buscarCobrancas(url, resposta);
      return;
    }
    const achado = recurso === 'preapproval' ? assinaturas.get(id ?? '') : cobrancas.get(id ?? '');
    responder(resposta, achado === undefined ? 404 : 200, achado ?? { message: 'not found' });
  }

  const servidor = createServer((requisicao, resposta) => {
    atender(requisicao, resposta).catch(() => {
      responder(resposta, 500, { message: 'erro no Mercado Pago falso' });
    });
  });

  const controle = {
    autorizar: async (assinaturaId: string) => {
      const assinatura = assinaturas.get(assinaturaId);
      if (assinatura !== undefined) {
        assinatura.status = 'authorized';
        assinatura.next_payment_date = new Date(Date.now() + 30 * 86_400_000).toISOString();
        await avisar(TOPICOS.assinatura, assinaturaId);
      }
    },
    cobrar: async (assinaturaId: string, pagamento: 'approved' | 'rejected', vencimento = new Date()) => {
      const assinatura = assinaturas.get(assinaturaId);
      const id = proximaCobranca++;
      cobrancas.set(String(id), {
        id,
        preapproval_id: assinaturaId,
        status: pagamento === 'approved' ? 'processed' : 'recycling',
        transaction_amount: assinatura?.auto_recurring.transaction_amount ?? 0,
        debit_date: vencimento.toISOString(),
        payment: { id: id + 1_000_000_000, status: pagamento },
      });
      await avisar(TOPICOS.cobranca, String(id));
      return String(id);
    },
  };

  return {
    servidor,
    assinaturas,
    cobrancas,
    avisosEnviados,
    ouvir(porta = 0, host = '127.0.0.1') {
      return new Promise((resolver) => {
        servidor.listen(porta, host, () => {
          const endereco = servidor.address();
          resolver(
            `http://127.0.0.1:${String(typeof endereco === 'object' && endereco !== null ? endereco.port : porta)}`,
          );
        });
      });
    },
    autorizar: controle.autorizar,
    cobrar: controle.cobrar,
    definirFora(valor) {
      fora = valor;
    },
    encerrar() {
      return new Promise((resolver) => {
        servidor.closeAllConnections();
        servidor.close(() => {
          resolver();
        });
      });
    },
  };
}
