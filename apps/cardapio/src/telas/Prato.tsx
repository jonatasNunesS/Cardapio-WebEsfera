import { formatarReais, Icone, VideoPrato } from '@cardapio/ui';
import { Link, useParams } from 'react-router';
import { useCaminho, useMesaPronta } from '../dados/contexto.ts';
import { imagemDo, videoDo } from '../dados/pratos.ts';
import estilos from './Prato.module.css';

function Voltar() {
  const caminho = useCaminho();
  return (
    <Link className={estilos.voltar} to={caminho()}>
      <Icone nome="voltar" tamanho={16} />
      Voltar ao cardápio
    </Link>
  );
}

export function Prato() {
  const { cardapio } = useMesaPronta();
  const { pratoId } = useParams();
  const prato = cardapio.secoes.flatMap((secao) => secao.pratos).find((item) => item.id === pratoId);
  if (prato === undefined) {
    return (
      <main className={estilos.prato}>
        <Voltar />
        <h1 className={estilos.nome}>Prato não encontrado</h1>
        <p className={estilos.descricao}>Ele pode ter saído do cardápio.</p>
      </main>
    );
  }
  const video = videoDo(prato.nome, prato.midia);
  const imagem = imagemDo(prato.nome, prato.midia);
  return (
    <main className={estilos.prato}>
      <Voltar />
      <div className={estilos.midia}>
        {video !== undefined ? (
          <VideoPrato {...video} />
        ) : (
          imagem !== undefined && (
            <picture>
              {imagem.avif !== undefined && <source srcSet={imagem.avif} type="image/avif" />}
              {imagem.webp !== undefined && <source srcSet={imagem.webp} type="image/webp" />}
              <img
                className={estilos.imagem}
                src={imagem.src}
                alt={imagem.alt}
                width={imagem.largura}
                height={imagem.altura}
              />
            </picture>
          )
        )}
      </div>
      {prato.destaque && <p className={estilos.rotulo}>Destaque da casa</p>}
      <h1 className={estilos.nome}>{prato.nome}</h1>
      {prato.disponivel ? (
        <p className={estilos.preco}>{formatarReais(prato.precoCentavos)}</p>
      ) : (
        <p className={estilos.esgotado}>Esgotado hoje</p>
      )}
      {prato.descricao !== '' && <p className={estilos.descricao}>{prato.descricao}</p>}
    </main>
  );
}
