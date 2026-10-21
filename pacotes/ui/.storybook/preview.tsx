import type { Decorator, Preview } from '@storybook/react-vite';
import '../src/fontes/cardapio.css';
import '../src/fontes/painel.css';
import '../src/tokens.css';
import './previa.css';

export type TemaDaPrevia = 'cardapio' | 'painel' | 'tv';

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
  initialGlobals: { tema: 'cardapio' },
  parameters: {
    a11y: { test: 'error' },
    layout: 'padded',
  },
};

export default previa;
