import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AcessoAoBanco } from '../banco.ts';
import { criarRepositorioDeHorarios } from '../restaurantes/repositorio-de-horarios.ts';
import { criarRepositorioDePersonalizacao } from '../restaurantes/repositorio-de-personalizacao.ts';
import { abrirBanco, consultarComoAdmin, criarRestauranteDeTeste } from './apoio.ts';

const PERSONALIZACAO = {
  corMarca: '#2F6B3A',
  corSobreMarca: '#FFFFFF',
  corMarcaTexto: '#2F6B3A',
  logoUrl: '/midias/logo.webp',
  capaUrl: null,
  frase: 'Horta e brasa',
  linkAvaliacaoGoogle: 'https://g.page/r/x/review',
  linkInstagram: null,
  textos: { boasVindas: 'Olá', aoChamarGarcom: 'Já vamos', restauranteFechado: 'Fechado' },
};

let banco: AcessoAoBanco;

beforeAll(() => {
  banco = abrirBanco('api');
});

afterAll(async () => {
  await banco.encerrar();
});

describe('personalização', () => {
  it('publicar grava ou atualiza a única linha do restaurante e sobe a versão', async () => {
    const repositorio = criarRepositorioDePersonalizacao(banco);
    const { id } = await criarRestauranteDeTeste(banco);

    expect(await repositorio.buscar(id)).toBeNull();
    expect(await repositorio.publicar(id, PERSONALIZACAO)).toBe(1);
    expect(await repositorio.publicar(id, { ...PERSONALIZACAO, frase: 'Nova' })).toBe(2);
    expect(await repositorio.buscar(id)).toEqual({ ...PERSONALIZACAO, frase: 'Nova', versao: 2 });
  });

  it('publicar em A não altera B', async () => {
    const repositorio = criarRepositorioDePersonalizacao(banco);
    const [a, b] = [await criarRestauranteDeTeste(banco), await criarRestauranteDeTeste(banco)];
    await repositorio.publicar(b.id, PERSONALIZACAO);
    await repositorio.publicar(a.id, { ...PERSONALIZACAO, corMarca: '#1F4E8C' });

    expect((await repositorio.buscar(b.id))?.corMarca).toBe('#2F6B3A');
  });

  it('o banco recusa cor fora do formato, mesmo que o código deixe passar', async () => {
    const repositorio = criarRepositorioDePersonalizacao(banco);
    const { id } = await criarRestauranteDeTeste(banco);
    await expect(repositorio.publicar(id, { ...PERSONALIZACAO, corMarca: 'red' })).rejects.toMatchObject({
      codigo: 'BANCO_CONSULTA_FALHOU',
    });
  });
});

describe('horários', () => {
  it('substitui a semana inteira do restaurante', async () => {
    const repositorio = criarRepositorioDeHorarios(banco);
    const { id } = await criarRestauranteDeTeste(banco);
    await repositorio.substituir(id, [
      { diaSemana: 1, abre: '11:30', fecha: '15:00' },
      { diaSemana: 5, abre: '18:00', fecha: '02:00' },
    ]);
    await repositorio.substituir(id, [{ diaSemana: 2, abre: '12:00', fecha: '16:00' }]);

    const linhas = await consultarComoAdmin<{ dia_semana: number; abre: string; fecha: string }>(
      'SELECT dia_semana, abre::text, fecha::text FROM horarios WHERE restaurante_id = $1',
      [id],
    );
    expect(linhas).toEqual([{ dia_semana: 2, abre: '12:00:00', fecha: '16:00:00' }]);
  });
});
