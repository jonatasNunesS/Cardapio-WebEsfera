import { CODIGOS, type SituacaoDoChamado, type TipoDeChamado } from '@cardapio/dominio';
import { beforeEach, describe, expect, it } from 'vitest';
import { RelogioDeTeste } from '../../testes/dobles.ts';
import type { DependenciasDoAtendimento } from '../dependencias.ts';
import type {
  ChamadoGuardado,
  DesfechoDoChamado,
  PedidoDaSessao,
  RepositorioDeAtendimento,
  SituacaoDaSessao,
} from '../portas/repositorio-de-atendimento.ts';
import { cancelarChamado } from './cancelar-chamado.ts';
import { chamarGarcom } from './chamar-garcom.ts';
import { obterChamado } from './obter-chamado.ts';
import { obterResumoDaConta } from './obter-resumo-da-conta.ts';
import { obterSituacaoDaSessao } from './obter-situacao-da-sessao.ts';
import { pedirConta } from './pedir-conta.ts';

const SESSAO = { restauranteId: 'r1', sessaoMesaId: 's1' };

class AtendimentoEmMemoria implements RepositorioDeAtendimento {
  readonly chamados: (ChamadoGuardado & { chave: string })[] = [];
  pedidos: PedidoDaSessao[] = [];
  situacao: SituacaoDaSessao = 'aberta';

  abrirChamado(_s: unknown, tipo: TipoDeChamado, chave: string): Promise<DesfechoDoChamado> {
    if (this.situacao !== 'aberta') {
      return Promise.resolve({ tipo: 'sessao-expirada' });
    }
    const existente =
      this.chamados.find((c) => c.chave === chave) ??
      this.chamados.find((c) => c.tipo === tipo && ['aguardando', 'em_atendimento'].includes(c.situacao));
    if (existente !== undefined) {
      return Promise.resolve({ tipo: 'existente', chamado: existente });
    }
    const chamado = {
      id: `c${String(this.chamados.length + 1)}`,
      tipo,
      situacao: 'aguardando' as const,
      criadoEm: new Date(),
      chave,
    };
    this.chamados.push(chamado);
    return Promise.resolve({ tipo: 'criado', chamado });
  }

  obterChamado(_s: unknown, id: string) {
    return Promise.resolve(
      this.situacao === 'aberta'
        ? (this.chamados.find((c) => c.id === id) ?? null)
        : ('sessao-expirada' as const),
    );
  }

  cancelarChamado(_s: unknown, id: string, _a: Date, pode: (s: SituacaoDoChamado) => boolean) {
    const chamado = this.chamados.find((c) => c.id === id);
    if (chamado === undefined) {
      return Promise.resolve('nao-encontrado' as const);
    }
    if (!pode(chamado.situacao)) {
      return Promise.resolve('fora-de-hora' as const);
    }
    Object.assign(chamado, { situacao: 'cancelado' });
    return Promise.resolve('cancelado' as const);
  }

  pedidosDaSessao() {
    return Promise.resolve(this.situacao === 'aberta' ? this.pedidos : ('sessao-expirada' as const));
  }

  situacaoDaSessao() {
    return Promise.resolve(this.situacao);
  }
}

let atendimento: AtendimentoEmMemoria;
let dependencias: DependenciasDoAtendimento;

beforeEach(() => {
  atendimento = new AtendimentoEmMemoria();
  dependencias = { atendimento, relogio: new RelogioDeTeste() };
});

describe('chamados', () => {
  it('dois toques em chamar garçom devolvem o mesmo chamado aberto', async () => {
    const primeiro = await chamarGarcom(dependencias, SESSAO, 'k1');
    const segundo = await chamarGarcom(dependencias, SESSAO, 'k2');

    expect(primeiro.ok && primeiro.valor.novo).toBe(true);
    expect(segundo.ok && segundo.valor).toEqual({
      novo: false,
      chamado: primeiro.ok && primeiro.valor.chamado,
    });
    expect(atendimento.chamados).toHaveLength(1);
  });

  it('garçom e conta convivem: dois chamados de tipos diferentes', async () => {
    await chamarGarcom(dependencias, SESSAO, 'k1');
    await pedirConta(dependencias, SESSAO, 'k2');

    expect(atendimento.chamados.map((c) => c.tipo)).toEqual(['garcom', 'conta']);
  });

  it('cancela só enquanto aguardando', async () => {
    await chamarGarcom(dependencias, SESSAO, 'k1');
    await pedirConta(dependencias, SESSAO, 'k2');
    Object.assign(atendimento.chamados[1] ?? {}, { situacao: 'em_atendimento' });

    expect((await cancelarChamado(dependencias, SESSAO, 'c1')).ok).toBe(true);
    const tarde = await cancelarChamado(dependencias, SESSAO, 'c2');
    expect(tarde.ok ? null : tarde.erro.codigo).toBe(CODIGOS.CHAMADO_CANCELAR_FORA_DE_HORA);
    const nenhum = await cancelarChamado(dependencias, SESSAO, 'c9');
    expect(nenhum.ok ? null : nenhum.erro.codigo).toBe(CODIGOS.CHAMADO_CONSULTAR_NAO_ENCONTRADO);
  });

  it('depois de cancelado, um novo toque abre outro chamado', async () => {
    await chamarGarcom(dependencias, SESSAO, 'k1');
    await cancelarChamado(dependencias, SESSAO, 'c1');
    const novo = await chamarGarcom(dependencias, SESSAO, 'k2');

    expect(novo.ok && novo.valor.novo).toBe(true);
  });

  it('sessão expirada recusa com o caminho de escanear de novo', async () => {
    atendimento.situacao = 'expirada';
    const resultado = await chamarGarcom(dependencias, SESSAO, 'k1');
    const obter = await obterChamado(dependencias, SESSAO, 'c1');

    expect(resultado.ok ? null : resultado.erro.codigo).toBe(CODIGOS.PEDIDO_SESSAO_MESA_EXPIRADA);
    expect(obter.ok ? null : obter.erro.codigo).toBe(CODIGOS.PEDIDO_SESSAO_MESA_EXPIRADA);
  });
});

describe('conta e sessão', () => {
  it('o resumo soma só pedidos não cancelados e lista os itens deles', async () => {
    atendimento.pedidos = [
      {
        situacao: 'entregue',
        totalCentavos: 8900,
        itens: [{ nome: 'Costela', quantidade: 1, precoCentavos: 8900 }],
      },
      {
        situacao: 'cancelado',
        totalCentavos: 5000,
        itens: [{ nome: 'Vinho', quantidade: 1, precoCentavos: 5000 }],
      },
    ];
    const resultado = await obterResumoDaConta(dependencias, SESSAO);

    expect(resultado.ok && resultado.valor).toMatchObject({
      subtotalCentavos: 8900,
      taxaCentavos: 890,
      totalComTaxaCentavos: 9790,
      itens: [{ nome: 'Costela', quantidade: 1, precoCentavos: 8900 }],
    });
  });

  it('a situação da sessão sem cookie é expirada', async () => {
    atendimento.situacao = 'encerrada';
    expect(await obterSituacaoDaSessao(dependencias, null)).toBe('expirada');
    expect(await obterSituacaoDaSessao(dependencias, SESSAO)).toBe('encerrada');
  });
});
