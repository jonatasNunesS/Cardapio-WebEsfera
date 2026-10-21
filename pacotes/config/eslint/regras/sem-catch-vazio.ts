import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { criarRegra } from './criar-regra.ts';

export interface OpcoesSemCatchVazio {
  readonly funcoesDeReporte: readonly string[];
}

const LIMITES_DE_ESCOPO: ReadonlySet<string> = new Set([
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.ArrowFunctionExpression,
  AST_NODE_TYPES.ClassBody,
]);

function nomeDaChamada(chamada: TSESTree.CallExpression): string | undefined {
  const { callee } = chamada;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name;
  }
  if (callee.type === AST_NODE_TYPES.MemberExpression && callee.property.type === AST_NODE_TYPES.Identifier) {
    return callee.property.name;
  }
  return undefined;
}

function filhos(
  no: TSESTree.Node,
  chaves: Readonly<Record<string, readonly string[] | undefined>>,
): TSESTree.Node[] {
  const registro = no as unknown as Record<string, unknown>;
  return (chaves[no.type] ?? []).flatMap((chave) => {
    const valor = registro[chave];
    const lista = Array.isArray(valor) ? valor : [valor];
    return lista.filter(
      (item): item is TSESTree.Node => typeof item === 'object' && item !== null && 'type' in item,
    );
  });
}

function trataOErro(
  no: TSESTree.Node,
  funcoes: ReadonlySet<string>,
  chaves: Readonly<Record<string, readonly string[] | undefined>>,
): boolean {
  if (no.type === AST_NODE_TYPES.ThrowStatement) {
    return true;
  }
  if (no.type === AST_NODE_TYPES.CallExpression && funcoes.has(nomeDaChamada(no) ?? '')) {
    return true;
  }
  if (LIMITES_DE_ESCOPO.has(no.type)) {
    return false;
  }
  return filhos(no, chaves).some((filho) => trataOErro(filho, funcoes, chaves));
}

export const semCatchVazio = criarRegra<[OpcoesSemCatchVazio], 'vazio' | 'semTratamento'>({
  name: 'sem-catch-vazio',
  meta: {
    type: 'problem',
    docs: {
      description: 'Exige que todo catch relance o erro ou chame uma função de reporte.',
    },
    messages: {
      vazio: 'Bloco catch vazio. Relance o erro ou chame {{funcoes}}.',
      semTratamento:
        'O catch precisa relançar o erro ou chamar {{funcoes}}. Só registrar em log ou ignorar é proibido.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          funcoesDeReporte: { type: 'array', items: { type: 'string' }, minItems: 1, uniqueItems: true },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ funcoesDeReporte: ['reportarErro'] }],
  },
  create(contexto, [opcoes]) {
    const funcoes = new Set(opcoes.funcoesDeReporte);
    const dados = { funcoes: opcoes.funcoesDeReporte.join(' ou ') };
    const chaves = contexto.sourceCode.visitorKeys;

    return {
      CatchClause(no) {
        if (no.body.body.length === 0) {
          contexto.report({ node: no, messageId: 'vazio', data: dados });
          return;
        }
        if (!trataOErro(no.body, funcoes, chaves)) {
          contexto.report({ node: no, messageId: 'semTratamento', data: dados });
        }
      },
    };
  },
});
