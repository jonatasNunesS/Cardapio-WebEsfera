import { CODIGOS, type Horario } from '@cardapio/dominio';
import { describe, expect, it } from 'vitest';
import { HorariosEmMemoria } from '../../testes/dobles.ts';
import { definirHorarios } from './definir-horarios.ts';

const HORARIOS: Horario[] = [
  { diaSemana: 5, abre: '18:00', fecha: '02:00' },
  { diaSemana: 1, abre: '11:30', fecha: '15:00' },
];

describe('DefinirHorarios', () => {
  it('grava os horários válidos, ordenados', async () => {
    const horarios = new HorariosEmMemoria();
    const resultado = await definirHorarios(
      { horarios },
      { restauranteId: 'r1', papel: 'gerente' },
      HORARIOS,
    );

    expect(resultado.ok).toBe(true);
    expect(horarios.porRestaurante.get('r1')?.map((horario) => horario.diaSemana)).toEqual([1, 5]);
  });

  it('recusa horários inválidos', async () => {
    const horarios = new HorariosEmMemoria();
    const resultado = await definirHorarios({ horarios }, { restauranteId: 'r1', papel: 'dono' }, [
      { diaSemana: 1, abre: '18:00', fecha: '18:00' },
    ]);
    expect(!resultado.ok && resultado.erro.codigo).toBe(CODIGOS.HORARIO_DEFINIR_INVALIDO);
    expect(horarios.porRestaurante.size).toBe(0);
  });

  it('garçom não define horários', async () => {
    const horarios = new HorariosEmMemoria();
    const resultado = await definirHorarios({ horarios }, { restauranteId: 'r1', papel: 'garcom' }, HORARIOS);
    expect(!resultado.ok && resultado.erro.codigo).toBe(CODIGOS.HORARIO_DEFINIR_SEM_PERMISSAO);
  });
});
