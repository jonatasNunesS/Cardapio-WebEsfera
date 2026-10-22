import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Esqueleto } from './Esqueleto.tsx';

describe('Esqueleto', () => {
  it('os blocos ficam fora da árvore de acessibilidade e há um texto equivalente', () => {
    const { container } = render(<Esqueleto rotulo="Carregando cardápio" linhas={4} comMidia />);
    expect(screen.getByRole('status').textContent).toBe('Carregando cardápio');
    const blocos = container.querySelector('[aria-hidden="true"]');
    expect(blocos?.children).toHaveLength(5);
  });
});
