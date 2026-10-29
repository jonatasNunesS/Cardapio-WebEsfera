import type { RepositorioDeMesas } from '@cardapio/aplicacao';
import { sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AcessoAoBanco } from '../banco.ts';
import { criarLeituraDeMesasDoAdmin } from '../mesas/leitura-do-admin.ts';
import { criarRepositorioDeMesas } from '../mesas/repositorio-de-mesas.ts';
import { criarRepositorioMesas } from '../mesas/repositorio-mesas.ts';
import { criarSessoesDeMesa } from '../mesas/sessoes-de-mesa.ts';
import { abrirBanco, consultarComoAdmin, criarRestauranteDeTeste } from './apoio.ts';

const AUTOR = { usuarioId: uuidv7() };
const SEM_LIMITE = 1000;
const geradorDeCodigoDeMesa = { gerar: () => randomBytes(16).toString('base64url') };

describe('mesas do painel no Postgres', () => {
  let banco: AcessoAoBanco;
  let mesas: RepositorioDeMesas;

  beforeAll(() => {
    banco = abrirBanco('api');
    mesas = criarRepositorioDeMesas(banco);
  });

  afterAll(async () => {
    await banco.encerrar();
  });

  async function nova(restauranteId: string, numero: number, limite = SEM_LIMITE) {
    return mesas.criar(
      restauranteId,
      { numero, nome: null, area: null, codigo: geradorDeCodigoDeMesa.gerar() },
      limite,
      AUTOR,
    );
  }

  async function criada(restauranteId: string, numero: number) {
    const desfecho = await nova(restauranteId, numero);
    if (desfecho.tipo !== 'ok') {
      throw new Error(desfecho.tipo);
    }
    return desfecho.mesa;
  }

  function auditoria(restauranteId: string) {
    return consultarComoAdmin<{ acao: string; autor_id: string; antes: unknown; depois: unknown }>(
      `SELECT acao, autor_id, antes, depois FROM auditoria WHERE restaurante_id = $1 AND entidade = 'mesa' ORDER BY criado_em, id`,
      [restauranteId],
    );
  }

  it('cria, lista em ordem e audita; número repetido e código repetido são distinguidos', async () => {
    const restaurante = await criarRestauranteDeTeste(banco);
    const dois = await criada(restaurante.id, 2);
    await criada(restaurante.id, 1);
    const repetido = await nova(restaurante.id, 2);
    const outro = await criarRestauranteDeTeste(banco);
    const mesmoCodigo = await mesas.criar(
      outro.id,
      { numero: 9, nome: null, area: null, codigo: dois.codigo },
      SEM_LIMITE,
      AUTOR,
    );

    expect((await mesas.listar(restaurante.id)).mesas.map((mesa) => mesa.numero)).toEqual([1, 2]);
    expect(repetido).toEqual({ tipo: 'numero-repetido' });
    expect(mesmoCodigo).toEqual({ tipo: 'codigo-repetido' });
    expect((await auditoria(restaurante.id)).map((linha) => [linha.acao, linha.autor_id])).toEqual([
      ['criar', AUTOR.usuarioId],
      ['criar', AUTOR.usuarioId],
    ]);
  });

  it('limite: conta só as ativas; desativar libera; reativar respeita; tudo auditado', async () => {
    const restaurante = await criarRestauranteDeTeste(banco);
    const primeira =
      (await nova(restaurante.id, 1, 2)).tipo === 'ok'
        ? (await mesas.listar(restaurante.id)).mesas[0]
        : undefined;
    await nova(restaurante.id, 2, 2);
    const alem = await nova(restaurante.id, 3, 2);
    await mesas.alterarAtiva(restaurante.id, primeira?.id ?? '', false, 2, AUTOR);
    const depois = await nova(restaurante.id, 3, 2);
    const reativar = await mesas.alterarAtiva(restaurante.id, primeira?.id ?? '', true, 2, AUTOR);

    expect(alem).toEqual({ tipo: 'limite' });
    expect(depois.tipo).toBe('ok');
    expect(reativar).toEqual({ tipo: 'limite' });
    expect((await auditoria(restaurante.id)).map((linha) => linha.acao)).toEqual([
      'criar',
      'criar',
      'desativar',
      'criar',
    ]);
  });

  it('renumerar grava o número antigo no histórico e na auditoria, sem mudar o código; trocar código audita sem o código', async () => {
    const restaurante = await criarRestauranteDeTeste(banco);
    const mesa = await criada(restaurante.id, 7);
    const renumerada = await mesas.renumerar(restaurante.id, mesa.id, 17, AUTOR);
    const novoCodigo = geradorDeCodigoDeMesa.gerar();
    const trocada = await mesas.trocarCodigo(restaurante.id, mesa.id, novoCodigo, AUTOR);
    const historico = await consultarComoAdmin<{ numero: number }>(
      'SELECT numero FROM historico_numeros_mesa WHERE mesa_id = $1',
      [mesa.id],
    );
    const linhas = await auditoria(restaurante.id);

    expect(renumerada.tipo === 'ok' && renumerada.mesa).toMatchObject({ numero: 17, codigo: mesa.codigo });
    expect(trocada.tipo === 'ok' && trocada.mesa.codigo).toBe(novoCodigo);
    expect(historico).toEqual([{ numero: 7 }]);
    expect(linhas.map((linha) => [linha.acao, linha.antes, linha.depois])).toEqual([
      ['criar', null, { numero: 7 }],
      ['renumerar', { numero: 7 }, { numero: 17 }],
      ['trocar_codigo', null, null],
    ]);
    expect(JSON.stringify(linhas)).not.toContain(novoCodigo);
  });

  it('mudar slug e número não quebra o QR impresso: o link antigo redireciona; o código trocado deixa de valer', async () => {
    const restaurante = await criarRestauranteDeTeste(banco);
    const mesa = await criada(restaurante.id, 4);
    const resolucao = criarRepositorioMesas(banco);
    await mesas.renumerar(restaurante.id, mesa.id, 40, AUTOR);
    const slugNovo = `${restaurante.slug}-novo`;
    await banco.comRestaurante(restaurante.id, async (transacao) => {
      await transacao.execute(
        sql`INSERT INTO historico_slugs (restaurante_id, slug) VALUES (${restaurante.id}, ${slugNovo})`,
      );
      await transacao.execute(sql`UPDATE restaurantes SET slug = ${slugNovo} WHERE id = ${restaurante.id}`);
    });

    expect(await resolucao.resolverMesa(restaurante.slug, 4, mesa.codigo)).toEqual({
      situacao: 'redirecionar',
      restauranteId: restaurante.id,
      mesaId: mesa.id,
      slugAtual: slugNovo,
      numeroAtual: 40,
    });
    expect(await resolucao.resolverMesa(slugNovo, 40, mesa.codigo)).toMatchObject({ situacao: 'valida' });
    await mesas.trocarCodigo(restaurante.id, mesa.id, geradorDeCodigoDeMesa.gerar(), AUTOR);
    expect(await resolucao.resolverMesa(slugNovo, 40, mesa.codigo)).toEqual({ situacao: 'desconhecido' });
  });

  it('isolamento: B não lista, não edita, não renumera, não desativa nem troca o código das mesas de A', async () => {
    const a = await criarRestauranteDeTeste(banco);
    const b = await criarRestauranteDeTeste(banco);
    const mesa = await criada(a.id, 1);

    expect((await mesas.listar(b.id)).mesas).toEqual([]);
    expect(await mesas.editar(b.id, mesa.id, { nome: 'x', area: null }, AUTOR)).toEqual({
      tipo: 'nao-encontrada',
    });
    expect(await mesas.renumerar(b.id, mesa.id, 2, AUTOR)).toEqual({ tipo: 'nao-encontrada' });
    expect(await mesas.alterarAtiva(b.id, mesa.id, false, SEM_LIMITE, AUTOR)).toEqual({
      tipo: 'nao-encontrada',
    });
    expect(await mesas.trocarCodigo(b.id, mesa.id, geradorDeCodigoDeMesa.gerar(), AUTOR)).toEqual({
      tipo: 'nao-encontrada',
    });
    expect((await mesas.listar(a.id)).mesas[0]).toEqual(mesa);
  });

  it('sessão de mesa: uma aberta por mesa, reaproveitada; depois de vencida, abre outra', async () => {
    const restaurante = await criarRestauranteDeTeste(banco);
    const mesa = await criada(restaurante.id, 1);
    const sessoes = criarSessoesDeMesa(banco);
    const agora = new Date('2026-10-29T20:00:00Z');
    const quatroHoras = new Date(agora.getTime() + 4 * 60 * 60 * 1000);

    const primeira = await sessoes.abrirOuReusar(restaurante.id, mesa.id, agora, quatroHoras);
    const [segunda, terceira] = await Promise.all([
      sessoes.abrirOuReusar(restaurante.id, mesa.id, new Date(agora.getTime() + 60_000), new Date(0)),
      sessoes.abrirOuReusar(restaurante.id, mesa.id, new Date(agora.getTime() + 60_000), new Date(0)),
    ]);
    const depoisDeVencer = new Date(quatroHoras.getTime() + 1000);
    const nova = await sessoes.abrirOuReusar(
      restaurante.id,
      mesa.id,
      depoisDeVencer,
      new Date(depoisDeVencer.getTime() + 4 * 60 * 60 * 1000),
    );

    expect(segunda).toEqual(primeira);
    expect(terceira).toEqual(primeira);
    expect(primeira.expiraEm).toEqual(quatroHoras);
    expect(nova.sessaoId).not.toBe(primeira.sessaoId);
    const abertas = await consultarComoAdmin(
      'SELECT id FROM sessoes_mesa WHERE mesa_id = $1 AND fechada_em IS NULL',
      [mesa.id],
    );
    expect(abertas).toEqual([{ id: nova.sessaoId }]);
  });

  it('admin: lê as mesas do restaurante pelo slug com auditoria; admin inexistente não lê nada', async () => {
    const restaurante = await criarRestauranteDeTeste(banco);
    await criada(restaurante.id, 3);
    const vazio = await criarRestauranteDeTeste(banco);
    const [admin] = await consultarComoAdmin<{ id: string }>(
      `INSERT INTO administradores (nome, email, hash_senha, papel, troca_de_senha_obrigatoria, segredo_totp_cifrado)
       VALUES ('Ops', $1, '$argon2id$x', 'suporte', false, 'cifrado') RETURNING id`,
      [`ops-${uuidv7()}@webesfera.com.br`],
    );
    const leitura = criarLeituraDeMesasDoAdmin(banco);

    const lida = await leitura.listar(admin?.id ?? '', restaurante.slug);
    expect(lida).toMatchObject({ slug: restaurante.slug, mesas: [{ numero: 3, ativa: true }] });
    expect(await leitura.listar(admin?.id ?? '', vazio.slug)).toMatchObject({ mesas: [] });
    expect(await leitura.listar(uuidv7(), restaurante.slug)).toBeNull();
    expect(await leitura.listar(admin?.id ?? '', 'nao-existe')).toBeNull();
    const consultas = await consultarComoAdmin(
      `SELECT autor_tipo, autor_id FROM auditoria WHERE restaurante_id = $1 AND acao = 'consultar'`,
      [restaurante.id],
    );
    expect(consultas).toEqual([{ autor_tipo: 'administrador', autor_id: admin?.id }]);
  });
});
