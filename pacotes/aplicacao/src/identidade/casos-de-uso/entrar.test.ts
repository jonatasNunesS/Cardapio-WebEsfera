import { CODIGOS, FALHAS_LIVRES } from '@cardapio/dominio';
import { describe, expect, it } from 'vitest';
import { dependenciasDeIdentidade } from '../../testes/dobles.ts';
import { criarConta } from './criar-conta.ts';
import { entrar } from './entrar.ts';

const SENHA = 'cavalo-bateria-grampo';

async function comConta() {
  const dependencias = dependenciasDeIdentidade();
  await criarConta(dependencias, { nome: 'Ana', email: 'ana@brasa.com.br', senha: SENHA });
  return dependencias;
}

describe('Entrar', () => {
  it('entra com o restaurante do primeiro vínculo e zera as falhas do e-mail', async () => {
    const dependencias = await comConta();
    dependencias.contas.vinculos.push({
      usuarioId: 'usuario-1',
      restauranteId: 'restaurante-1',
      papel: 'dono',
    });
    await entrar(dependencias, { email: 'ana@brasa.com.br', senha: 'errada-errada', ip: '10.0.0.1' });

    const resultado = await entrar(dependencias, {
      email: ' ANA@brasa.com.br',
      senha: SENHA,
      ip: '10.0.0.1',
    });

    expect(resultado).toMatchObject({
      ok: true,
      valor: { token: 'token-2', restauranteId: 'restaurante-1' },
    });
    expect(dependencias.tentativas.falhasDe('painel', 'resumo(email:ana@brasa.com.br)')).toBe(0);
    expect(dependencias.tentativas.falhasDe('painel', 'resumo(ip:10.0.0.1)')).toBe(1);
  });

  it('sem restaurante ainda: entra com restaurante nulo', async () => {
    const resultado = await entrar(await comConta(), {
      email: 'ana@brasa.com.br',
      senha: SENHA,
      ip: '10.0.0.1',
    });
    expect(resultado).toMatchObject({ ok: true, valor: { restauranteId: null } });
  });

  it('e-mail inexistente e senha errada dão a mesma resposta e o mesmo trabalho', async () => {
    const dependencias = await comConta();
    const inexistente = await entrar(dependencias, { email: 'nao@existe.com', senha: SENHA, ip: '10.0.0.1' });
    const errada = await entrar(dependencias, {
      email: 'ana@brasa.com.br',
      senha: 'outra-senha-1',
      ip: '10.0.0.2',
    });
    const malformado = await entrar(dependencias, { email: 'sem-arroba', senha: SENHA, ip: '10.0.0.3' });

    expect(inexistente).toEqual(errada);
    expect(malformado).toEqual(errada);
    expect(!errada.ok && errada.erro.codigo).toBe(CODIGOS.SESSAO_ENTRAR_CREDENCIAIS_INVALIDAS);
    expect(dependencias.cofre.conferencias).toEqual([null, expect.any(String), null]);
    expect(dependencias.sessoes.guardadas).toHaveLength(1);
  });

  it('bloqueia o e-mail depois de N falhas, mesmo com a senha certa, e libera quando o tempo passa', async () => {
    const dependencias = await comConta();
    for (let falha = 0; falha < FALHAS_LIVRES.email; falha += 1) {
      await entrar(dependencias, {
        email: 'ana@brasa.com.br',
        senha: 'errada-errada',
        ip: `10.0.0.${String(falha)}`,
      });
    }

    const bloqueada = await entrar(dependencias, { email: 'ana@brasa.com.br', senha: SENHA, ip: '10.9.9.9' });
    expect(!bloqueada.ok && bloqueada.erro).toMatchObject({
      codigo: CODIGOS.SESSAO_ENTRAR_BLOQUEADA,
      detalhes: { tenteDeNovoEm: '2026-10-22T20:01:00.000Z' },
    });
    expect(dependencias.cofre.conferencias).toHaveLength(FALHAS_LIVRES.email);

    dependencias.relogio.avancar(60_000);
    expect((await entrar(dependencias, { email: 'ana@brasa.com.br', senha: SENHA, ip: '10.9.9.9' })).ok).toBe(
      true,
    );
  });

  it('bloqueia o IP depois de N falhas, para qualquer e-mail', async () => {
    const dependencias = await comConta();
    for (let falha = 0; falha < FALHAS_LIVRES.ip; falha += 1) {
      await entrar(dependencias, {
        email: `outro${String(falha)}@x.com`,
        senha: 'errada-errada',
        ip: '10.0.0.1',
      });
    }

    const resultado = await entrar(dependencias, { email: 'ana@brasa.com.br', senha: SENHA, ip: '10.0.0.1' });
    expect(!resultado.ok && resultado.erro.codigo).toBe(CODIGOS.SESSAO_ENTRAR_BLOQUEADA);
    expect((await entrar(dependencias, { email: 'ana@brasa.com.br', senha: SENHA, ip: '10.0.0.2' })).ok).toBe(
      true,
    );
  });
});
