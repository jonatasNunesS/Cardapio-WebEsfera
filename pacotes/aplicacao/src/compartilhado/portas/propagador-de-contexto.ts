export interface PropagadorDeContexto {
  comRestaurante<T>(restauranteId: string, executar: () => T): T;
  comSistema<T>(executar: () => T): T;
}

export const propagadorNulo: PropagadorDeContexto = {
  comRestaurante: (_restauranteId, executar) => executar(),
  comSistema: (executar) => executar(),
};
