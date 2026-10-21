import type { Meta, StoryObj } from '@storybook/react-vite';
import estilos from '../../storybook/historias.module.css';
import { Esqueleto } from './Esqueleto.tsx';

const meta = {
  title: 'Compartilhados/Esqueleto',
  component: Esqueleto,
  args: { rotulo: 'Carregando cardápio' },
  decorators: [
    (Historia) => (
      <div className={estilos.estreito}>
        <Historia />
      </div>
    ),
  ],
} satisfies Meta<typeof Esqueleto>;

export default meta;
type Historia = StoryObj<typeof meta>;

export const Lista: Historia = {};
export const CartaoComMidia: Historia = {
  args: { rotulo: 'Carregando destaque', comMidia: true, linhas: 2 },
};
