import { rotaCom, ROTAS_DAS_MESAS_NO_PAINEL as ROTAS, type MesaNaApi } from '@cardapio/contratos';
import { Aviso, Botao, CampoTexto, Esqueleto, LinkBotao, Tabela, useToasts } from '@cardapio/ui';
import { useState, type SubmitEvent } from 'react';
import { useAcaoNasMesas, useMesas } from '../mesas.ts';
import estilos from './Mesas.module.css';
import painel from './Painel.module.css';

type Acao = ReturnType<typeof useAcaoNasMesas>;

const textoOuNulo = (valor: string) => (valor.trim() === '' ? null : valor);

function NovaMesa({ acao }: { readonly acao: Acao }) {
  const [campos, setCampos] = useState({ numero: '', nome: '', area: '' });
  const criar = (evento: SubmitEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const corpo = {
      numero: Number(campos.numero),
      nome: textoOuNulo(campos.nome),
      area: textoOuNulo(campos.area),
    };
    void acao('POST', ROTAS.mesas, corpo, 'Mesa criada.').then((ok) => {
      if (ok) {
        setCampos({ numero: '', nome: '', area: '' });
      }
    });
  };
  const campo = (chave: keyof typeof campos) => ({
    value: campos[chave],
    onChange: (evento: { target: { value: string } }) => {
      setCampos({ ...campos, [chave]: evento.target.value });
    },
  });
  return (
    <form className={estilos.formulario} onSubmit={criar}>
      <CampoTexto rotulo="Número da mesa" type="number" min={1} max={999} required {...campo('numero')} />
      <CampoTexto rotulo="Nome (opcional)" dica="Por exemplo: Janela." {...campo('nome')} />
      <CampoTexto rotulo="Área (opcional)" dica="Por exemplo: Varanda." {...campo('area')} />
      <Botao type="submit">Adicionar mesa</Botao>
    </form>
  );
}

function CopiarLink({ mesa }: { readonly mesa: MesaNaApi }) {
  const toasts = useToasts();
  return (
    <Botao
      variante="secundario"
      onClick={() => {
        void navigator.clipboard.writeText(mesa.link).then(
          () => {
            toasts.mostrar({ tipo: 'sucesso', texto: `Link da mesa ${String(mesa.numero)} copiado.` });
          },
          () => {
            toasts.mostrar({ tipo: 'erro', texto: 'Não foi possível copiar. Selecione o link e copie.' });
          },
        );
      }}
    >
      Copiar link<span className={estilos.somenteLeitor}> da mesa {mesa.numero}</span>
    </Botao>
  );
}

function Renumerar({ mesa, acao }: { readonly mesa: MesaNaApi; readonly acao: Acao }) {
  const [numero, setNumero] = useState(String(mesa.numero));
  const salvar = (evento: SubmitEvent<HTMLFormElement>) => {
    evento.preventDefault();
    void acao('PUT', rotaCom(ROTAS.numero, { id: mesa.id }), { numero: Number(numero) }, 'Mesa renumerada.');
  };
  return (
    <form className={estilos.renumerar} onSubmit={salvar}>
      <CampoTexto
        rotulo={`Novo número da mesa ${String(mesa.numero)}`}
        type="number"
        min={1}
        max={999}
        value={numero}
        onChange={(evento) => {
          setNumero(evento.target.value);
        }}
      />
      <Botao type="submit" variante="secundario">
        Renumerar
      </Botao>
    </form>
  );
}

function NovoCodigo({ mesa, acao }: { readonly mesa: MesaNaApi; readonly acao: Acao }) {
  const [confirmando, setConfirmando] = useState(false);
  if (!confirmando) {
    return (
      <Botao
        variante="secundario"
        onClick={() => {
          setConfirmando(true);
        }}
      >
        Gerar novo código<span className={estilos.somenteLeitor}> da mesa {mesa.numero}</span>
      </Botao>
    );
  }
  return (
    <Aviso
      tipo="aviso"
      titulo={`Gerar novo código da mesa ${String(mesa.numero)}?`}
      acao={
        <div className={estilos.acoes}>
          <Botao
            onClick={() => {
              setConfirmando(false);
              void acao('POST', rotaCom(ROTAS.codigo, { id: mesa.id }), undefined, 'Novo código gerado.');
            }}
          >
            Confirmar novo código
          </Botao>
          <Botao
            variante="secundario"
            onClick={() => {
              setConfirmando(false);
            }}
          >
            Cancelar
          </Botao>
        </div>
      }
    >
      O QR impresso desta mesa deixa de funcionar na hora. Imprima o cartão novo.
    </Aviso>
  );
}

function AcoesDaMesa({ mesa, acao }: { readonly mesa: MesaNaApi; readonly acao: Acao }) {
  const situacao = mesa.ativa ? 'Desativar' : 'Ativar';
  return (
    <div className={estilos.acoes}>
      <CopiarLink mesa={mesa} />
      <LinkBotao variante="secundario" href={rotaCom(ROTAS.cartao, { id: mesa.id })} target="_blank">
        Ver QR<span className={estilos.somenteLeitor}> da mesa {mesa.numero}</span>
      </LinkBotao>
      <Botao
        variante="secundario"
        onClick={() =>
          void acao(
            'PUT',
            rotaCom(ROTAS.situacao, { id: mesa.id }),
            { ativa: !mesa.ativa },
            mesa.ativa ? 'Mesa desativada.' : 'Mesa ativada.',
          )
        }
      >
        {situacao}
        <span className={estilos.somenteLeitor}> mesa {mesa.numero}</span>
      </Botao>
      <Renumerar mesa={mesa} acao={acao} />
      <NovoCodigo mesa={mesa} acao={acao} />
    </div>
  );
}

export function Mesas() {
  const consulta = useMesas();
  const acao = useAcaoNasMesas();
  const lista = consulta.data?.ok === true ? consulta.data.dados : null;
  const ativas = lista?.mesas.filter((mesa) => mesa.ativa).length ?? 0;
  return (
    <main className={painel.conteudo}>
      <h1 className={painel.titulo}>Mesas e QR Codes</h1>
      <NovaMesa acao={acao} />
      {lista === null ? (
        <Esqueleto rotulo="Carregando as mesas" />
      ) : (
        <>
          <div className={estilos.topo}>
            <p>
              {ativas} de {lista.limite} mesas ativas no seu plano.
            </p>
            <LinkBotao variante="secundario" href={ROTAS.cartoes} download>
              Baixar todos os QR Codes (ZIP)
            </LinkBotao>
          </div>
          <Tabela
            legenda="Mesas do restaurante"
            linhas={lista.mesas}
            chaveDaLinha={(mesa) => mesa.id}
            mensagemVazia="Nenhuma mesa ainda. Adicione a primeira acima."
            colunas={[
              { chave: 'numero', titulo: 'Número', numerica: true, celula: (mesa) => mesa.numero },
              { chave: 'nome', titulo: 'Nome', celula: (mesa) => mesa.nome ?? '' },
              { chave: 'area', titulo: 'Área', celula: (mesa) => mesa.area ?? '' },
              {
                chave: 'situacao',
                titulo: 'Situação',
                celula: (mesa) => (mesa.ativa ? 'Ativa' : 'Desativada'),
              },
              {
                chave: 'link',
                titulo: 'Link',
                celula: (mesa) => <code className={estilos.link}>{mesa.link}</code>,
              },
              { chave: 'acoes', titulo: 'Ações', celula: (mesa) => <AcoesDaMesa mesa={mesa} acao={acao} /> },
            ]}
          />
        </>
      )}
    </main>
  );
}
