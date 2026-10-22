import { describe, expect, it } from 'vitest';
import { bloqueadoAte, esperaAposFalhas, esquecerAntesDe } from './bloqueio.ts';
import { expiracaoDaNovaSessao, precisaRenovar, sessaoExpirou, type DatasDaSessao } from './sessao.ts';

const AGORA = new Date('2026-10-22T20:00:00Z');
const minutos = (n: number) => new Date(AGORA.getTime() + n * 60_000);

function sessao(parcial: Partial<DatasDaSessao>): DatasDaSessao {
  return {
    publico: 'painel',
    nivel: 'completa',
    criadaEm: AGORA,
    ultimoUsoEm: AGORA,
    expiraEm: expiracaoDaNovaSessao(parcial.publico ?? 'painel', parcial.nivel ?? 'completa', AGORA),
    ...parcial,
  };
}

describe('expiração da sessão', () => {
  it('painel: cai após 12 h sem uso', () => {
    expect(sessaoExpirou(sessao({}), minutos(12 * 60 - 1))).toBe(false);
    expect(sessaoExpirou(sessao({}), minutos(12 * 60))).toBe(true);
  });

  it('painel: cai aos 30 dias mesmo em uso', () => {
    const usada = sessao({ ultimoUsoEm: minutos(30 * 24 * 60 - 1) });
    expect(sessaoExpirou(usada, minutos(30 * 24 * 60 - 1))).toBe(false);
    expect(sessaoExpirou(usada, minutos(30 * 24 * 60))).toBe(true);
  });

  it('admin: cai após 30 min sem uso e aos 8 h em uso', () => {
    expect(sessaoExpirou(sessao({ publico: 'admin' }), minutos(30))).toBe(true);
    const usada = sessao({ publico: 'admin', ultimoUsoEm: minutos(8 * 60 - 1) });
    expect(sessaoExpirou(usada, minutos(8 * 60 - 1))).toBe(false);
    expect(sessaoExpirou(usada, minutos(8 * 60))).toBe(true);
  });

  it('admin entre a senha e o segundo fator: cai após 5 min sem uso', () => {
    const parcial = sessao({ publico: 'admin', nivel: 'segundo_fator' });
    expect(sessaoExpirou(parcial, minutos(4))).toBe(false);
    expect(sessaoExpirou(parcial, minutos(5))).toBe(true);
  });

  it('renova o último uso no máximo uma vez por minuto', () => {
    expect(precisaRenovar(sessao({}), new Date(AGORA.getTime() + 59_000))).toBe(false);
    expect(precisaRenovar(sessao({}), minutos(1))).toBe(true);
  });
});

describe('bloqueio progressivo', () => {
  it('e-mail: 5 falhas livres, depois 1, 2, 4 min, até 60 min', () => {
    expect([4, 5, 6, 7, 20].map((falhas) => esperaAposFalhas('email', falhas))).toEqual([
      0, 60_000, 120_000, 240_000, 3_600_000,
    ]);
  });

  it('IP: 20 falhas livres, por causa de redes compartilhadas', () => {
    expect(esperaAposFalhas('ip', 19)).toBe(0);
    expect(esperaAposFalhas('ip', 20)).toBe(60_000);
  });

  it('desbloqueia quando o tempo passa', () => {
    const tentativas = { falhas: 6, ultimaFalhaEm: AGORA };
    expect(bloqueadoAte('email', tentativas, minutos(1))).toEqual(minutos(2));
    expect(bloqueadoAte('email', tentativas, minutos(2))).toBeNull();
  });

  it('esquece as falhas depois de 24 h', () => {
    const tentativas = { falhas: 50, ultimaFalhaEm: AGORA };
    expect(bloqueadoAte('email', tentativas, minutos(59))).not.toBeNull();
    expect(bloqueadoAte('email', tentativas, minutos(24 * 60))).toBeNull();
    expect(esquecerAntesDe(AGORA)).toEqual(minutos(-24 * 60));
  });
});
