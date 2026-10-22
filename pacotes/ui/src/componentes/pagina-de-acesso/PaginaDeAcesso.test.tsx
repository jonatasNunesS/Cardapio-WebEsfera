import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PaginaDeAcesso } from './PaginaDeAcesso.tsx';

describe('PaginaDeAcesso', () => {
  it('tem um título de nível 1 que nomeia a região do formulário', () => {
    render(
      <PaginaDeAcesso
        marca="Cardápio WebEsfera"
        titulo="Entrar no painel"
        rodape={<a href="#x">Criar conta</a>}
      >
        <p>formulário</p>
      </PaginaDeAcesso>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Entrar no painel' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Entrar no painel' }).textContent).toContain('formulário');
    expect(screen.getByRole('link', { name: 'Criar conta' })).toBeTruthy();
  });
});
