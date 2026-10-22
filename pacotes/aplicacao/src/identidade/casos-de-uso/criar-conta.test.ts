import { CODIGOS } from '@cardapio/dominio';
import { describe, expect, it } from 'vitest';
import { dependenciasDeIdentidade } from '../../testes/dobles.ts';
import { criarConta } from './criar-conta.ts';

const VALIDA = { nome: ' Ana Souza ', email: ' Ana@Brasa.com.BR ', senha: 'cavalo-bateria-grampo' };

describe('CriarConta', () => {
  it('cria o usuário com e-mail normalizado e senha resumida, e abre a sessão do painel', async () => {
    const dependencias = dependenciasDeIdentidade();
    const resultado = await criarConta(dependencias, VALIDA);

    expect(resultado).toEqual({
      ok: true,
      valor: { token: 'token-1', expiraEm: new Date('2026-11-21T20:00:00Z') },
    });
    expect(dependencias.contas.usuarios).toEqual([
      {
        id: 'usuario-1',
        nome: 'Ana Souza',
        email: 'ana@brasa.com.br',
        hashSenha: '$argon2id$teste$cavalo-bateria-grampo',
      },
    ]);
    expect(dependencias.sessoes.guardadas[0]).toMatchObject({
      hashId: 'resumo(token-1)',
      publico: 'painel',
      titularId: 'usuario-1',
      restauranteId: null,
    });
  });

  it.each([
    [{ nome: '  ' }, CODIGOS.CONTA_CRIAR_NOME_INVALIDO, 'nome'],
    [{ nome: 'a'.repeat(121) }, CODIGOS.CONTA_CRIAR_NOME_INVALIDO, 'nome'],
    [{ email: 'ana@' }, CODIGOS.CONTA_CRIAR_EMAIL_INVALIDO, 'email'],
    [{ senha: 'curta' }, CODIGOS.CONTA_SENHA_CURTA_DEMAIS, 'senha'],
    [{ senha: 'a'.repeat(129) }, CODIGOS.CONTA_SENHA_LONGA_DEMAIS, 'senha'],
    [{ senha: '1234567890' }, CODIGOS.CONTA_SENHA_VAZADA, 'senha'],
  ])('recusa %o com %s', async (mudanca, codigo, campo) => {
    const dependencias = dependenciasDeIdentidade();
    const resultado = await criarConta(dependencias, { ...VALIDA, ...mudanca });

    expect(!resultado.ok && resultado.erro).toMatchObject({ codigo, detalhes: { campo } });
    expect(dependencias.contas.usuarios).toEqual([]);
    expect(dependencias.sessoes.guardadas).toEqual([]);
  });

  it('e-mail já usado: recusa sem abrir sessão', async () => {
    const dependencias = dependenciasDeIdentidade();
    await criarConta(dependencias, VALIDA);
    const resultado = await criarConta(dependencias, { ...VALIDA, email: 'ana@brasa.com.br' });

    expect(!resultado.ok && resultado.erro.codigo).toBe(CODIGOS.CONTA_CRIAR_EMAIL_INDISPONIVEL);
    expect(dependencias.sessoes.guardadas).toHaveLength(1);
  });

  it('banco recusa a sessão: erro inesperado, não de negócio', async () => {
    const dependencias = dependenciasDeIdentidade();
    dependencias.sessoes.aceitar = false;

    await expect(criarConta(dependencias, VALIDA)).rejects.toMatchObject({
      name: 'ErroEstadoInconsistente',
      codigo: CODIGOS.SESSAO_CRIAR_RECUSADA,
      contexto: { modulo: 'identidade', casoDeUso: 'CriarConta' },
    });
  });
});
