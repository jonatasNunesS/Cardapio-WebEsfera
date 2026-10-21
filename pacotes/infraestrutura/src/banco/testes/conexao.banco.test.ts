import { CODIGOS, ErroDependenciaExterna } from '@cardapio/aplicacao';
import { describe, expect, inject, it } from 'vitest';
import { criarBanco } from '../banco.ts';
import { abrirBanco, consultarComoAdmin, criarRelatorDeTeste } from './apoio.ts';

function bancoCom(url: string, relator = criarRelatorDeTeste(), nomeAplicacao = 'teste-conexao') {
  return criarBanco({ runtime: { url, nomeAplicacao, maxConexoes: 1 }, relator });
}

async function falhaDaVerificacao(url: string): Promise<unknown> {
  const banco = bancoCom(url);
  try {
    return await banco.verificarConexao().then(
      () => undefined,
      (erro: unknown) => erro,
    );
  } finally {
    await banco.encerrar();
  }
}

describe('verificarConexao', () => {
  it('passa com o usuário da API', async () => {
    const banco = abrirBanco('api');
    await expect(banco.verificarConexao()).resolves.toBeUndefined();
    await banco.encerrar();
  });

  it('vira ErroDependenciaExterna quando ninguém escuta na porta', async () => {
    const erro = await falhaDaVerificacao('postgres://cardapio_api:x@127.0.0.1:1/cardapio');
    expect(erro).toBeInstanceOf(ErroDependenciaExterna);
    expect((erro as ErroDependenciaExterna).codigo).toBe(CODIGOS.BANCO_CONEXAO_FALHOU);
  });

  it('vira ErroDependenciaExterna com senha errada, sem levar a senha na mensagem', async () => {
    const url = new URL(inject('bancoDeTeste').urlApi);
    url.password = 'senha-errada-de-teste';
    const erro = await falhaDaVerificacao(url.toString());
    expect(erro).toBeInstanceOf(ErroDependenciaExterna);
    expect((erro as ErroDependenciaExterna).contexto.dados).toEqual({ sqlstate: '28P01' });
    expect(JSON.stringify(erro)).not.toContain('senha-errada-de-teste');
  });

  it('reporta a queda de uma conexão ociosa sem derrubar o processo e reconecta', async () => {
    const relator = criarRelatorDeTeste();
    const banco = bancoCom(inject('bancoDeTeste').urlApi, relator, 'teste-conexao-ociosa');
    await banco.verificarConexao();

    await consultarComoAdmin(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = 'teste-conexao-ociosa'",
    );
    await expect.poll(() => relator.reportados.length).toBe(1);

    expect(relator.reportados[0]).toBeInstanceOf(ErroDependenciaExterna);
    expect((relator.reportados[0] as ErroDependenciaExterna).contexto.dados).toEqual({ sqlstate: '57P01' });
    await expect(banco.verificarConexao()).resolves.toBeUndefined();
    await banco.encerrar();
  });
});
