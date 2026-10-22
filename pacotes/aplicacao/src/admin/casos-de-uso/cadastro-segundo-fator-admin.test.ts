import { CODIGOS } from '@cardapio/dominio';
import { describe, expect, it } from 'vitest';
import { codigoTotpDeTeste, dependenciasDeAdmin } from '../../testes/dobles.ts';
import { concluirCadastroSegundoFatorAdmin } from './concluir-cadastro-segundo-fator-admin.ts';
import { iniciarCadastroSegundoFatorAdmin } from './iniciar-cadastro-segundo-fator-admin.ts';

function comAdminNovo() {
  const dependencias = dependenciasDeAdmin();
  const admin = dependencias.admins.cadastrar({
    email: 'ops@webesfera.com.br',
    hashSenha: '$argon2id$teste$temporaria-123',
    trocaDeSenhaObrigatoria: true,
    segredoCifrado: null,
  });
  return { dependencias, admin };
}

describe('CadastrarSegundoFatorAdmin', () => {
  it('início: guarda o segredo cifrado como pendente e devolve a chave e o endereço otpauth', async () => {
    const { dependencias, admin } = comAdminNovo();
    const iniciado = await iniciarCadastroSegundoFatorAdmin(dependencias, admin.id);

    expect(iniciado).toEqual({
      segredo: 'SEGREDONOVO',
      endereco: 'otpauth://totp/WebEsfera Admin?secret=SEGREDONOVO',
    });
    expect(admin.segredoPendenteCifrado).toBe('cifrado:SEGREDONOVO');
    expect(admin.segredoCifrado).toBeNull();
  });

  it('início recusado pelo banco: erro inesperado', async () => {
    const { dependencias, admin } = comAdminNovo();
    admin.trocaDeSenhaObrigatoria = false;
    await expect(iniciarCadastroSegundoFatorAdmin(dependencias, admin.id)).rejects.toMatchObject({
      codigo: CODIGOS.ADMIN_SEGUNDO_FATOR_CADASTRO_RECUSADO,
    });
  });

  it('conclusão: com o primeiro código, ativa o segredo, troca a senha e entrega 10 códigos de recuperação', async () => {
    const { dependencias, admin } = comAdminNovo();
    await iniciarCadastroSegundoFatorAdmin(dependencias, admin.id);
    const codigo = codigoTotpDeTeste('SEGREDONOVO', dependencias.relogio.agora());

    const resultado = await concluirCadastroSegundoFatorAdmin(dependencias, {
      administradorId: admin.id,
      codigo,
      senhaNova: 'senha-nova-do-admin',
    });

    expect(resultado.ok && resultado.valor.codigosDeRecuperacao).toHaveLength(10);
    expect(admin).toMatchObject({
      segredoCifrado: 'cifrado:SEGREDONOVO',
      segredoPendenteCifrado: null,
      trocaDeSenhaObrigatoria: false,
      hashSenha: '$argon2id$teste$senha-nova-do-admin',
    });
    expect(admin.codigos[0]).toEqual({ hash: 'resumo(ABCD0000)', usado: false });
  });

  it('código errado não conclui', async () => {
    const { dependencias, admin } = comAdminNovo();
    await iniciarCadastroSegundoFatorAdmin(dependencias, admin.id);

    const resultado = await concluirCadastroSegundoFatorAdmin(dependencias, {
      administradorId: admin.id,
      codigo: '000000',
      senhaNova: 'senha-nova-do-admin',
    });
    expect(!resultado.ok && resultado.erro.codigo).toBe(CODIGOS.ADMIN_SEGUNDO_FATOR_CODIGO_INVALIDO);
    expect(admin.trocaDeSenhaObrigatoria).toBe(true);
  });

  it('sem início, não conclui', async () => {
    const { dependencias, admin } = comAdminNovo();
    const codigo = codigoTotpDeTeste('SEGREDONOVO', dependencias.relogio.agora());
    const resultado = await concluirCadastroSegundoFatorAdmin(dependencias, {
      administradorId: admin.id,
      codigo,
      senhaNova: 'senha-nova-do-admin',
    });
    expect(resultado.ok).toBe(false);
  });

  it('o banco recusa a conclusão (código já usado): mesma falha de código', async () => {
    const { dependencias, admin } = comAdminNovo();
    await iniciarCadastroSegundoFatorAdmin(dependencias, admin.id);
    admin.ultimoPasso = Number.MAX_SAFE_INTEGER;
    const codigo = codigoTotpDeTeste('SEGREDONOVO', dependencias.relogio.agora());

    const resultado = await concluirCadastroSegundoFatorAdmin(dependencias, {
      administradorId: admin.id,
      codigo,
      senhaNova: 'senha-nova-do-admin',
    });
    expect(!resultado.ok && resultado.erro.codigo).toBe(CODIGOS.ADMIN_SEGUNDO_FATOR_CODIGO_INVALIDO);
  });

  it('senha nova vazada é recusada', async () => {
    const { dependencias, admin } = comAdminNovo();
    await iniciarCadastroSegundoFatorAdmin(dependencias, admin.id);
    const codigo = codigoTotpDeTeste('SEGREDONOVO', dependencias.relogio.agora());
    const resultado = await concluirCadastroSegundoFatorAdmin(dependencias, {
      administradorId: admin.id,
      codigo,
      senhaNova: '1234567890',
    });
    expect(!resultado.ok && resultado.erro.codigo).toBe(CODIGOS.CONTA_SENHA_VAZADA);
  });
});
