import {
  buscarPratos,
  criarCategoria,
  criarPrato,
  editarPrato,
  moverItemDoCardapio,
  obterCardapioPublicado,
  removerPrato,
  type CacheDoCardapio,
  type CardapioPublicado,
} from '@cardapio/aplicacao';
import { CODIGOS } from '@cardapio/dominio';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AcessoAoBanco } from '../banco.ts';
import { criarFonteDoCardapioPublico } from '../cardapio/fonte-do-cardapio-publico.ts';
import { criarRepositorioDoCardapio } from '../cardapio/repositorio-do-cardapio.ts';
import { pratos, restaurantes } from '../esquema/index.ts';
import { abrirBanco, consultarComoAdmin, criarRestauranteDeTeste } from './apoio.ts';

const enderecos = { urlPublica: (caminho: string) => `https://midia.exemplo/${caminho}` };
const semCache: CacheDoCardapio = { ler: () => Promise.resolve(null), gravar: () => Promise.resolve() };

function valor<T>(resultado: { ok: true; valor: T } | { ok: false }): T {
  if (!resultado.ok) {
    throw new Error('esperava sucesso');
  }
  return resultado.valor;
}

async function versaoDoCardapio(restauranteId: string): Promise<number> {
  const [linha] = await consultarComoAdmin<{ versao: string }>(
    'SELECT versao_cardapio AS versao FROM restaurantes WHERE id = $1',
    [restauranteId],
  );
  return Number(linha?.versao);
}

describe('cardápio no Postgres', () => {
  let banco: AcessoAoBanco;
  let dependencias: { cardapio: ReturnType<typeof criarRepositorioDoCardapio> };
  let fonte: ReturnType<typeof criarFonteDoCardapioPublico>;

  beforeAll(() => {
    banco = abrirBanco('api');
    dependencias = { cardapio: criarRepositorioDoCardapio(banco) };
    fonte = criarFonteDoCardapioPublico(banco);
  });

  afterAll(async () => {
    await banco.encerrar();
  });

  async function restauranteComCardapio() {
    const restaurante = await criarRestauranteDeTeste(banco);
    const acesso = { restauranteId: restaurante.id, papel: 'dono' } as const;
    const principais = valor(await criarCategoria(dependencias, acesso, { nome: 'Principais' }));
    const massas = valor(await criarCategoria(dependencias, acesso, { nome: 'Massas' }));
    const prato = (categoriaId: string, nome: string, descricao: string, extra = {}) =>
      criarPrato(dependencias, acesso, {
        categoriaId,
        nome,
        descricao,
        precoCentavos: 8900,
        disponivel: true,
        destaque: false,
        ...extra,
      });
    const costela = valor(
      await prato(principais.id, 'Costela na brasa', 'Fogo de chão e mandioca crocante.'),
    );
    const risoto = valor(await prato(principais.id, 'Risoto de abóbora assada', 'Queijo canastra e sálvia.'));
    const burrata = valor(
      await prato(principais.id, 'Burrata', 'Tomates confitados.', { disponivel: false }),
    );
    const pappardelle = valor(await prato(massas.id, 'Pappardelle', 'Ragu desfiado e parmesão.'));
    return { restaurante, acesso, principais, massas, costela, risoto, burrata, pappardelle };
  }

  it('cria categoria e prato com ordem no fim; nome de categoria repetido sem acento é recusado', async () => {
    const { acesso, principais, massas, costela, risoto } = await restauranteComCardapio();

    expect([principais.ordem, massas.ordem]).toEqual([1024, 2048]);
    expect([costela.ordem, risoto.ordem]).toEqual([1024, 2048]);
    const repetida = await criarCategoria(dependencias, acesso, { nome: 'PRINCIPAÍS' });
    expect(!repetida.ok && repetida.erro.codigo).toBe(CODIGOS.CARDAPIO_EDITAR_NOME_REPETIDO);
  });

  it('trava otimista: duas edições concorrentes com a mesma versão, uma recebe conflito', async () => {
    const { acesso, costela } = await restauranteComCardapio();
    const dados = (nome: string) => ({
      categoriaId: costela.categoriaId,
      nome,
      descricao: '',
      precoCentavos: 9900,
      disponivel: true,
      destaque: false,
    });

    const resultados = await Promise.all([
      editarPrato(dependencias, acesso, costela, dados('Costela A')),
      editarPrato(dependencias, acesso, costela, dados('Costela B')),
    ]);

    const codigos = resultados.map((resultado) => (resultado.ok ? 'ok' : resultado.erro.codigo));
    expect(codigos.sort()).toEqual([CODIGOS.CARDAPIO_EDITAR_CONFLITO_DE_VERSAO, 'ok'].sort());
  });

  it('o app_runtime não consegue apagar prato de verdade: remover é lógico', async () => {
    const { restaurante, acesso, costela } = await restauranteComCardapio();

    await expect(
      banco.comRestaurante(restaurante.id, (transacao) => transacao.delete(pratos)),
    ).rejects.toMatchObject({ codigo: CODIGOS.BANCO_ISOLAMENTO_VIOLADO });
    expect((await removerPrato(dependencias, acesso, costela)).ok).toBe(true);
    const [linha] = await consultarComoAdmin<{ removido: boolean }>(
      'SELECT removido_em IS NOT NULL AS removido FROM pratos WHERE id = $1',
      [costela.id],
    );
    expect(linha?.removido).toBe(true);
  });

  it('um restaurante não lê nem altera o cardápio do outro', async () => {
    const a = await restauranteComCardapio();
    const b = await criarRestauranteDeTeste(banco);
    const acessoB = { restauranteId: b.id, papel: 'dono' } as const;

    expect((await dependencias.cardapio.listar(b.id)).pratos).toEqual([]);
    const tentativa = await removerPrato(dependencias, acessoB, a.costela);
    expect(!tentativa.ok && tentativa.erro.codigo).toBe(CODIGOS.CARDAPIO_EDITAR_NAO_ENCONTRADO);
    const invasao = await criarPrato(dependencias, acessoB, {
      categoriaId: a.principais.id,
      nome: 'Invasor',
      descricao: '',
      precoCentavos: 100,
      disponivel: true,
      destaque: false,
    });
    expect(!invasao.ok && invasao.erro.codigo).toBe(CODIGOS.CARDAPIO_EDITAR_NAO_ENCONTRADO);
  });

  it('toda mudança no cardápio, na personalização ou no horário sobe a versão publicada', async () => {
    const { restaurante, acesso, costela } = await restauranteComCardapio();
    const antes = await versaoDoCardapio(restaurante.id);

    await removerPrato(dependencias, acesso, costela);
    const depoisDoPrato = await versaoDoCardapio(restaurante.id);
    await banco.comRestaurante(restaurante.id, (transacao) =>
      transacao.execute(sql`INSERT INTO horarios (restaurante_id, dia_semana, abre, fecha)
                            VALUES (${restaurante.id}, 1, '18:00', '23:00')`),
    );

    expect(depoisDoPrato).toBeGreaterThan(antes);
    expect(await versaoDoCardapio(restaurante.id)).toBeGreaterThan(depoisDoPrato);
  });

  it('reordenar muda só o necessário e a ordem fica estável depois de várias trocas', async () => {
    const { restaurante, acesso, costela, risoto, burrata } = await restauranteComCardapio();
    const versoes = new Map([costela, risoto, burrata].map((prato) => [prato.id, prato.versao]));
    const ordem = async () =>
      (await dependencias.cardapio.listar(restaurante.id)).pratos
        .filter((prato) => prato.categoriaId === costela.categoriaId)
        .map((prato) => prato.nome);

    for (let rodada = 0; rodada < 12; rodada += 1) {
      const alvo = rodada % 2 === 0 ? burrata : risoto;
      const versao = versoes.get(alvo.id) ?? 1;
      valor(
        await moverItemDoCardapio(dependencias, acesso, { tipo: 'prato', id: alvo.id, versao, posicao: 0 }),
      );
      versoes.set(alvo.id, versao + 1);
    }

    expect(await ordem()).toEqual(['Risoto de abóbora assada', 'Burrata', 'Costela na brasa']);
    const [{ alteradas } = { alteradas: 0 }] = await consultarComoAdmin<{ alteradas: number }>(
      `SELECT count(*)::int AS alteradas FROM pratos WHERE id = $1 AND versao = 1`,
      [costela.id],
    );
    expect(alteradas).toBe(1);
  });

  it('busca ignora acento e maiúscula, casa nome, descrição e categoria, e marca esgotado', async () => {
    const { restaurante, acesso, costela } = await restauranteComCardapio();
    const nomes = async (termo: string) => {
      const resultado = valor(await buscarPratos({ fonte, enderecos }, restaurante.slug, termo));
      return resultado.tipo === 'resultados' ? resultado.pratos.map((prato) => prato.nome) : [];
    };

    expect(await nomes('costela')).toEqual(['Costela na brasa']);
    expect(await nomes('COST')).toEqual(['Costela na brasa']);
    expect(await nomes('abobora')).toEqual(['Risoto de abóbora assada']);
    expect(await nomes('chao')).toEqual(['Costela na brasa']);
    expect(await nomes('massas')).toEqual(['Pappardelle']);
    expect(await nomes('lagosta')).toEqual([]);
    const esgotada = valor(await buscarPratos({ fonte, enderecos }, restaurante.slug, 'burrata'));
    expect(esgotada.tipo === 'resultados' && esgotada.pratos[0]?.disponivel).toBe(false);

    await removerPrato(dependencias, acesso, costela);
    expect(await nomes('costela')).toEqual([]);
  });

  it('leitura pública: uma consulta, sem removido, esgotado marcado; cancelado não existe; slug antigo redireciona', async () => {
    const { restaurante, acesso, costela } = await restauranteComCardapio();
    await removerPrato(dependencias, acesso, costela);
    const relogio = { agora: () => new Date() };

    const lido = valor(
      await obterCardapioPublicado({ fonte, cache: semCache, relogio, enderecos }, restaurante.slug),
    );
    if (lido.tipo !== 'cardapio') {
      throw new Error('esperava cardápio');
    }
    const cardapio: CardapioPublicado = lido.cardapio;
    expect(cardapio.secoes.map((secao) => [secao.nome, secao.pratos.map((prato) => prato.nome)])).toEqual([
      ['Principais', ['Risoto de abóbora assada', 'Burrata']],
      ['Massas', ['Pappardelle']],
    ]);
    expect(cardapio.secoes[0]?.pratos[1]?.disponivel).toBe(false);

    const novoSlug = `${restaurante.slug}-novo`;
    await banco.comRestaurante(restaurante.id, async (transacao) => {
      await transacao.execute(
        sql`INSERT INTO historico_slugs (restaurante_id, slug) VALUES (${restaurante.id}, ${novoSlug})`,
      );
      await transacao.update(restaurantes).set({ slug: novoSlug });
    });
    const antigo = valor(
      await obterCardapioPublicado({ fonte, cache: semCache, relogio, enderecos }, restaurante.slug),
    );
    expect(antigo).toEqual({ tipo: 'redirecionar', slug: novoSlug });

    await banco.comRestaurante(restaurante.id, (transacao) =>
      transacao.update(restaurantes).set({ situacao: 'cancelado' }),
    );
    const cancelado = await obterCardapioPublicado({ fonte, cache: semCache, relogio, enderecos }, novoSlug);
    expect(!cancelado.ok && cancelado.erro.codigo).toBe(CODIGOS.CARDAPIO_CONSULTAR_NAO_ENCONTRADO);
  });
});
