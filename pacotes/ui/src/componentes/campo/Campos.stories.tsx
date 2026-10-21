import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import estilos from '../../storybook/historias.module.css';
import { AreaTexto } from './AreaTexto.tsx';
import { Caixa } from './Caixa.tsx';
import { CampoTexto } from './CampoTexto.tsx';
import { GrupoRadio } from './GrupoRadio.tsx';
import { Seletor } from './Seletor.tsx';

const meta = {
  title: 'Formulario/Campos',
  component: CampoTexto,
  args: { rotulo: 'Nome do restaurante' },
  decorators: [
    (Historia) => (
      <div className={estilos.estreito}>
        <Historia />
      </div>
    ),
  ],
} satisfies Meta<typeof CampoTexto>;

export default meta;
type Historia = StoryObj<typeof meta>;

export const Normal: Historia = { args: { defaultValue: 'Brasa & Trigo' } };
export const ComDica: Historia = {
  args: {
    rotulo: 'Link de avaliação do Google',
    placeholder: 'Cole o link do seu Perfil da Empresa no Google',
    dica: 'No Google, abra seu perfil e toque em "Pedir avaliações" para copiar o link.',
  },
};
export const ComErro: Historia = {
  args: {
    rotulo: 'Link de avaliação do Google',
    defaultValue: 'google',
    erro: 'O link precisa começar com https://.',
  },
};
export const Desativado: Historia = {
  args: { rotulo: 'Endereço do restaurante', defaultValue: 'brasa-e-trigo', disabled: true },
};
export const Foco: Historia = {
  play: ({ canvas }) => {
    canvas.getByRole('textbox', { name: 'Nome do restaurante' }).focus();
  },
};

export const Area: Historia = {
  render: () => (
    <AreaTexto
      rotulo="Mensagem de boas-vindas"
      defaultValue="Boa noite! Peça pelo celular quando quiser."
      dica="Aparece no topo do cardápio. Até 140 caracteres."
    />
  ),
};

export const SeletorDePlano: Historia = {
  render: () => (
    <Seletor
      rotulo="Plano"
      opcoes={[
        { valor: 'basico', rotulo: 'Básico' },
        { valor: 'pro', rotulo: 'Pro' },
      ]}
      erro="Escolha um plano."
    />
  ),
};

export const Caixas: Historia = {
  render: () => (
    <div className={estilos.coluna}>
      <Caixa rotulo="Taxa de serviço (10%, opcional)" defaultChecked />
      <Caixa rotulo="Sem cebola" />
      <Caixa rotulo="Aceito os termos" erro="Marque para continuar." />
      <Caixa rotulo="Indisponível" disabled />
    </div>
  ),
};

function RadiosControlados() {
  const [valor, setValor] = useState('aberto');
  return (
    <GrupoRadio
      legenda="Prévia do cardápio"
      nome="previa"
      valor={valor}
      aoMudar={setValor}
      opcoes={[
        { valor: 'aberto', rotulo: 'Aberto' },
        { valor: 'fechado', rotulo: 'Fechado' },
        { valor: 'inadimplente', rotulo: 'Pedidos pausados', desativada: true },
      ]}
      dica="Só muda a prévia; os clientes não veem."
    />
  );
}

export const Radios: Historia = { render: () => <RadiosControlados /> };
