import { CODIGOS } from '@cardapio/dominio';
import { describe, expect, it } from 'vitest';
import { dependenciasDeIdentidade, INICIO } from '../../testes/dobles.ts';
import { criarConta } from './criar-conta.ts';
import { renovarSessao } from './renovar-sessao.ts';
import { sair } from './sair.ts';

const HORA = 3_600_000;

async function comSessao() {
  const dependencias = dependenciasDeIdentidade();
  await criarConta(dependencias, { nome: 'Ana', email: 'ana@brasa.com.br', senha: 'cavalo-bateria-grampo' });
  return dependencias;
}

const doPainel = { token: 'token-1', publico: 'painel', niveis: ['completa'] } as const;

describe('RenovarSessao', () => {
  it('valida a sessão e renova o último uso', async () => {
    const dependencias = await comSessao();
    dependencias.relogio.avancar(HORA);

    const resultado = await renovarSessao(dependencias, doPainel);

    expect(resultado).toEqual({
      ok: true,
      valor: {
        hashId: 'resumo(token-1)',
        titularId: 'usuario-1',
        nivel: 'completa',
        restauranteId: null,
        papel: null,
      },
    });
    expect(dependencias.sessoes.guardadas[0]?.ultimoUsoEm).toEqual(new Date(INICIO.getTime() + HORA));
  });

  it('expira por inatividade e revoga', async () => {
    const dependencias = await comSessao();
    dependencias.relogio.avancar(12 * HORA);

    const resultado = await renovarSessao(dependencias, doPainel);
    expect(!resultado.ok && resultado.erro.codigo).toBe(CODIGOS.SESSAO_VALIDAR_INVALIDA);
    expect(dependencias.sessoes.guardadas[0]?.revogada).toBe(true);
  });

  it('expira pela idade máxima, mesmo em uso', async () => {
    const dependencias = await comSessao();
    for (let passadas = 11; passadas < 30 * 24; passadas += 11) {
      dependencias.relogio.avancar(11 * HORA);
      expect((await renovarSessao(dependencias, doPainel)).ok).toBe(true);
    }
    dependencias.relogio.avancar(INICIO.getTime() + 30 * 24 * HORA - dependencias.relogio.agora().getTime());

    const resultado = await renovarSessao(dependencias, doPainel);
    expect(!resultado.ok && resultado.erro.codigo).toBe(CODIGOS.SESSAO_VALIDAR_INVALIDA);
  });

  it('sessão do painel não vale no admin, e vice-versa', async () => {
    const dependencias = await comSessao();
    const noAdmin = await renovarSessao(dependencias, { ...doPainel, publico: 'admin' });
    expect(!noAdmin.ok && noAdmin.erro.codigo).toBe(CODIGOS.SESSAO_VALIDAR_INVALIDA);
  });

  it('nível fora do pedido é recusado', async () => {
    const dependencias = await comSessao();
    const resultado = await renovarSessao(dependencias, { ...doPainel, niveis: ['segundo_fator'] });
    expect(resultado.ok).toBe(false);
  });

  it('token desconhecido é recusado', async () => {
    const resultado = await renovarSessao(await comSessao(), { ...doPainel, token: 'outro' });
    expect(resultado.ok).toBe(false);
  });

  it('Sair revoga a sessão', async () => {
    const dependencias = await comSessao();
    await sair(dependencias, 'token-1');
    expect((await renovarSessao(dependencias, doPainel)).ok).toBe(false);
  });
});
