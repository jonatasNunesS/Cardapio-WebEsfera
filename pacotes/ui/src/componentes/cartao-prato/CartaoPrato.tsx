import { juntarClasses } from '../../utilitarios/classes.ts';
import { formatarReais } from '../../utilitarios/dinheiro.ts';
import { VideoPrato, type PropriedadesVideoPrato } from '../video-prato/VideoPrato.tsx';
import estilos from './CartaoPrato.module.css';

export interface ImagemPrato {
  readonly src: string;
  readonly alt: string;
  readonly avif?: string | undefined;
  readonly webp?: string | undefined;
  readonly largura?: number | undefined;
  readonly altura?: number | undefined;
}

export interface PropriedadesCartaoPrato {
  readonly nome: string;
  readonly precoEmCentavos: number;
  readonly href: string;
  readonly descricao?: string | undefined;
  readonly imagem?: ImagemPrato | undefined;
  readonly video?: PropriedadesVideoPrato | undefined;
  readonly destaque?: boolean | undefined;
  readonly rotuloDestaque?: string | undefined;
  readonly esgotado?: boolean | undefined;
  readonly motivoEsgotado?: string | undefined;
  readonly nivelTitulo?: 2 | 3 | undefined;
}

function Midia({ imagem, video }: Pick<PropriedadesCartaoPrato, 'imagem' | 'video'>) {
  if (video !== undefined) {
    return <VideoPrato {...video} />;
  }
  if (imagem !== undefined) {
    return (
      <picture>
        {imagem.avif !== undefined && <source srcSet={imagem.avif} type="image/avif" />}
        {imagem.webp !== undefined && <source srcSet={imagem.webp} type="image/webp" />}
        <img
          className={estilos.imagem}
          src={imagem.src}
          alt={imagem.alt}
          width={imagem.largura}
          height={imagem.altura}
          loading="lazy"
          decoding="async"
        />
      </picture>
    );
  }
  return null;
}

export function CartaoPrato({
  nome,
  precoEmCentavos,
  href,
  descricao,
  imagem,
  video,
  destaque = false,
  rotuloDestaque = 'Destaque da casa',
  esgotado = false,
  motivoEsgotado = 'Esgotado hoje',
  nivelTitulo = 3,
}: PropriedadesCartaoPrato) {
  const Titulo = nivelTitulo === 2 ? 'h2' : 'h3';
  const preco = formatarReais(precoEmCentavos);
  return (
    <article
      className={juntarClasses(estilos.cartao, destaque && estilos.destaque, esgotado && estilos.esgotado)}
    >
      <div className={estilos.midia}>
        <Midia imagem={imagem} {...(destaque && video !== undefined ? { video } : {})} />
      </div>
      <div className={estilos.texto}>
        {destaque && <p className={estilos.rotuloDestaque}>{rotuloDestaque}</p>}
        <Titulo className={estilos.nome}>
          {esgotado ? (
            nome
          ) : (
            <a className={estilos.link} href={href}>
              {nome}
            </a>
          )}
        </Titulo>
        {descricao !== undefined && <p className={estilos.descricao}>{descricao}</p>}
        {esgotado ? (
          <p className={estilos.motivo}>{motivoEsgotado}</p>
        ) : (
          <p className={estilos.preco}>{preco}</p>
        )}
      </div>
    </article>
  );
}
