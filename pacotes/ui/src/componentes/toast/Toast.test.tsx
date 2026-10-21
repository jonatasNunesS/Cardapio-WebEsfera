import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Botao } from '../botao/Botao.tsx';
import { ProvedorDeToast, useToasts, type MensagemToast } from './ProvedorDeToast.tsx';

function Disparador({ mensagem }: { mensagem: MensagemToast }) {
  const toasts = useToasts();
  return (
    <Botao
      onClick={() => {
        toasts.mostrar(mensagem);
      }}
    >
      Mostrar
    </Botao>
  );
}

function montar(mensagem: MensagemToast) {
  render(
    <ProvedorDeToast duracaoMs={1000}>
      <Disparador mensagem={mensagem} />
    </ProvedorDeToast>,
  );
  act(() => {
    screen.getByRole('button', { name: 'Mostrar' }).click();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Toast', () => {
  it('há uma região aria-live única, mesmo com vários toasts', () => {
    montar({ tipo: 'sucesso', texto: 'Pedido #42 enviado' });
    act(() => {
      screen.getByRole('button', { name: 'Mostrar' }).click();
    });
    const regioes = document.querySelectorAll('[aria-live]');
    expect(regioes).toHaveLength(1);
    expect(regioes[0]?.getAttribute('aria-live')).toBe('polite');
    expect(screen.getAllByText('Pedido #42 enviado')).toHaveLength(2);
  });

  it('some sozinho quando não é erro', () => {
    montar({ tipo: 'sucesso', texto: 'Pedido #42 enviado' });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByText('Pedido #42 enviado')).toBeNull();
  });

  it('erro não some sozinho', () => {
    montar({ tipo: 'erro', texto: 'Não deu para enviar' });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText('Não deu para enviar')).toBeDefined();
  });

  it('com o foco dentro, não some; fecha pelo teclado', async () => {
    vi.useRealTimers();
    const usuario = userEvent.setup();
    render(
      <ProvedorDeToast duracaoMs={50}>
        <Disparador mensagem={{ tipo: 'informacao', texto: 'Cardápio atualizado' }} />
      </ProvedorDeToast>,
    );
    await usuario.click(screen.getByRole('button', { name: 'Mostrar' }));
    screen.getByRole('button', { name: 'Fechar notificação' }).focus();
    await new Promise((resolver) => setTimeout(resolver, 120));
    expect(screen.getByText('Cardápio atualizado')).toBeDefined();
    await usuario.keyboard('{Enter}');
    expect(screen.queryByText('Cardápio atualizado')).toBeNull();
  });

  it('useToasts fora do provedor falha com mensagem clara', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Disparador mensagem={{ tipo: 'sucesso', texto: 'x' }} />)).toThrow(
      /ProvedorDeToast/,
    );
  });
});
