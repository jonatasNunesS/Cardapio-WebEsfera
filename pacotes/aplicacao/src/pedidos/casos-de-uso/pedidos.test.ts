import {
  CODIGOS,
  type ErroDeNegocio,
  type PedidoMontado,
  type PratoParaPedido,
  type Resultado,
  type SituacaoDoPedido,
} from '@cardapio/dominio';
import { beforeEach, describe, expect, it } from 'vitest';
import { RelogioDeTeste } from '../../testes/dobles.ts';
import type { DependenciasDosPedidos } from '../dependencias.ts';
import type {
  DesfechoDaCriacaoDoPedido,
  DesfechoDoCancelamento,
  EstadoParaPedido,
  NovoPedido,
  PedidoGuardado,
  RepositorioDePedidos,
  SessaoDoCliente,
} from '../portas/repositorio-de-pedidos.ts';
import { cancelarPedido } from './cancelar-pedido.ts';
import { criarPedido } from './criar-pedido.ts';
import { obterPedido } from './obter-pedido.ts';

const SESSAO: SessaoDoCliente = { restauranteId: 'r1', sessaoMesaId: 's1' };

class PedidosEmMemoria implements RepositorioDePedidos {
  readonly guardados = new Map<string, PedidoGuardado & { chave: string; hash: string }>();
  estado: EstadoParaPedido = {
    situacaoDoRestaurante: 'ativo',
    fusoHorario: 'America/Sao_Paulo',
    horarios: [],
    pratos: new Map<string, PratoParaPedido>([
      ['picanha', { id: 'picanha', nome: 'Picanha', precoCentavos: 8900, disponivel: true }],
      ['suco', { id: 'suco', nome: 'Suco', precoCentavos: 1200, disponivel: true }],
      ['pudim', { id: 'pudim', nome: 'Pudim', precoCentavos: 1500, disponivel: false }],
    ]),
  };
  sessaoValida = true;

  criar(
    _sessao: SessaoDoCliente,
    novo: NovoPedido,
    _agora: Date,
    decidir: (estado: EstadoParaPedido) => Resultado<PedidoMontado, ErroDeNegocio>,
  ): Promise<DesfechoDaCriacaoDoPedido> {
    if (!this.sessaoValida) {
      return Promise.resolve({ tipo: 'sessao-expirada' });
    }
    const existente = [...this.guardados.values()].find((pedido) => pedido.chave === novo.chave);
    if (existente !== undefined) {
      return Promise.resolve(
        existente.hash === novo.hashDoConteudo
          ? { tipo: 'existente', pedido: existente }
          : { tipo: 'chave-reusada' },
      );
    }
    const montado = decidir(this.estado);
    if (!montado.ok) {
      return Promise.resolve({ tipo: 'recusado', erro: montado.erro });
    }
    const pedido = {
      id: `p${String(this.guardados.size + 1)}`,
      numero: this.guardados.size + 1,
      situacao: 'enviado' as const,
      totalCentavos: montado.valor.totalCentavos,
      criadoEm: new Date(),
      itens: montado.valor.itens,
      chave: novo.chave,
      hash: novo.hashDoConteudo,
    };
    this.guardados.set(pedido.id, pedido);
    return Promise.resolve({ tipo: 'criado', pedido });
  }

  obter(_sessao: SessaoDoCliente, pedidoId: string) {
    return Promise.resolve(
      this.sessaoValida ? (this.guardados.get(pedidoId) ?? null) : ('sessao-expirada' as const),
    );
  }

  cancelar(
    _sessao: SessaoDoCliente,
    pedidoId: string,
    _agora: Date,
    podeCancelar: (situacao: SituacaoDoPedido) => boolean,
  ): Promise<DesfechoDoCancelamento> {
    const pedido = this.guardados.get(pedidoId);
    if (pedido === undefined) {
      return Promise.resolve('nao-encontrado');
    }
    if (!podeCancelar(pedido.situacao)) {
      return Promise.resolve('fora-de-hora');
    }
    this.guardados.set(pedidoId, { ...pedido, situacao: 'cancelado' });
    return Promise.resolve('cancelado');
  }
}

let pedidos: PedidosEmMemoria;
let dependencias: DependenciasDosPedidos;
const itens = [
  { pratoId: 'picanha', quantidade: 2, observacao: 'ao ponto' },
  { pratoId: 'suco', quantidade: 1, observacao: '' },
];

beforeEach(() => {
  pedidos = new PedidosEmMemoria();
  const relogio = new RelogioDeTeste();
  relogio.atual = new Date('2026-10-30T22:00:00Z');
  dependencias = { pedidos, resumidor: { resumo: (texto) => `h(${texto})` }, relogio };
});

describe('CriarPedido', () => {
  it('calcula total e preço pelo cardápio do servidor', async () => {
    const resultado = await criarPedido(dependencias, SESSAO, { chave: 'k1', itens });

    expect(resultado.ok && resultado.valor).toMatchObject({
      novo: true,
      pedido: { numero: 1, totalCentavos: 8900 * 2 + 1200, situacao: 'enviado' },
    });
    expect(resultado.ok && resultado.valor.pedido.itens[0]).toMatchObject({
      nome: 'Picanha',
      precoCentavos: 8900,
    });
  });

  it('a mesma chave e o mesmo carrinho devolvem o mesmo pedido; outra chave cria outro', async () => {
    const primeiro = await criarPedido(dependencias, SESSAO, { chave: 'k1', itens });
    const repetido = await criarPedido(dependencias, SESSAO, { chave: 'k1', itens });
    const outro = await criarPedido(dependencias, SESSAO, { chave: 'k2', itens });

    expect(repetido.ok && repetido.valor).toEqual({
      novo: false,
      pedido: primeiro.ok && primeiro.valor.pedido,
    });
    expect(outro.ok && outro.valor.pedido.numero).toBe(2);
    expect(pedidos.guardados.size).toBe(2);
  });

  it('a mesma chave com carrinho diferente é recusada', async () => {
    await criarPedido(dependencias, SESSAO, { chave: 'k1', itens });
    const resultado = await criarPedido(dependencias, SESSAO, { chave: 'k1', itens: itens.slice(1) });

    expect(resultado.ok ? null : resultado.erro.codigo).toBe(CODIGOS.PEDIDO_CRIAR_CHAVE_REUSADA);
  });

  it('o reenvio de um pedido já gravado vale mesmo se o prato esgotou depois', async () => {
    await criarPedido(dependencias, SESSAO, { chave: 'k1', itens });
    pedidos.estado = { ...pedidos.estado, situacaoDoRestaurante: 'inadimplente' };

    expect((await criarPedido(dependencias, SESSAO, { chave: 'k1', itens })).ok).toBe(true);
  });

  it.each<[string, Partial<EstadoParaPedido>, string]>([
    ['esgotado', {}, CODIGOS.PEDIDO_CRIAR_ITEM_INDISPONIVEL],
    ['inadimplente', { situacaoDoRestaurante: 'inadimplente' }, CODIGOS.PEDIDO_CRIAR_RESTAURANTE_SUSPENSO],
    ['cancelado', { situacaoDoRestaurante: 'cancelado' }, CODIGOS.PEDIDO_CRIAR_RESTAURANTE_SUSPENSO],
    [
      'fechado',
      { horarios: [{ diaSemana: 1, abre: '11:00', fecha: '15:00' }] },
      CODIGOS.PEDIDO_CRIAR_RESTAURANTE_FECHADO,
    ],
  ])('recusa %s sem gravar', async (caso, mudanca, codigo) => {
    pedidos.estado = { ...pedidos.estado, ...mudanca };
    const linhas =
      caso === 'esgotado' ? [...itens, { pratoId: 'pudim', quantidade: 1, observacao: '' }] : itens;
    const resultado = await criarPedido(dependencias, SESSAO, { chave: 'k1', itens: linhas });

    expect(resultado.ok ? null : resultado.erro.codigo).toBe(codigo);
    expect(pedidos.guardados.size).toBe(0);
  });

  it('carregar em carência continua aceitando pedido', async () => {
    pedidos.estado = { ...pedidos.estado, situacaoDoRestaurante: 'carencia' };
    expect((await criarPedido(dependencias, SESSAO, { chave: 'k1', itens })).ok).toBe(true);
  });

  it('sessão expirada recusa com o caminho de escanear de novo', async () => {
    pedidos.sessaoValida = false;
    const resultado = await criarPedido(dependencias, SESSAO, { chave: 'k1', itens });

    expect(resultado.ok ? null : resultado.erro).toMatchObject({
      codigo: CODIGOS.PEDIDO_SESSAO_MESA_EXPIRADA,
      mensagem: expect.stringContaining('Escaneie') as string,
    });
  });

  it('carrinho inválido nem chega ao repositório', async () => {
    const resultado = await criarPedido(dependencias, SESSAO, { chave: 'k1', itens: [] });
    expect(resultado.ok ? null : resultado.erro.codigo).toBe(CODIGOS.PEDIDO_CRIAR_CARRINHO_INVALIDO);
  });
});

describe('ObterPedido e CancelarPedido', () => {
  it('obtém o pedido da sessão; inexistente e sessão expirada recusam', async () => {
    await criarPedido(dependencias, SESSAO, { chave: 'k1', itens });

    expect((await obterPedido(dependencias, SESSAO, 'p1')).ok).toBe(true);
    const nenhum = await obterPedido(dependencias, SESSAO, 'p9');
    expect(nenhum.ok ? null : nenhum.erro.codigo).toBe(CODIGOS.PEDIDO_CONSULTAR_NAO_ENCONTRADO);
    pedidos.sessaoValida = false;
    const expirada = await obterPedido(dependencias, SESSAO, 'p1');
    expect(expirada.ok ? null : expirada.erro.codigo).toBe(CODIGOS.PEDIDO_SESSAO_MESA_EXPIRADA);
  });

  it('o cliente cancela só enquanto enviado', async () => {
    await criarPedido(dependencias, SESSAO, { chave: 'k1', itens });
    await criarPedido(dependencias, SESSAO, { chave: 'k2', itens });
    const p2 = pedidos.guardados.get('p2');
    if (p2 !== undefined) {
      pedidos.guardados.set('p2', { ...p2, situacao: 'em_preparo' });
    }

    expect((await cancelarPedido(dependencias, SESSAO, 'p1')).ok).toBe(true);
    expect(pedidos.guardados.get('p1')?.situacao).toBe('cancelado');
    const tarde = await cancelarPedido(dependencias, SESSAO, 'p2');
    expect(tarde.ok ? null : tarde.erro.codigo).toBe(CODIGOS.PEDIDO_CANCELAR_FORA_DE_HORA);
    const nenhum = await cancelarPedido(dependencias, SESSAO, 'p9');
    expect(nenhum.ok ? null : nenhum.erro.codigo).toBe(CODIGOS.PEDIDO_CONSULTAR_NAO_ENCONTRADO);
  });
});
