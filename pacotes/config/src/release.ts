export function montarRelease(app: string, versao: string, commit: string | undefined): string {
  const curto = commit === undefined || commit === '' ? 'local' : commit.slice(0, 7);
  return `${app}@${versao}+${curto}`;
}
