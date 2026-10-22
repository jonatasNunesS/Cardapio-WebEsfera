import { CODIGOS } from '@cardapio/dominio';
import { describe, expect, it } from 'vitest';
import { criarConta } from '../../identidade/casos-de-uso/criar-conta.ts';
import { renovarSessao } from '../../identidade/casos-de-uso/renovar-sessao.ts';
import { dependenciasDeIdentidade, RestaurantesEmMemoria } from '../../testes/dobles.ts';
import { consultarRestaurante } from './consultar-restaurante.ts';
import { criarRestaurante } from './criar-restaurante.ts';

async function preparar() {
  const dependencias = { ...dependenciasDeIdentidade(), restaurantes: new RestaurantesEmMemoria() };
  await criarConta(dependencias, { nome: 'Ana', email: 'ana@brasa.com.br', senha: 'cavalo-bateria-grampo' });
  return dependencias;
}

const ENTRADA = { usuarioId: 'usuario-1', hashDaSessao: 'resumo(token-1)', nome: 'Brasa & Trigo' };

describe('CriarRestaurante', () => {
  it('cria em teste de 10 dias, com slug do nome, personalização padrão, e a sessão passa a apontar para ele', async () => {
    const dependencias = await preparar();
    const resultado = await criarRestaurante(dependencias, ENTRADA);

    expect(resultado).toEqual({ ok: true, valor: { restauranteId: 'restaurante-1', slug: 'brasa-e-trigo' } });
    expect(dependencias.restaurantes.criados[0]).toMatchObject({
      donoId: 'usuario-1',
      testeTerminaEm: new Date('2026-11-01T20:00:00Z'),
      personalizacao: { corMarca: '#B4441F', corSobreMarca: '#FFFFFF' },
    });
    const sessao = await renovarSessao(dependencias, {
      token: 'token-1',
      publico: 'painel',
      niveis: ['completa'],
    });
    expect(sessao.ok && sessao.valor).toMatchObject({ restauranteId: 'restaurante-1', papel: 'dono' });
    expect(
      await consultarRestaurante(dependencias, { restauranteId: 'restaurante-1', papel: 'dono' }),
    ).toMatchObject({
      slug: 'brasa-e-trigo',
      situacao: 'teste',
    });
  });

  it('slug ocupado: usa o próximo candidato', async () => {
    const dependencias = await preparar();
    dependencias.restaurantes.slugsOcupados.add('brasa-e-trigo');
    const resultado = await criarRestaurante(dependencias, ENTRADA);
    expect(resultado.ok && resultado.valor.slug).toBe('brasa-e-trigo-2');
  });

  it('todos os candidatos ocupados: falha de negócio', async () => {
    const dependencias = await preparar();
    for (const sufixo of ['', '-2', '-3', '-4', '-5', '-6', '-7', '-8', '-9']) {
      dependencias.restaurantes.slugsOcupados.add(`brasa-e-trigo${sufixo}`);
    }
    const resultado = await criarRestaurante(dependencias, ENTRADA);
    expect(!resultado.ok && resultado.erro).toMatchObject({
      codigo: CODIGOS.RESTAURANTE_CRIAR_SLUG_OCUPADO,
      detalhes: { campo: 'nome' },
    });
  });

  it('nome inválido: falha antes de gravar', async () => {
    const dependencias = await preparar();
    const resultado = await criarRestaurante(dependencias, { ...ENTRADA, nome: '   ' });
    expect(!resultado.ok && resultado.erro.codigo).toBe(CODIGOS.RESTAURANTE_CRIAR_NOME_INVALIDO);
    expect(dependencias.restaurantes.criados).toEqual([]);
  });

  it('sessão recusa o restaurante: erro inesperado', async () => {
    const dependencias = await preparar();
    dependencias.sessoes.aceitar = false;
    await expect(criarRestaurante(dependencias, ENTRADA)).rejects.toMatchObject({
      codigo: CODIGOS.SESSAO_CRIAR_RECUSADA,
    });
  });
});
