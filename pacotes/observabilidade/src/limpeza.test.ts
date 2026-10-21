import { describe, expect, it } from 'vitest';
import { limparBreadcrumb, limparEvento, limparSpan, mascararTexto } from './limpeza.ts';

const RESTAURANTE_ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

function eventoDeRequisicao() {
  return {
    event_id: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
    tags: { restaurante_id: RESTAURANTE_ID, app: 'api' },
    user: { email: 'dono@restaurante.com.br', ip_address: '10.0.0.1' },
    request: {
      url: 'https://cardapio.exemplo/brasa-e-trigo/mesa/12?c=Abc123',
      query_string: 'c=Abc123',
      method: 'POST',
      cookies: { sessao: 'segredo' },
      data: { observacao: 'sem cebola' },
      headers: {
        Cookie: 'sessao=segredo',
        Authorization: 'Bearer abc',
        'user-agent': 'Mozilla/5.0',
      },
    },
  };
}

describe('limparEvento', () => {
  it('remove cookie, corpo e authorization da requisição', () => {
    const limpo = limparEvento(eventoDeRequisicao());

    expect(limpo.request).not.toHaveProperty('cookies');
    expect(limpo.request).not.toHaveProperty('data');
    expect(limpo.request.headers).toEqual({ 'user-agent': 'Mozilla/5.0' });
    expect(limpo).not.toHaveProperty('user');
  });

  it('oculta o código do QR e o segmento da mesa na URL', () => {
    const limpo = limparEvento(eventoDeRequisicao());

    expect(limpo.request.url).toBe('https://cardapio.exemplo/brasa-e-trigo/mesa/[oculto]?c=[oculto]');
    expect(limpo.request.query_string).toBe('c=[oculto]');
  });

  it('oculta o código do QR na consulta em pares', () => {
    const limpo = limparEvento({
      request: {
        query_string: [
          ['c', 'Abc123'],
          ['pagina', '2'],
        ],
      },
    });

    expect(limpo.request.query_string).toEqual([
      ['c', '[oculto]'],
      ['pagina', '2'],
    ]);
  });

  it('mantém o restaurante_id', () => {
    expect(limparEvento(eventoDeRequisicao()).tags.restaurante_id).toBe(RESTAURANTE_ID);
  });

  it('mascara e-mail, CPF e CNPJ em qualquer texto do evento', () => {
    const limpo = limparEvento({
      message: 'Contato joao.silva+teste@gmail.com, CPF 123.456.789-09 e 12345678909',
      extra: { aviso: 'CNPJ 12.345.678/0001-90 ou 12345678000190' },
      exception: { values: [{ type: 'Error', value: 'Falhou para maria@exemplo.com' }] },
    });

    expect(limpo.message).toBe('Contato [email], CPF [cpf] e [cpf]');
    expect(limpo.extra.aviso).toBe('CNPJ [cnpj] ou [cnpj]');
    expect(limpo.exception.values[0]?.value).toBe('Falhou para [email]');
  });

  it('oculta campos com nome sensível em qualquer nível', () => {
    const limpo = limparEvento({
      contexts: { negocio: { senha: 'x', token: 'y', documento: 'z', mesa: 3 } },
    });

    expect(limpo.contexts.negocio).toEqual({
      senha: '[oculto]',
      token: '[oculto]',
      documento: '[oculto]',
      mesa: 3,
    });
  });
});

describe('limparBreadcrumb', () => {
  it('limpa a URL e os dados do passo', () => {
    const limpo = limparBreadcrumb({
      category: 'http',
      data: { url: '/brasa-e-trigo/mesa/4?c=Zz9', email: 'a@b.com' },
    });

    expect(limpo.data).toEqual({ url: '/brasa-e-trigo/mesa/[oculto]?c=[oculto]', email: '[oculto]' });
  });
});

describe('limparSpan', () => {
  it('oculta o código do QR nos atributos e no nome do span', () => {
    const limpo = limparSpan({
      name: 'GET /brasa-e-trigo/mesa/12?c=Abc123',
      attributes: {
        'url.path': { value: '/depuracao/erro?c=QrSegredo', type: 'string' },
        'http.route': '/depuracao/erro',
      },
    });

    expect(limpo.name).toBe('GET /brasa-e-trigo/mesa/[oculto]?c=[oculto]');
    expect(limpo.attributes['url.path'].value).toBe('/depuracao/erro?c=[oculto]');
    expect(limpo.attributes['http.route']).toBe('/depuracao/erro');
  });
});

describe('mascararTexto', () => {
  it('não confunde release e caminho de pacote com e-mail', () => {
    expect(mascararTexto('api@0.0.0+62b6336')).toBe('api@0.0.0+62b6336');
    expect(mascararTexto('/node_modules/.pnpm/@sentry+core@11.8.0/node_modules')).toBe(
      '/node_modules/.pnpm/@sentry+core@11.8.0/node_modules',
    );
  });

  it('não altera texto sem dado pessoal', () => {
    expect(mascararTexto(`Pedido 42 do restaurante ${RESTAURANTE_ID}`)).toBe(
      `Pedido 42 do restaurante ${RESTAURANTE_ID}`,
    );
  });
});
