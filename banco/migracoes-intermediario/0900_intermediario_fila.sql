SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.pedidos
  ADD COLUMN motivo_cancelamento text
    CHECK (char_length(motivo_cancelamento) BETWEEN 3 AND 200);

GRANT UPDATE (motivo_cancelamento) ON public.pedidos TO app_runtime;

CREATE INDEX pedidos_abertos_idx
  ON public.pedidos (restaurante_id, criado_em)
  WHERE situacao IN ('enviado', 'em_preparo', 'pronto');

CREATE INDEX chamados_abertos_idx
  ON public.chamados (restaurante_id, criado_em)
  WHERE situacao IN ('aguardando', 'em_atendimento');
