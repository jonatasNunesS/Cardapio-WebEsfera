import {
  aceitarConvite,
  alternarSuspensao,
  chamarGarcom,
  criarPedido,
  criarRestauranteComDono,
  gerarNovoConvite,
  listarRestaurantes,
  obterIndicadores,
  verFinanceiro,
  type DependenciasDaPlataforma,
} from '@cardapio/aplicacao';
import { CODIGOS } from '@cardapio/dominio';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarRepositorioDeAtendimento } from '../banco/atendimento/repositorio-de-atendimento.ts';
import type { AcessoAoBanco } from '../banco/banco.ts';
import { criarRepositorioDePedidos } from '../banco/pedidos/repositorio-de-pedidos.ts';
import { criarRepositorioDaPlataforma } from '../banco/plataforma/repositorio-da-plataforma.ts';
import { abrirBanco, consultarComoAdmin, sufixoUnico } from '../banco/testes/apoio.ts';
import { geradorDeSegredos } from '../identidade/segredos-cripto.ts';
import { enviadorConviteManual } from './enviador-convite-manual.ts';

const HASH = '$argon2id$v=19$m=19456,t=2,p=1$ZmFicmljYQ$ZmFicmljYQ';
let banco: AcessoAoBanco;
let dependencias: DependenciasDaPlataforma;
let admin = { administradorId: '' };

async function novoAdmin(comSegundoFator: boolean) {
  const [linha] = await consultarComoAdmin<{ id: string }>(
    `INSERT INTO administradores (nome, email, hash_senha, papel, segredo_totp_cifrado)
     VALUES ('Ops', $1, $2, 'suporte', $3) RETURNING id`,
    [`ops-${sufixoUnico()}@webesfera.com.br`, HASH, comSegundoFator ? 'cifrado' : null],
  );
  return { administradorId: linha?.id ?? '' };
}

beforeAll(async () => {
  banco = abrirBanco('api', {}, 6);
  admin = await novoAdmin(true);
  dependencias = {
    plataforma: criarRepositorioDaPlataforma(banco),
    enviador: enviadorConviteManual,
    segredos: geradorDeSegredos,
    cofre: { resumir: () => Promise.resolve(HASH), conferir: () => Promise.resolve(false) },
    senhasVazadas: { contem: () => false },
    relogio: { agora: () => new Date() },
    urlDoConvite: 'https://painel.localhost/convite',
  };
});

afterAll(async () => {
  await banco.encerrar();
});

async function criar() {
  const sufixo = sufixoUnico();
  const resultado = await criarRestauranteComDono(dependencias, admin, {
    nome: `Brasa ${sufixo}`,
    slug: `brasa-${sufixo}`,
    emailDoDono: `dono-${sufixo}@brasa.com.br`,
  });
  if (!resultado.ok) {
    throw new Error(resultado.erro.codigo);
  }
  const [linha] = await consultarComoAdmin<{ id: string }>('SELECT id FROM restaurantes WHERE slug = $1', [
    resultado.valor.slug,
  ]);
  return {
    ...resultado.valor,
    restauranteId: linha?.id ?? '',
    token: resultado.valor.linkDoConvite?.split('token=')[1] ?? '',
  };
}

const auditoria = (restauranteId: string) =>
  consultarComoAdmin<{ acao: string; autor_tipo: string; motivo: string | null }>(
    'SELECT acao, autor_tipo, motivo FROM auditoria WHERE restaurante_id = $1 ORDER BY id',
    [restauranteId],
  );

describe('admin mínimo no Postgres', () => {
  it('cria restaurante, dono, personalização e convite numa transação, com auditoria', async () => {
    const criado = await criar();

    expect(criado.token).not.toBe('');
    expect((await auditoria(criado.restauranteId)).map((linha) => linha.acao)).toEqual([
      'restaurante.criar',
      'convite.gerar',
    ]);
    const [convite] = await consultarComoAdmin<{ hash_token: string; horas: number }>(
      `SELECT hash_token, round(extract(epoch FROM expira_em - criado_em) / 3600)::int AS horas
         FROM convites WHERE restaurante_id = $1`,
      [criado.restauranteId],
    );
    expect(convite?.horas).toBe(72);
    expect(convite?.hash_token).not.toContain(criado.token);
    const lista = await listarRestaurantes(dependencias, admin);
    expect(lista.find((item) => item.slug === criado.slug)).toMatchObject({
      situacao: 'teste',
      diasDeTeste: 10,
    });
  });

  it('slug ou e-mail repetidos não criam nada', async () => {
    const criado = await criar();
    const repetido = await criarRestauranteComDono(dependencias, admin, {
      nome: 'Outro',
      slug: criado.slug,
      emailDoDono: `novo-${sufixoUnico()}@brasa.com.br`,
    });
    expect(repetido).toMatchObject({ ok: false, erro: { codigo: CODIGOS.PLATAFORMA_CRIAR_SLUG_OCUPADO } });
  });

  it('admin sem segundo fator não lê nem cria nada', async () => {
    const semFator = await novoAdmin(false);
    expect(await listarRestaurantes(dependencias, semFator)).toEqual([]);
    const tentativa = await criarRestauranteComDono(dependencias, semFator, {
      nome: 'Sem fator',
      slug: `sem-fator-${sufixoUnico()}`,
      emailDoDono: `x-${sufixoUnico()}@brasa.com.br`,
    });
    expect(tentativa).toMatchObject({ ok: false, erro: { codigo: CODIGOS.PLATAFORMA_ACAO_SEM_PERMISSAO } });
  });

  it('convite: novo invalida o anterior, uso único e grava a senha', async () => {
    const criado = await criar();
    const novo = await gerarNovoConvite(dependencias, admin, criado.slug);
    const segundo = novo.ok ? (novo.valor.linkDoConvite?.split('token=')[1] ?? '') : '';
    const senha = { senha: 'cavalo-bateria-grampo' };

    expect((await aceitarConvite(dependencias, { token: criado.token, ...senha })).ok).toBe(false);
    expect((await aceitarConvite(dependencias, { token: segundo, ...senha })).ok).toBe(true);
    expect((await aceitarConvite(dependencias, { token: segundo, ...senha })).ok).toBe(false);
    expect((await auditoria(criado.restauranteId)).map((linha) => linha.acao)).toContain('convite.aceitar');
  });

  it('convite vencido não vale', async () => {
    const criado = await criar();
    await consultarComoAdmin(
      "UPDATE convites SET criado_em = now() - interval '73 hours', expira_em = now() - interval '1 hour' WHERE restaurante_id = $1",
      [criado.restauranteId],
    );
    expect(
      (await aceitarConvite(dependencias, { token: criado.token, senha: 'cavalo-bateria-grampo' })).ok,
    ).toBe(false);
  });

  it('suspender e reativar com motivo e auditoria; aparece como suspenso', async () => {
    const criado = await criar();
    const pedir = (suspender: boolean) =>
      alternarSuspensao(dependencias, admin, { slug: criado.slug, suspender, motivo: 'teste de suspensão' });

    expect((await pedir(true)).ok).toBe(true);
    expect((await pedir(true)).ok).toBe(false);
    expect(
      (await listarRestaurantes(dependencias, admin)).find((item) => item.slug === criado.slug)?.situacao,
    ).toBe('suspenso');
    expect((await pedir(false)).ok).toBe(true);
    const registros = await auditoria(criado.restauranteId);
    expect(registros.filter((linha) => linha.acao.startsWith('restaurante.'))).toEqual([
      { acao: 'restaurante.criar', autor_tipo: 'administrador', motivo: null },
      { acao: 'restaurante.suspender', autor_tipo: 'administrador', motivo: 'teste de suspensão' },
      { acao: 'restaurante.reativar', autor_tipo: 'administrador', motivo: 'teste de suspensão' },
    ]);
  });

  it('suspenso recusa pedido, mas chamar garçom continua', async () => {
    const criado = await criar();
    const mesa = uuidv7();
    const sessao = uuidv7();
    await consultarComoAdmin(
      `INSERT INTO mesas (restaurante_id, id, numero, codigo) VALUES ($1, $2, 1, $3);`,
      [criado.restauranteId, mesa, uuidv7().replaceAll('-', '').slice(0, 22)],
    );
    await consultarComoAdmin(
      `INSERT INTO sessoes_mesa (restaurante_id, id, mesa_id, expira_em) VALUES ($1, $2, $3, now() + interval '4 hours')`,
      [criado.restauranteId, sessao, mesa],
    );
    await alternarSuspensao(dependencias, admin, {
      slug: criado.slug,
      suspender: true,
      motivo: 'suspensão de teste',
    });
    const cliente = { restauranteId: criado.restauranteId, sessaoMesaId: sessao };
    const relogio = { agora: () => new Date() };

    const pedido = await criarPedido(
      { pedidos: criarRepositorioDePedidos(banco), resumidor: geradorDeSegredos, relogio },
      cliente,
      { chave: uuidv7(), itens: [{ pratoId: uuidv7(), quantidade: 1, observacao: '' }] },
    );
    expect(pedido).toMatchObject({ ok: false, erro: { codigo: CODIGOS.PEDIDO_CRIAR_RESTAURANTE_SUSPENSO } });
    const garcom = await chamarGarcom(
      { atendimento: criarRepositorioDeAtendimento(banco), relogio },
      cliente,
      uuidv7(),
    );
    expect(garcom.ok).toBe(true);
  });

  it('financeiro em leitura e indicadores agregados', async () => {
    const criado = await criar();
    const financeiro = await verFinanceiro(dependencias, admin, criado.slug);
    expect(financeiro).toEqual({
      ok: true,
      valor: { situacaoDoRestaurante: 'teste', assinatura: null, cobrancas: [] },
    });
    const indicadores = await obterIndicadores(dependencias, admin);
    expect(indicadores.porSituacao.teste).toBeGreaterThanOrEqual(1);
    expect(typeof indicadores.pedidosUltimas24h).toBe('number');
  });
});
