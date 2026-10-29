import { CODIGOS, ErroInvarianteDominio, LIMITE_MESAS_TESTE } from '@cardapio/dominio';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AcessoAoRestaurante } from '../../compartilhado/acesso.ts';
import { RelogioDeTeste } from '../../testes/dobles.ts';
import {
  CartoesDeTeste,
  CodigosDeTeste,
  ContadorDeTeste,
  MesasEmMemoria,
  SessoesDeMesaEmMemoria,
} from '../../testes/mesas-em-memoria.ts';
import type { DependenciasDasMesas } from '../dependencias.ts';
import { abrirSessaoDeMesa, TENTATIVAS_ATE_O_ALERTA } from './abrir-sessao-de-mesa.ts';
import { alterarSituacaoDaMesa } from './alterar-situacao-da-mesa.ts';
import { criarMesa } from './criar-mesa.ts';
import { editarMesa } from './editar-mesa.ts';
import { gerarNovoCodigoDaMesa } from './gerar-novo-codigo-da-mesa.ts';
import { listarMesas } from './listar-mesas.ts';
import { listarMesasParaOAdmin } from './listar-mesas-para-o-admin.ts';
import { obterCartaoDaMesa } from './obter-cartao-da-mesa.ts';
import { obterCartoesEmZip } from './obter-cartoes-em-zip.ts';
import { renumerarMesa } from './renumerar-mesa.ts';

const A = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4aaa';
const B = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4bbb';
const DONO: AcessoAoRestaurante = { restauranteId: A, papel: 'dono', usuarioId: 'u1' };
const GARCOM: AcessoAoRestaurante = { restauranteId: A, papel: 'garcom' };
const DONO_DE_B: AcessoAoRestaurante = { restauranteId: B, papel: 'dono' };
const URL = 'https://cardapio.exemplo';

let repositorio: MesasEmMemoria;
let codigos: CodigosDeTeste;
let cartoes: CartoesDeTeste;
let limite: number;
let dependencias: DependenciasDasMesas;

beforeEach(() => {
  repositorio = new MesasEmMemoria();
  repositorio.adicionarRestaurante(A, 'brasa');
  repositorio.adicionarRestaurante(B, 'trigo');
  codigos = new CodigosDeTeste();
  cartoes = new CartoesDeTeste();
  limite = LIMITE_MESAS_TESTE;
  dependencias = {
    mesas: repositorio,
    limite: { limite: () => Promise.resolve(limite) },
    codigos,
    cartoes,
    urlDoCardapio: URL,
  };
});

async function mesaCriada(numero: number, acesso = DONO) {
  const resultado = await criarMesa(dependencias, acesso, { numero, nome: null, area: null });
  if (!resultado.ok) {
    throw new Error(resultado.erro.codigo);
  }
  return resultado.valor;
}

describe('gestão de mesas', () => {
  it('cria com código gerado pela aplicação e lista com o link canônico', async () => {
    const mesa = await mesaCriada(12);
    const lista = await listarMesas(dependencias, DONO);

    expect(mesa.codigo).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(lista.ok && lista.valor).toEqual({
      slug: 'brasa',
      nomeDoRestaurante: 'Restaurante brasa',
      limite: 30,
      mesas: [{ ...mesa, link: `${URL}/brasa/mesa/12?c=${mesa.codigo}` }],
    });
    expect(repositorio.auditoria).toEqual([
      { restauranteId: A, mesaId: mesa.id, acao: 'criar', usuarioId: 'u1' },
    ]);
  });

  it('recusa garçom, número inválido, número repetido e texto longo', async () => {
    await mesaCriada(1);
    const casos = await Promise.all([
      criarMesa(dependencias, GARCOM, { numero: 2, nome: null, area: null }),
      criarMesa(dependencias, DONO, { numero: 0, nome: null, area: null }),
      criarMesa(dependencias, DONO, { numero: 1, nome: null, area: null }),
      criarMesa(dependencias, DONO, { numero: 3, nome: 'x'.repeat(61), area: null }),
    ]);
    expect(casos.map((caso) => !caso.ok && caso.erro.codigo)).toEqual([
      CODIGOS.MESA_EDITAR_SEM_PERMISSAO,
      CODIGOS.MESA_EDITAR_NUMERO_INVALIDO,
      CODIGOS.MESA_EDITAR_NUMERO_REPETIDO,
      CODIGOS.MESA_EDITAR_TEXTO_LONGO,
    ]);
  });

  it('limite do plano: a mesa além do limite é recusada; desativar libera; reativar respeita o limite', async () => {
    limite = 2;
    const primeira = await mesaCriada(1);
    await mesaCriada(2);
    const alem = await criarMesa(dependencias, DONO, { numero: 3, nome: null, area: null });
    await alterarSituacaoDaMesa(dependencias, DONO, primeira.id, false);
    const depoisDeDesativar = await criarMesa(dependencias, DONO, { numero: 3, nome: null, area: null });
    const reativar = await alterarSituacaoDaMesa(dependencias, DONO, primeira.id, true);

    expect(!alem.ok && alem.erro).toMatchObject({
      codigo: CODIGOS.MESA_CRIAR_LIMITE_DO_PLANO,
      detalhes: { limite: 2 },
    });
    expect(depoisDeDesativar.ok).toBe(true);
    expect(!reativar.ok && reativar.erro.codigo).toBe(CODIGOS.MESA_CRIAR_LIMITE_DO_PLANO);
  });

  it('código repetido (colisão) tenta de novo uma vez; código fora do formato é defeito', async () => {
    const primeira = await mesaCriada(1);
    codigos.fila.push(primeira.codigo);
    const segunda = await mesaCriada(2);
    expect(segunda.codigo).not.toBe(primeira.codigo);

    codigos.fila.push('curto');
    await expect(criarMesa(dependencias, DONO, { numero: 3, nome: null, area: null })).rejects.toThrow(
      ErroInvarianteDominio,
    );
  });

  it('editar, renumerar (número antigo no histórico e na auditoria) e novo código (auditoria)', async () => {
    const mesa = await mesaCriada(7);
    const editada = await editarMesa(dependencias, DONO, mesa.id, { nome: 'Varanda', area: 'Fundos' });
    const renumerada = await renumerarMesa(dependencias, DONO, mesa.id, 17);
    const trocada = await gerarNovoCodigoDaMesa(dependencias, DONO, mesa.id);

    expect(editada.ok && editada.valor).toMatchObject({ nome: 'Varanda', area: 'Fundos' });
    expect(renumerada.ok && renumerada.valor.numero).toBe(17);
    expect(renumerada.ok && renumerada.valor.codigo).toBe(mesa.codigo);
    expect(repositorio.historicoDeNumeros).toEqual([{ mesaId: mesa.id, numero: 7 }]);
    expect(trocada.ok && trocada.valor.codigo).not.toBe(mesa.codigo);
    expect(repositorio.auditoria.map((linha) => linha.acao)).toEqual(['criar', 'renumerar', 'trocar_codigo']);
  });

  it('isolamento: B não lista, não edita, não renumera, não troca código nem baixa o cartão de A', async () => {
    const mesa = await mesaCriada(5);
    const listaDeB = await listarMesas(dependencias, DONO_DE_B);
    const tentativas = await Promise.all([
      editarMesa(dependencias, DONO_DE_B, mesa.id, { nome: 'x', area: null }),
      renumerarMesa(dependencias, DONO_DE_B, mesa.id, 6),
      gerarNovoCodigoDaMesa(dependencias, DONO_DE_B, mesa.id),
      alterarSituacaoDaMesa(dependencias, DONO_DE_B, mesa.id, false),
      obterCartaoDaMesa(dependencias, DONO_DE_B, mesa.id),
    ]);

    expect(listaDeB.ok && listaDeB.valor.mesas).toEqual([]);
    expect(tentativas.map((caso) => !caso.ok && caso.erro.codigo)).toEqual(
      Array(5).fill(CODIGOS.MESA_EDITAR_NAO_ENCONTRADA),
    );
  });

  it('cartão leva o link exato; o ZIP traz só as mesas ativas', async () => {
    const um = await mesaCriada(1);
    const dois = await mesaCriada(2);
    await alterarSituacaoDaMesa(dependencias, DONO, dois.id, false);
    const cartao = await obterCartaoDaMesa(dependencias, DONO, um.id);
    const zip = await obterCartoesEmZip(dependencias, DONO);
    const partes: Uint8Array[] = [];
    for await (const parte of zip.ok ? zip.valor.zip : []) {
      partes.push(parte);
    }

    expect(cartao.ok && String.fromCharCode(...cartao.valor.png)).toBe(`${URL}/brasa/mesa/1?c=${um.codigo}`);
    expect(partes.map((parte) => String.fromCharCode(...parte))).toEqual([
      `${URL}/brasa/mesa/1?c=${um.codigo}`,
    ]);
  });
});

describe('sessão de mesa', () => {
  let sessoes: SessoesDeMesaEmMemoria;
  let contador: ContadorDeTeste;
  let relogio: RelogioDeTeste;
  const reportados: unknown[] = [];

  function abrir(slug: string, numero: number, codigo: string, origem = '10.0.0.x') {
    return abrirSessaoDeMesa(
      {
        resolucao: repositorio,
        sessoes,
        tentativas: contador,
        relator: {
          reportar: (erro) => {
            reportados.push(erro);
            return 'id';
          },
          registrarPasso: () => undefined,
        },
        relogio,
      },
      { slug, numero, codigo, origem },
    );
  }

  beforeEach(() => {
    sessoes = new SessoesDeMesaEmMemoria();
    contador = new ContadorDeTeste();
    relogio = new RelogioDeTeste();
    reportados.length = 0;
  });

  it('link válido abre a sessão de 4 h; o segundo cliente reaproveita a mesma, com a validade da primeira', async () => {
    const mesa = await mesaCriada(3);
    const primeira = await abrir('brasa', 3, mesa.codigo);
    relogio.avancar(60 * 60 * 1000);
    const segunda = await abrir('brasa', 3, mesa.codigo);

    expect(primeira.ok && primeira.valor).toMatchObject({
      tipo: 'sessao',
      restauranteId: A,
      mesaId: mesa.id,
    });
    const expira = primeira.ok && primeira.valor.tipo === 'sessao' ? primeira.valor.expiraEm.getTime() : 0;
    expect(expira - relogio.agora().getTime() + 60 * 60 * 1000).toBe(4 * 60 * 60 * 1000);
    expect(segunda).toEqual(primeira);
  });

  it('slug e número desatualizados redirecionam para o link atual, sem abrir sessão', async () => {
    const mesa = await mesaCriada(3);
    await renumerarMesa(dependencias, DONO, mesa.id, 30);
    const restaurante = repositorio.restaurantes.get(A);
    if (restaurante !== undefined) {
      restaurante.slug = 'brasa-nova';
    }

    expect(await abrir('brasa', 3, mesa.codigo)).toEqual({
      ok: true,
      valor: { tipo: 'redirecionar', slug: 'brasa-nova', numero: 30, codigo: mesa.codigo },
    });
    expect(sessoes.abertas.size).toBe(0);
  });

  it('mesa inativa, restaurante cancelado e código trocado dão QR inválido, sem alerta', async () => {
    const inativa = await mesaCriada(1);
    const trocada = await mesaCriada(2);
    await alterarSituacaoDaMesa(dependencias, DONO, inativa.id, false);
    await gerarNovoCodigoDaMesa(dependencias, DONO, trocada.id);
    const resultados = [await abrir('brasa', 1, inativa.codigo), await abrir('brasa', 2, trocada.codigo)];
    const restaurante = repositorio.restaurantes.get(A);
    if (restaurante !== undefined) {
      restaurante.cancelado = true;
    }
    const daMesaAtual = repositorio.mesas.get(trocada.id)?.codigo ?? '';
    resultados.push(await abrir('brasa', 2, daMesaAtual));

    expect(resultados.map((resultado) => !resultado.ok && resultado.erro.codigo)).toEqual(
      Array(3).fill(CODIGOS.MESA_ABRIR_QR_INVALIDO),
    );
    expect(reportados).toEqual([]);
  });

  it('código inexistente conta a tentativa da origem e alerta uma vez só ao chegar no limite, sem o código', async () => {
    for (let vez = 0; vez < TENTATIVAS_ATE_O_ALERTA + 5; vez += 1) {
      await abrir('brasa', 1, `inexistente${String(vez).padStart(11, '0')}`);
    }
    await abrir('brasa', 1, 'curto-e-errado');

    expect(contador.contagem.get('10.0.0.x')).toBe(TENTATIVAS_ATE_O_ALERTA + 6);
    expect(reportados).toHaveLength(1);
    expect(reportados[0]).toMatchObject({ codigo: CODIGOS.MESA_RESOLUCAO_CODIGO_DESCONHECIDO });
    expect(JSON.stringify((reportados[0] as { contexto: unknown }).contexto)).not.toContain('inexistente');
  });
});

describe('admin', () => {
  it('lista as mesas com o link, só leitura; restaurante desconhecido dá não encontrado', async () => {
    const leitura = {
      listar: (_admin: string, slug: string) =>
        Promise.resolve(
          slug === 'brasa'
            ? {
                nomeDoRestaurante: 'Brasa',
                slug,
                mesas: [{ numero: 1, nome: null, area: null, codigo: 'c'.repeat(22), ativa: true }],
              }
            : null,
        ),
    };
    const lida = await listarMesasParaOAdmin({ leitura, urlDoCardapio: URL }, 'admin', 'brasa');
    const ausente = await listarMesasParaOAdmin({ leitura, urlDoCardapio: URL }, 'admin', 'x');

    expect(lida.ok && lida.valor.mesas[0]?.link).toBe(`${URL}/brasa/mesa/1?c=${'c'.repeat(22)}`);
    expect(!ausente.ok && ausente.erro.codigo).toBe(CODIGOS.CARDAPIO_CONSULTAR_NAO_ENCONTRADO);
  });
});
