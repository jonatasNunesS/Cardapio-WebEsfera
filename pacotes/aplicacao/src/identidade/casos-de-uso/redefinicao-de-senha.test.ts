import { CODIGOS } from '@cardapio/dominio';
import { describe, expect, it } from 'vitest';
import { dependenciasDeIdentidade } from '../../testes/dobles.ts';
import { confirmarRedefinicaoDeSenha } from './confirmar-redefinicao-de-senha.ts';
import { criarConta } from './criar-conta.ts';
import { pedirRedefinicaoDeSenha } from './pedir-redefinicao-de-senha.ts';
import { renovarSessao } from './renovar-sessao.ts';

async function comConta() {
  const dependencias = dependenciasDeIdentidade();
  await criarConta(dependencias, { nome: 'Ana', email: 'ana@brasa.com.br', senha: 'cavalo-bateria-grampo' });
  return dependencias;
}

describe('RedefinirSenha: pedido', () => {
  it('grava só o resumo do token, válido por 30 min, e envia o link com o token no fragmento', async () => {
    const dependencias = await comConta();
    await pedirRedefinicaoDeSenha(dependencias, ' ANA@brasa.com.br ');

    expect(dependencias.contas.tokens).toEqual([
      expect.objectContaining({
        hashToken: 'resumo(token-2)',
        expiraEm: new Date('2026-10-22T20:30:00Z'),
        usado: false,
      }),
    ]);
    expect(dependencias.email.enviados).toHaveLength(1);
    expect(dependencias.email.enviados[0]?.para).toBe('ana@brasa.com.br');
    expect(dependencias.email.enviados[0]?.texto).toContain('/redefinir-senha#token-2');
  });

  it('e-mail inexistente ou inválido: não envia nada e não falha', async () => {
    const dependencias = await comConta();
    await expect(pedirRedefinicaoDeSenha(dependencias, 'nao@existe.com')).resolves.toBeUndefined();
    await expect(pedirRedefinicaoDeSenha(dependencias, 'invalido')).resolves.toBeUndefined();
    expect(dependencias.email.enviados).toEqual([]);
  });
});

describe('RedefinirSenha: confirmação', () => {
  it('troca a senha, derruba todas as sessões e o token não vale de novo', async () => {
    const dependencias = await comConta();
    await pedirRedefinicaoDeSenha(dependencias, 'ana@brasa.com.br');

    const resultado = await confirmarRedefinicaoDeSenha(dependencias, {
      token: 'token-2',
      senha: 'nova-senha-forte',
    });

    expect(resultado).toEqual({ ok: true, valor: null });
    expect(dependencias.contas.usuarios[0]?.hashSenha).toBe('$argon2id$teste$nova-senha-forte');
    expect(
      (await renovarSessao(dependencias, { token: 'token-1', publico: 'painel', niveis: ['completa'] })).ok,
    ).toBe(false);
    const repetido = await confirmarRedefinicaoDeSenha(dependencias, {
      token: 'token-2',
      senha: 'outra-senha-forte',
    });
    expect(!repetido.ok && repetido.erro.codigo).toBe(CODIGOS.SENHA_REDEFINIR_TOKEN_INVALIDO);
  });

  it('token expirado é recusado', async () => {
    const dependencias = await comConta();
    await pedirRedefinicaoDeSenha(dependencias, 'ana@brasa.com.br');
    dependencias.relogio.avancar(30 * 60_000);

    const resultado = await confirmarRedefinicaoDeSenha(dependencias, {
      token: 'token-2',
      senha: 'nova-senha-forte',
    });
    expect(!resultado.ok && resultado.erro.codigo).toBe(CODIGOS.SENHA_REDEFINIR_TOKEN_INVALIDO);
  });

  it('um pedido novo invalida o token anterior', async () => {
    const dependencias = await comConta();
    await pedirRedefinicaoDeSenha(dependencias, 'ana@brasa.com.br');
    await pedirRedefinicaoDeSenha(dependencias, 'ana@brasa.com.br');

    expect(
      (await confirmarRedefinicaoDeSenha(dependencias, { token: 'token-2', senha: 'nova-senha-forte' })).ok,
    ).toBe(false);
    expect(
      (await confirmarRedefinicaoDeSenha(dependencias, { token: 'token-3', senha: 'nova-senha-forte' })).ok,
    ).toBe(true);
  });

  it.each([
    ['curta', CODIGOS.CONTA_SENHA_CURTA_DEMAIS],
    ['senhasenha', CODIGOS.CONTA_SENHA_VAZADA],
  ])('senha nova %s é recusada antes de gastar o token', async (senha, codigo) => {
    const dependencias = await comConta();
    await pedirRedefinicaoDeSenha(dependencias, 'ana@brasa.com.br');

    const resultado = await confirmarRedefinicaoDeSenha(dependencias, { token: 'token-2', senha });
    expect(!resultado.ok && resultado.erro.codigo).toBe(codigo);
    expect(dependencias.contas.tokens[0]?.usado).toBe(false);
  });
});
