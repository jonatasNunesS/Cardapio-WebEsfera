import { describe, expect, it } from 'vitest';
import { CODIGOS } from '../compartilhado/codigos.ts';
import { validarHorarios, viraODia } from './horario.ts';
import { DIAS_DE_TESTE, prepararNovoRestaurante } from './restaurante.ts';
import { candidatosDeSlug, gerarSlug, SLUGS_RESERVADOS, TAMANHO_MAXIMO_DO_SLUG } from './slug.ts';

describe('slug', () => {
  it.each([
    ['Brasa & Trigo', 'brasa-e-trigo'],
    ['Cantina Dona Lú', 'cantina-dona-lu'],
    ['  Açaí   do Zé!!  ', 'acai-do-ze'],
    ['Hamburgueria 77', 'hamburgueria-77'],
    ['São João & Cia.', 'sao-joao-e-cia'],
    ['ÉÊÈ ÇÃO', 'eee-cao'],
  ])('%s vira %s', (nome, slug) => {
    expect(gerarSlug(nome)).toBe(slug);
  });

  it('respeita o formato do banco e o tamanho máximo', () => {
    const slug = gerarSlug(`${'a'.repeat(59)} b ${'c'.repeat(10)}`);
    expect(slug.length).toBeLessThanOrEqual(TAMANHO_MAXIMO_DO_SLUG);
    expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('gera candidatos com sufixo para quando o slug estiver ocupado', () => {
    expect(candidatosDeSlug('Brasa & Trigo')).toEqual([
      'brasa-e-trigo',
      ...Array.from({ length: 8 }, (_, i) => `brasa-e-trigo-${String(i + 2)}`),
    ]);
  });

  it('nunca propõe um slug reservado', () => {
    for (const reservado of SLUGS_RESERVADOS) {
      expect(candidatosDeSlug(reservado)).not.toContain(reservado);
    }
    expect(candidatosDeSlug('Admin')[0]).toBe('admin-2');
  });

  it('nome sem letra nem número não gera slug', () => {
    expect(candidatosDeSlug('!!! ???')).toEqual([]);
  });
});

describe('prepararNovoRestaurante', () => {
  const agora = new Date('2026-10-22T12:00:00Z');

  it('nasce em teste por 10 dias', () => {
    const resultado = prepararNovoRestaurante('Brasa & Trigo', agora);
    expect(resultado.ok && resultado.valor).toMatchObject({
      nome: 'Brasa & Trigo',
      situacao: 'teste',
      testeTerminaEm: new Date('2026-11-01T12:00:00Z'),
    });
    expect(DIAS_DE_TESTE).toBe(10);
  });

  it.each(['', '   ', '!!!', 'x'.repeat(81)])('recusa o nome "%s"', (nome) => {
    const resultado = prepararNovoRestaurante(nome, agora);
    expect(!resultado.ok && resultado.erro.codigo).toBe(CODIGOS.RESTAURANTE_CRIAR_NOME_INVALIDO);
  });
});

describe('horários', () => {
  it('ordena por dia e aceita virar a noite', () => {
    const resultado = validarHorarios([
      { diaSemana: 5, abre: '18:00', fecha: '02:00' },
      { diaSemana: 1, abre: '11:30', fecha: '15:00' },
    ]);
    expect(resultado.ok && resultado.valor.map((h) => h.diaSemana)).toEqual([1, 5]);
    expect(viraODia({ diaSemana: 5, abre: '18:00', fecha: '02:00' })).toBe(true);
  });

  it.each([
    [[{ diaSemana: 7, abre: '10:00', fecha: '12:00' }]],
    [[{ diaSemana: 1, abre: '24:00', fecha: '12:00' }]],
    [[{ diaSemana: 1, abre: '10:00', fecha: '10:00' }]],
    [
      [
        { diaSemana: 1, abre: '10:00', fecha: '12:00' },
        { diaSemana: 1, abre: '18:00', fecha: '22:00' },
      ],
    ],
  ] as const)('recusa %j', (horarios) => {
    const resultado = validarHorarios(horarios as never);
    expect(!resultado.ok && resultado.erro.codigo).toBe(CODIGOS.HORARIO_DEFINIR_INVALIDO);
  });
});
