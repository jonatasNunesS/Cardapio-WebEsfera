import { useEffect, useId, useRef, type ReactNode } from 'react';
import { BotaoIcone } from '../botao/BotaoIcone.tsx';
import estilos from './FolhaInferior.module.css';

export interface PropriedadesFolhaInferior {
  readonly aberta: boolean;
  readonly aoFechar: () => void;
  readonly titulo: string;
  readonly children: ReactNode;
  readonly rodape?: ReactNode | undefined;
  readonly rotuloFechar?: string | undefined;
}

const FOCAVEIS =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function abrir(dialogo: HTMLDialogElement): void {
  dialogo.showModal();
  dialogo.querySelector<HTMLElement>(FOCAVEIS)?.focus();
}

export function FolhaInferior({
  aberta,
  aoFechar,
  titulo,
  children,
  rodape,
  rotuloFechar = 'Fechar',
}: PropriedadesFolhaInferior) {
  const dialogoRef = useRef<HTMLDialogElement>(null);
  const quemAbriuRef = useRef<HTMLElement | null>(null);
  const tituloId = useId();

  useEffect(() => {
    const dialogo = dialogoRef.current;
    if (dialogo === null) {
      return;
    }
    if (aberta && !dialogo.open) {
      quemAbriuRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      abrir(dialogo);
    } else if (!aberta && dialogo.open) {
      dialogo.close();
    }
  }, [aberta]);

  return (
    <dialog
      ref={dialogoRef}
      className={estilos.folha}
      aria-labelledby={tituloId}
      onCancel={(evento) => {
        evento.preventDefault();
        aoFechar();
      }}
      onKeyDown={(evento) => {
        if (evento.key === 'Escape') {
          evento.preventDefault();
          aoFechar();
        }
      }}
      onClose={() => {
        quemAbriuRef.current?.focus();
        quemAbriuRef.current = null;
        if (aberta) {
          aoFechar();
        }
      }}
    >
      <header className={estilos.cabecalho}>
        <h2 id={tituloId} className={estilos.titulo}>
          {titulo}
        </h2>
        <BotaoIcone icone="fechar" rotulo={rotuloFechar} variante="texto" onClick={aoFechar} />
      </header>
      <div className={estilos.conteudo}>{children}</div>
      {rodape !== undefined && <footer className={estilos.rodape}>{rodape}</footer>}
    </dialog>
  );
}
