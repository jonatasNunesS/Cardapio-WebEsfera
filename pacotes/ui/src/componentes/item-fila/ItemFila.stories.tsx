import type { Meta, StoryObj } from '@storybook/react-vite';
import estilos from '../../storybook/historias.module.css';
import { ItemFila } from './ItemFila.tsx';

const meta = {
  title: 'Painel/ItemFila',
  component: ItemFila,
  args: {
    mesa: 12,
    tipo: 'Chamar garçom',
    detalhe: 'Sessão aberta há 40 min',
    tempo: 'agora',
    estado: 'novo',
  },
  decorators: [
    (Historia) => (
      <div className={estilos.estreito}>
        <Historia />
      </div>
    ),
  ],
} satisfies Meta<typeof ItemFila>;

export default meta;
type Historia = StoryObj<typeof meta>;

export const Novo: Historia = {};
export const Atrasado: Historia = {
  args: {
    mesa: 7,
    tipo: 'Pedir a conta',
    detalhe: '4 pessoas · R$ 286,00',
    tempo: 'há 6 min',
    estado: 'atrasado',
  },
};
export const Assumido: Historia = { args: { estado: 'assumido' } };
export const NaTv: Historia = {
  args: {
    mesa: 5,
    tipo: 'Pedido #41',
    detalhe: '3 itens · em preparo',
    tempo: 'há 12 min',
    estado: 'atrasado',
    naTv: true,
  },
  globals: { tema: 'tv' },
};
