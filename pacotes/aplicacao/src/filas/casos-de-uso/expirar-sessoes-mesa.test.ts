import { describe, expect, it } from 'vitest';
import type { SessaoMesaVencida, SessoesMesaVencidas } from '../portas/sessoes-mesa-vencidas.ts';
import { expirarSessoesMesa } from './expirar-sessoes-mesa.ts';

const AGORA = new Date('2026-10-22T23:00:00Z');

class SessoesEmMemoria implements SessoesMesaVencidas {
  abertas: SessaoMesaVencida[];
  chamadasDeFechar: { restauranteId: string; ids: readonly string[] }[] = [];

  constructor(abertas: SessaoMesaVencida[]) {
    this.abertas = abertas;
  }

  listar(_agora: Date, limite: number) {
    return Promise.resolve(this.abertas.slice(0, limite));
  }

  fechar(restauranteId: string, ids: readonly string[]) {
    this.chamadasDeFechar.push({ restauranteId, ids });
    const antes = this.abertas.length;
    this.abertas = this.abertas.filter((sessao) => !ids.includes(sessao.sessaoMesaId));
    return Promise.resolve(antes - this.abertas.length);
  }
}

const vencidas = (quantidade: number, restaurantes = 3) =>
  Array.from({ length: quantidade }, (_, indice) => ({
    restauranteId: `r${String(indice % restaurantes)}`,
    sessaoMesaId: `s${String(indice)}`,
  }));

describe('ExpirarSessoesMesa', () => {
  it('fecha em lotes, agrupando por restaurante, até não sobrar vencida', async () => {
    const sessoes = new SessoesEmMemoria(vencidas(12));
    const fechadas = await expirarSessoesMesa({ sessoesMesa: sessoes, relogio: { agora: () => AGORA } }, 5);

    expect(fechadas).toBe(12);
    expect(sessoes.abertas).toEqual([]);
    expect(sessoes.chamadasDeFechar.every((chamada) => chamada.ids.length <= 5)).toBe(true);
    expect(new Set(sessoes.chamadasDeFechar.slice(0, 3).map((chamada) => chamada.restauranteId)).size).toBe(
      3,
    );
  });

  it('sem vencidas, não fecha nada e roda uma consulta só', async () => {
    const sessoes = new SessoesEmMemoria([]);
    expect(await expirarSessoesMesa({ sessoesMesa: sessoes, relogio: { agora: () => AGORA } })).toBe(0);
    expect(sessoes.chamadasDeFechar).toEqual([]);
  });

  it('para no limite de lotes por execução; o resto fica para a próxima', async () => {
    const sessoes = new SessoesEmMemoria(vencidas(30, 1));
    expect(await expirarSessoesMesa({ sessoesMesa: sessoes, relogio: { agora: () => AGORA } }, 1)).toBe(20);
    expect(sessoes.abertas).toHaveLength(10);
  });
});
