import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Icone } from './Icone.tsx';
import { ICONES } from './icones.ts';

describe('Icone', () => {
  it('é decorativo por padrão: aria-hidden e fora da árvore de acessibilidade', () => {
    const { container } = render(<Icone nome="buscar" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('role')).toBeNull();
  });

  it('com rótulo vira role="img" com nome acessível', () => {
    render(<Icone nome="semConexao" rotulo="Sem conexão" />);
    expect(screen.getByRole('img', { name: 'Sem conexão' }).getAttribute('aria-hidden')).toBeNull();
  });

  it.each([16, 20, 24] as const)('aceita o tamanho %i', (tamanho) => {
    const { container } = render(<Icone nome="mais" tamanho={tamanho} />);
    expect(container.querySelector('svg')?.getAttribute('width')).toBe(String(tamanho));
  });

  it('usa 20 px quando o tamanho não é informado', () => {
    const { container } = render(<Icone nome="mais" />);
    expect(container.querySelector('svg')?.getAttribute('height')).toBe('20');
  });

  it('o mapa tem só nomes em português, em camelCase', () => {
    for (const nome of Object.keys(ICONES)) {
      expect(nome).toMatch(/^[a-z][a-zA-Z]*$/);
    }
  });
});
