import { describe, expect, it } from 'vitest';
import { esquemaDefinirHorarios, esquemaEntrar, esquemaPublicarPersonalizacao } from './esquemas.ts';

describe('esquemas de identidade', () => {
  it('recusa campos a mais: o restaurante nunca vem do corpo', () => {
    expect(esquemaEntrar.safeParse({ email: 'a@b.co', senha: 'x', restauranteId: 'r' }).success).toBe(false);
    expect(
      esquemaPublicarPersonalizacao.safeParse({
        corMarca: '#B4441F',
        logoUrl: null,
        capaUrl: null,
        frase: '',
        linkAvaliacaoGoogle: null,
        textos: { boasVindas: '', aoChamarGarcom: '', restauranteFechado: '' },
        restaurante_id: 'r',
      }).success,
    ).toBe(false);
  });

  it('dia da semana só de 0 a 6', () => {
    const horario = (diaSemana: number) => ({ horarios: [{ diaSemana, abre: '18:00', fecha: '23:00' }] });
    expect(esquemaDefinirHorarios.safeParse(horario(6)).success).toBe(true);
    expect(esquemaDefinirHorarios.safeParse(horario(7)).success).toBe(false);
  });
});
