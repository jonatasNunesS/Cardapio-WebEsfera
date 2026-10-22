import { describe, expect, it } from 'vitest';
import { criarClienteDaApi } from './cliente-da-api.ts';

interface Chamada {
  readonly endereco: string;
  readonly opcoes: RequestInit;
}

function servidorFalso(respostas: (() => Response)[]) {
  const chamadas: Chamada[] = [];
  const buscar = (endereco: string, opcoes: RequestInit) => {
    chamadas.push({ endereco, opcoes });
    const proxima =
      endereco === '/csrf'
        ? () => Response.json({ token: `t${String(chamadas.length)}` })
        : respostas.shift();
    return Promise.resolve((proxima ?? (() => new Response(null, { status: 500 })))());
  };
  return { chamadas, buscar };
}

describe('cliente da API', () => {
  it('leitura sem CSRF; escrita com o token no cabeçalho, pedido uma vez só', async () => {
    const { chamadas, buscar } = servidorFalso([
      () => Response.json({ restaurante: null }),
      () => new Response(null, { status: 204 }),
      () => new Response(null, { status: 201 }),
    ]);
    const cliente = criarClienteDaApi('/csrf', buscar);

    expect(await cliente.pedir('GET', '/sessao')).toEqual({
      ok: true,
      status: 200,
      dados: { restaurante: null },
    });
    await cliente.pedir('POST', '/sessao', { email: 'a@b.co' });
    await cliente.pedir('POST', '/contas', {});

    expect(chamadas.map((chamada) => chamada.endereco)).toEqual(['/sessao', '/csrf', '/sessao', '/contas']);
    expect(chamadas[2]?.opcoes.headers).toEqual({ 'x-csrf-token': 't2', 'content-type': 'application/json' });
    expect(chamadas[2]?.opcoes.credentials).toBe('same-origin');
  });

  it('CSRF vencido: renova o token e repete uma vez', async () => {
    const { chamadas, buscar } = servidorFalso([
      () => Response.json({ codigo: 'HTTP_CSRF_INVALIDO' }, { status: 403 }),
      () => new Response(null, { status: 204 }),
    ]);
    const resposta = await criarClienteDaApi('/csrf', buscar).pedir('DELETE', '/sessao');

    expect(resposta).toEqual({ ok: true, status: 204, dados: undefined });
    expect(chamadas.map((chamada) => chamada.endereco)).toEqual(['/csrf', '/sessao', '/csrf', '/sessao']);
  });

  it('erro vira o Problem Details da API', async () => {
    const problema = {
      status: 401,
      codigo: 'SESSAO_ENTRAR_CREDENCIAIS_INVALIDAS',
      detail: 'E-mail ou senha incorretos.',
    };
    const { buscar } = servidorFalso([() => Response.json(problema, { status: 401 })]);

    expect(await criarClienteDaApi('/csrf', buscar).pedir('POST', '/sessao', {})).toEqual({
      ok: false,
      status: 401,
      problema,
    });
  });
});
