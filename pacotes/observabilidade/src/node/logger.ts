import { pino, type DestinationStream, type LevelWithSilent, type Logger } from 'pino';
import { contextoAtual } from '../contexto.ts';
import { limparValor, mascararTexto, OCULTO } from '../limpeza.ts';

const CAMPOS_REDIGIDOS = [
  'cookie',
  'authorization',
  'senha',
  'senhaNova',
  'token',
  'email',
  'documento',
  'c',
  'segredo',
  'codigoDeVerificacao',
  'codigosDeRecuperacao',
  'uriOtpauth',
];

const CAMINHOS_REDIGIDOS = [
  ...CAMPOS_REDIGIDOS.flatMap((campo) => [campo, `*.${campo}`, `*.*.${campo}`]),
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
];

export interface OpcoesLogger {
  readonly app: string;
  readonly nivel?: LevelWithSilent;
  readonly destino?: DestinationStream;
}

function camposDoContexto(_objeto: object, _nivel: number, logger: Logger): Record<string, string> {
  const contexto = contextoAtual();
  if (contexto === undefined) {
    return {};
  }
  const jaVinculados = Object.keys(logger.bindings());
  return Object.fromEntries(
    Object.entries({
      id_rastreio: contexto.idRastreio,
      restauranteId: contexto.restauranteId,
      rota: contexto.rota,
      tarefa: contexto.tarefa,
      casoDeUso: contexto.casoDeUso,
    }).filter((par): par is [string, string] => par[1] !== undefined && !jaVinculados.includes(par[0])),
  );
}

export function criarLogger(opcoes: OpcoesLogger): Logger {
  return pino(
    {
      level: opcoes.nivel ?? 'info',
      base: { app: opcoes.app },
      redact: { paths: CAMINHOS_REDIGIDOS, censor: OCULTO },
      mixin: camposDoContexto,
      formatters: {
        log: (objeto) => limparValor(objeto) as Record<string, unknown>,
      },
      hooks: {
        logMethod(argumentos, metodo) {
          const limpos = argumentos.map((argumento) =>
            typeof argumento === 'string' ? mascararTexto(argumento) : argumento,
          );
          metodo.apply(this, limpos as Parameters<typeof metodo>);
        },
      },
    },
    opcoes.destino ?? pino.destination({ sync: false }),
  );
}

let loggerPadrao: Logger | undefined;

export function definirLoggerPadrao(logger: Logger): void {
  loggerPadrao = logger;
}

export function obterLoggerPadrao(): Logger {
  loggerPadrao ??= criarLogger({ app: 'cardapio' });
  return loggerPadrao;
}
