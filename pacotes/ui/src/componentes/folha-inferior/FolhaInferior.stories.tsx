import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, waitFor } from 'storybook/test';
import { Botao } from '../botao/Botao.tsx';
import { CampoTexto } from '../campo/CampoTexto.tsx';
import estilos from '../../storybook/historias.module.css';
import { FolhaInferior } from './FolhaInferior.tsx';

function Carrinho({ abertaDesdeOInicio = false }: { abertaDesdeOInicio?: boolean }) {
  const [aberta, setAberta] = useState(abertaDesdeOInicio);
  return (
    <div className={estilos.linha}>
      <Botao
        onClick={() => {
          setAberta(true);
        }}
      >
        Ver pedido
      </Botao>
      <Botao variante="secundario" icone="chamarGarcom">
        Chamar garçom
      </Botao>
      <FolhaInferior
        aberta={aberta}
        aoFechar={() => {
          setAberta(false);
        }}
        titulo="Seu pedido"
        rodape={<Botao larguraTotal>Enviar pedido</Botao>}
      >
        <p>Costela na brasa, sem cebola.</p>
        <CampoTexto rotulo="Alguma observação?" placeholder="Ex.: sem cebola, ponto da carne" />
      </FolhaInferior>
    </div>
  );
}

const meta = {
  title: 'Cardapio/FolhaInferior',
  component: FolhaInferior,
  args: { aberta: false, aoFechar: () => undefined, titulo: 'Seu pedido', children: null },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof FolhaInferior>;

export default meta;
type Historia = StoryObj<typeof meta>;

export const Fechada: Historia = { render: () => <Carrinho /> };

export const Aberta: Historia = {
  render: () => <Carrinho abertaDesdeOInicio />,
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.ownerDocument.querySelector('dialog')?.open).toBe(true));
  },
};

export const FocoEntraEscFechaEFocoVolta: Historia = {
  render: () => <Carrinho />,
  play: async ({ canvas, userEvent }) => {
    const abrir = canvas.getByRole('button', { name: 'Ver pedido' });
    await userEvent.click(abrir);
    const dialogo = await canvas.findByRole('dialog', { name: 'Seu pedido' });

    await expect(dialogo).toContainElement(document.activeElement as HTMLElement);
    await expect(document.activeElement).toBe(canvas.getByRole('button', { name: 'Fechar' }));

    const fora = canvas.getByRole('button', { name: 'Chamar garçom', hidden: true });
    fora.focus();
    await expect(document.activeElement).not.toBe(fora);
    await expect(dialogo.matches(':modal')).toBe(true);

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(canvas.queryByRole('dialog')).toBeNull());
    await expect(document.activeElement).toBe(abrir);
  },
};

export const BotaoFecharDevolveOFoco: Historia = {
  render: () => <Carrinho />,
  play: async ({ canvas, userEvent }) => {
    const abrir = canvas.getByRole('button', { name: 'Ver pedido' });
    await userEvent.click(abrir);
    await userEvent.click(await canvas.findByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(canvas.queryByRole('dialog')).toBeNull());
    await expect(document.activeElement).toBe(abrir);
  },
};
