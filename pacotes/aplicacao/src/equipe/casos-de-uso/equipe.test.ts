import { CODIGOS, type SituacaoDoChamado, type SituacaoDoPedido } from '@cardapio/dominio';
import { beforeEach, describe, expect, it } from 'vitest';
import { RelogioDeTeste } from '../../testes/dobles.ts';
import type { DependenciasDaEquipe } from '../dependencias.ts';
import type {
  DesfechoDaMudanca,
  DesfechoDoEncerramento,
  FilaDaEquipe,
  MudancaDeSituacao,
  RepositorioDaEquipe,
} from '../portas/repositorio-da-equipe.ts';
import { avancarChamado } from './avancar-chamado.ts';
import { avancarPedido } from './avancar-pedido.ts';
import { cancelarPedidoPelaEquipe } from './cancelar-pedido-pela-equipe.ts';
import { encerrarSessaoDeMesa } from './encerrar-sessao-de-mesa.ts';
import { obterFila } from './obter-fila.ts';

const DONO = { restauranteId: 'r1', papel: 'dono' as const, usuarioId: 'u1' };
const GARCOM = { restauranteId: 'r1', papel: 'garcom' as const, usuarioId: 'u2' };

function mudar<S>(itens: Map<string, S>, mudanca: MudancaDeSituacao<S>): DesfechoDaMudanca<S> {
  const atual = itens.get(mudanca.id);
  if (atual === undefined) {
    return { tipo: 'nao-encontrado' };
  }
  if (atual !== mudanca.de) {
    return { tipo: 'desatualizado', atual };
  }
  itens.set(mudanca.id, mudanca.para);
  return { tipo: 'alterado' };
}

class EquipeEmMemoria implements RepositorioDaEquipe {
  readonly pedidos = new Map<string, SituacaoDoPedido>([['p1', 'enviado']]);
  readonly chamados = new Map<string, SituacaoDoChamado>([['c1', 'aguardando']]);
  readonly motivos: (string | null)[] = [];
  encerramento: DesfechoDoEncerramento = { tipo: 'encerrada' };
  confirmacoes: boolean[] = [];

  fila(): Promise<FilaDaEquipe> {
    return Promise.resolve({ pedidos: [], chamados: [], sessoes: [] });
  }

  mudarPedido(_a: unknown, mudanca: MudancaDeSituacao<SituacaoDoPedido> & { motivo: string | null }) {
    this.motivos.push(mudanca.motivo);
    return Promise.resolve(mudar(this.pedidos, mudanca));
  }

  mudarChamado(_a: unknown, mudanca: MudancaDeSituacao<SituacaoDoChamado>) {
    return Promise.resolve(mudar(this.chamados, mudanca));
  }

  encerrarSessao(_a: unknown, _s: string, confirmado: boolean) {
    this.confirmacoes.push(confirmado);
    return Promise.resolve(this.encerramento);
  }
}

let repositorio: EquipeEmMemoria;
let dependencias: DependenciasDaEquipe;

beforeEach(() => {
  repositorio = new EquipeEmMemoria();
  dependencias = { equipe: repositorio, relogio: new RelogioDeTeste() };
});

describe('fila da equipe', () => {
  it('o dono lê a fila; outro papel não', async () => {
    expect((await obterFila(dependencias, DONO)).ok).toBe(true);
    expect(await obterFila(dependencias, GARCOM)).toMatchObject({
      ok: false,
      erro: { codigo: CODIGOS.EQUIPE_ACAO_SEM_PERMISSAO },
    });
  });

  it('o pedido avança só na ordem, até entregue', async () => {
    for (const de of ['enviado', 'em_preparo', 'pronto'] as const) {
      expect(await avancarPedido(dependencias, DONO, 'p1', de)).toEqual({ ok: true, valor: null });
    }
    expect(repositorio.pedidos.get('p1')).toBe('entregue');
    expect(await avancarPedido(dependencias, DONO, 'p1', 'entregue')).toMatchObject({
      ok: false,
      erro: { codigo: CODIGOS.EQUIPE_ACAO_TRANSICAO_INVALIDA },
    });
  });

  it('a ação repetida devolve 409 com a situação atual e não corrompe o estado', async () => {
    await avancarPedido(dependencias, DONO, 'p1', 'enviado');
    const repetida = await avancarPedido(dependencias, DONO, 'p1', 'enviado');

    expect(repetida).toMatchObject({
      ok: false,
      erro: { codigo: CODIGOS.EQUIPE_ACAO_SITUACAO_DESATUALIZADA, detalhes: { situacaoAtual: 'em_preparo' } },
    });
    expect(repositorio.pedidos.get('p1')).toBe('em_preparo');
  });

  it('pedido de outro restaurante ou inexistente não é encontrado', async () => {
    expect(await avancarPedido(dependencias, DONO, 'outro', 'enviado')).toMatchObject({
      ok: false,
      erro: { codigo: CODIGOS.EQUIPE_ACAO_NAO_ENCONTRADO },
    });
  });

  it('cancelar exige motivo e grava o motivo limpo', async () => {
    const sem = await cancelarPedidoPelaEquipe(dependencias, DONO, 'p1', {
      situacaoEsperada: 'enviado',
      motivo: ' ',
    });
    expect(sem).toMatchObject({ ok: false, erro: { codigo: CODIGOS.EQUIPE_CANCELAR_MOTIVO_INVALIDO } });
    expect(repositorio.motivos).toEqual([]);

    const com = await cancelarPedidoPelaEquipe(dependencias, DONO, 'p1', {
      situacaoEsperada: 'enviado',
      motivo: '  acabou   o peixe ',
    });
    expect(com.ok).toBe(true);
    expect(repositorio.motivos).toEqual(['acabou o peixe']);
    expect(repositorio.pedidos.get('p1')).toBe('cancelado');
  });

  it('não cancela pedido entregue', async () => {
    expect(
      await cancelarPedidoPelaEquipe(dependencias, DONO, 'p1', {
        situacaoEsperada: 'entregue',
        motivo: 'cliente desistiu',
      }),
    ).toMatchObject({ ok: false, erro: { codigo: CODIGOS.EQUIPE_ACAO_TRANSICAO_INVALIDA } });
  });

  it('o chamado é assumido e concluído; assumir de novo dá 409', async () => {
    expect((await avancarChamado(dependencias, DONO, 'c1', 'aguardando')).ok).toBe(true);
    expect(await avancarChamado(dependencias, DONO, 'c1', 'aguardando')).toMatchObject({
      ok: false,
      erro: { codigo: CODIGOS.EQUIPE_ACAO_SITUACAO_DESATUALIZADA },
    });
    expect((await avancarChamado(dependencias, DONO, 'c1', 'em_atendimento')).ok).toBe(true);
    expect(await avancarChamado(dependencias, DONO, 'c1', 'concluido')).toMatchObject({
      ok: false,
      erro: { codigo: CODIGOS.EQUIPE_ACAO_TRANSICAO_INVALIDA },
    });
  });

  it('as ações recusam papel sem gestão', async () => {
    expect((await avancarPedido(dependencias, GARCOM, 'p1', 'enviado')).ok).toBe(false);
    expect((await avancarChamado(dependencias, GARCOM, 'c1', 'aguardando')).ok).toBe(false);
    expect((await encerrarSessaoDeMesa(dependencias, GARCOM, 's1', true)).ok).toBe(false);
    expect(repositorio.pedidos.get('p1')).toBe('enviado');
  });
});

describe('encerrar a sessão da mesa', () => {
  it('encerra e repassa a confirmação', async () => {
    expect(await encerrarSessaoDeMesa(dependencias, DONO, 's1', false)).toEqual({ ok: true, valor: null });
    expect(repositorio.confirmacoes).toEqual([false]);
  });

  it('com pendência sem confirmação, pede confirmação com as contagens', async () => {
    repositorio.encerramento = { tipo: 'pendencias', pedidos: 2, chamados: 1 };

    expect(await encerrarSessaoDeMesa(dependencias, DONO, 's1', false)).toMatchObject({
      ok: false,
      erro: {
        codigo: CODIGOS.EQUIPE_ENCERRAR_PENDENCIAS_ABERTAS,
        detalhes: { pedidosAbertos: 2, chamadosAbertos: 1 },
      },
    });
  });

  it.each([
    ['nao-encontrada', CODIGOS.EQUIPE_ACAO_NAO_ENCONTRADO],
    ['ja-fechada', CODIGOS.EQUIPE_ENCERRAR_SESSAO_FECHADA],
  ] as const)('%s vira falha de negócio', async (tipo, codigo) => {
    repositorio.encerramento = { tipo };

    expect(await encerrarSessaoDeMesa(dependencias, DONO, 's1', true)).toMatchObject({
      ok: false,
      erro: { codigo },
    });
  });
});
