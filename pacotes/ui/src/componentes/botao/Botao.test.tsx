import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Botao } from './Botao.tsx';
import { BotaoIcone } from './BotaoIcone.tsx';
import { LinkBotao } from './LinkBotao.tsx';

describe('Botao', () => {
  it('é um button nativo do tipo button e responde ao teclado', async () => {
    const aoClicar = vi.fn();
    render(<Botao onClick={aoClicar}>Enviar pedido</Botao>);
    const botao = screen.getByRole('button', { name: 'Enviar pedido' });

    expect(botao.getAttribute('type')).toBe('button');
    botao.focus();
    await userEvent.keyboard('{Enter}');
    expect(aoClicar).toHaveBeenCalledTimes(1);
  });

  it('carregando: aria-busy, continua focável e não dispara o clique', async () => {
    const aoClicar = vi.fn();
    render(
      <Botao carregando onClick={aoClicar}>
        Enviando
      </Botao>,
    );
    const botao = screen.getByRole('button', { name: 'Enviando' });

    expect(botao.getAttribute('aria-busy')).toBe('true');
    expect(botao.getAttribute('aria-disabled')).toBe('true');
    expect(botao.hasAttribute('disabled')).toBe(false);
    await userEvent.click(botao);
    expect(aoClicar).not.toHaveBeenCalled();
  });

  it('desativado não dispara o clique', async () => {
    const aoClicar = vi.fn();
    render(
      <Botao disabled onClick={aoClicar}>
        Enviar
      </Botao>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(aoClicar).not.toHaveBeenCalled();
  });

  it('aceita type submit', () => {
    render(<Botao type="submit">Salvar</Botao>);
    expect(screen.getByRole('button', { name: 'Salvar' }).getAttribute('type')).toBe('submit');
  });
});

describe('LinkBotao', () => {
  it('é um link para navegação, com a aparência do botão', () => {
    render(<LinkBotao href="/cardapio">Ver cardápio</LinkBotao>);
    const link = screen.getByRole('link', { name: 'Ver cardápio' });
    expect(link.getAttribute('href')).toBe('/cardapio');
    expect(link.className).toBe(screen.getByRole('link').className);
  });
});

describe('BotaoIcone', () => {
  it('tem o rótulo como nome acessível e o ícone escondido', () => {
    const { container } = render(<BotaoIcone icone="fechar" rotulo="Fechar carrinho" />);
    expect(screen.getByRole('button', { name: 'Fechar carrinho' })).toBeDefined();
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});
