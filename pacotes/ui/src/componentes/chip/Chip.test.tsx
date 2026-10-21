import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ChipCategoria } from './ChipCategoria.tsx';
import { FiltroChip } from './FiltroChip.tsx';

const CATEGORIAS = ['Entradas', 'Principais', 'Massas', 'Sobremesas'].map((nome) => ({
  id: nome.toLowerCase(),
  nome,
}));

function Categorias() {
  const [selecionada, setSelecionada] = useState('entradas');
  return (
    <ChipCategoria
      rotulo="Categorias"
      categorias={CATEGORIAS}
      selecionada={selecionada}
      aoEscolher={setSelecionada}
    />
  );
}

describe('ChipCategoria', () => {
  it('fica num nav rotulado e marca a selecionada com aria-pressed', () => {
    render(<Categorias />);
    expect(screen.getByRole('navigation', { name: 'Categorias' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Entradas' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Massas' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('setas, Home e End movem o foco; Enter escolhe', async () => {
    render(<Categorias />);
    screen.getByRole('button', { name: 'Entradas' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement?.textContent).toBe('Principais');
    await userEvent.keyboard('{End}');
    expect(document.activeElement?.textContent).toBe('Sobremesas');
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement?.textContent).toBe('Entradas');
    await userEvent.keyboard('{ArrowLeft}{Enter}');
    expect(screen.getByRole('button', { name: 'Sobremesas' }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('FiltroChip', () => {
  it('mostra a contagem e alterna aria-pressed', async () => {
    const aoClicar = vi.fn();
    render(<FiltroChip rotulo="Ativos" contagem={3} selecionado={false} onClick={aoClicar} />);
    const filtro = screen.getByRole('button', { name: 'Ativos · 3' });
    expect(filtro.getAttribute('aria-pressed')).toBe('false');
    await userEvent.click(filtro);
    expect(aoClicar).toHaveBeenCalledTimes(1);
  });
});
