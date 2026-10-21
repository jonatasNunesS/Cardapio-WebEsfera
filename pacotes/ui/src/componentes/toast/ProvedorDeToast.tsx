import { createContext, use, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import type { TipoAviso } from '../aviso/Aviso.tsx';
import { Toast } from './Toast.tsx';
import estilos from './Toast.module.css';

export interface MensagemToast {
  readonly tipo: TipoAviso;
  readonly texto: string;
}

interface ToastAtivo extends MensagemToast {
  readonly id: number;
}

export interface Toasts {
  mostrar(mensagem: MensagemToast): void;
}

export const DURACAO_DO_TOAST_MS = 6000;

const ToastsContext = createContext<Toasts | null>(null);

export function useToasts(): Toasts {
  const toasts = use(ToastsContext);
  if (toasts === null) {
    throw new Error('useToasts precisa de um ProvedorDeToast acima na árvore');
  }
  return toasts;
}

export interface PropriedadesProvedorDeToast {
  readonly children: ReactNode;
  readonly duracaoMs?: number | undefined;
}

export function ProvedorDeToast({ children, duracaoMs = DURACAO_DO_TOAST_MS }: PropriedadesProvedorDeToast) {
  const [ativos, setAtivos] = useState<readonly ToastAtivo[]>([]);
  const proximoIdRef = useRef(0);
  const fechar = useCallback((id: number) => {
    setAtivos((lista) => lista.filter((toast) => toast.id !== id));
  }, []);
  const toasts = useMemo<Toasts>(
    () => ({
      mostrar(mensagem) {
        proximoIdRef.current += 1;
        const id = proximoIdRef.current;
        setAtivos((lista) => [...lista, { ...mensagem, id }]);
      },
    }),
    [],
  );
  return (
    <ToastsContext value={toasts}>
      {children}
      <section
        className={estilos.regiao}
        aria-label="Notificações"
        aria-live="polite"
        aria-relevant="additions"
      >
        {ativos.map((toast) => (
          <Toast
            key={toast.id}
            tipo={toast.tipo}
            texto={toast.texto}
            duracaoMs={toast.tipo === 'erro' ? undefined : duracaoMs}
            aoFechar={() => {
              fechar(toast.id);
            }}
          />
        ))}
      </section>
    </ToastsContext>
  );
}
