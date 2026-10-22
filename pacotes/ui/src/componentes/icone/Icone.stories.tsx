import type { Meta, StoryObj } from '@storybook/react-vite';
import { Icone } from './Icone.tsx';
import { ICONES, type NomeIcone } from './icones.ts';
import estilos from './Icone.stories.module.css';

const meta = {
  title: 'Base/Icone',
  tags: ['cardapio', 'painel'],
  component: Icone,
  args: { nome: 'buscar' },
} satisfies Meta<typeof Icone>;

export default meta;
type Historia = StoryObj<typeof meta>;

export const Decorativo: Historia = {};

export const ComRotulo: Historia = { args: { nome: 'semConexao', rotulo: 'Sem conexão' } };

export const Tamanhos: Historia = {
  render: () => (
    <div className={estilos.linha}>
      <Icone nome="chamarGarcom" tamanho={16} />
      <Icone nome="chamarGarcom" tamanho={20} />
      <Icone nome="chamarGarcom" tamanho={24} />
    </div>
  ),
};

export const Catalogo: Historia = {
  render: () => (
    <ul className={estilos.catalogo}>
      {(Object.keys(ICONES) as NomeIcone[]).map((nome) => (
        <li key={nome} className={estilos.item}>
          <Icone nome={nome} tamanho={24} />
          <span>{nome}</span>
        </li>
      ))}
    </ul>
  ),
};
