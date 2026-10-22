import { bloqueadoAte, esquecerAntesDe, type Publico, type TipoDeAlvo } from '@cardapio/dominio';
import type { GeradorDeSegredos } from './portas/gerador-de-segredos.ts';
import type { RegistroDeTentativas } from './portas/registro-de-tentativas.ts';

export interface AlvoDeLogin {
  readonly tipo: TipoDeAlvo;
  readonly alvo: string;
}

export function alvoDeLogin(segredos: GeradorDeSegredos, tipo: TipoDeAlvo, valor: string): AlvoDeLogin {
  return { tipo, alvo: segredos.resumo(`${tipo}:${valor}`) };
}

export async function bloqueioAtual(
  registro: RegistroDeTentativas,
  publico: Publico,
  alvos: readonly AlvoDeLogin[],
  agora: Date,
): Promise<Date | null> {
  const tentativas = await registro.consultar(
    publico,
    alvos.map((item) => item.alvo),
  );
  const fins = alvos.flatMap(({ tipo, alvo }) => {
    const registrada = tentativas.find((item) => item.alvo === alvo);
    const fim = registrada === undefined ? null : bloqueadoAte(tipo, registrada, agora);
    return fim === null ? [] : [fim.getTime()];
  });
  return fins.length === 0 ? null : new Date(Math.max(...fins));
}

export async function registrarFalhas(
  registro: RegistroDeTentativas,
  publico: Publico,
  alvos: readonly AlvoDeLogin[],
  agora: Date,
): Promise<void> {
  for (const { alvo } of alvos) {
    await registro.registrarFalha(publico, alvo, agora, esquecerAntesDe(agora));
  }
}
