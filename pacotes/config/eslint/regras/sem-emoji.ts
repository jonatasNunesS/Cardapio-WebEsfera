import type { TSESTree } from '@typescript-eslint/utils';
import { encontrarEmojis } from '../../src/emoji.ts';
import { criarRegra } from './criar-regra.ts';

type Localizavel = TSESTree.Node | TSESTree.Comment;

export const semEmoji = criarRegra({
  name: 'sem-emoji',
  meta: {
    type: 'problem',
    docs: {
      description: 'Proíbe emoji e pictogramas em strings, templates, JSX e comentários.',
    },
    messages: {
      emoji:
        'O caractere {{codigo}} é um emoji ou pictograma, proibido no projeto. Use um ícone SVG do pacote ui.',
    },
    schema: [],
    defaultOptions: [],
  },
  create(contexto) {
    function verificar(alvo: Localizavel, texto: string): void {
      const [primeira] = encontrarEmojis(texto);
      if (primeira !== undefined) {
        contexto.report({ loc: alvo.loc, messageId: 'emoji', data: { codigo: primeira.codigo } });
      }
    }

    return {
      Program() {
        for (const comentario of contexto.sourceCode.getAllComments()) {
          verificar(comentario, comentario.value);
        }
      },
      Literal(no) {
        if (typeof no.value === 'string') {
          verificar(no, no.value);
        }
      },
      TemplateElement(no) {
        verificar(no, no.value.cooked ?? no.value.raw);
      },
      JSXText(no) {
        verificar(no, no.value);
      },
    };
  },
});
