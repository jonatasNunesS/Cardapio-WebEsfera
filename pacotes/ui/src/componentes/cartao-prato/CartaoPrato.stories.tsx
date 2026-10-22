import type { Meta, StoryObj } from '@storybook/react-vite';
import estilos from '../../storybook/historias.module.css';
import { MIDIA_DE_EXEMPLO } from '../../storybook/midia.ts';
import { CartaoPrato } from './CartaoPrato.tsx';

const meta = {
  title: 'Cardapio/CartaoPrato',
  tags: ['cardapio'],
  component: CartaoPrato,
  args: {
    nome: 'Pão de fermentação natural',
    descricao: 'Com manteiga de ervas e flor de sal.',
    precoEmCentavos: 2400,
    href: '#prato',
    imagem: { src: MIDIA_DE_EXEMPLO.capa, alt: 'Pão de fermentação natural fatiado' },
  },
  decorators: [
    (Historia) => (
      <div className={estilos.estreito}>
        <Historia />
      </div>
    ),
  ],
} satisfies Meta<typeof CartaoPrato>;

export default meta;
type Historia = StoryObj<typeof meta>;

export const Normal: Historia = {};
export const SemImagem: Historia = {
  args: { nome: 'Bolinho de arroz', imagem: undefined, precoEmCentavos: 3200 },
};
export const Destaque: Historia = {
  args: {
    nome: 'Costela na brasa',
    descricao: '12 horas no fogo de chão, com mandioca crocante e vinagrete.',
    precoEmCentavos: 8900,
    destaque: true,
    nivelTitulo: 2,
    video: { ...MIDIA_DE_EXEMPLO, descricao: 'Costela na brasa girando no prato' },
  },
};
export const Esgotado: Historia = {
  args: { nome: 'Burrata com tomates', descricao: 'Com pesto de manjericão.', esgotado: true },
};
export const Foco: Historia = {
  play: ({ canvas }) => {
    canvas.getByRole('link', { name: 'Pão de fermentação natural' }).focus();
  },
};
