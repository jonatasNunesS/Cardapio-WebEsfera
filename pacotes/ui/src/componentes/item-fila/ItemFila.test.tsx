import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ItemFila } from './ItemFila.tsx';

const BASE = { mesa: 7, tipo: 'Pedir a conta', tempo: 'há 6 min' } as const;

describe('ItemFila', () => {
  it('novo: mostra a mesa e o botão Assumir com a mesa no nome', async () => {
    const aoAssumir = vi.fn();
    render(<ItemFila {...BASE} estado="novo" aoAssumir={aoAssumir} />);
    expect(screen.getByRole('heading', { name: 'Mesa 7' })).toBeDefined();
    await userEvent.click(screen.getByRole('button', { name: 'Assumir mesa 7' }));
    expect(aoAssumir).toHaveBeenCalledTimes(1);
  });

  it('atrasado: o atraso está escrito, não só na cor', () => {
    render(<ItemFila {...BASE} estado="atrasado" />);
    expect(screen.getByText('Atrasado · há 6 min')).toBeDefined();
  });

  it('assumido: mostra quem assumiu e o botão Concluir', async () => {
    const aoConcluir = vi.fn();
    render(<ItemFila {...BASE} estado="assumido" aoConcluir={aoConcluir} />);
    expect(screen.getByText('Você assumiu')).toBeDefined();
    await userEvent.click(screen.getByRole('button', { name: 'Concluir mesa 7' }));
    expect(aoConcluir).toHaveBeenCalledTimes(1);
  });

  it('na TV não há botões', () => {
    render(<ItemFila {...BASE} estado="assumido" naTv responsavel="Rafael" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Rafael')).toBeDefined();
  });
});
