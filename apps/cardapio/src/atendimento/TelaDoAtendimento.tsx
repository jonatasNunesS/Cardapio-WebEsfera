import { gerarUuidV7, type RespostaChamado, type TipoDeChamadoNaApi } from '@cardapio/contratos/publico';
import { Aviso, Botao, LinkBotao } from '@cardapio/ui';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useCaminho, useMesaPronta } from '../dados/contexto.ts';
import { useAvisosDaMesa } from '../pedido/ao-vivo.ts';
import { abrirChamado, cancelarChamado, lerChamado } from './api.ts';
import estilos from './Atendimento.module.css';
import { guardarChamado, lerChamadosGuardados } from './chamados-guardados.ts';

const TEXTOS: Readonly<Record<TipoDeChamadoNaApi, Readonly<Record<RespostaChamado['situacao'], string>>>> = {
  garcom: {
    aguardando: 'Garçom avisado. A equipe recebeu agora; aguarde um instante.',
    em_atendimento: 'Alguém da equipe está vindo até a mesa.',
    concluido: 'Atendimento concluído.',
    cancelado: 'Chamado cancelado.',
  },
  conta: {
    aguardando: 'Conta pedida. A equipe vai trazer a conta à mesa.',
    em_atendimento: 'A equipe está fechando a sua conta.',
    concluido: 'Conta entregue.',
    cancelado: 'Pedido de conta cancelado.',
  },
};

const novaChave = () => gerarUuidV7(Date.now(), crypto.getRandomValues(new Uint8Array(10)));

function useChamado(id: string | null) {
  const [chamado, setChamado] = useState<RespostaChamado | null>(null);
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    if (id === null) {
      return undefined;
    }
    let ativo = true;
    void lerChamado(id).then((lido) => {
      if (ativo && lido.ok) {
        setChamado(lido.dados);
      }
    });
    return () => {
      ativo = false;
    };
  }, [id, versao]);
  return {
    chamado,
    recarregar: () => {
      setVersao((atual) => atual + 1);
    },
  };
}

function Acompanhamento({ id, aoMudar }: { readonly id: string; readonly aoMudar: () => void }) {
  const { chamado, recarregar } = useChamado(id);
  const caminho = useCaminho();
  const navegar = useNavigate();
  useAvisosDaMesa({
    aoMudar: recarregar,
    aoEncerrar: () => {
      void navegar(caminho('/obrigado'));
    },
  });
  const [erro, setErro] = useState<string | null>(null);
  if (chamado === null) {
    return <p aria-busy="true">Carregando o chamado...</p>;
  }
  return (
    <section aria-live="polite" className={estilos.opcoes}>
      <Aviso tipo={chamado.situacao === 'cancelado' ? 'informacao' : 'sucesso'}>
        {TEXTOS[chamado.tipo][chamado.situacao]}
      </Aviso>
      {erro !== null && <Aviso tipo="erro">{erro}</Aviso>}
      {chamado.situacao === 'aguardando' && (
        <Botao
          variante="perigo"
          onClick={() => {
            void cancelarChamado(chamado.id).then((lido) => {
              setErro(lido.ok ? null : (lido.problema?.detail ?? 'Sem conexão. Tente de novo.'));
              recarregar();
              aoMudar();
            });
          }}
        >
          {chamado.tipo === 'garcom' ? 'Cancelar chamado' : 'Cancelar pedido de conta'}
        </Botao>
      )}
    </section>
  );
}

export function TelaDoAtendimento() {
  const { mesa } = useMesaPronta();
  const caminho = useCaminho();
  const [guardados, setGuardados] = useState(() => lerChamadosGuardados(mesa.slug, mesa.numero));
  const [chaves] = useState(() => ({ garcom: novaChave(), conta: novaChave() }));
  const [enviando, setEnviando] = useState<TipoDeChamadoNaApi | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const abrir = (tipo: TipoDeChamadoNaApi) => {
    setEnviando(tipo);
    void abrirChamado(tipo, chaves[tipo]).then((lido) => {
      setEnviando(null);
      if (!lido.ok) {
        setErro(lido.problema?.detail ?? 'Sem conexão. Toque de novo: não cria outro chamado.');
        return;
      }
      setErro(null);
      guardarChamado(mesa.slug, mesa.numero, tipo, lido.dados.id);
      setGuardados(lerChamadosGuardados(mesa.slug, mesa.numero));
    });
  };
  const atualizar = () => {
    setGuardados(lerChamadosGuardados(mesa.slug, mesa.numero));
  };
  return (
    <main className={estilos.tela}>
      <h1 className={estilos.titulo}>Do que você precisa?</h1>
      <p className={estilos.subtitulo}>Um toque basta. Se você tocar de novo, não cria outro chamado.</p>
      {erro !== null && <Aviso tipo="erro">{erro}</Aviso>}
      <div className={estilos.opcoes}>
        <Botao
          icone="chamarGarcom"
          onClick={() => {
            abrir('garcom');
          }}
          disabled={enviando !== null}
        >
          {enviando === 'garcom' ? 'Chamando...' : 'Chamar garçom'}
        </Botao>
        {guardados.garcom !== undefined && <Acompanhamento id={guardados.garcom} aoMudar={atualizar} />}
        <Botao
          icone="conta"
          variante="secundario"
          onClick={() => {
            abrir('conta');
          }}
          disabled={enviando !== null}
        >
          {enviando === 'conta' ? 'Pedindo...' : 'Pedir a conta'}
        </Botao>
        {guardados.conta !== undefined && <Acompanhamento id={guardados.conta} aoMudar={atualizar} />}
      </div>
      <LinkBotao variante="secundario" href={caminho('/conta')}>
        Ver resumo da conta
      </LinkBotao>
      <LinkBotao variante="texto" href={caminho()}>
        Voltar ao cardápio
      </LinkBotao>
    </main>
  );
}
