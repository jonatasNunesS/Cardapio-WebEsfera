import type { Meta, StoryObj } from '@storybook/react-vite';
import { TelaErro } from './TelaErro.tsx';

const meta = {
  title: 'Compartilhados/TelaErro',
  component: TelaErro,
  args: { idRastreio: '01a15eda-4bef-7721-9371-fcb3c22b525a', aoTentarDeNovo: () => undefined },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof TelaErro>;

export default meta;
type Historia = StoryObj<typeof meta>;

export const Padrao: Historia = {};
