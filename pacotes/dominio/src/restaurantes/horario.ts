import { CODIGOS } from '../compartilhado/codigos.ts';
import { criarErroDeNegocio, type ErroDeNegocio } from '../compartilhado/erro-de-negocio.ts';
import { Resultado } from '../compartilhado/resultado.ts';

export type DiaDaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface Horario {
  readonly diaSemana: DiaDaSemana;
  readonly abre: string;
  readonly fecha: string;
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function invalido(mensagem: string, detalhes: Readonly<Record<string, unknown>>): ErroDeNegocio {
  return criarErroDeNegocio(CODIGOS.HORARIO_DEFINIR_INVALIDO, mensagem, detalhes);
}

function problemaDoHorario(horario: Horario): ErroDeNegocio | undefined {
  if (!Number.isInteger(horario.diaSemana) || horario.diaSemana < 0 || horario.diaSemana > 6) {
    return invalido('Dia da semana inválido.', { diaSemana: horario.diaSemana });
  }
  if (!HORA.test(horario.abre) || !HORA.test(horario.fecha)) {
    return invalido('Use o formato HH:MM.', { diaSemana: horario.diaSemana });
  }
  if (horario.abre === horario.fecha) {
    return invalido('A abertura e o fechamento não podem ser iguais.', { diaSemana: horario.diaSemana });
  }
  return undefined;
}

export function validarHorarios(horarios: readonly Horario[]): Resultado<readonly Horario[], ErroDeNegocio> {
  const vistos = new Set<number>();
  for (const horario of horarios) {
    const problema = problemaDoHorario(horario);
    if (problema !== undefined) {
      return Resultado.falha(problema);
    }
    if (vistos.has(horario.diaSemana)) {
      return Resultado.falha(invalido('Cada dia aparece uma vez só.', { diaSemana: horario.diaSemana }));
    }
    vistos.add(horario.diaSemana);
  }
  return Resultado.ok([...horarios].sort((a, b) => a.diaSemana - b.diaSemana));
}

export function viraODia(horario: Horario): boolean {
  return horario.fecha < horario.abre;
}
