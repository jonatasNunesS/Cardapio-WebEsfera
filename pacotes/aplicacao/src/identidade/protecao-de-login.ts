import {
  bloqueadoAte,
  esquecerAntesDe,
  FALHAS_LIVRES,
  type Publico,
  type TipoDeAlvo,
} from '@cardapio/dominio';
import type { GeradorDeSegredos } from './portas/gerador-de-segredos.ts';
import type { RegistroDeTentativas } from './portas/registro-de-tentativas.ts';
import type { EtapaDeAutenticacao, SinaisDeSeguranca } from './portas/sinais-de-seguranca.ts';

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

export interface FalhaDeAutenticacao {
  readonly publico: Publico;
  readonly etapa: EtapaDeAutenticacao;
  readonly alvos: readonly AlvoDeLogin[];
  readonly agora: Date;
}

export async function registrarFalhas(
  dependencias: { readonly tentativas: RegistroDeTentativas; readonly sinais: SinaisDeSeguranca },
  falha: FalhaDeAutenticacao,
): Promise<void> {
  dependencias.sinais.falhou(falha.publico, falha.etapa);
  for (const { tipo, alvo } of falha.alvos) {
    const falhas = await dependencias.tentativas.registrarFalha(
      falha.publico,
      alvo,
      falha.agora,
      esquecerAntesDe(falha.agora),
    );
    if (falhas === FALHAS_LIVRES[tipo]) {
      dependencias.sinais.bloqueou(falha.publico, falha.etapa, tipo);
    }
  }
}
