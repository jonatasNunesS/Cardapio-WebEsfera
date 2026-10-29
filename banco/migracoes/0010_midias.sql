SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE public.midias (
  restaurante_id uuid NOT NULL REFERENCES public.restaurantes (id),
  id uuid NOT NULL DEFAULT uuidv7(),
  prato_id uuid NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('foto', 'video')),
  situacao text NOT NULL DEFAULT 'enviando'
    CHECK (situacao IN ('enviando', 'processando', 'pronta', 'falhou')),
  tipo_conteudo text NOT NULL CHECK (char_length(tipo_conteudo) BETWEEN 1 AND 100),
  tamanho_bytes bigint NOT NULL CHECK (tamanho_bytes BETWEEN 1 AND 104857600),
  caminho_original text NOT NULL CHECK (caminho_original LIKE 'r/' || restaurante_id || '/midias/' || id || '/%'),
  tentativa integer NOT NULL DEFAULT 0 CHECK (tentativa >= 0),
  motivo_falha text CHECK (
    motivo_falha IN (
      'tipo_nao_reconhecido', 'tipo_divergente', 'sem_video', 'longo_demais',
      'resolucao_invalida', 'derivado_grande_demais', 'erro_no_processamento'
    )
  ),
  derivados jsonb,
  duracao_ms integer CHECK (duracao_ms BETWEEN 1 AND 10000),
  processamento_iniciado_em timestamptz,
  pronta_em timestamptz,
  original_apagado_em timestamptz,
  descartada_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurante_id, id),
  FOREIGN KEY (restaurante_id, prato_id) REFERENCES public.pratos (restaurante_id, id),
  CHECK ((situacao = 'pronta') = (derivados IS NOT NULL AND pronta_em IS NOT NULL)),
  CHECK ((situacao = 'falhou') = (motivo_falha IS NOT NULL))
);

CREATE INDEX midias_situacao_idx
  ON public.midias (situacao, atualizado_em)
  WHERE situacao IN ('enviando', 'processando');
CREATE INDEX midias_prato_idx
  ON public.midias (restaurante_id, prato_id, criado_em DESC)
  WHERE descartada_em IS NULL;

ALTER TABLE public.pratos
  ADD CONSTRAINT pratos_midia_fk
  FOREIGN KEY (restaurante_id, midia_id) REFERENCES public.midias (restaurante_id, id);

ALTER TABLE public.midias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midias FORCE ROW LEVEL SECURITY;

CREATE POLICY midias_isolamento ON public.midias
  FOR ALL TO app_runtime
  USING (restaurante_id = app.restaurante_atual())
  WITH CHECK (restaurante_id = app.restaurante_atual());

GRANT SELECT, INSERT, UPDATE ON public.midias TO app_runtime;
