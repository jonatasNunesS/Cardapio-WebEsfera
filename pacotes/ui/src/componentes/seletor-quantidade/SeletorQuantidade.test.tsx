import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { SeletorQuantidade } from './SeletorQuantidade.tsx';

function Controlado({
  inicial = 1,
  minimo = 1,
  maximo = 3,
}: {
  inicial?: number;
  minimo?: number;
  maximo?: number;
}) {
  const [valor, setValor] = useState(inicial);
  return (
    <SeletorQuantidade
      nomeDoItem="Costela na brasa"
      valor={valor}
      aoMudar={setValor}
      minimo={minimo}
      maximo={maximo}
    />
  );
}

describe('SeletorQuantidade', () => {
  it('os botões dizem o que fazem com o item', () => {
    render(<Controlado />);
    expect(screen.getByRole('button', { name: 'Diminuir Costela na brasa' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Aumentar Costela na brasa' })).toBeDefined();
  });

  it('respeita o máximo e o mínimo sem perder o foco', async () => {
    render(<Controlado />);
    const aumentar = screen.getByRole('button', { name: 'Aumentar Costela na brasa' });
    await userEvent.click(aumentar);
    await userEvent.click(aumentar);
    await userEvent.click(aumentar);
    expect(screen.getByText('3')).toBeDefined();
    expect(aumentar.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(aumentar);

    const diminuir = screen.getByRole('button', { name: 'Diminuir Costela na brasa' });
    for (let vez = 0; vez < 4; vez += 1) {
      await userEvent.click(diminuir);
    }
    expect(screen.getByText('1')).toBeDefined();
    expect(diminuir.getAttribute('aria-disabled')).toBe('true');
  });

  it('anuncia o valor numa região aria-live', async () => {
    render(<Controlado />);
    await userEvent.click(screen.getByRole('button', { name: 'Aumentar Costela na brasa' }));
    const regiao = document.querySelector('[aria-live="polite"]');
    expect(regiao?.textContent).toBe('Quantidade de Costela na brasa: 2');
    expect(regiao?.getAttribute('aria-atomic')).toBe('true');
  });

  it('aceita mínimo zero, para tirar o item do carrinho', async () => {
    render(<Controlado minimo={0} />);
    await userEvent.click(screen.getByRole('button', { name: 'Diminuir Costela na brasa' }));
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toContain(': 0');
  });
});
