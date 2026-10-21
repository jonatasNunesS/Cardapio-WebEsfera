import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SeloSituacao, type Situacao } from './SeloSituacao.tsx';

describe('SeloSituacao', () => {
  it.each<[Situacao, string]>([
    ['aguardando', 'Aguardando'],
    ['emAtendimento', 'Em atendimento'],
    ['concluido', 'Concluído'],
    ['cancelado', 'Cancelado'],
    ['vencida', 'Vencida'],
    ['paga', 'Paga'],
  ])('%s sempre tem texto, nunca só cor', (situacao, texto) => {
    render(<SeloSituacao situacao={situacao} />);
    expect(screen.getByText(texto)).toBeDefined();
  });

  it('aceita outro texto com o mesmo tom', () => {
    render(<SeloSituacao situacao="vencida" texto="Em atraso" />);
    expect(screen.getByText('Em atraso')).toBeDefined();
  });
});
