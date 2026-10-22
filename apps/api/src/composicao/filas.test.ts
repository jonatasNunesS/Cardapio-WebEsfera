import { NOMES_DAS_FILAS } from '@cardapio/contratos';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { comporPainelDeFilas } from './filas.ts';

const relatorMudo = { reportar: () => randomUUID(), registrarPasso: () => undefined };

describe('painel de filas composto', () => {
  it('registra todas as filas e limpa dados pessoais do payload e do resultado exibidos', async () => {
    const painel = comporPainelDeFilas('redis://127.0.0.1:1', relatorMudo);
    const [primeiro] = painel.opcoes.adaptadores;
    const dados = { restauranteId: randomUUID(), email: 'pessoa@exemplo.com', senha: 'segredo-123' };

    const exibido = JSON.stringify([primeiro?.format('data', dados), primeiro?.format('returnValue', dados)]);

    expect(painel.opcoes.adaptadores.map((adaptador) => adaptador.getName())).toEqual([...NOMES_DAS_FILAS]);
    expect(exibido).not.toContain('pessoa@exemplo.com');
    expect(exibido).not.toContain('segredo-123');
    expect(exibido).toContain(dados.restauranteId);
    await painel.encerrar();
  });
});
