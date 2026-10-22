import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Aviso, type TipoAviso } from './Aviso.tsx';

describe('Aviso', () => {
  it.each<[TipoAviso, 'status' | 'alert']>([
    ['informacao', 'status'],
    ['sucesso', 'status'],
    ['aviso', 'status'],
    ['erro', 'alert'],
  ])('%s usa role="%s"', (tipo, papel) => {
    render(
      <Aviso tipo={tipo} titulo="Título">
        Texto
      </Aviso>,
    );
    expect(screen.getByRole(papel).textContent).toBe('TítuloTexto');
  });

  it('o ícone é decorativo: o sentido está no texto', () => {
    const { container } = render(<Aviso tipo="erro">Sem conexão</Aviso>);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});
