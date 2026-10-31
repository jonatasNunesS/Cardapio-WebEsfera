import { Aviso } from '@cardapio/ui';
import estilos from './Plataforma.module.css';

export function LinkDoConvite({ link }: { readonly link: string | null }) {
  if (link === null) {
    return null;
  }
  return (
    <Aviso tipo="sucesso" titulo="Convite gerado">
      <p>Envie este link ao dono. Ele vale por 72 horas, só uma vez, e não aparece de novo.</p>
      <p className={estilos.link}>{link}</p>
    </Aviso>
  );
}
