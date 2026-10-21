import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import estilos from '../../storybook/historias.module.css';
import { ChipCategoria } from './ChipCategoria.tsx';
import { FiltroChip } from './FiltroChip.tsx';

const CATEGORIAS = ['Entradas', 'Principais', 'Massas', 'Sobremesas', 'Bebidas'].map((nome) => ({
  id: nome.toLowerCase(),
  nome,
}));

const meta = {
  title: 'Cardapio/Chips',
  component: ChipCategoria,
  args: {
    rotulo: 'Categorias',
    categorias: CATEGORIAS,
    selecionada: 'entradas',
    aoEscolher: () => undefined,
  },
} satisfies Meta<typeof ChipCategoria>;

export default meta;
type Historia = StoryObj<typeof meta>;

function CategoriasControladas() {
  const [selecionada, setSelecionada] = useState('entradas');
  return (
    <ChipCategoria
      rotulo="Categorias"
      categorias={CATEGORIAS}
      selecionada={selecionada}
      aoEscolher={setSelecionada}
    />
  );
}

export const Categorias: Historia = { render: () => <CategoriasControladas /> };

export const Foco: Historia = {
  render: () => <CategoriasControladas />,
  play: ({ canvas }) => {
    canvas.getByRole('button', { name: 'Principais' }).focus();
  },
};

const FILTROS = [
  ['Todos', 7],
  ['Ativos', 3],
  ['Em teste', 1],
  ['Em atraso', 2],
  ['Cancelados', 1],
] as const;

function FiltrosControlados() {
  const [ativo, setAtivo] = useState('Todos');
  return (
    <div className={estilos.linha}>
      {FILTROS.map(([rotulo, contagem]) => (
        <FiltroChip
          key={rotulo}
          rotulo={rotulo}
          contagem={contagem}
          selecionado={ativo === rotulo}
          onClick={() => {
            setAtivo(rotulo);
          }}
        />
      ))}
      <FiltroChip rotulo="Arquivados" selecionado={false} disabled />
    </div>
  );
}

export const Filtros: Historia = { render: () => <FiltrosControlados /> };
