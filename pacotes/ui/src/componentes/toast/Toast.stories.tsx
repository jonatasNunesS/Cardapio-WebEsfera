import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { Botao } from '../botao/Botao.tsx';
import estilos from '../../storybook/historias.module.css';
import { ProvedorDeToast, useToasts } from './ProvedorDeToast.tsx';
import { Toast } from './Toast.tsx';

function Disparadores() {
  const toasts = useToasts();
  return (
    <div className={estilos.linha}>
      <Botao
        onClick={() => {
          toasts.mostrar({ tipo: 'sucesso', texto: 'Pedido #42 enviado. A equipe já está vendo.' });
        }}
      >
        Pedido enviado
      </Botao>
      <Botao
        variante="secundario"
        onClick={() => {
          toasts.mostrar({ tipo: 'erro', texto: 'Não deu para enviar. Seus itens continuam guardados.' });
        }}
      >
        Erro
      </Botao>
    </div>
  );
}

const meta = {
  title: 'Compartilhados/Toast',
  tags: ['cardapio', 'painel'],
  component: Toast,
  args: { tipo: 'sucesso', texto: 'Pedido #42 enviado', aoFechar: () => undefined },
} satisfies Meta<typeof Toast>;

export default meta;
type Historia = StoryObj<typeof meta>;

export const Sucesso: Historia = {};
export const Informacao: Historia = {
  args: { tipo: 'informacao', texto: 'Rafael está trazendo a maquininha.' },
};
export const AvisoDeAtualizacao: Historia = {
  args: { tipo: 'aviso', texto: 'Atualização lenta. Tentando reconectar.' },
};
export const Erro: Historia = {
  args: { tipo: 'erro', texto: 'Não deu para chamar o garçom. Tente de novo.' },
};

export const ComProvedor: Historia = {
  render: () => (
    <ProvedorDeToast>
      <Disparadores />
    </ProvedorDeToast>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Erro' }));
    await expect(await canvas.findByText(/Não deu para enviar/u)).toBeVisible();
  },
};
