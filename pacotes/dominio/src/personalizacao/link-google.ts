const HOSTS_DO_GOOGLE = ['google.com', 'g.page', 'goo.gl'] as const;

const URL_HTTPS = /^https:\/\/([^/?#\s]+)([/?#][^\s]*)?$/i;
const HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

function ehHostDoGoogle(host: string): boolean {
  return HOSTS_DO_GOOGLE.some((permitido) => host === permitido || host.endsWith(`.${permitido}`));
}

export function ehLinkDoGoogle(valor: string): boolean {
  const autoridade = URL_HTTPS.exec(valor.trim())?.[1];
  if (autoridade === undefined || autoridade.includes('@')) {
    return false;
  }
  const host = autoridade.replace(/:443$/, '').toLowerCase();
  return HOST.test(host) && ehHostDoGoogle(host);
}
