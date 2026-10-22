import { randomBytes } from 'node:crypto';
import { CODIGOS } from '@cardapio/aplicacao';
import { generate } from 'otplib';
import { describe, expect, it } from 'vitest';
import { criarCifraAesGcm, lerChaveDeCifra } from './cifra-aes-gcm.ts';
import { geradorDeCodigosDeRecuperacao } from './codigos-de-recuperacao.ts';
import { criarCofreArgon2 } from './cofre-argon2.ts';
import { criarEnviadorDeEmailNoConsole } from './email.ts';
import { geradorDeSegredos } from './segredos-cripto.ts';
import { carregarSenhasVazadas } from './senhas-vazadas.ts';
import { autenticadorTotp } from './totp-otplib.ts';

describe('cofre Argon2id', () => {
  const cofre = criarCofreArgon2();

  it('usa Argon2id com os parâmetros da OWASP (19 MiB, 2 passadas, 1 via)', async () => {
    const hash = await cofre.resumir('cavalo-bateria-grampo');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await cofre.conferir(hash, 'cavalo-bateria-grampo')).toBe(true);
    expect(await cofre.conferir(hash, 'cavalo-bateria-grampa')).toBe(false);
  });

  it('sem hash (e-mail inexistente), faz o mesmo trabalho e devolve falso', async () => {
    const hash = await cofre.resumir('cavalo-bateria-grampo');
    const medir = async (alvo: string | null) => {
      const tempos: number[] = [];
      for (let vez = 0; vez < 3; vez += 1) {
        const inicio = performance.now();
        await cofre.conferir(alvo, 'cavalo-bateria-grampo');
        tempos.push(performance.now() - inicio);
      }
      return Math.min(...tempos);
    };
    await medir(null);
    const [semUsuario, comUsuario] = [await medir(null), await medir(hash)];

    expect(await cofre.conferir(null, 'senha-da-simulacao-de-tempo-constante')).toBe(false);
    expect(semUsuario / comUsuario).toBeGreaterThan(1 / 3);
    expect(semUsuario / comUsuario).toBeLessThan(3);
  });
});

describe('segredos', () => {
  it('token de 256 bits em base64url, sem repetição', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => geradorDeSegredos.token()));
    expect(tokens.size).toBe(100);
    for (const token of tokens) {
      expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    }
  });

  it('resumo é o SHA-256 em hexadecimal', () => {
    expect(geradorDeSegredos.resumo('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('cifra AES-256-GCM', () => {
  const chave = randomBytes(32);
  const cifra = criarCifraAesGcm(chave);

  it('cifra e decifra, com IV novo a cada vez e sem o texto puro no resultado', () => {
    const [a, b] = [cifra.cifrar('JBSWY3DPEHPK3PXPJBSWY3DP'), cifra.cifrar('JBSWY3DPEHPK3PXPJBSWY3DP')];
    expect(a).not.toBe(b);
    expect(a).not.toContain('JBSWY3DP');
    expect(a.startsWith('v1.')).toBe(true);
    expect(cifra.decifrar(a)).toBe('JBSWY3DPEHPK3PXPJBSWY3DP');
  });

  it.each([
    ['alterado', (guardado: string) => `${guardado.slice(0, -2)}AA`],
    ['outra versão', (guardado: string) => guardado.replace(/^v1/, 'v9')],
    ['outra chave', (guardado: string) => criarCifraAesGcm(randomBytes(32)).cifrar(guardado)],
  ])('recusa segredo %s com erro tipado', (_caso, estragar) => {
    expect(() => cifra.decifrar(estragar(cifra.cifrar('segredo')))).toThrow(
      expect.objectContaining({ codigo: CODIGOS.SEGREDO_DECIFRAR_FALHOU }),
    );
  });

  it('exige chave de 32 bytes', () => {
    expect(() => lerChaveDeCifra(randomBytes(16).toString('base64'))).toThrow(
      expect.objectContaining({ codigo: CODIGOS.SEGREDO_CHAVE_INVALIDA }),
    );
    expect(lerChaveDeCifra(chave.toString('base64'))).toEqual(chave);
  });
});

describe('TOTP (otplib)', () => {
  const agora = new Date('2026-10-22T20:00:10Z');
  const epoch = Math.floor(agora.getTime() / 1000);

  it('gera segredo de 160 bits em base32 e endereço otpauth', () => {
    const segredo = autenticadorTotp.gerarSegredo();
    expect(segredo).toMatch(/^[A-Z2-7]{32}$/);
    expect(autenticadorTotp.enderecoDeCadastro(segredo, 'Admin')).toMatch(
      new RegExp(`^otpauth://totp/WebEsfera:Admin\\?secret=${segredo}&issuer=WebEsfera`),
    );
  });

  it('devolve o passo do código, aceita um passo de tolerância e recusa fora dela', async () => {
    const segredo = autenticadorTotp.gerarSegredo();
    const passo = Math.floor(epoch / 30);
    const codigoDe = (deslocamento: number) =>
      generate({ secret: segredo, epoch: epoch + deslocamento * 30 });

    expect(await autenticadorTotp.passoDoCodigo(segredo, await codigoDe(0), agora)).toBe(passo);
    expect(await autenticadorTotp.passoDoCodigo(segredo, await codigoDe(-1), agora)).toBe(passo - 1);
    expect(await autenticadorTotp.passoDoCodigo(segredo, await codigoDe(1), agora)).toBe(passo + 1);
    expect(await autenticadorTotp.passoDoCodigo(segredo, await codigoDe(-3), agora)).toBeNull();
  });
});

describe('códigos de recuperação', () => {
  it('gera códigos legíveis, sem caracteres ambíguos, e normaliza a digitação', () => {
    const codigos = geradorDeCodigosDeRecuperacao.gerar(10);
    expect(new Set(codigos).size).toBe(10);
    for (const codigo of codigos) {
      expect(codigo).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
    }
    expect(geradorDeCodigosDeRecuperacao.normalizar(' abcde-fghjk ')).toBe('ABCDEFGHJK');
  });
});

describe('senhas vazadas (lista local, sem serviço externo)', () => {
  const lista = carregarSenhasVazadas();

  it.each(['1234567890', 'Password123', 'QWERTYUIOP'])('contém %s, sem diferenciar maiúsculas', (senha) => {
    expect(lista.contem(senha)).toBe(true);
  });

  it('não contém uma senha aleatória', () => {
    expect(lista.contem(geradorDeSegredos.token())).toBe(false);
  });
});

describe('e-mail no console', () => {
  it('escreve destinatário, assunto e texto', async () => {
    const escritos: string[] = [];
    await criarEnviadorDeEmailNoConsole((texto) => escritos.push(texto)).enviar({
      para: 'ana@brasa.com.br',
      assunto: 'Redefinir a senha',
      texto: 'link',
    });
    expect(escritos.join('')).toContain('Para: ana@brasa.com.br\nAssunto: Redefinir a senha\n\nlink');
  });
});
