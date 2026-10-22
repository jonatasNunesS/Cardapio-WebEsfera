import { useCallback, useState, type SubmitEvent } from 'react';

export interface ProblemaDoFormulario {
  readonly detail: string;
  readonly detalhes?: Readonly<Record<string, unknown>> | undefined;
  readonly campos?: readonly { readonly campo: string }[] | undefined;
}

export type RespostaDoEnvio<T> =
  { readonly ok: true; readonly dados: T } | { readonly ok: false; readonly problema: ProblemaDoFormulario };

export interface ErrosDoFormulario {
  readonly geral?: string | undefined;
  readonly campos: Readonly<Record<string, string>>;
}

export const SEM_ERROS: ErrosDoFormulario = { campos: {} };

const MENSAGEM_DE_CAMPO_INVALIDO = 'Confira este campo.';

export function errosDoProblema(problema: ProblemaDoFormulario): ErrosDoFormulario {
  const campo = problema.detalhes?.campo;
  if (typeof campo === 'string') {
    return { campos: { [campo]: problema.detail } };
  }
  const invalidos = problema.campos ?? [];
  if (invalidos.length > 0) {
    return {
      geral: problema.detail,
      campos: Object.fromEntries(invalidos.map((item) => [item.campo, MENSAGEM_DE_CAMPO_INVALIDO])),
    };
  }
  return { geral: problema.detail, campos: {} };
}

function focarPrimeiroErro(erros: ErrosDoFormulario, prefixo: string): void {
  const [campo] = Object.keys(erros.campos);
  if (campo !== undefined) {
    document.getElementById(`${prefixo}${campo}`)?.focus();
  }
}

export interface EnvioDeFormulario<T> {
  readonly erros: ErrosDoFormulario;
  readonly enviando: boolean;
  readonly ultimaFalha: ProblemaDoFormulario | null;
  readonly aoEnviar: (evento: SubmitEvent<HTMLFormElement>) => void;
  readonly idDoCampo: (campo: string) => string;
  readonly erroDe: (campo: string) => string | undefined;
  readonly limpar: () => void;
  readonly concluido: T | null;
}

export function useEnvioDeFormulario<T>(
  enviar: () => Promise<RespostaDoEnvio<T>>,
  aoConcluir: (dados: T) => void,
  prefixo = 'campo-',
): EnvioDeFormulario<T> {
  const [erros, setErros] = useState<ErrosDoFormulario>(SEM_ERROS);
  const [enviando, setEnviando] = useState(false);
  const [ultimaFalha, setUltimaFalha] = useState<ProblemaDoFormulario | null>(null);
  const [concluido, setConcluido] = useState<T | null>(null);

  const aoEnviar = useCallback(
    (evento: SubmitEvent<HTMLFormElement>) => {
      evento.preventDefault();
      setEnviando(true);
      void enviar()
        .then((resposta) => {
          if (resposta.ok) {
            setErros(SEM_ERROS);
            setUltimaFalha(null);
            setConcluido(resposta.dados);
            aoConcluir(resposta.dados);
            return;
          }
          const novos = errosDoProblema(resposta.problema);
          setErros(novos);
          setUltimaFalha(resposta.problema);
          focarPrimeiroErro(novos, prefixo);
        })
        .finally(() => {
          setEnviando(false);
        });
    },
    [enviar, aoConcluir, prefixo],
  );

  return {
    erros,
    enviando,
    ultimaFalha,
    aoEnviar,
    concluido,
    idDoCampo: (campo) => `${prefixo}${campo}`,
    erroDe: (campo) => erros.campos[campo],
    limpar: () => {
      setErros(SEM_ERROS);
      setUltimaFalha(null);
    },
  };
}
