import { describe, expect, it } from 'vitest';
import { momentoLocal, situacaoDoHorario, type Horario } from './horario.ts';

const SEMANA: Horario[] = [
  { diaSemana: 2, abre: '18:00', fecha: '23:00' },
  { diaSemana: 5, abre: '18:00', fecha: '02:00' },
];

const em = (diaSemana: 0 | 1 | 2 | 3 | 4 | 5 | 6, hora: string) => {
  const [h = 0, m = 0] = hora.split(':').map(Number);
  return { diaSemana, minutos: h * 60 + m };
};

describe('situação do horário', () => {
  it('sem horário cadastrado conta como aberto', () => {
    expect(situacaoDoHorario([], em(1, '03:00'))).toEqual({ aberto: true, proximaAbertura: null });
  });

  it('aberto dentro do intervalo, fechado no limite de fechamento', () => {
    expect(situacaoDoHorario(SEMANA, em(2, '18:00')).aberto).toBe(true);
    expect(situacaoDoHorario(SEMANA, em(2, '22:59')).aberto).toBe(true);
    expect(situacaoDoHorario(SEMANA, em(2, '23:00')).aberto).toBe(false);
  });

  it('horário que vira o dia cobre a madrugada do dia seguinte', () => {
    expect(situacaoDoHorario(SEMANA, em(5, '23:30')).aberto).toBe(true);
    expect(situacaoDoHorario(SEMANA, em(6, '01:59')).aberto).toBe(true);
    expect(situacaoDoHorario(SEMANA, em(6, '02:00')).aberto).toBe(false);
  });

  it('fechado informa a próxima abertura, hoje ou num dia seguinte', () => {
    expect(situacaoDoHorario(SEMANA, em(2, '10:00')).proximaAbertura).toEqual({
      diaSemana: 2,
      abre: '18:00',
      hoje: true,
    });
    expect(situacaoDoHorario(SEMANA, em(2, '23:30')).proximaAbertura).toEqual({
      diaSemana: 5,
      abre: '18:00',
      hoje: false,
    });
  });

  it('converte o instante para o fuso do restaurante', () => {
    const instante = new Date('2026-10-23T01:30:00Z');
    expect(momentoLocal(instante, 'America/Sao_Paulo')).toEqual({ diaSemana: 4, minutos: 22 * 60 + 30 });
    expect(momentoLocal(instante, 'UTC')).toEqual({ diaSemana: 5, minutos: 90 });
  });
});
