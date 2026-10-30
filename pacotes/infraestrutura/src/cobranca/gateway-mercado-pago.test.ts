import { CODIGOS, ErroDependenciaExterna } from '@cardapio/aplicacao';
import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarGatewayMercadoPago } from './gateway-mercado-pago.ts';
import { criarMercadoPagoFalso, type MercadoPagoFalso } from './mercado-pago-falso.ts';

const TOKEN = 'TEST-token-de-acesso-falso';
const RESTAURANTE = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const pedido = {
  referenciaExterna: RESTAURANTE,
  motivo: 'Cardápio WebEsfera - Plano Básico',
  valorCentavos: 9900,
  emailDoPagador: 'dono@exemplo.com.br',
  urlDeRetorno: 'https://painel.exemplo.com.br/plano',
  chaveDeIdempotencia: '6f2b1c4e-9a7d-4e3b-8c1a-2d5f6e7a8b9c',
};

let falso: MercadoPagoFalso;
let url = '';

async function servidorQueResponde(corpo: unknown, status = 200) {
  const servidor = createServer((_requisicao, resposta) => {
    resposta.writeHead(status, { 'content-type': 'application/json' });
    resposta.end(JSON.stringify(corpo));
  });
  await new Promise<void>((resolver) => servidor.listen(0, '127.0.0.1', resolver));
  const endereco = servidor.address();
  const porta = typeof endereco === 'object' && endereco !== null ? endereco.port : 0;
  return { url: `http://127.0.0.1:${String(porta)}`, fechar: () => servidor.close() };
}

beforeAll(async () => {
  falso = criarMercadoPagoFalso({ tokenDeAcesso: TOKEN, segredoDoWebhook: 'segredo' });
  url = await falso.ouvir();
});

afterAll(async () => {
  await falso.encerrar();
});

const gateway = () => criarGatewayMercadoPago({ url, tokenDeAcesso: TOKEN, tempoMaximoMs: 2000 });

describe('adaptador HTTP do Mercado Pago', () => {
  it('cria a assinatura sem plano, pendente, com o restaurante como external_reference', async () => {
    const criada = await gateway().criarAssinatura(pedido);

    expect(criada).toMatchObject({
      situacao: 'pendente',
      referenciaExterna: RESTAURANTE,
      proximaCobrancaEm: null,
    });
    expect(criada.initPoint).toMatch(
      /^https:\/\/www\.mercadopago\.com\.br\/subscriptions\/checkout\?preapproval_id=/,
    );
    expect(falso.assinaturas.get(criada.id)).toMatchObject({
      status: 'pending',
      payer_email: 'dono@exemplo.com.br',
      auto_recurring: { transaction_amount: 99 },
    });
  });

  it('a mesma chave de idempotência devolve a mesma assinatura', async () => {
    const chave = { ...pedido, chaveDeIdempotencia: 'b3c1a2d4-0000-4000-8000-000000000001' };
    const [primeira, segunda] = [
      await gateway().criarAssinatura(chave),
      await gateway().criarAssinatura(chave),
    ];

    expect(segunda.id).toBe(primeira.id);
  });

  it('consulta assinatura e cobranças com o vocabulário do domínio', async () => {
    const criada = await gateway().criarAssinatura({ ...pedido, chaveDeIdempotencia: 'c-2' });
    await falso.autorizar(criada.id);
    const paga = await falso.cobrar(criada.id, 'approved', new Date('2026-11-01T15:00:00Z'));
    const recusada = await falso.cobrar(criada.id, 'rejected');

    expect(await gateway().consultarAssinatura(criada.id)).toMatchObject({ situacao: 'autorizada' });
    expect(await gateway().consultarCobranca(paga)).toEqual({
      id: paga,
      assinaturaId: criada.id,
      situacao: 'paga',
      pagamentoId: String(Number(paga) + 1_000_000),
      valorCentavos: 9900,
      venceEm: new Date('2026-11-01T15:00:00Z'),
    });
    expect((await gateway().listarCobrancas(criada.id)).map((c) => [c.id, c.situacao])).toEqual([
      [paga, 'paga'],
      [recusada, 'em_retentativa'],
    ]);
  });

  it('recurso inexistente devolve nulo', async () => {
    expect(await gateway().consultarAssinatura('nao-existe')).toBeNull();
    expect(await gateway().consultarCobranca('123')).toBeNull();
  });

  it('erro do Mercado Pago vira ErroDependenciaExterna com o status, sem token nem corpo', async () => {
    falso.definirFora(true);
    const erro: unknown = await gateway()
      .consultarAssinatura('qualquer')
      .catch((falha: unknown) => falha);
    falso.definirFora(false);

    expect(erro).toBeInstanceOf(ErroDependenciaExterna);
    expect(erro).toMatchObject({
      codigo: CODIGOS.PAGAMENTO_GATEWAY_REQUISICAO_FALHOU,
      dependencia: { provedor: 'mercado_pago', operacao: 'consultarAssinatura', statusHttp: 503 },
    });
    expect(JSON.stringify(erro)).not.toContain(TOKEN);
  });

  it('token errado é falha, não "não encontrado"', async () => {
    const outro = criarGatewayMercadoPago({ url, tokenDeAcesso: 'errado', tempoMaximoMs: 2000 });

    await expect(outro.consultarAssinatura('x')).rejects.toMatchObject({ dependencia: { statusHttp: 401 } });
  });

  it('init_point fora do Mercado Pago é resposta inválida', async () => {
    const estranho = await servidorQueResponde({
      id: 'abc',
      status: 'pending',
      external_reference: RESTAURANTE,
      init_point: 'https://golpe.exemplo.com/checkout',
    });
    const alvo = criarGatewayMercadoPago({ url: estranho.url, tokenDeAcesso: TOKEN, tempoMaximoMs: 2000 });

    await expect(alvo.consultarAssinatura('abc')).rejects.toMatchObject({
      codigo: CODIGOS.PAGAMENTO_GATEWAY_RESPOSTA_INVALIDA,
    });
    estranho.fechar();
  });

  it('situação desconhecida vira a mais conservadora: assinatura pendente, cobrança agendada', async () => {
    const estranho = await servidorQueResponde({
      id: 'abc',
      status: 'algo_novo',
      external_reference: RESTAURANTE,
      init_point: 'https://www.mercadopago.com.br/x',
    });
    const alvo = criarGatewayMercadoPago({ url: estranho.url, tokenDeAcesso: TOKEN, tempoMaximoMs: 2000 });

    expect(await alvo.consultarAssinatura('abc')).toMatchObject({ situacao: 'pendente' });
    estranho.fechar();
  });

  it('sem resposta dentro do tempo, falha em vez de esperar', async () => {
    const parado = createServer(() => undefined);
    await new Promise<void>((resolver) => parado.listen(0, '127.0.0.1', resolver));
    const endereco = parado.address();
    const porta = typeof endereco === 'object' && endereco !== null ? endereco.port : 0;
    const alvo = criarGatewayMercadoPago({
      url: `http://127.0.0.1:${String(porta)}`,
      tokenDeAcesso: TOKEN,
      tempoMaximoMs: 100,
    });

    await expect(alvo.consultarAssinatura('x')).rejects.toMatchObject({
      codigo: CODIGOS.PAGAMENTO_GATEWAY_REQUISICAO_FALHOU,
    });
    parado.closeAllConnections();
    parado.close();
  });
});
