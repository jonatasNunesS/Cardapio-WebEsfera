import { CODIGOS } from '@cardapio/aplicacao';
import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';
import { montarMensagem } from './publicador-tempo-real.ts';

const evento = (tipo: string, carga: Record<string, unknown>) => ({
  id: uuidv7(),
  restauranteId: uuidv7(),
  tipo,
  carga,
  ocorridoEm: new Date('2026-10-22T12:00:00Z'),
});

describe('mensagem de tempo real', () => {
  it('monta a mensagem com versão separada dos dados', () => {
    const [sessaoMesaId, mesaId] = [uuidv7(), uuidv7()];
    const entrada = evento('SessaoMesaExpirada', { versao: 1, sessaoMesaId, mesaId });

    expect(montarMensagem(entrada)).toEqual({
      id: entrada.id,
      tipo: 'SessaoMesaExpirada',
      restaurante_id: entrada.restauranteId,
      ocorrido_em: '2026-10-22T12:00:00.000Z',
      versao: 1,
      dados: { sessaoMesaId, mesaId },
    });
  });

  it('recusa tipo sem contrato e carga com campo a mais, sem copiar valores para o erro', () => {
    const intruso = evento('SessaoMesaExpirada', {
      versao: 1,
      sessaoMesaId: uuidv7(),
      mesaId: uuidv7(),
      email: 'pessoa@exemplo.com',
    });

    expect(() => montarMensagem(evento('MesaCriada', {}))).toThrow(
      expect.objectContaining({ codigo: CODIGOS.CAIXA_SAIDA_EVENTO_INVALIDO }),
    );
    expect(() => montarMensagem(intruso)).toThrow(
      expect.objectContaining({ codigo: CODIGOS.CAIXA_SAIDA_EVENTO_INVALIDO }),
    );
    expect(() => montarMensagem(intruso)).not.toThrow(/pessoa@exemplo\.com/);
  });
});
