import { describe } from 'vitest';
import { pluginCardapio } from '../plugin.ts';
import { criarTestador } from './testador.ts';

const regra = pluginCardapio.rules?.['sem-catch-vazio'];
if (regra === undefined) {
  throw new Error('Regra sem-catch-vazio não registrada no plugin');
}

describe('sem-catch-vazio', () => {
  criarTestador().run('sem-catch-vazio', regra, {
    valid: [
      'try { executar(); } catch (erro) { throw erro; }',
      'try { executar(); } catch (erro) { reportarErro(erro); }',
      'try { executar(); } catch (erro) { if (deveRelancar) { throw erro; } reportarErro(erro); }',
      'try { executar(); } catch (erro) { observabilidade.reportarErro(erro); }',
      {
        code: 'try { executar(); } catch (erro) { capturarFalha(erro); }',
        options: [{ funcoesDeReporte: ['capturarFalha'] }],
      },
    ],
    invalid: [
      { code: 'try { executar(); } catch (erro) {}', errors: [{ messageId: 'vazio' }] },
      { code: 'try { executar(); } catch {}', errors: [{ messageId: 'vazio' }] },
      {
        code: 'try { executar(); } catch (erro) { logger.error(erro); }',
        errors: [{ messageId: 'semTratamento' }],
      },
      {
        code: 'try { executar(); } catch (erro) { const tratar = () => { throw erro; }; }',
        errors: [{ messageId: 'semTratamento' }],
      },
      {
        code: 'try { executar(); } catch (erro) { reportarErro(erro); }',
        options: [{ funcoesDeReporte: ['capturarFalha'] }],
        errors: [{ messageId: 'semTratamento' }],
      },
    ],
  });
});
