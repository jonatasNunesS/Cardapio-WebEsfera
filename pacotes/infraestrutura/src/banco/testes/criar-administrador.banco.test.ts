import { describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { criarAdministradorPorUrl } from '../admin/criar-administrador.ts';
import { consultarComoAdmin, sufixoUnico } from './apoio.ts';

const HASH = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA';

describe('criar administrador (ferramenta de operação)', () => {
  it('cria com troca de senha obrigatória e sem segundo fator, e não duplica', async () => {
    const email = `ops-${sufixoUnico()}@webesfera.com.br`;
    const novo = { nome: 'Ops', email, papel: 'dono_plataforma', hashSenha: HASH } as const;
    const url = inject('bancoDeTeste').urlMigracao;

    expect(await criarAdministradorPorUrl(url, novo)).toBe('criado');
    expect(await criarAdministradorPorUrl(url, novo)).toBe('ja_existe');
    const [linha] = await consultarComoAdmin<{ troca: boolean; segredo: string | null }>(
      'SELECT troca_de_senha_obrigatoria AS troca, segredo_totp_cifrado AS segredo FROM administradores WHERE email = $1',
      [email],
    );
    expect(linha).toEqual({ troca: true, segredo: null });
  });

  it('o usuário da API não consegue criar administrador', async () => {
    const url = inject('bancoDeTeste').urlApi;
    await expect(
      criarAdministradorPorUrl(url, {
        nome: 'X',
        email: `x-${sufixoUnico()}@x.com`,
        papel: 'suporte',
        hashSenha: HASH,
      }),
    ).rejects.toThrow();
  });
});
