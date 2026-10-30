import { Botao, Icone } from '@cardapio/ui';
import estilos from './TelaNeutra.module.css';

export type MotivoDaTelaNeutra = 'qr-invalido' | 'expirada' | 'sem-conexao';

const TEXTOS: Readonly<Record<MotivoDaTelaNeutra, { readonly titulo: string; readonly texto: string }>> = {
  'qr-invalido': {
    titulo: 'Este QR Code não está ativo',
    texto:
      'Pode ser de uma mesa desativada ou de um cardápio que saiu do ar. Escaneie o QR Code da sua mesa ou chame alguém da equipe.',
  },
  expirada: {
    titulo: 'Sua sessão na mesa terminou',
    texto:
      'Por segurança, o acesso pela mesa dura algumas horas. Escaneie o QR Code da mesa de novo para continuar.',
  },
  'sem-conexao': {
    titulo: 'Sem conexão',
    texto: 'Não conseguimos abrir o cardápio agora. Confira a internet e tente de novo.',
  },
};

export function TelaNeutra({ motivo }: { readonly motivo: MotivoDaTelaNeutra }) {
  const { titulo, texto } = TEXTOS[motivo];
  return (
    <main className={estilos.tela}>
      <section className={estilos.caixa} aria-labelledby="titulo-da-tela-neutra">
        <Icone
          nome={motivo === 'sem-conexao' ? 'semConexao' : 'qrCode'}
          tamanho={24}
          className={estilos.icone}
        />
        <h1 id="titulo-da-tela-neutra" className={estilos.titulo}>
          {titulo}
        </h1>
        <p className={estilos.texto}>{texto}</p>
        {motivo !== 'expirada' && (
          <Botao
            variante="secundario"
            onClick={() => {
              location.reload();
            }}
          >
            Tentar de novo
          </Botao>
        )}
      </section>
    </main>
  );
}
