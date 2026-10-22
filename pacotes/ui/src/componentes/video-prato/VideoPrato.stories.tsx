import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';
import estilos from '../../storybook/historias.module.css';
import { MIDIA_DE_EXEMPLO } from '../../storybook/midia.ts';
import { ProvedorDeVideos } from './CoordenadorDeVideos.tsx';
import { VideoPrato } from './VideoPrato.tsx';

function economizarDados(): () => void {
  const original = Object.getOwnPropertyDescriptor(navigator, 'connection');
  Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true });
  return () => {
    if (original === undefined) {
      Reflect.deleteProperty(navigator, 'connection');
    } else {
      Object.defineProperty(navigator, 'connection', original);
    }
  };
}

const meta = {
  title: 'Cardapio/VideoPrato',
  tags: ['cardapio'],
  component: VideoPrato,
  args: { ...MIDIA_DE_EXEMPLO, descricao: 'Costela na brasa girando no prato' },
  decorators: [
    (Historia) => (
      <div className={estilos.estreito}>
        <ProvedorDeVideos>
          <Historia />
        </ProvedorDeVideos>
      </div>
    ),
  ],
} satisfies Meta<typeof VideoPrato>;

export default meta;
type Historia = StoryObj<typeof meta>;

export const Tocando: Historia = {
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Pausar vídeo do prato' })).toBeVisible());
  },
};

export const Pausado: Historia = {
  play: async ({ canvas, userEvent }) => {
    const pausar = await canvas.findByRole('button', { name: 'Pausar vídeo do prato' });
    await userEvent.click(pausar);
    await expect(canvas.getByRole('button', { name: 'Reproduzir vídeo do prato' })).toHaveFocus();
  },
};

export const SemTocarSozinho: Historia = {
  beforeEach: economizarDados,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Reproduzir vídeo do prato' })).toHaveTextContent(
      'Reproduzir',
    );
  },
};

export const Falhou: Historia = {
  args: { fonteMp4: '/midia/inexistente.mp4', fonteWebm: undefined },
  play: async ({ canvas }) => {
    await waitFor(() =>
      expect(canvas.getByRole('img', { name: 'Costela na brasa girando no prato' })).toBeVisible(),
    );
    await expect(canvas.queryByRole('button')).toBeNull();
  },
};
