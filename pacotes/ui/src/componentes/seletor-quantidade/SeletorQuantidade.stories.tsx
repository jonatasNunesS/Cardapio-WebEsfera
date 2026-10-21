import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { SeletorQuantidade } from './SeletorQuantidade.tsx';

function Controlado({
  inicial,
  minimo,
  maximo,
  desativado,
}: {
  inicial: number;
  minimo?: number;
  maximo?: number;
  desativado?: boolean;
}) {
  const [valor, setValor] = useState(inicial);
  return (
    <SeletorQuantidade
      nomeDoItem="Costela na brasa"
      valor={valor}
      aoMudar={setValor}
      minimo={minimo}
      maximo={maximo}
      desativado={desativado}
    />
  );
}

const meta = {
  title: 'Cardapio/SeletorQuantidade',
  component: SeletorQuantidade,
  args: { nomeDoItem: 'Costela na brasa', valor: 1, aoMudar: () => undefined },
} satisfies Meta<typeof SeletorQuantidade>;

export default meta;
type Historia = StoryObj<typeof meta>;

export const Normal: Historia = { render: () => <Controlado inicial={2} /> };
export const NoMinimo: Historia = { render: () => <Controlado inicial={1} /> };
export const NoMaximo: Historia = { render: () => <Controlado inicial={20} /> };
export const Desativado: Historia = { render: () => <Controlado inicial={1} desativado /> };
export const Foco: Historia = {
  render: () => <Controlado inicial={2} />,
  play: ({ canvas }) => {
    canvas.getByRole('button', { name: 'Aumentar Costela na brasa' }).focus();
  },
};
