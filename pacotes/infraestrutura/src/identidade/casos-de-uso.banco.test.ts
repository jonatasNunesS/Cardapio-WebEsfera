import { criarConta, entrar, renovarSessao, sair } from '@cardapio/aplicacao';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AcessoAoBanco } from '../banco/banco.ts';
import { criarRegistroDeTentativas } from '../banco/identidade/registro-de-tentativas.ts';
import { criarRepositorioDeContas } from '../banco/identidade/repositorio-de-contas.ts';
import { criarRepositorioDeSessoes } from '../banco/identidade/repositorio-de-sessoes.ts';
import { abrirBanco, consultarComoAdmin, sufixoUnico } from '../banco/testes/apoio.ts';
import { criarCofreArgon2 } from './cofre-argon2.ts';
import { geradorDeSegredos } from './segredos-cripto.ts';
import { carregarSenhasVazadas } from './senhas-vazadas.ts';

let banco: AcessoAoBanco;

beforeAll(() => {
  banco = abrirBanco('api');
});

afterAll(async () => {
  await banco.encerrar();
});

describe('casos de uso com os adaptadores reais', () => {
  it('criar conta, entrar, renovar e sair: o cookie leva o token, o banco guarda só o resumo', async () => {
    const dependencias = {
      contas: criarRepositorioDeContas(banco),
      sessoes: criarRepositorioDeSessoes(banco),
      tentativas: criarRegistroDeTentativas(banco),
      cofre: criarCofreArgon2(),
      senhasVazadas: carregarSenhasVazadas(),
      segredos: geradorDeSegredos,
      relogio: { agora: () => new Date() },
    };
    const email = `dono-${sufixoUnico()}@brasa.com.br`;
    const criada = await criarConta(dependencias, { nome: 'Ana', email, senha: 'cavalo-bateria-grampo' });
    const entrada = await entrar(dependencias, { email, senha: 'cavalo-bateria-grampo', ip: '203.0.113.9' });
    const token = entrada.ok ? entrada.valor.token : '';

    expect(criada.ok && entrada.ok).toBe(true);
    const guardadas = await consultarComoAdmin(
      'SELECT s.*, u.hash_senha FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id WHERE u.email = $1',
      [email],
    );
    expect(guardadas).toHaveLength(2);
    expect(JSON.stringify(guardadas)).not.toContain(token);
    expect(JSON.stringify(guardadas)).not.toContain('cavalo-bateria-grampo');
    const doPainel = { token, publico: 'painel', niveis: ['completa'] } as const;
    expect((await renovarSessao(dependencias, doPainel)).ok).toBe(true);
    await sair(dependencias, token);
    expect((await renovarSessao(dependencias, doPainel)).ok).toBe(false);
  });
});
