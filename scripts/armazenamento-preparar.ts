export interface OpcoesDoArmazenamentoLocal {
  readonly urlAdmin: string;
  readonly tokenAdmin: string;
  readonly chaveDeAcesso: string;
  readonly bucketOriginais: string;
  readonly bucketPublico: string;
  readonly origensDoPainel: readonly string[];
}

interface InfoDoBucket {
  readonly id: string;
}

async function chamar<T>(opcoes: OpcoesDoArmazenamentoLocal, rota: string, corpo?: unknown): Promise<T> {
  const resposta = await fetch(new URL(`/v2/${rota}`, opcoes.urlAdmin), {
    method: corpo === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${opcoes.tokenAdmin}`, 'content-type': 'application/json' },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  if (!resposta.ok) {
    throw new Error(`Garage ${rota} respondeu ${String(resposta.status)}: ${await resposta.text()}`);
  }
  return (await resposta.json()) as T;
}

async function bucketPorNome(opcoes: OpcoesDoArmazenamentoLocal, nome: string): Promise<InfoDoBucket> {
  const resposta = await fetch(new URL(`/v2/GetBucketInfo?globalAlias=${nome}`, opcoes.urlAdmin), {
    headers: { authorization: `Bearer ${opcoes.tokenAdmin}` },
  });
  if (resposta.ok) {
    return (await resposta.json()) as InfoDoBucket;
  }
  return chamar<InfoDoBucket>(opcoes, 'CreateBucket', { globalAlias: nome });
}

async function permitirChave(opcoes: OpcoesDoArmazenamentoLocal, bucketId: string): Promise<void> {
  await chamar(opcoes, 'AllowBucketKey', {
    bucketId,
    accessKeyId: opcoes.chaveDeAcesso,
    permissions: { read: true, write: true, owner: false },
  });
}

export async function prepararArmazenamentoLocal(opcoes: OpcoesDoArmazenamentoLocal): Promise<void> {
  const originais = await bucketPorNome(opcoes, opcoes.bucketOriginais);
  const publico = await bucketPorNome(opcoes, opcoes.bucketPublico);
  await permitirChave(opcoes, originais.id);
  await permitirChave(opcoes, publico.id);
  await chamar(opcoes, `UpdateBucket?id=${originais.id}`, {
    corsRules: [
      {
        AllowedOrigin: [...opcoes.origensDoPainel],
        AllowedMethod: ['PUT'],
        AllowedHeader: ['content-type'],
        MaxAgeSeconds: 600,
      },
    ],
  });
  await chamar(opcoes, `UpdateBucket?id=${publico.id}`, {
    websiteAccess: { enabled: true, indexDocument: 'index.html' },
    corsRules: [{ AllowedOrigin: ['*'], AllowedMethod: ['GET', 'HEAD'] }],
  });
}

export function opcoesDoAmbiente(ambiente: NodeJS.ProcessEnv): OpcoesDoArmazenamentoLocal {
  return {
    urlAdmin: ambiente.URL_ADMIN_ARMAZENAMENTO_LOCAL ?? 'http://127.0.0.1:3903',
    tokenAdmin: ambiente.TOKEN_ADMIN_ARMAZENAMENTO_LOCAL ?? 'admin_local',
    chaveDeAcesso: ambiente.CHAVE_ARMAZENAMENTO ?? 'GKabababababababababababab',
    bucketOriginais: ambiente.BUCKET_ORIGINAIS ?? 'midia-originais',
    bucketPublico: ambiente.BUCKET_PUBLICO ?? 'midia-publica',
    origensDoPainel: (
      ambiente.ORIGENS_DO_UPLOAD ?? 'http://painel.localhost:5173,http://painel.localhost:4173'
    )
      .split(',')
      .map((origem) => origem.trim())
      .filter((origem) => origem !== ''),
  };
}

if (import.meta.main) {
  const opcoes = opcoesDoAmbiente(process.env);
  await prepararArmazenamentoLocal(opcoes);
  console.log(`Buckets prontos: ${opcoes.bucketOriginais} (privado) e ${opcoes.bucketPublico} (público).`);
}
