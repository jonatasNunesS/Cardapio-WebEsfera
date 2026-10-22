import type { RegistroDeTentativas } from '@cardapio/aplicacao';
import { sql } from 'drizzle-orm';
import type { AcessoAoBanco } from '../banco.ts';

interface LinhaDeTentativas extends Record<string, unknown> {
  readonly alvo: string;
  readonly falhas: number;
  readonly ultima_falha_em: string;
}

export function criarRegistroDeTentativas(banco: AcessoAoBanco): RegistroDeTentativas {
  return {
    consultar: (publico, alvos) =>
      banco.semRestaurante('Entrar', async (transacao) => {
        const resultado = await transacao.execute<LinhaDeTentativas>(
          sql`SELECT * FROM app.consultar_tentativas_login(${publico}, ${sql.param([...alvos])}::text[])`,
        );
        return resultado.rows.map((linha) => ({
          alvo: linha.alvo,
          falhas: linha.falhas,
          ultimaFalhaEm: new Date(linha.ultima_falha_em),
        }));
      }),
    registrarFalha: (publico, alvo, agora, esquecerAntesDe) =>
      banco.semRestaurante('Entrar', async (transacao) => {
        const resultado = await transacao.execute<{ falhas: number }>(
          sql`SELECT app.registrar_falha_login(${publico}, ${alvo}, ${agora}, ${esquecerAntesDe}) AS falhas`,
        );
        return resultado.rows[0]?.falhas ?? 0;
      }),
    limpar: (publico, alvo) =>
      banco.semRestaurante('Entrar', async (transacao) => {
        await transacao.execute(sql`SELECT app.limpar_tentativas_login(${publico}, ${alvo})`);
      }),
  };
}
