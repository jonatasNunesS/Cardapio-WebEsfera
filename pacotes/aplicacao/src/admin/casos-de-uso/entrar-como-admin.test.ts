import { CODIGOS, FALHAS_LIVRES } from '@cardapio/dominio';
import { describe, expect, it } from 'vitest';
import { renovarSessao } from '../../identidade/casos-de-uso/renovar-sessao.ts';
import { codigoTotpDeTeste, dependenciasDeAdmin } from '../../testes/dobles.ts';
import { confirmarSegundoFatorAdmin } from './confirmar-segundo-fator-admin.ts';
import { entrarComoAdmin } from './entrar-como-admin.ts';

const SENHA = 'senha-do-admin-forte';

function comAdmin(trocaDeSenhaObrigatoria = false) {
  const dependencias = dependenciasDeAdmin();
  const admin = dependencias.admins.cadastrar({
    email: 'ops@webesfera.com.br',
    hashSenha: `$argon2id$teste$${SENHA}`,
    trocaDeSenhaObrigatoria,
    codigos: [{ hash: 'resumo(ABCD0001)', usado: false }],
  });
  return { dependencias, admin };
}

async function entrarComSenha(dependencias: ReturnType<typeof dependenciasDeAdmin>) {
  const resultado = await entrarComoAdmin(dependencias, {
    email: 'ops@webesfera.com.br',
    senha: SENHA,
    ip: '10.0.0.1',
  });
  if (!resultado.ok) {
    throw new Error('o login com senha deveria passar');
  }
  return resultado.valor;
}

describe('EntrarComoAdmin', () => {
  it('a senha certa abre só uma sessão parcial: sem o segundo fator, não entra', async () => {
    const { dependencias } = comAdmin();
    const parcial = await entrarComSenha(dependencias);

    expect(parcial.proximoPasso).toBe('segundo_fator');
    const completa = await renovarSessao(dependencias, {
      token: parcial.token,
      publico: 'admin',
      niveis: ['completa'],
    });
    expect(completa.ok).toBe(false);
  });

  it('com troca de senha pendente, o próximo passo é o cadastro', async () => {
    const { dependencias } = comAdmin(true);
    expect((await entrarComSenha(dependencias)).proximoPasso).toBe('cadastro');
  });

  it('e-mail inexistente e senha errada: mesma resposta e mesmo trabalho', async () => {
    const { dependencias } = comAdmin();
    const inexistente = await entrarComoAdmin(dependencias, {
      email: 'x@y.com',
      senha: SENHA,
      ip: '1.1.1.1',
    });
    const errada = await entrarComoAdmin(dependencias, {
      email: 'ops@webesfera.com.br',
      senha: 'errada-errada',
      ip: '1.1.1.2',
    });
    expect(inexistente).toEqual(errada);
    expect(!errada.ok && errada.erro.codigo).toBe(CODIGOS.ADMIN_ENTRAR_CREDENCIAIS_INVALIDAS);
    expect(dependencias.cofre.conferencias).toEqual([null, expect.any(String)]);
    expect(dependencias.sinais.falhas).toEqual(['admin:senha', 'admin:senha']);
  });

  it('bloqueia o e-mail depois de N falhas', async () => {
    const { dependencias } = comAdmin();
    for (let falha = 0; falha < FALHAS_LIVRES.email; falha += 1) {
      await entrarComoAdmin(dependencias, {
        email: 'ops@webesfera.com.br',
        senha: 'errada-errada',
        ip: '1.1.1.1',
      });
    }
    const resultado = await entrarComoAdmin(dependencias, {
      email: 'ops@webesfera.com.br',
      senha: SENHA,
      ip: '2.2.2.2',
    });
    expect(!resultado.ok && resultado.erro.codigo).toBe(CODIGOS.ADMIN_ENTRAR_BLOQUEADA);
  });
});

describe('ConfirmarSegundoFatorAdmin', () => {
  async function preparar() {
    const { dependencias, admin } = comAdmin();
    const parcial = await entrarComSenha(dependencias);
    const entrada = { administradorId: admin.id, hashDaSessaoParcial: `resumo(${parcial.token})` };
    return { dependencias, parcial, entrada };
  }

  it('código TOTP certo: revoga a sessão parcial e abre a completa', async () => {
    const { dependencias, parcial, entrada } = await preparar();
    const codigo = codigoTotpDeTeste('SEGREDO', dependencias.relogio.agora());

    const resultado = await confirmarSegundoFatorAdmin(dependencias, { ...entrada, codigo });

    expect(resultado.ok).toBe(true);
    const token = resultado.ok ? resultado.valor.token : '';
    expect((await renovarSessao(dependencias, { token, publico: 'admin', niveis: ['completa'] })).ok).toBe(
      true,
    );
    expect(
      (
        await renovarSessao(dependencias, {
          token: parcial.token,
          publico: 'admin',
          niveis: ['segundo_fator'],
        })
      ).ok,
    ).toBe(false);
  });

  it('o mesmo código não vale duas vezes', async () => {
    const { dependencias, entrada } = await preparar();
    const codigo = codigoTotpDeTeste('SEGREDO', dependencias.relogio.agora());
    await confirmarSegundoFatorAdmin(dependencias, { ...entrada, codigo });

    const repetido = await confirmarSegundoFatorAdmin(dependencias, { ...entrada, codigo });
    expect(!repetido.ok && repetido.erro.codigo).toBe(CODIGOS.ADMIN_ENTRAR_CODIGO_INVALIDO);
  });

  it('código errado é recusado e conta para o bloqueio do segundo fator', async () => {
    const { dependencias, entrada } = await preparar();
    for (let falha = 0; falha < FALHAS_LIVRES.segundo_fator; falha += 1) {
      const resultado = await confirmarSegundoFatorAdmin(dependencias, { ...entrada, codigo: '000000' });
      expect(!resultado.ok && resultado.erro.codigo).toBe(CODIGOS.ADMIN_ENTRAR_CODIGO_INVALIDO);
    }
    const codigo = codigoTotpDeTeste('SEGREDO', dependencias.relogio.agora());
    const bloqueado = await confirmarSegundoFatorAdmin(dependencias, { ...entrada, codigo });
    expect(!bloqueado.ok && bloqueado.erro.codigo).toBe(CODIGOS.ADMIN_ENTRAR_BLOQUEADA);
    expect(dependencias.sinais.bloqueios).toEqual(['admin:segundo_fator:segundo_fator']);
  });

  it('código de recuperação vale uma vez só', async () => {
    const { dependencias, entrada } = await preparar();
    expect((await confirmarSegundoFatorAdmin(dependencias, { ...entrada, codigo: 'abcd-0001' })).ok).toBe(
      true,
    );
    expect((await confirmarSegundoFatorAdmin(dependencias, { ...entrada, codigo: 'ABCD-0001' })).ok).toBe(
      false,
    );
  });

  it('admin sem segredo cadastrado não passa com código de seis dígitos', async () => {
    const { dependencias, entrada } = await preparar();
    const admin = dependencias.admins.admins[0];
    if (admin) {
      admin.segredoCifrado = null;
    }
    const codigo = codigoTotpDeTeste('SEGREDO', dependencias.relogio.agora());
    expect((await confirmarSegundoFatorAdmin(dependencias, { ...entrada, codigo })).ok).toBe(false);
  });
});
