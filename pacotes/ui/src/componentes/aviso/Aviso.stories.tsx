import type { Meta, StoryObj } from '@storybook/react-vite';
import { Botao } from '../botao/Botao.tsx';
import estilos from '../../storybook/historias.module.css';
import { Aviso } from './Aviso.tsx';

const meta = {
  title: 'Compartilhados/Aviso',
  tags: ['cardapio', 'painel', 'tv'],
  component: Aviso,
  args: { tipo: 'informacao', children: 'Os clientes só veem depois de publicar.' },
  decorators: [
    (Historia) => (
      <div className={estilos.estreito}>
        <Historia />
      </div>
    ),
  ],
} satisfies Meta<typeof Aviso>;

export default meta;
type Historia = StoryObj<typeof meta>;

export const Informacao: Historia = {};
export const Sucesso: Historia = {
  args: { tipo: 'sucesso', children: 'Legível. Texto do botão 5,5:1 e destaque contra o fundo 5,1:1.' },
};
export const AvisoDeCobranca: Historia = {
  args: {
    tipo: 'aviso',
    titulo: 'Cobrança vencida',
    children: 'Os pedidos param no dia 15 se a fatura não for paga.',
  },
};
export const Erro: Historia = {
  args: {
    tipo: 'erro',
    titulo: 'Sem conexão: seu pedido não foi enviado.',
    children: 'Seus itens continuam guardados. Quando a internet voltar, tente de novo. Não vai duplicar.',
    acao: <Botao variante="secundario">Tentar de novo</Botao>,
  },
};
