import { Icone } from '@cardapio/ui';
import { Link } from 'react-router';
import { useCaminho, useMesaPronta } from '../dados/contexto.ts';
import estilos from './Cardapio.module.css';

export function Cabecalho() {
  const { mesa, cardapio } = useMesaPronta();
  const caminho = useCaminho();
  const logo = cardapio.personalizacao?.logoUrl ?? null;
  return (
    <header className={estilos.cabecalho}>
      <div className={estilos.identidade}>
        {logo !== null && <img className={estilos.logo} src={logo} alt="" width={40} height={40} />}
        <div>
          <p className={estilos.nomeDoRestaurante}>{cardapio.restaurante.nome}</p>
          <p className={estilos.mesa}>Mesa {mesa.numero}</p>
        </div>
      </div>
      <Link className={estilos.buscar} to={caminho('/busca')}>
        <Icone nome="buscar" tamanho={16} />
        Buscar prato ou ingrediente
      </Link>
    </header>
  );
}
