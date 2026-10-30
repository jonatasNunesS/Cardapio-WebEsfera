import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import type { AcessoAoBanco } from '../banco.ts';
import { criarRegistroDeTentativas } from '../identidade/registro-de-tentativas.ts';
import { criarRepositorioDeAdmins } from '../identidade/repositorio-de-admins.ts';
import { criarRepositorioDeContas } from '../identidade/repositorio-de-contas.ts';
import { criarRepositorioDeSessoes } from '../identidade/repositorio-de-sessoes.ts';
import { criarRepositorioDeRestaurantes } from '../restaurantes/repositorio-de-restaurantes.ts';
import { abrirBanco, consultarComoAdmin, sufixoUnico } from './apoio.ts';

const HASH = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA';
const AGORA = new Date('2026-10-22T20:00:00Z');
const depois = (minutos: number) => new Date(AGORA.getTime() + minutos * 60_000);
const hex = (valor: string) => createHash('sha256').update(valor).digest('hex');
const novoToken = () => randomBytes(32).toString('base64url');

let banco: AcessoAoBanco;
let contas: ReturnType<typeof criarRepositorioDeContas>;
let sessoes: ReturnType<typeof criarRepositorioDeSessoes>;
let restaurantes: ReturnType<typeof criarRepositorioDeRestaurantes>;

beforeAll(() => {
  banco = abrirBanco('api');
  contas = criarRepositorioDeContas(banco);
  sessoes = criarRepositorioDeSessoes(banco);
  restaurantes = criarRepositorioDeRestaurantes(banco);
});

afterAll(async () => {
  await banco.encerrar();
});

const emailNovo = () => `dono-${sufixoUnico()}@brasa.com.br`;

async function novoUsuario(): Promise<string> {
  const id = await contas.criarUsuario('Ana', emailNovo(), HASH);
  if (id === null) {
    throw new Error('usuário não criado');
  }
  return id;
}

const PERSONALIZACAO = {
  corMarca: '#B4441F',
  corSobreMarca: '#FFFFFF',
  corMarcaTexto: '#B4441F',
  logoUrl: null,
  capaUrl: null,
  frase: '',
  linkAvaliacaoGoogle: null,
  linkInstagram: null,
  textos: { boasVindas: 'a', aoChamarGarcom: 'b', restauranteFechado: 'c' },
};

async function novoRestaurante(donoId: string, candidatos = [`r-${sufixoUnico()}`]) {
  return restaurantes.criar({
    nome: 'Brasa',
    candidatosDeSlug: candidatos,
    testeTerminaEm: depois(10 * 24 * 60),
    donoId,
    personalizacao: PERSONALIZACAO,
  });
}

describe('contas', () => {
  it('cria, recusa e-mail repetido e busca as credenciais', async () => {
    const email = emailNovo();
    const id = await contas.criarUsuario('Ana', email, HASH);

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await contas.criarUsuario('Outra', email, HASH)).toBeNull();
    expect(await contas.buscarCredenciais(email)).toEqual({ usuarioId: id, hashSenha: HASH });
    expect(await contas.buscarCredenciais('ninguem@x.com')).toBeNull();
  });

  it('o banco recusa senha que não seja hash Argon2id', async () => {
    await expect(contas.criarUsuario('Ana', emailNovo(), 'senha-em-texto-puro')).rejects.toMatchObject({
      codigo: 'BANCO_CONSULTA_FALHOU',
    });
  });

  it('lista os vínculos ativos do usuário', async () => {
    const usuarioId = await novoUsuario();
    expect(await contas.listarVinculos(usuarioId)).toEqual([]);
    const criado = await novoRestaurante(usuarioId);
    expect(await contas.listarVinculos(usuarioId)).toEqual([
      { restauranteId: criado?.restauranteId, papel: 'dono' },
    ]);
  });
});

describe('sessões', () => {
  it('guarda só o resumo do id, renova, revoga e não aparece depois de revogada', async () => {
    const usuarioId = await novoUsuario();
    const token = novoToken();
    const hashId = hex(token);
    const nova = {
      hashId,
      publico: 'painel',
      titularId: usuarioId,
      restauranteId: null,
      nivel: 'completa',
    } as const;

    expect(await sessoes.criar({ ...nova, agora: AGORA, expiraEm: depois(60) })).toBe(true);
    const linhas = await consultarComoAdmin<Record<string, unknown>>(
      'SELECT * FROM sessoes WHERE usuario_id = $1',
      [usuarioId],
    );
    expect(JSON.stringify(linhas)).not.toContain(token);
    expect(linhas[0]?.hash_id).toBe(hashId);

    await sessoes.renovar(hashId, depois(5));
    expect(await sessoes.buscar(hashId)).toMatchObject({
      publico: 'painel',
      titularId: usuarioId,
      restauranteId: null,
      papel: null,
      ultimoUsoEm: depois(5),
    });

    await sessoes.revogar(hashId, depois(6));
    expect(await sessoes.buscar(hashId)).toBeNull();
  });

  it('restaurante na sessão só com vínculo, e o papel vem do vínculo', async () => {
    const [dona, outra] = [await novoUsuario(), await novoUsuario()];
    const criado = await novoRestaurante(dona);
    const restauranteId = criado?.restauranteId ?? '';
    const base = { publico: 'painel', nivel: 'completa', agora: AGORA, expiraEm: depois(60) } as const;

    expect(await sessoes.criar({ ...base, hashId: hex('a'), titularId: outra, restauranteId })).toBe(false);
    expect(
      await sessoes.criar({ ...base, hashId: hex(`b${sufixoUnico()}`), titularId: dona, restauranteId }),
    ).toBe(true);

    const hashSemRestaurante = hex(`c${sufixoUnico()}`);
    await sessoes.criar({ ...base, hashId: hashSemRestaurante, titularId: outra, restauranteId: null });
    expect(await sessoes.definirRestaurante(hashSemRestaurante, restauranteId)).toBe(false);

    const hashDaDona = hex(`d${sufixoUnico()}`);
    await sessoes.criar({ ...base, hashId: hashDaDona, titularId: dona, restauranteId: null });
    expect(await sessoes.definirRestaurante(hashDaDona, restauranteId)).toBe(true);
    expect(await sessoes.buscar(hashDaDona)).toMatchObject({ restauranteId, papel: 'dono' });
  });
});

describe('redefinição de senha', () => {
  it('token de uso único, só o resumo no banco, e todas as sessões caem', async () => {
    const email = emailNovo();
    const usuarioId = (await contas.criarUsuario('Ana', email, HASH)) ?? '';
    const sessaoA = hex(`a${sufixoUnico()}`);
    const sessaoB = hex(`b${sufixoUnico()}`);
    for (const hashId of [sessaoA, sessaoB]) {
      await sessoes.criar({
        hashId,
        publico: 'painel',
        titularId: usuarioId,
        restauranteId: null,
        nivel: 'completa',
        agora: AGORA,
        expiraEm: depois(600),
      });
    }
    const token = novoToken();

    expect(
      await contas.criarTokenDeRedefinicao({
        email: 'ninguem@x.com',
        hashToken: hex('x'),
        agora: AGORA,
        expiraEm: depois(30),
      }),
    ).toBe(false);
    expect(
      await contas.criarTokenDeRedefinicao({
        email,
        hashToken: hex(token),
        agora: AGORA,
        expiraEm: depois(30),
      }),
    ).toBe(true);
    const guardados = await consultarComoAdmin(
      'SELECT * FROM tokens_redefinicao_senha WHERE usuario_id = $1',
      [usuarioId],
    );
    expect(JSON.stringify(guardados)).not.toContain(token);

    const novoHash = HASH.replace('aGFzaA', 'bm92bw');
    expect(await contas.redefinirSenha(hex(token), novoHash, depois(31))).toBe(false);
    expect(await contas.redefinirSenha(hex(token), novoHash, depois(10))).toBe(true);
    expect(await contas.redefinirSenha(hex(token), novoHash, depois(11))).toBe(false);
    expect(await contas.buscarCredenciais(email)).toMatchObject({ hashSenha: novoHash });
    expect(await sessoes.buscar(sessaoA)).toBeNull();
    expect(await sessoes.buscar(sessaoB)).toBeNull();
  });
});

describe('tentativas de login', () => {
  it('conta, esquece depois da janela e limpa', async () => {
    const registro = criarRegistroDeTentativas(banco);
    const alvo = hex(`email:${sufixoUnico()}`);

    expect(await registro.registrarFalha('painel', alvo, AGORA, depois(-1440))).toBe(1);
    expect(await registro.registrarFalha('painel', alvo, depois(1), depois(-1439))).toBe(2);
    expect(await registro.registrarFalha('admin', alvo, depois(1), depois(-1439))).toBe(1);
    expect(await registro.consultar('painel', [alvo, hex('outro')])).toEqual([
      { alvo, falhas: 2, ultimaFalhaEm: depois(1) },
    ]);
    expect(await registro.registrarFalha('painel', alvo, depois(3000), depois(3000 - 1440))).toBe(1);

    await registro.limpar('painel', alvo);
    expect(await registro.consultar('painel', [alvo])).toEqual([]);
  });
});

describe('administradores', () => {
  async function novoAdmin(trocaDeSenhaObrigatoria: boolean, ativo = true) {
    const email = `ops-${sufixoUnico()}@webesfera.com.br`;
    const [linha] = await consultarComoAdmin<{ id: string }>(
      `INSERT INTO administradores (nome, email, hash_senha, papel, troca_de_senha_obrigatoria, segredo_totp_cifrado, ativo)
       VALUES ('Ops', $1, $2, 'suporte', $3, $4, $5) RETURNING id`,
      [email, HASH, trocaDeSenhaObrigatoria, trocaDeSenhaObrigatoria ? null : 'v1.cifrado', ativo],
    );
    return { email, id: linha?.id ?? '' };
  }

  it('cadastro do segundo fator: só com troca de senha pendente; ativa o segredo e grava os códigos', async () => {
    const admins = criarRepositorioDeAdmins(banco);
    const { email, id } = await novoAdmin(true);

    expect(await admins.buscar(email)).toEqual({
      administradorId: id,
      hashSenha: HASH,
      trocaDeSenhaObrigatoria: true,
      segundoFatorCadastrado: false,
    });
    expect(await admins.iniciarCadastroDoSegundoFator(id, 'v1.pendente')).toBe(true);
    const conclusao = {
      administradorId: id,
      passo: 100,
      hashSenha: HASH,
      hashesDeRecuperacao: [hex('A'), hex('B')],
      agora: AGORA,
    };
    expect(await admins.concluirCadastroDoSegundoFator(conclusao)).toBe(true);
    expect(await admins.concluirCadastroDoSegundoFator(conclusao)).toBe(false);
    expect(await admins.buscarSegundoFator(id)).toEqual({
      segredoCifrado: 'v1.pendente',
      segredoPendenteCifrado: null,
      ultimoPasso: 100,
    });
    expect(await admins.iniciarCadastroDoSegundoFator(id, 'v1.outro')).toBe(false);
  });

  it('o mesmo passo TOTP e o mesmo código de recuperação não valem duas vezes', async () => {
    const admins = criarRepositorioDeAdmins(banco);
    const { id } = await novoAdmin(false);
    await consultarComoAdmin(
      'INSERT INTO codigos_recuperacao_admin (administrador_id, hash_codigo) VALUES ($1, $2)',
      [id, hex('RECUPERA')],
    );

    expect(await admins.usarPasso(id, 200)).toBe(true);
    expect(await admins.usarPasso(id, 200)).toBe(false);
    expect(await admins.usarPasso(id, 199)).toBe(false);
    expect(await admins.usarCodigoDeRecuperacao(id, hex('RECUPERA'), AGORA)).toBe(true);
    expect(await admins.usarCodigoDeRecuperacao(id, hex('RECUPERA'), AGORA)).toBe(false);
  });

  it('admin inativo não é encontrado nem abre sessão, e a sessão do admin não traz restaurante', async () => {
    const admins = criarRepositorioDeAdmins(banco);
    const inativo = await novoAdmin(false, false);
    const ativo = await novoAdmin(false);
    const base = {
      publico: 'admin',
      restauranteId: null,
      nivel: 'completa',
      agora: AGORA,
      expiraEm: depois(30),
    } as const;

    expect(await admins.buscar(inativo.email)).toBeNull();
    expect(await sessoes.criar({ ...base, hashId: hex(`i${sufixoUnico()}`), titularId: inativo.id })).toBe(
      false,
    );
    const hashId = hex(`a${sufixoUnico()}`);
    expect(await sessoes.criar({ ...base, hashId, titularId: ativo.id })).toBe(true);
    expect(await sessoes.buscar(hashId)).toMatchObject({
      publico: 'admin',
      titularId: ativo.id,
      restauranteId: null,
    });
    expect(await sessoes.definirRestaurante(hashId, ativo.id)).toBe(false);
  });
});

describe('restaurantes', () => {
  it('slug ocupado por outro restaurante, inclusive no histórico, passa para o próximo candidato', async () => {
    const dona = await novoUsuario();
    const base = `brasa-${sufixoUnico()}`;
    const primeiro = await novoRestaurante(dona, [base]);
    await consultarComoAdmin('INSERT INTO historico_slugs (restaurante_id, slug) VALUES ($1, $2)', [
      primeiro?.restauranteId,
      `${base}-2`,
    ]);

    const segundo = await novoRestaurante(dona, [base, `${base}-2`, `${base}-3`]);
    expect(segundo?.slug).toBe(`${base}-3`);
    expect(await novoRestaurante(dona, [base, `${base}-2`])).toBeNull();

    expect(await restaurantes.buscar(segundo?.restauranteId ?? '')).toMatchObject({
      nome: 'Brasa',
      slug: `${base}-3`,
      situacao: 'teste',
      testeTerminaEm: depois(10 * 24 * 60),
    });
    const [personalizacao] = await consultarComoAdmin<{ cor_marca: string; versao: number }>(
      'SELECT cor_marca, versao FROM personalizacoes WHERE restaurante_id = $1',
      [segundo?.restauranteId],
    );
    expect(personalizacao).toEqual({ cor_marca: '#B4441F', versao: 1 });
  });
});
