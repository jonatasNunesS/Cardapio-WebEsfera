import type { Meta, StoryObj } from '@storybook/react-vite';
import { Botao } from './Botao.tsx';
import { BotaoIcone } from './BotaoIcone.tsx';
import { LinkBotao } from './LinkBotao.tsx';
import estilos from '../../storybook/historias.module.css';

const meta = {
  title: 'Formulario/Botao',
  component: Botao,
  args: { children: 'Ver cardápio' },
} satisfies Meta<typeof Botao>;

export default meta;
type Historia = StoryObj<typeof meta>;

export const Principal: Historia = {};
export const Secundario: Historia = {
  args: { variante: 'secundario', children: 'Chamar garçom', icone: 'chamarGarcom' },
};
export const Perigo: Historia = { args: { variante: 'perigo', children: 'Cancelar pedido' } };
export const Texto: Historia = { args: { variante: 'texto', children: 'Pedir mais alguma coisa' } };
export const Carregando: Historia = { args: { carregando: true, children: 'Enviando pedido' } };
export const Desativado: Historia = { args: { disabled: true, children: 'Enviar pedido' } };
export const LarguraTotal: Historia = { args: { larguraTotal: true, children: 'Adicionar · R$ 89,00' } };

export const Foco: Historia = {
  args: { children: 'Com foco' },
  play: ({ canvas }) => {
    canvas.getByRole('button', { name: 'Com foco' }).focus();
  },
};

export const Todos: Historia = {
  render: () => (
    <div className={estilos.coluna}>
      <Botao>Principal</Botao>
      <Botao variante="secundario">Secundário</Botao>
      <Botao variante="perigo">Perigo</Botao>
      <Botao variante="texto">Texto</Botao>
      <Botao carregando>Carregando</Botao>
      <Botao disabled>Desativado</Botao>
      <LinkBotao href="#cardapio">Link com aparência de botão</LinkBotao>
      <div className={estilos.linha}>
        <BotaoIcone icone="voltar" rotulo="Voltar ao cardápio" />
        <BotaoIcone icone="fechar" rotulo="Fechar" variante="principal" />
        <BotaoIcone icone="pausar" rotulo="Pausar vídeo do prato" variante="texto" />
      </div>
    </div>
  ),
};
