import { CODIGOS } from '@cardapio/dominio';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CofreDeTeste,
  INICIO,
  RelogioDeTeste,
  SegredosDeTeste,
  senhasVazadasDeTeste,
} from '../../testes/dobles.ts';
import type { DependenciasDaPlataforma } from '../dependencias.ts';
import type { ConviteParaEnviar, EnviadorConvite } from '../portas/enviador-convite.ts';
import type {
  ConviteNovo,
  DesfechoDaCriacaoPeloAdmin,
  RepositorioDaPlataforma,
  RestauranteDoAdmin,
} from '../portas/repositorio-da-plataforma.ts';
import { aceitarConvite } from './aceitar-convite.ts';
import { alternarSuspensao } from './alternar-suspensao.ts';
import { criarRestauranteComDono } from './criar-restaurante-com-dono.ts';
import { gerarNovoConvite } from './gerar-novo-convite.ts';
import { listarRestaurantes } from './listar-restaurantes.ts';

const ADMIN = { administradorId: 'a1' };
const DIA = 86_400_000;

class PlataformaEmMemoria implements RepositorioDaPlataforma {
  desfecho: DesfechoDaCriacaoPeloAdmin = 'criado';
  readonly criados: RestauranteDoAdmin[] = [];
  readonly convites: ConviteNovo[] = [];
  readonly suspensos = new Set<string>();
  readonly aceitos: string[] = [];

  listar() {
    return Promise.resolve([
      {
        nome: 'Brasa',
        slug: 'brasa',
        situacao: 'teste' as const,
        suspenso: false,
        testeTerminaEm: new Date(INICIO.getTime() + 3 * DIA),
        criadoEm: INICIO,
      },
      {
        nome: 'Trigo',
        slug: 'trigo',
        situacao: 'ativo' as const,
        suspenso: true,
        testeTerminaEm: INICIO,
        criadoEm: INICIO,
      },
    ]);
  }

  resolver(_a: unknown, slug: string) {
    return Promise.resolve(slug === 'brasa' ? 'r1' : null);
  }

  criar(_a: unknown, novo: RestauranteDoAdmin) {
    if (this.desfecho === 'criado') {
      this.criados.push(novo);
      this.convites.push(novo.convite);
    }
    return Promise.resolve(this.desfecho);
  }

  gerarConvite(_a: unknown, _r: string, convite: ConviteNovo) {
    this.convites.push(convite);
    return Promise.resolve({ nome: 'Brasa', email: 'dono@brasa.com.br' });
  }

  suspender(_a: unknown, restauranteId: string) {
    const novo = !this.suspensos.has(restauranteId);
    this.suspensos.add(restauranteId);
    return Promise.resolve(novo);
  }

  reativar(_a: unknown, restauranteId: string) {
    return Promise.resolve(this.suspensos.delete(restauranteId));
  }

  financeiro() {
    return Promise.resolve(null);
  }

  indicadores() {
    return Promise.resolve({ porSituacao: {}, pedidosUltimas24h: 0 });
  }

  aceitarConvite(hashToken: string) {
    const valido = this.convites.at(-1)?.hashToken === hashToken && !this.aceitos.includes(hashToken);
    if (valido) {
      this.aceitos.push(hashToken);
    }
    return Promise.resolve(valido);
  }
}

class EnviadorManualDeTeste implements EnviadorConvite {
  readonly enviados: ConviteParaEnviar[] = [];

  enviar(convite: ConviteParaEnviar) {
    this.enviados.push(convite);
    return Promise.resolve({ linkParaOAdmin: convite.link });
  }
}

let plataforma: PlataformaEmMemoria;
let enviador: EnviadorManualDeTeste;
let dependencias: DependenciasDaPlataforma;

beforeEach(() => {
  plataforma = new PlataformaEmMemoria();
  enviador = new EnviadorManualDeTeste();
  dependencias = {
    plataforma,
    enviador,
    segredos: new SegredosDeTeste(),
    cofre: new CofreDeTeste(),
    senhasVazadas: senhasVazadasDeTeste,
    relogio: new RelogioDeTeste(),
    urlDoConvite: 'https://painel.exemplo/convite',
  };
});

const ENTRADA = { nome: 'Brasa e Trigo', slug: 'brasa-e-trigo', emailDoDono: 'Dono@Brasa.com.br' };

describe('lista de restaurantes', () => {
  it('mostra suspenso por cima da cobrança e os dias de teste só no teste', async () => {
    expect(await listarRestaurantes(dependencias, ADMIN)).toEqual([
      { nome: 'Brasa', slug: 'brasa', situacao: 'teste', diasDeTeste: 3 },
      { nome: 'Trigo', slug: 'trigo', situacao: 'suspenso', diasDeTeste: null },
    ]);
  });
});

describe('criar restaurante com dono', () => {
  it('cria com e-mail normalizado, convite de 72 h e devolve o link uma vez', async () => {
    const resultado = await criarRestauranteComDono(dependencias, ADMIN, ENTRADA);

    expect(resultado).toEqual({
      ok: true,
      valor: {
        slug: 'brasa-e-trigo',
        linkDoConvite: expect.stringMatching(/^https:\/\/painel\.exemplo\/convite#token=/) as string,
      },
    });
    expect(plataforma.criados[0]?.dono.email).toBe('dono@brasa.com.br');
    expect((plataforma.criados[0]?.convite.expiraEm.getTime() ?? 0) - INICIO.getTime()).toBe(72 * 3600_000);
    expect(plataforma.criados[0]?.convite.hashToken).toMatch(/^resumo\(/);
    expect(enviador.enviados).toHaveLength(1);
  });

  it.each([
    [{ ...ENTRADA, slug: 'admin' }, CODIGOS.PLATAFORMA_CRIAR_SLUG_INVALIDO],
    [{ ...ENTRADA, emailDoDono: 'sem-arroba' }, CODIGOS.PLATAFORMA_CRIAR_EMAIL_INVALIDO],
    [{ ...ENTRADA, nome: '  ' }, CODIGOS.RESTAURANTE_CRIAR_NOME_INVALIDO],
  ])('recusa entrada inválida sem gravar', async (entrada, codigo) => {
    expect(await criarRestauranteComDono(dependencias, ADMIN, entrada)).toMatchObject({
      ok: false,
      erro: { codigo },
    });
    expect(plataforma.criados).toEqual([]);
  });

  it.each([
    ['slug-ocupado', CODIGOS.PLATAFORMA_CRIAR_SLUG_OCUPADO],
    ['email-ocupado', CODIGOS.PLATAFORMA_CRIAR_EMAIL_OCUPADO],
    ['proibido', CODIGOS.PLATAFORMA_ACAO_SEM_PERMISSAO],
  ] as const)('%s vira falha e não envia convite', async (desfecho, codigo) => {
    plataforma.desfecho = desfecho;
    expect(await criarRestauranteComDono(dependencias, ADMIN, ENTRADA)).toMatchObject({
      ok: false,
      erro: { codigo },
    });
    expect(enviador.enviados).toEqual([]);
  });
});

describe('convite', () => {
  it('novo convite substitui o anterior; o antigo não vale mais', async () => {
    await criarRestauranteComDono(dependencias, ADMIN, ENTRADA);
    const primeiro = enviador.enviados[0]?.link.split('token=')[1] ?? '';
    const novo = await gerarNovoConvite(dependencias, ADMIN, 'brasa');
    const segundo = enviador.enviados[1]?.link.split('token=')[1] ?? '';

    expect(novo.ok).toBe(true);
    expect((await aceitarConvite(dependencias, { token: primeiro, senha: 'cavalo-bateria-grampo' })).ok).toBe(
      false,
    );
    expect((await aceitarConvite(dependencias, { token: segundo, senha: 'cavalo-bateria-grampo' })).ok).toBe(
      true,
    );
  });

  it('uso único: aceitar de novo falha', async () => {
    await criarRestauranteComDono(dependencias, ADMIN, ENTRADA);
    const token = enviador.enviados[0]?.link.split('token=')[1] ?? '';
    await aceitarConvite(dependencias, { token, senha: 'cavalo-bateria-grampo' });

    expect(await aceitarConvite(dependencias, { token, senha: 'cavalo-bateria-grampo' })).toMatchObject({
      ok: false,
      erro: { codigo: CODIGOS.CONVITE_ACEITAR_INVALIDO },
    });
  });

  it('senha vazada é recusada antes de consumir o convite', async () => {
    await criarRestauranteComDono(dependencias, ADMIN, ENTRADA);
    const token = enviador.enviados[0]?.link.split('token=')[1] ?? '';

    expect((await aceitarConvite(dependencias, { token, senha: 'senhasenha' })).ok).toBe(false);
    expect(plataforma.aceitos).toEqual([]);
  });

  it('restaurante desconhecido não gera convite', async () => {
    expect(await gerarNovoConvite(dependencias, ADMIN, 'nenhum')).toMatchObject({
      ok: false,
      erro: { codigo: CODIGOS.PLATAFORMA_ACAO_NAO_ENCONTRADO },
    });
  });
});

describe('suspender e reativar', () => {
  it('exige motivo, não suspende duas vezes e não reativa quem não está suspenso', async () => {
    const pedir = (suspender: boolean, motivo = 'falta de pagamento') =>
      alternarSuspensao(dependencias, ADMIN, { slug: 'brasa', suspender, motivo });

    expect(await pedir(true, 'x')).toMatchObject({
      ok: false,
      erro: { codigo: CODIGOS.PLATAFORMA_ACAO_MOTIVO_INVALIDO },
    });
    expect((await pedir(true)).ok).toBe(true);
    expect(await pedir(true)).toMatchObject({
      ok: false,
      erro: { codigo: CODIGOS.PLATAFORMA_SUSPENDER_JA_SUSPENSO },
    });
    expect((await pedir(false)).ok).toBe(true);
    expect(await pedir(false)).toMatchObject({
      ok: false,
      erro: { codigo: CODIGOS.PLATAFORMA_REATIVAR_NAO_SUSPENSO },
    });
  });
});
