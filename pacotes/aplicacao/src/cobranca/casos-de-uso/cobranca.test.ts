import { CODIGOS, ErroAplicacao, LIMITE_MESAS_TESTE } from '@cardapio/dominio';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AcessoAoRestaurante } from '../../compartilhado/acesso.ts';
import { ErroEstadoInconsistente } from '../../compartilhado/erros/erro-estado-inconsistente.ts';
import { RelogioDeTeste } from '../../testes/dobles.ts';
import type {
  DependenciasDaAssinatura,
  DependenciasDasRotinasDeCobranca,
  DependenciasDoAviso,
  DependenciasDoProcessamentoDePagamento,
} from '../dependencias.ts';
import {
  AssinaturasEmMemoria,
  EventosEmMemoria,
  FilaEmMemoria,
  GatewayFalso,
  PLANOS,
  RESTAURANTE,
} from '../testes/dobles.ts';
import { aplicarInadimplencia } from './aplicar-inadimplencia.ts';
import { conciliarAssinatura } from './conciliar-assinatura.ts';
import { conciliarCobrancas, ESPERA_ANTES_DE_REPROCESSAR_MS } from './conciliar-cobrancas.ts';
import { consultarPlanoECobranca } from './consultar-plano-e-cobranca.ts';
import { escolherPlanoEAssinar } from './escolher-plano-e-assinar.ts';
import { obterLimiteDeMesas } from './obter-limite-de-mesas.ts';
import { processarEventoPagamento, TOPICOS_DE_PAGAMENTO } from './processar-evento-pagamento.ts';
import { AVISOS_INVALIDOS_ATE_O_ALERTA, receberAvisoDePagamento } from './receber-aviso-de-pagamento.ts';
import { registrarEsgotamentoDoEvento } from './registrar-esgotamento-do-evento.ts';

const dono: AcessoAoRestaurante = { restauranteId: RESTAURANTE, papel: 'dono', usuarioId: 'u' };
const pedido = {
  codigoDoPlano: 'basico',
  emailDoPagador: ' Dono@Exemplo.com.br ',
  chaveDeIdempotencia: 'chave-1',
};

class RelatorDeTeste {
  readonly reportados: unknown[] = [];
  reportar(erro: unknown) {
    this.reportados.push(erro);
    return 'id';
  }
  registrarPasso() {
    return undefined;
  }
}

let assinaturas: AssinaturasEmMemoria;
let gateway: GatewayFalso;
let eventos: EventosEmMemoria;
let relogio: RelogioDeTeste;
let relator: RelatorDeTeste;

function dependenciasDaAssinatura(): DependenciasDaAssinatura {
  return { assinaturas, gateway, relogio, urlDeRetorno: 'https://painel.exemplo.com.br/plano' };
}

function dependenciasDoProcessamento(): DependenciasDoProcessamentoDePagamento {
  return { assinaturas, gateway, eventos, relator, relogio };
}

async function assinarEAutorizar(): Promise<string> {
  await escolherPlanoEAssinar(dependenciasDaAssinatura(), dono, pedido);
  gateway.autorizar('preapproval-1');
  return 'preapproval-1';
}

async function avisoDeCobranca(xRequestId: string, cobrancaId: string): Promise<string> {
  const { eventoId } = await eventos.registrar({
    xRequestId,
    topico: TOPICOS_DE_PAGAMENTO.cobranca,
    recursoId: cobrancaId,
  });
  return eventoId;
}

function cobrancaPaga(id = 'cobranca-1', situacao: 'paga' | 'recusada' = 'paga') {
  gateway.cobrancas.set(id, {
    id,
    assinaturaId: 'preapproval-1',
    situacao,
    pagamentoId: situacao === 'paga' ? 'pagamento-1' : null,
    valorCentavos: 9900,
    venceEm: new Date('2026-11-01T15:00:00Z'),
  });
}

beforeEach(() => {
  assinaturas = new AssinaturasEmMemoria();
  gateway = new GatewayFalso();
  eventos = new EventosEmMemoria();
  relogio = new RelogioDeTeste();
  relogio.atual = new Date('2026-10-30T12:00:00Z');
  relator = new RelatorDeTeste();
});

describe('EscolherPlanoEAssinar', () => {
  it('cria a assinatura no Mercado Pago com o restaurante como referência e devolve o init_point', async () => {
    const resultado = await escolherPlanoEAssinar(dependenciasDaAssinatura(), dono, pedido);

    expect(resultado).toEqual({
      ok: true,
      valor: {
        initPoint: 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=preapproval-1',
      },
    });
    expect(gateway.pedidos).toEqual([
      {
        referenciaExterna: RESTAURANTE,
        motivo: 'Cardápio WebEsfera - Plano Básico',
        valorCentavos: 9900,
        emailDoPagador: 'dono@exemplo.com.br',
        urlDeRetorno: 'https://painel.exemplo.com.br/plano',
        chaveDeIdempotencia: 'chave-1',
      },
    ]);
    expect((await assinaturas.assinaturaAtual(RESTAURANTE))?.situacao).toBe('pendente');
  });

  it('repetir o mesmo plano pendente devolve o mesmo link sem nova chamada', async () => {
    await escolherPlanoEAssinar(dependenciasDaAssinatura(), dono, pedido);
    const repetido = await escolherPlanoEAssinar(dependenciasDaAssinatura(), dono, {
      ...pedido,
      chaveDeIdempotencia: 'outra',
    });

    expect(repetido.ok && repetido.valor.initPoint).toContain('preapproval-1');
    expect(gateway.pedidos).toHaveLength(1);
  });

  it('trocar de plano ainda pendente cancela a pendente e cria outra', async () => {
    await escolherPlanoEAssinar(dependenciasDaAssinatura(), dono, pedido);
    await escolherPlanoEAssinar(dependenciasDaAssinatura(), dono, { ...pedido, codigoDoPlano: 'pro' });

    const linha = assinaturas.linha();
    expect(linha.assinaturas.map((a) => [a.plano.codigo, a.situacao])).toEqual([
      ['basico', 'cancelada'],
      ['pro', 'pendente'],
    ]);
    expect(gateway.pedidos[1]?.valorCentavos).toBe(14900);
  });

  it.each<[string, AcessoAoRestaurante, typeof pedido, string]>([
    ['gerente', { ...dono, papel: 'gerente' }, pedido, CODIGOS.ASSINATURA_ESCOLHER_SEM_PERMISSAO],
    [
      'e-mail inválido',
      dono,
      { ...pedido, emailDoPagador: 'sem-arroba' },
      CODIGOS.ASSINATURA_ESCOLHER_EMAIL_INVALIDO,
    ],
    [
      'plano inexistente',
      dono,
      { ...pedido, codigoDoPlano: 'ouro' },
      CODIGOS.ASSINATURA_ESCOLHER_PLANO_INVALIDO,
    ],
  ])('recusa %s sem chamar o Mercado Pago', async (_caso, acesso, entrada, codigo) => {
    const resultado = await escolherPlanoEAssinar(dependenciasDaAssinatura(), acesso, entrada);

    expect(resultado.ok ? null : resultado.erro.codigo).toBe(codigo);
    expect(gateway.pedidos).toEqual([]);
  });

  it('recusa nova assinatura quando já existe uma autorizada', async () => {
    await assinarEAutorizar();
    const desfecho = await processarEventoPagamento(
      dependenciasDoProcessamento(),
      (
        await eventos.registrar({
          xRequestId: 'r1',
          topico: TOPICOS_DE_PAGAMENTO.assinatura,
          recursoId: 'preapproval-1',
        })
      ).eventoId,
    );
    expect(desfecho).toBe('aplicado');

    const resultado = await escolherPlanoEAssinar(dependenciasDaAssinatura(), dono, {
      ...pedido,
      codigoDoPlano: 'pro',
    });

    expect(resultado.ok ? null : resultado.erro.codigo).toBe(CODIGOS.ASSINATURA_ESCOLHER_JA_AUTORIZADA);
    expect(gateway.pedidos).toHaveLength(1);
  });
});

describe('ReceberAvisoDePagamento', () => {
  let vistos: { assinatura: string; xRequestId: string; dataId: string }[];
  let avisados: string[];
  let tentativas: number;

  function dependenciasDoAviso(valido = true): DependenciasDoAviso {
    return {
      verificador: {
        verificar: (aviso) => {
          vistos.push(aviso);
          return valido;
        },
      },
      avisos: eventos,
      processamento: {
        avisar: (eventoId) => {
          avisados.push(eventoId);
          return Promise.resolve('enfileirado');
        },
      },
      tentativas: {
        registrar: () => {
          tentativas += 1;
          return Promise.resolve(tentativas);
        },
      },
      relator,
    };
  }

  const aviso = {
    assinatura: 'ts=1,v1=abc',
    xRequestId: 'req-1',
    dataId: 'AbC123',
    topico: 'payment',
    origem: '203.0.113.0/24',
  };

  beforeEach(() => {
    vistos = [];
    avisados = [];
    tentativas = 0;
  });

  it('com assinatura válida, grava o evento com o data.id em minúsculas e chama o processamento', async () => {
    const resultado = await receberAvisoDePagamento(dependenciasDoAviso(), aviso);

    expect(resultado.ok).toBe(true);
    expect(vistos).toEqual([{ assinatura: 'ts=1,v1=abc', xRequestId: 'req-1', dataId: 'abc123' }]);
    expect([...eventos.eventos.values()].map((e) => e.recursoId)).toEqual(['abc123']);
    expect(avisados).toHaveLength(1);
  });

  it('o mesmo x-request-id não cria outro evento nem chama de novo depois de processado', async () => {
    const primeiro = await receberAvisoDePagamento(dependenciasDoAviso(), aviso);
    const id = primeiro.ok ? primeiro.valor.eventoId : '';
    await eventos.concluir(id, new Date());
    const segundo = await receberAvisoDePagamento(dependenciasDoAviso(), aviso);

    expect(segundo.ok && segundo.valor.eventoId).toBe(id);
    expect(eventos.eventos.size).toBe(1);
    expect(avisados).toEqual([id]);
  });

  it('assinatura inválida não grava nada e alerta uma única vez por origem ao passar do limite', async () => {
    for (let vez = 0; vez < AVISOS_INVALIDOS_ATE_O_ALERTA + 5; vez += 1) {
      const resultado = await receberAvisoDePagamento(dependenciasDoAviso(false), aviso);
      expect(resultado.ok ? null : resultado.erro.codigo).toBe(CODIGOS.PAGAMENTO_AVISO_ASSINATURA_INVALIDA);
    }

    expect(eventos.eventos.size).toBe(0);
    expect(avisados).toEqual([]);
    expect(relator.reportados).toHaveLength(1);
    const alerta = relator.reportados[0] as ErroAplicacao;
    expect(alerta.contexto.dados).toEqual({
      origem: '203.0.113.0/24',
      tentativas: AVISOS_INVALIDOS_ATE_O_ALERTA,
    });
  });

  it('com assinatura válida mas dados fora do formato, recusa sem gravar', async () => {
    const resultado = await receberAvisoDePagamento(dependenciasDoAviso(), { ...aviso, dataId: '../x' });

    expect(resultado.ok ? null : resultado.erro.codigo).toBe(CODIGOS.PAGAMENTO_AVISO_DADOS_INVALIDOS);
    expect(eventos.eventos.size).toBe(0);
  });
});

describe('ProcessarEventoPagamento', () => {
  it('assinatura autorizada no Mercado Pago muda a assinatura, mas não dá acesso pago sem cobrança paga', async () => {
    await assinarEAutorizar();
    const { eventoId } = await eventos.registrar({
      xRequestId: 'r1',
      topico: TOPICOS_DE_PAGAMENTO.assinatura,
      recursoId: 'preapproval-1',
    });

    expect(await processarEventoPagamento(dependenciasDoProcessamento(), eventoId)).toBe('aplicado');
    expect((await assinaturas.assinaturaAtual(RESTAURANTE))?.situacao).toBe('autorizada');
    expect(assinaturas.linha().restaurante.situacaoAtual).toBe('teste');
    expect(assinaturas.eventos.map((e) => e.tipo)).toEqual(['AssinaturaAlterada']);
    expect(eventos.eventos.get(eventoId)?.processadoEm).not.toBeNull();
  });

  it('cobrança paga confirmada na reconsulta ativa o restaurante e cobre um mês', async () => {
    await assinarEAutorizar();
    cobrancaPaga();

    expect(
      await processarEventoPagamento(
        dependenciasDoProcessamento(),
        await avisoDeCobranca('r1', 'cobranca-1'),
      ),
    ).toBe('aplicado');
    expect(assinaturas.linha().restaurante.situacaoAtual).toBe('ativo');
    expect((await assinaturas.assinaturaAtual(RESTAURANTE))?.pagoAte).toEqual(
      new Date('2026-12-01T15:00:00Z'),
    );
    expect(assinaturas.eventos.at(-1)).toEqual({
      tipo: 'RestauranteSituacaoAlterada',
      carga: { versao: 1, de: 'teste', para: 'ativo' },
    });
  });

  it('dois avisos do mesmo pagamento mudam a assinatura uma vez só', async () => {
    await assinarEAutorizar();
    cobrancaPaga();

    const primeiro = await processarEventoPagamento(
      dependenciasDoProcessamento(),
      await avisoDeCobranca('r1', 'cobranca-1'),
    );
    const segundo = await processarEventoPagamento(
      dependenciasDoProcessamento(),
      await avisoDeCobranca('r2', 'cobranca-1'),
    );

    expect([primeiro, segundo]).toEqual(['aplicado', 'sem-mudanca']);
    expect(assinaturas.alteracoes).toBe(1);
    expect(assinaturas.eventos.filter((e) => e.tipo === 'RestauranteSituacaoAlterada')).toHaveLength(1);
  });

  it('o aviso diz pago, mas a reconsulta diz recusado: não dá acesso', async () => {
    await assinarEAutorizar();
    cobrancaPaga('cobranca-1', 'recusada');

    await processarEventoPagamento(dependenciasDoProcessamento(), await avisoDeCobranca('r1', 'cobranca-1'));

    expect(assinaturas.linha().restaurante.situacaoAtual).toBe('teste');
    expect([...assinaturas.linha().cobrancas.values()].map((c) => c.situacao)).toEqual(['recusada']);
  });

  it('a reconsulta falha: lança para a fila tentar de novo, sem mudar nada nem concluir o evento', async () => {
    await assinarEAutorizar();
    cobrancaPaga();
    gateway.falhar = true;
    const eventoId = await avisoDeCobranca('r1', 'cobranca-1');

    await expect(processarEventoPagamento(dependenciasDoProcessamento(), eventoId)).rejects.toThrow(
      'Mercado Pago fora',
    );
    expect(assinaturas.alteracoes).toBe(0);
    expect(eventos.eventos.get(eventoId)?.processadoEm).toBeNull();
  });

  it('recurso que não existe no Mercado Pago conclui o evento sem mudar nada', async () => {
    const eventoId = await avisoDeCobranca('r1', 'nao-existe');

    expect(await processarEventoPagamento(dependenciasDoProcessamento(), eventoId)).toBe(
      'recurso-inexistente',
    );
    expect(assinaturas.alteracoes).toBe(0);
    expect(eventos.eventos.get(eventoId)?.processadoEm).not.toBeNull();
  });

  it('referência externa que não é um restaurante é reportada e o evento concluído', async () => {
    gateway.assinaturas.set('estranha', {
      id: 'estranha',
      situacao: 'autorizada',
      referenciaExterna: 'outra-coisa',
      initPoint: 'https://www.mercadopago.com.br/x',
      proximaCobrancaEm: null,
    });
    const { eventoId } = await eventos.registrar({
      xRequestId: 'r1',
      topico: TOPICOS_DE_PAGAMENTO.assinatura,
      recursoId: 'estranha',
    });

    expect(await processarEventoPagamento(dependenciasDoProcessamento(), eventoId)).toBe(
      'referencia-invalida',
    );
    expect((relator.reportados[0] as ErroAplicacao).codigo).toBe(
      CODIGOS.PAGAMENTO_PROCESSAR_REFERENCIA_INVALIDA,
    );
  });

  it('assinatura que ainda não está no restaurante lança para tentar de novo (corrida com a criação)', async () => {
    gateway.assinaturas.set('nova', {
      id: 'nova',
      situacao: 'autorizada',
      referenciaExterna: RESTAURANTE,
      initPoint: 'https://www.mercadopago.com.br/x',
      proximaCobrancaEm: null,
    });
    const { eventoId } = await eventos.registrar({
      xRequestId: 'r1',
      topico: TOPICOS_DE_PAGAMENTO.assinatura,
      recursoId: 'nova',
    });

    await expect(processarEventoPagamento(dependenciasDoProcessamento(), eventoId)).rejects.toBeInstanceOf(
      ErroEstadoInconsistente,
    );
    expect(eventos.eventos.get(eventoId)?.processadoEm).toBeNull();
  });

  it('tópico sem efeito é concluído sem consultar o Mercado Pago', async () => {
    const { eventoId } = await eventos.registrar({ xRequestId: 'r1', topico: 'payment', recursoId: '123' });

    expect(await processarEventoPagamento(dependenciasDoProcessamento(), eventoId)).toBe('ignorado');
    expect(gateway.consultas).toBe(0);
  });

  it('evento já processado não é processado de novo', async () => {
    const { eventoId } = await eventos.registrar({ xRequestId: 'r1', topico: 'payment', recursoId: '123' });
    await eventos.concluir(eventoId, new Date());

    expect(await processarEventoPagamento(dependenciasDoProcessamento(), eventoId)).toBe('ja-processado');
  });

  it('esgotadas as tentativas, o evento guarda o código da falha e fica para a conciliação', async () => {
    const eventoId = await avisoDeCobranca('r1', 'cobranca-1');

    await registrarEsgotamentoDoEvento({ eventos }, eventoId);

    expect(eventos.eventos.get(eventoId)).toMatchObject({
      falha: CODIGOS.PAGAMENTO_PROCESSAR_TENTATIVAS_ESGOTADAS,
      processadoEm: null,
    });
  });
});

describe('rotinas diárias', () => {
  let fila: FilaEmMemoria;

  function dependenciasDasRotinas(): DependenciasDasRotinasDeCobranca {
    return {
      assinaturas,
      eventos,
      restaurantes: { listar: (apos) => Promise.resolve(apos === null ? [RESTAURANTE] : []) },
      filas: fila,
      relogio,
    };
  }

  beforeEach(() => {
    fila = new FilaEmMemoria();
  });

  it('a conciliação reenfileira uma vez o evento sem processado_em e uma conciliação por restaurante', async () => {
    const eventoId = await avisoDeCobranca('r1', 'cobranca-1');
    relogio.atual = new Date(new Date('2026-11-01T12:00:00Z').getTime() + ESPERA_ANTES_DE_REPROCESSAR_MS + 1);

    const primeira = await conciliarCobrancas(dependenciasDasRotinas());
    await conciliarCobrancas(dependenciasDasRotinas());

    expect(primeira).toEqual({ eventos: 1, restaurantes: 1 });
    expect(fila.pedidos).toEqual([
      {
        nome: 'processar-evento-pagamento',
        idDoJob: `evento-${eventoId}-conciliacao-20261101`,
        dados: { eventoId },
      },
      {
        nome: 'conciliar-assinatura',
        idDoJob: `conciliar-${RESTAURANTE}-20261101`,
        dados: {},
        restauranteId: RESTAURANTE,
      },
    ]);
  });

  it('evento recente ainda não é reprocessado', async () => {
    await avisoDeCobranca('r1', 'cobranca-1');
    relogio.atual = new Date('2026-11-01T12:05:00Z');

    expect((await conciliarCobrancas(dependenciasDasRotinas())).eventos).toBe(0);
  });

  it('a conciliação da assinatura aplica o que o Mercado Pago tem, mesmo sem aviso', async () => {
    await assinarEAutorizar();
    cobrancaPaga();

    expect(await conciliarAssinatura(dependenciasDoProcessamento(), RESTAURANTE)).toBe('aplicado');
    expect(assinaturas.linha().restaurante.situacaoAtual).toBe('ativo');
    expect(await conciliarAssinatura(dependenciasDoProcessamento(), RESTAURANTE)).toBe('sem-mudanca');
  });

  it('sem assinatura, a conciliação não consulta o Mercado Pago', async () => {
    expect(await conciliarAssinatura(dependenciasDoProcessamento(), RESTAURANTE)).toBe('sem-assinatura');
    expect(gateway.consultas).toBe(0);
  });

  it('assinatura do Mercado Pago com outra referência não é aplicada', async () => {
    await assinarEAutorizar();
    gateway.autorizar('preapproval-1', { referenciaExterna: '0190a1b2-c3d4-7e5f-8a9b-ffffffffffff' });

    expect(await conciliarAssinatura(dependenciasDoProcessamento(), RESTAURANTE)).toBe('referencia-invalida');
    expect(assinaturas.alteracoes).toBe(0);
  });

  it('dia 15 sem pagamento: inadimplente; o pagamento depois reativa', async () => {
    await assinarEAutorizar();
    relogio.atual = new Date('2026-11-15T12:00:00Z');
    expect(await aplicarInadimplencia(dependenciasDasRotinas())).toEqual({ avaliados: 1, alterados: 1 });
    expect(assinaturas.linha().restaurante.situacaoAtual).toBe('inadimplente');

    gateway.cobrancas.set('cobranca-2', {
      id: 'cobranca-2',
      assinaturaId: 'preapproval-1',
      situacao: 'paga',
      pagamentoId: 'pagamento-2',
      valorCentavos: 9900,
      venceEm: new Date('2026-11-14T10:00:00Z'),
    });
    await processarEventoPagamento(dependenciasDoProcessamento(), await avisoDeCobranca('r9', 'cobranca-2'));

    expect(assinaturas.linha().restaurante.situacaoAtual).toBe('ativo');
    expect(
      assinaturas.eventos.filter((e) => e.tipo === 'RestauranteSituacaoAlterada').map((e) => e.carga),
    ).toEqual([
      { versao: 1, de: 'teste', para: 'inadimplente' },
      { versao: 1, de: 'inadimplente', para: 'ativo' },
    ]);
  });

  it('a régua sem mudança não grava nada', async () => {
    expect(await aplicarInadimplencia(dependenciasDasRotinas())).toEqual({ avaliados: 1, alterados: 0 });
    expect(assinaturas.alteracoes).toBe(0);
  });
});

describe('ObterLimiteDeMesas e ConsultarPlanoECobranca', () => {
  it('teste: 30 mesas; assinatura pendente: 30; Básico autorizado: 10', async () => {
    expect(await obterLimiteDeMesas({ assinaturas }, RESTAURANTE)).toBe(LIMITE_MESAS_TESTE);
    await escolherPlanoEAssinar(dependenciasDaAssinatura(), dono, pedido);
    expect(await obterLimiteDeMesas({ assinaturas }, RESTAURANTE)).toBe(30);
    gateway.autorizar('preapproval-1');
    await conciliarAssinatura(dependenciasDoProcessamento(), RESTAURANTE);
    expect(await obterLimiteDeMesas({ assinaturas }, RESTAURANTE)).toBe(PLANOS[0]?.limiteMesas);
  });

  it('mostra a situação, o vencimento e o dia de atraso para o dono', async () => {
    relogio.atual = new Date('2026-11-03T12:00:00Z');
    const resultado = await consultarPlanoECobranca(dependenciasDaAssinatura(), dono);

    expect(resultado.ok && resultado.valor).toMatchObject({
      situacao: 'teste',
      vencimento: new Date('2026-11-01T15:00:00Z'),
      diaDeAtraso: 3,
      planos: PLANOS,
      assinatura: null,
      cobrancas: [],
    });
  });

  it('garçom não vê a cobrança', async () => {
    const resultado = await consultarPlanoECobranca(dependenciasDaAssinatura(), { ...dono, papel: 'garcom' });

    expect(resultado.ok ? null : resultado.erro.codigo).toBe(CODIGOS.ASSINATURA_CONSULTAR_SEM_PERMISSAO);
  });
});
