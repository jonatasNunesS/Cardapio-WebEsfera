import {
  ROTAS_DO_PAINEL,
  type CorpoPublicarPersonalizacao,
  type RespostaPersonalizacao,
} from '@cardapio/contratos';
import { reportarErroWeb } from '@cardapio/observabilidade/web';
import {
  aplicarTemaRestaurante,
  AreaTexto,
  Aviso,
  Botao,
  CampoTexto,
  Esqueleto,
  useEnvioDeFormulario,
  useToasts,
  type ProblemaDoFormulario,
} from '@cardapio/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api.ts';
import estilos from './Painel.module.css';

const CHAVE = ['personalizacao'] as const;

type Textos = CorpoPublicarPersonalizacao['textos'];

function paraFormulario(guardada: RespostaPersonalizacao): CorpoPublicarPersonalizacao {
  return {
    corMarca: guardada.corMarca,
    logoUrl: guardada.logoUrl,
    capaUrl: guardada.capaUrl,
    frase: guardada.frase,
    linkAvaliacaoGoogle: guardada.linkAvaliacaoGoogle,
    textos: guardada.textos,
  };
}

function SugestaoDeCor({
  falha,
  aoUsar,
}: {
  falha: ProblemaDoFormulario | null;
  aoUsar: (cor: string) => void;
}) {
  const sugestao = falha?.detalhes?.sugestao;
  if (typeof sugestao !== 'string') {
    return null;
  }
  const { contrasteTexto, contrasteFundo } = falha?.detalhes ?? {};
  const formatar = (valor: unknown) => (typeof valor === 'number' ? String(valor).replace('.', ',') : '');
  return (
    <Aviso
      tipo="aviso"
      titulo={`Sugestão: ${sugestao}`}
      acao={
        <Botao
          variante="secundario"
          onClick={() => {
            aoUsar(sugestao);
          }}
        >
          Usar este tom
        </Botao>
      }
    >
      Texto do botão {formatar(contrasteTexto)}:1 (mínimo 4,5) e destaque contra o fundo{' '}
      {formatar(contrasteFundo)}:1 (mínimo 3). O tom sugerido é o mais próximo que fica legível.
    </Aviso>
  );
}

function AmostraDaCorPublicada({ publicada }: { publicada: RespostaPersonalizacao }) {
  const amostraRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (amostraRef.current !== null) {
      aplicarTemaRestaurante(amostraRef.current, publicada, reportarErroWeb);
    }
  }, [publicada]);
  return <span ref={amostraRef} aria-hidden="true" className={estilos.amostra} />;
}

function Formulario({ inicial }: { inicial: RespostaPersonalizacao }) {
  const [dados, setDados] = useState(() => paraFormulario(inicial));
  const consultas = useQueryClient();
  const toasts = useToasts();
  const envio = useEnvioDeFormulario(
    () => api.pedir<RespostaPersonalizacao>('PUT', ROTAS_DO_PAINEL.personalizacao, dados),
    (publicada) => {
      consultas.setQueryData(CHAVE, { ok: true, status: 200, dados: publicada });
      toasts.mostrar({ tipo: 'sucesso', texto: 'Personalização publicada.' });
    },
  );
  const mudar = (campo: 'corMarca' | 'frase') => (evento: { target: { value: string } }) => {
    setDados((atuais) => ({ ...atuais, [campo]: evento.target.value }));
  };
  const mudarOpcional =
    (campo: 'logoUrl' | 'capaUrl' | 'linkAvaliacaoGoogle') => (evento: { target: { value: string } }) => {
      setDados((atuais) => ({ ...atuais, [campo]: evento.target.value === '' ? null : evento.target.value }));
    };
  const mudarTexto = (campo: keyof Textos) => (evento: { target: { value: string } }) => {
    setDados((atuais) => ({ ...atuais, textos: { ...atuais.textos, [campo]: evento.target.value } }));
  };
  return (
    <form noValidate onSubmit={envio.aoEnviar}>
      {envio.erros.geral !== undefined && <Aviso tipo="erro">{envio.erros.geral}</Aviso>}
      <fieldset className={estilos.grupo}>
        <legend className={estilos.legenda}>Cor da marca</legend>
        <div className={estilos.cor}>
          <AmostraDaCorPublicada publicada={inicial} />
          <CampoTexto
            id={envio.idDoCampo('corMarca')}
            rotulo="Cor em hexadecimal"
            dica={`Publicada: ${inicial.corMarca}. Só publica se ficar legível no cardápio.`}
            value={dados.corMarca}
            onChange={mudar('corMarca')}
            erro={envio.erroDe('corMarca')}
          />
        </div>
        <SugestaoDeCor
          falha={envio.ultimaFalha}
          aoUsar={(cor) => {
            setDados((atuais) => ({ ...atuais, corMarca: cor }));
            envio.limpar();
          }}
        />
      </fieldset>
      <fieldset className={estilos.grupo}>
        <legend className={estilos.legenda}>Identidade</legend>
        <CampoTexto
          id={envio.idDoCampo('logoUrl')}
          rotulo="Logo (endereço interno)"
          dica="Exemplo: /midias/logo.webp. O envio do arquivo chega em breve."
          value={dados.logoUrl ?? ''}
          onChange={mudarOpcional('logoUrl')}
          erro={envio.erroDe('logoUrl')}
        />
        <CampoTexto
          id={envio.idDoCampo('capaUrl')}
          rotulo="Capa (endereço interno)"
          value={dados.capaUrl ?? ''}
          onChange={mudarOpcional('capaUrl')}
          erro={envio.erroDe('capaUrl')}
        />
        <CampoTexto
          id={envio.idDoCampo('frase')}
          rotulo="Frase de apresentação"
          dica="Até 80 caracteres."
          value={dados.frase}
          onChange={mudar('frase')}
          erro={envio.erroDe('frase')}
        />
      </fieldset>
      <fieldset className={estilos.grupo}>
        <legend className={estilos.legenda}>Textos do cardápio</legend>
        <AreaTexto
          id={envio.idDoCampo('boasVindas')}
          rotulo="Boas-vindas"
          value={dados.textos.boasVindas}
          onChange={mudarTexto('boasVindas')}
          erro={envio.erroDe('boasVindas')}
        />
        <AreaTexto
          id={envio.idDoCampo('aoChamarGarcom')}
          rotulo="Ao chamar o garçom"
          value={dados.textos.aoChamarGarcom}
          onChange={mudarTexto('aoChamarGarcom')}
          erro={envio.erroDe('aoChamarGarcom')}
        />
        <AreaTexto
          id={envio.idDoCampo('restauranteFechado')}
          rotulo="Restaurante fechado"
          value={dados.textos.restauranteFechado}
          onChange={mudarTexto('restauranteFechado')}
          erro={envio.erroDe('restauranteFechado')}
        />
      </fieldset>
      <fieldset className={estilos.grupo}>
        <legend className={estilos.legenda}>Avaliação no Google</legend>
        <CampoTexto
          id={envio.idDoCampo('linkAvaliacaoGoogle')}
          rotulo="Link para avaliar no Google"
          type="url"
          dica='Copie o link em "Pedir avaliações" no seu perfil do Google. O botão aparece para todos os clientes.'
          value={dados.linkAvaliacaoGoogle ?? ''}
          onChange={mudarOpcional('linkAvaliacaoGoogle')}
          erro={envio.erroDe('linkAvaliacaoGoogle')}
        />
      </fieldset>
      <Botao type="submit" carregando={envio.enviando}>
        Publicar
      </Botao>
    </form>
  );
}

export function Personalizacao() {
  const guardada = useQuery({
    queryKey: CHAVE,
    queryFn: () => api.pedir<RespostaPersonalizacao>('GET', ROTAS_DO_PAINEL.personalizacao),
  });
  return (
    <main className={estilos.conteudo}>
      <h1 className={estilos.titulo}>Personalização</h1>
      {guardada.data?.ok === true ? (
        <Formulario inicial={guardada.data.dados} />
      ) : (
        <Esqueleto rotulo="Carregando a personalização" />
      )}
    </main>
  );
}
