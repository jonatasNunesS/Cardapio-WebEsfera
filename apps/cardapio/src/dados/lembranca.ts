export interface MesaLembrada {
  readonly slug: string;
  readonly numero: number;
  readonly expiraEm: string;
}

export interface Lembranca {
  lerMesa(slug: string, numero: number): MesaLembrada | undefined;
  guardarMesa(mesa: MesaLembrada): void;
  esquecerMesa(slug: string, numero: number): void;
  aberturaVista(mesa: MesaLembrada): boolean;
  marcarAberturaVista(mesa: MesaLembrada): void;
}

const chaveDaMesa = (slug: string, numero: number) => `mesa:${slug}:${String(numero)}`;
const chaveDaAbertura = (mesa: MesaLembrada) =>
  `abertura:${mesa.slug}:${String(mesa.numero)}:${mesa.expiraEm}`;

function eMesaLembrada(valor: unknown): valor is MesaLembrada {
  const mesa = valor as Partial<MesaLembrada> | null;
  return (
    typeof mesa?.slug === 'string' && typeof mesa.numero === 'number' && typeof mesa.expiraEm === 'string'
  );
}

function lerJson(armazenamento: Storage, chave: string): unknown {
  const texto = armazenamento.getItem(chave);
  return texto === null ? undefined : (JSON.parse(texto) as unknown);
}

export function criarLembranca(obterArmazenamento: () => Storage | undefined): Lembranca {
  const usar = <T>(acao: (armazenamento: Storage) => T, padrao: T): T => {
    const armazenamento = obterArmazenamento();
    return armazenamento === undefined ? padrao : acao(armazenamento);
  };
  return {
    lerMesa: (slug, numero) =>
      usar((armazenamento) => {
        const valor = lerJson(armazenamento, chaveDaMesa(slug, numero));
        return eMesaLembrada(valor) ? valor : undefined;
      }, undefined),
    guardarMesa: (mesa) => {
      usar((armazenamento) => {
        armazenamento.setItem(chaveDaMesa(mesa.slug, mesa.numero), JSON.stringify(mesa));
      }, undefined);
    },
    esquecerMesa: (slug, numero) => {
      usar((armazenamento) => {
        armazenamento.removeItem(chaveDaMesa(slug, numero));
      }, undefined);
    },
    aberturaVista: (mesa) =>
      usar((armazenamento) => armazenamento.getItem(chaveDaAbertura(mesa)) !== null, false),
    marcarAberturaVista: (mesa) => {
      usar((armazenamento) => {
        armazenamento.setItem(chaveDaAbertura(mesa), '1');
      }, undefined);
    },
  };
}
