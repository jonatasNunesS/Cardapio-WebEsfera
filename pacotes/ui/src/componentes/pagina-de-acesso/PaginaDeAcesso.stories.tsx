import type { Meta, StoryObj } from '@storybook/react-vite';
import { Botao } from '../botao/Botao.tsx';
import { CampoTexto } from '../campo/CampoTexto.tsx';
import { PaginaDeAcesso } from './PaginaDeAcesso.tsx';

const meta = {
  title: 'Painel/PaginaDeAcesso',
  tags: ['painel'],
  component: PaginaDeAcesso,
  args: {
    marca: 'Cardápio WebEsfera',
    titulo: 'Entrar no painel',
    descricao: 'Use o e-mail e a senha da sua conta.',
    rodape: <a href="#criar">Criar conta</a>,
    children: (
      <form noValidate>
        <CampoTexto rotulo="E-mail" type="email" autoComplete="email" />
        <CampoTexto rotulo="Senha" type="password" autoComplete="current-password" />
        <Botao type="submit" larguraTotal>
          Entrar
        </Botao>
      </form>
    ),
  },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof PaginaDeAcesso>;

export default meta;
type Historia = StoryObj<typeof meta>;

export const Padrao: Historia = {};
