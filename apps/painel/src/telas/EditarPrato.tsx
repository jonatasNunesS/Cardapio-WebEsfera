import {
  centavosDoTexto,
  rotaCom,
  ROTAS_DO_CARDAPIO_NO_PAINEL as ROTAS,
  textoDoPreco,
  type CategoriaNoPainel,
  type PratoNoPainel,
} from '@cardapio/contratos';
import {
  AreaTexto,
  Aviso,
  Botao,
  Caixa,
  CampoTexto,
  Esqueleto,
  Seletor,
  useEnvioDeFormulario,
  useToasts,
} from '@cardapio/ui';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { api } from '../api.ts';
import { useAtualizarCardapio, useCardapio } from '../cardapio.ts';
import estilos from './Painel.module.css';

const CODIGO_DE_CONFLITO = 'CARDAPIO_EDITAR_CONFLITO_DE_VERSAO';

interface DadosDoFormulario {
  readonly categoriaId: string;
  readonly nome: string;
  readonly descricao: string;
  readonly preco: string;
  readonly disponivel: boolean;
  readonly destaque: boolean;
}

function inicial(prato: PratoNoPainel | undefined, categoriaId: string): DadosDoFormulario {
  return prato === undefined
    ? { categoriaId, nome: '', descricao: '', preco: '', disponivel: true, destaque: false }
    : { ...prato, preco: textoDoPreco(prato.precoCentavos) };
}

function enviarPrato(dados: DadosDoFormulario, prato: PratoNoPainel | undefined) {
  const precoCentavos = centavosDoTexto(dados.preco);
  if (precoCentavos === null) {
    return Promise.resolve({
      ok: false as const,
      problema: { detail: 'Use o formato 89,90.', detalhes: { campo: 'precoCentavos' } },
    });
  }
  const corpo = {
    categoriaId: dados.categoriaId,
    nome: dados.nome,
    descricao: dados.descricao,
    precoCentavos,
    disponivel: dados.disponivel,
    destaque: dados.destaque,
  };
  return prato === undefined
    ? api.pedir<PratoNoPainel>('POST', ROTAS.pratos, corpo)
    : api.pedir<PratoNoPainel>('PUT', rotaCom(ROTAS.prato, { id: prato.id }), {
        ...corpo,
        versao: prato.versao,
      });
}

function Formulario({
  prato,
  categorias,
  categoriaInicial,
  aoConflito,
}: {
  readonly prato: PratoNoPainel | undefined;
  readonly categorias: readonly CategoriaNoPainel[];
  readonly categoriaInicial: string;
  readonly aoConflito: () => void;
}) {
  const [dados, setDados] = useState(() => inicial(prato, categoriaInicial));
  const navegar = useNavigate();
  const atualizar = useAtualizarCardapio();
  const toasts = useToasts();
  const envio = useEnvioDeFormulario(
    () =>
      enviarPrato(dados, prato).then((resposta) => {
        if (
          !resposta.ok &&
          'codigo' in resposta.problema &&
          resposta.problema.codigo === CODIGO_DE_CONFLITO
        ) {
          aoConflito();
        }
        return resposta;
      }),
    () => {
      void atualizar();
      toasts.mostrar({ tipo: 'sucesso', texto: 'Prato salvo.' });
      void navegar('/cardapio');
    },
  );
  const mudar =
    (campo: 'nome' | 'descricao' | 'preco' | 'categoriaId') => (evento: { target: { value: string } }) => {
      setDados((atuais) => ({ ...atuais, [campo]: evento.target.value }));
    };
  return (
    <form noValidate className={estilos.formulario} onSubmit={envio.aoEnviar}>
      {envio.erros.geral !== undefined && <Aviso tipo="erro">{envio.erros.geral}</Aviso>}
      <Seletor
        id={envio.idDoCampo('categoriaId')}
        rotulo="Categoria"
        value={dados.categoriaId}
        onChange={mudar('categoriaId')}
        opcoes={categorias.map((categoria) => ({ valor: categoria.id, rotulo: categoria.nome }))}
        erro={envio.erroDe('categoriaId')}
      />
      <CampoTexto
        id={envio.idDoCampo('nome')}
        rotulo="Nome do prato"
        dica="Até 80 caracteres."
        value={dados.nome}
        onChange={mudar('nome')}
        erro={envio.erroDe('nome')}
      />
      <AreaTexto
        id={envio.idDoCampo('descricao')}
        rotulo="Descrição"
        dica="Até 400 caracteres. Ingredientes e o que acompanha."
        value={dados.descricao}
        onChange={mudar('descricao')}
        erro={envio.erroDe('descricao')}
      />
      <CampoTexto
        id={envio.idDoCampo('precoCentavos')}
        rotulo="Preço em reais"
        dica="Por exemplo: 89,90"
        inputMode="decimal"
        value={dados.preco}
        onChange={mudar('preco')}
        erro={envio.erroDe('precoCentavos')}
      />
      <Caixa
        rotulo="Disponível hoje"
        checked={dados.disponivel}
        onChange={(evento) => {
          setDados((atuais) => ({ ...atuais, disponivel: evento.target.checked }));
        }}
      />
      <Caixa
        rotulo="Destaque da casa"
        checked={dados.destaque}
        onChange={(evento) => {
          setDados((atuais) => ({ ...atuais, destaque: evento.target.checked }));
        }}
      />
      <Botao type="submit" carregando={envio.enviando}>
        Salvar prato
      </Botao>
      <Link to="/cardapio">Voltar ao cardápio</Link>
    </form>
  );
}

export function EditarPrato() {
  const { id = 'novo' } = useParams();
  const [busca] = useSearchParams();
  const consulta = useCardapio();
  const atualizar = useAtualizarCardapio();
  const [conflito, setConflito] = useState(false);
  if (consulta.data?.ok !== true) {
    return <Esqueleto rotulo="Carregando o prato" />;
  }
  const { categorias } = consulta.data.dados;
  const prato = categorias.flatMap((categoria) => categoria.pratos).find((item) => item.id === id);
  const novo = id === 'novo';
  if (!novo && prato === undefined) {
    return (
      <main className={estilos.conteudo}>
        <Aviso tipo="erro">Este prato não existe mais.</Aviso>
        <Link to="/cardapio">Voltar ao cardápio</Link>
      </main>
    );
  }
  return (
    <main className={estilos.conteudo}>
      <h1 className={estilos.titulo}>{novo ? 'Novo prato' : 'Editar prato'}</h1>
      {conflito && (
        <Aviso tipo="aviso">
          Alguém mudou este prato enquanto você editava. Os dados abaixo são os atuais; confira e salve de
          novo.
        </Aviso>
      )}
      <Formulario
        key={prato === undefined ? 'novo' : `${prato.id}-${String(prato.versao)}`}
        prato={prato}
        categorias={categorias}
        categoriaInicial={busca.get('categoria') ?? categorias[0]?.id ?? ''}
        aoConflito={() => {
          setConflito(true);
          void atualizar();
        }}
      />
    </main>
  );
}
