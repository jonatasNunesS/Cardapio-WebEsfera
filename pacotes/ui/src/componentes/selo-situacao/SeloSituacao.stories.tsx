import type { Meta, StoryObj } from '@storybook/react-vite';
import estilos from '../../storybook/historias.module.css';
import { SeloSituacao, type Situacao } from './SeloSituacao.tsx';

const SITUACOES: readonly Situacao[] = [
  'aguardando',
  'emAtendimento',
  'concluido',
  'cancelado',
  'vencida',
  'paga',
];

const meta = {
  title: 'Painel/SeloSituacao',
  component: SeloSituacao,
  args: { situacao: 'aguardando' },
} satisfies Meta<typeof SeloSituacao>;

export default meta;
type Historia = StoryObj<typeof meta>;

export const Todas: Historia = {
  render: () => (
    <div className={estilos.linha}>
      {SITUACOES.map((situacao) => (
        <SeloSituacao key={situacao} situacao={situacao} />
      ))}
      <SeloSituacao situacao="vencida" texto="Em atraso" />
    </div>
  ),
};
