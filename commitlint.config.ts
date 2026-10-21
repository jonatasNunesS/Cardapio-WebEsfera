import { RuleConfigSeverity, type UserConfig } from '@commitlint/types';
import { encontrarEmojis } from './pacotes/config/src/emoji.ts';

const configuracao: UserConfig = {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'sem-emoji': (mensagem) => {
          const [ocorrencia] = encontrarEmojis(mensagem.raw ?? '');
          return [
            ocorrencia === undefined,
            `a mensagem contém o emoji ${ocorrencia?.codigo ?? ''}, proibido no projeto (CLAUDE.md)`,
          ];
        },
      },
    },
  ],
  rules: {
    'sem-emoji': [RuleConfigSeverity.Error, 'always'],
  },
};

export default configuracao;
