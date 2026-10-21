import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TelaDeErro } from './TelaDeErro.tsx';

const ID = '0190a1b2-0000-7000-8000-00000000abcd';

afterEach(cleanup);

describe('TelaDeErro', () => {
  it('mostra o título, o texto e o código de rastreio em um alerta', () => {
    render(<TelaDeErro idRastreio={ID} aoTentarDeNovo={vi.fn()} />);

    const alerta = screen.getByRole('alert');
    expect(alerta).toHaveProperty('textContent', expect.stringContaining('Algo deu errado'));
    expect(screen.getByRole('heading', { level: 1, name: 'Algo deu errado' })).toBeTruthy();
    expect(screen.getByText('Já fomos avisados. Tente de novo.')).toBeTruthy();
    expect(screen.getByText(ID)).toBeTruthy();
  });

  it('chama a nova tentativa pelo botão', () => {
    const aoTentarDeNovo = vi.fn();
    render(<TelaDeErro idRastreio={ID} aoTentarDeNovo={aoTentarDeNovo} />);

    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(aoTentarDeNovo).toHaveBeenCalledTimes(1);
  });

  it('passa no axe', async () => {
    const { container } = render(<TelaDeErro idRastreio={ID} aoTentarDeNovo={vi.fn()} />);

    const resultado = await axe.run(container);

    expect(resultado.violations).toEqual([]);
  });
});
