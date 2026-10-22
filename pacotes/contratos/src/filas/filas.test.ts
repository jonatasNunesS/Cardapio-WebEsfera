import { describe, expect, it } from 'vitest';
import { EVENTOS, ehTipoDeEvento, esquemaMensagemTempoReal } from './eventos.ts';
import { JOBS, NOMES_DAS_FILAS } from './jobs.ts';

const ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

describe('contratos das filas', () => {
  it('todo job aponta para uma fila registrada', () => {
    for (const definicao of Object.values(JOBS)) {
      expect(NOMES_DAS_FILAS).toContain(definicao.fila);
    }
  });

  it('payload com campo a mais é recusado', () => {
    expect(JOBS['expirar-sessoes-mesa'].esquema.safeParse({ idRastreio: ID }).success).toBe(true);
    expect(JOBS['expirar-sessoes-mesa'].esquema.safeParse({ email: 'a@b.co' }).success).toBe(false);
  });

  it('evento SessaoMesaExpirada só carrega ids, sem dado pessoal', () => {
    expect(EVENTOS.SessaoMesaExpirada.safeParse({ versao: 1, sessaoMesaId: ID, mesaId: ID }).success).toBe(
      true,
    );
    expect(
      EVENTOS.SessaoMesaExpirada.safeParse({ versao: 1, sessaoMesaId: ID, mesaId: ID, nome: 'x' }).success,
    ).toBe(false);
    expect(ehTipoDeEvento('SessaoMesaExpirada')).toBe(true);
    expect(ehTipoDeEvento('MesaCriada')).toBe(false);
  });

  it('mensagem de tempo real segue o formato do plano', () => {
    expect(
      esquemaMensagemTempoReal.safeParse({
        id: ID,
        tipo: 'SessaoMesaExpirada',
        restaurante_id: ID,
        ocorrido_em: '2026-10-22T20:00:00.000Z',
        versao: 1,
        dados: { mesaId: ID },
      }).success,
    ).toBe(true);
  });
});
