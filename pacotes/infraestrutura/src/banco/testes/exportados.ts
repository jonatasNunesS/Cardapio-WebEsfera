import pg from 'pg';

export async function consultarComUrl<T extends pg.QueryResultRow>(
  url: string,
  texto: string,
  valores: unknown[] = [],
): Promise<T[]> {
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  try {
    return (await cliente.query<T>(texto, valores)).rows;
  } finally {
    await cliente.end();
  }
}
