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

export interface MomentoLocal {
  readonly diaSemana: DiaDaSemana;
  readonly minutos: number;
}

export interface SituacaoDoHorario {
  readonly aberto: boolean;
  readonly proximaAbertura: {
    readonly diaSemana: DiaDaSemana;
    readonly abre: string;
    readonly hoje: boolean;
  } | null;
}

const DIAS: Readonly<Record<string, DiaDaSemana>> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function momentoLocal(instante: Date, fusoHorario: string): MomentoLocal {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: fusoHorario,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instante);
  const valor = (tipo: string) => partes.find((parte) => parte.type === tipo)?.value ?? '';
  return {
    diaSemana: DIAS[valor('weekday')] ?? 0,
    minutos: Number(valor('hour')) * 60 + Number(valor('minute')),
  };
}

function emMinutos(hora: string): number {
  const [horas = 0, minutos = 0] = hora.split(':').map(Number);
  return horas * 60 + minutos;
}

function cobre(horario: Horario, momento: MomentoLocal): boolean {
  const [abre, fecha] = [emMinutos(horario.abre), emMinutos(horario.fecha)];
  if (!viraODia(horario)) {
    return horario.diaSemana === momento.diaSemana && momento.minutos >= abre && momento.minutos < fecha;
  }
  const ontem = ((momento.diaSemana + 6) % 7) as DiaDaSemana;
  return (
    (horario.diaSemana === momento.diaSemana && momento.minutos >= abre) ||
    (horario.diaSemana === ontem && momento.minutos < fecha)
  );
}

function proximaAbertura(
  horarios: readonly Horario[],
  momento: MomentoLocal,
): SituacaoDoHorario['proximaAbertura'] {
  for (let distancia = 0; distancia <= 7; distancia += 1) {
    const dia = ((momento.diaSemana + distancia) % 7) as DiaDaSemana;
    const horario = horarios.find((item) => item.diaSemana === dia);
    if (horario !== undefined && (distancia > 0 || emMinutos(horario.abre) > momento.minutos)) {
      return { diaSemana: dia, abre: horario.abre, hoje: distancia === 0 };
    }
  }
  return null;
}

export function situacaoDoHorario(horarios: readonly Horario[], momento: MomentoLocal): SituacaoDoHorario {
  if (horarios.length === 0 || horarios.some((horario) => cobre(horario, momento))) {
    return { aberto: true, proximaAbertura: null };
  }
  return { aberto: false, proximaAbertura: proximaAbertura(horarios, momento) };
}
