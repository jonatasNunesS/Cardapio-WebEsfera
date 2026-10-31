const DURACAO_DO_BIPE_S = 0.25;

let contexto: AudioContext | null = null;

export function tocarAlerta(): void {
  contexto ??= new AudioContext();
  const oscilador = contexto.createOscillator();
  const volume = contexto.createGain();
  oscilador.frequency.value = 880;
  volume.gain.setValueAtTime(0.2, contexto.currentTime);
  volume.gain.exponentialRampToValueAtTime(0.001, contexto.currentTime + DURACAO_DO_BIPE_S);
  oscilador.connect(volume).connect(contexto.destination);
  oscilador.start();
  oscilador.stop(contexto.currentTime + DURACAO_DO_BIPE_S);
}

export function ehNovidade(tipo: string): boolean {
  return tipo === 'PedidoCriado' || tipo === 'ChamadoCriado';
}
