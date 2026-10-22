import type { Decorator, Preview } from '@storybook/react-vite';
import '../src/fontes/cardapio.css';
import '../src/fontes/painel.css';
import '../src/tokens.css';
import './previa.css';
import { exigirSuperficie } from '../src/storybook/superficies.ts';

export type TemaDaPrevia = 'cardapio' | 'painel' | 'tv';

const TEMAS: readonly TemaDaPrevia[] = ['cardapio', 'painel', 'tv'];

function temaInicial(): TemaDaPrevia {
  const pedido = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
    ?.TEMA_DA_PREVIA;
  return TEMAS.find((tema) => tema === pedido) ?? 'cardapio';
}

const aplicarTema: Decorator = (Historia, contexto) => {
  const tema = contexto.globals.tema as TemaDaPrevia | undefined;
  if (tema === undefined || tema === 'cardapio') {
    document.documentElement.removeAttribute('data-tema');
  } else {
    document.documentElement.setAttribute('data-tema', tema);
  }
  document.documentElement.lang = 'pt-BR';
  return <Historia />;
};

const previa: Preview = {
  decorators: [aplicarTema],
  beforeEach: ({ title, name, tags }) => {
    exigirSuperficie(title, name, tags);
  },
  globalTypes: {
    tema: {
      description: 'Tema do design system',
      toolbar: {
        title: 'Tema',
        icon: 'paintbrush',
        items: [
          { value: 'cardapio', title: 'Cardápio' },
          { value: 'painel', title: 'Painel e admin' },
          { value: 'tv', title: 'TV' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { tema: temaInicial() },
  parameters: {
    a11y: { test: 'error' },
    layout: 'padded',
  },
};

export default previa;
