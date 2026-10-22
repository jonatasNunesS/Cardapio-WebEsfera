export interface EventoCapturado {
  readonly event_id?: string;
  readonly level?: string;
  readonly tags?: Record<string, string>;
  readonly contexts?: Record<string, Record<string, unknown> | undefined>;
  readonly fingerprint?: string[];
  readonly exception?: { values?: { type?: string; value?: string }[] };
  readonly request?: Record<string, unknown>;
}

type ItemDoEnvelope = readonly [{ readonly type?: string }, unknown];
type Envelope = readonly [unknown, readonly ItemDoEnvelope[]];

export interface CheckInCapturado {
  readonly monitor_slug?: string;
  readonly status?: string;
  readonly monitor_config?: Record<string, unknown>;
}

export interface TransporteFalso {
  readonly eventos: EventoCapturado[];
  readonly checkIns: CheckInCapturado[];
  readonly fabrica: () => {
    send: (envelope: Envelope) => Promise<Record<string, never>>;
    flush: () => Promise<boolean>;
  };
}

export function criarTransporteFalso(): TransporteFalso {
  const eventos: EventoCapturado[] = [];
  const checkIns: CheckInCapturado[] = [];
  return {
    eventos,
    checkIns,
    fabrica: () => ({
      send: (envelope) => {
        for (const [cabecalho, carga] of envelope[1]) {
          if (cabecalho.type === 'event') {
            eventos.push(carga as EventoCapturado);
          }
          if (cabecalho.type === 'check_in') {
            checkIns.push(carga as CheckInCapturado);
          }
        }
        return Promise.resolve({});
      },
      flush: () => Promise.resolve(true),
    }),
  };
}

export const DSN_DE_TESTE = 'https://chavepublica@o0.ingest.sentry.io/0';
