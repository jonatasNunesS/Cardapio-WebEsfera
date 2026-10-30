SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE public.assinaturas (
  restaurante_id uuid NOT NULL REFERENCES public.restaurantes (id),
  id uuid NOT NULL DEFAULT uuidv7(),
  plano_id uuid NOT NULL REFERENCES public.planos (id),
  mp_assinatura_id text NOT NULL UNIQUE CHECK (mp_assinatura_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  situacao text NOT NULL DEFAULT 'pendente'
    CHECK (situacao IN ('pendente', 'autorizada', 'pausada', 'cancelada')),
  init_point text NOT NULL CHECK (init_point ~ '^https://' AND length(init_point) <= 2000),
  pago_ate timestamptz,
  proxima_cobranca_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurante_id, id)
);

CREATE UNIQUE INDEX assinaturas_uma_viva_idx
  ON public.assinaturas (restaurante_id) WHERE situacao <> 'cancelada';

ALTER TABLE public.assinaturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assinaturas FORCE ROW LEVEL SECURITY;

CREATE POLICY assinaturas_isolamento ON public.assinaturas
  FOR ALL TO app_runtime
  USING (restaurante_id = app.restaurante_atual())
  WITH CHECK (restaurante_id = app.restaurante_atual());

GRANT SELECT, INSERT, UPDATE ON public.assinaturas TO app_runtime;

CREATE TABLE public.cobrancas (
  restaurante_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT uuidv7(),
  assinatura_id uuid NOT NULL,
  mp_cobranca_id text NOT NULL UNIQUE CHECK (mp_cobranca_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  mp_pagamento_id text CHECK (mp_pagamento_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  valor_centavos integer NOT NULL CHECK (valor_centavos >= 0),
  situacao text NOT NULL
    CHECK (situacao IN ('agendada', 'paga', 'recusada', 'em_retentativa', 'cancelada')),
  vence_em timestamptz NOT NULL,
  paga_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurante_id, id),
  FOREIGN KEY (restaurante_id, assinatura_id) REFERENCES public.assinaturas (restaurante_id, id),
  CHECK ((situacao = 'paga') = (paga_em IS NOT NULL))
);

CREATE INDEX cobrancas_da_assinatura_idx ON public.cobrancas (restaurante_id, assinatura_id, vence_em DESC);

ALTER TABLE public.cobrancas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cobrancas FORCE ROW LEVEL SECURITY;

CREATE POLICY cobrancas_isolamento ON public.cobrancas
  FOR ALL TO app_runtime
  USING (restaurante_id = app.restaurante_atual())
  WITH CHECK (restaurante_id = app.restaurante_atual());

GRANT SELECT, INSERT, UPDATE ON public.cobrancas TO app_runtime;

-- Sem restaurante_id: o aviso chega antes de sabermos de quem é; só o worker lê: docs/adr/0014-assinaturas-e-cobranca.md
CREATE TABLE public.eventos_pagamento (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  provedor text NOT NULL CHECK (provedor IN ('mercado_pago')),
  x_request_id text NOT NULL CHECK (x_request_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  topico text NOT NULL CHECK (topico ~ '^[a-z_.]{1,64}$'),
  recurso_id text NOT NULL CHECK (recurso_id ~ '^[a-z0-9_-]{1,64}$'),
  recebido_em timestamptz NOT NULL DEFAULT now(),
  em_processamento_em timestamptz,
  processado_em timestamptz,
  tentativas integer NOT NULL DEFAULT 0 CHECK (tentativas >= 0),
  ultimo_erro_codigo text CHECK (ultimo_erro_codigo ~ '^[A-Z_]{1,80}$'),
  UNIQUE (provedor, x_request_id)
);

CREATE INDEX eventos_pagamento_pendentes_idx
  ON public.eventos_pagamento (recebido_em) WHERE processado_em IS NULL;

ALTER TABLE public.eventos_pagamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eventos_pagamento FORCE ROW LEVEL SECURITY;

CREATE POLICY eventos_pagamento_sistema ON public.eventos_pagamento
  FOR ALL TO app_sistema
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON public.eventos_pagamento TO app_sistema;
GRANT UPDATE (em_processamento_em, processado_em, tentativas, ultimo_erro_codigo)
  ON public.eventos_pagamento TO app_sistema;
GRANT SELECT, INSERT ON public.eventos_pagamento TO funcoes_privilegiadas;

CREATE FUNCTION app.registrar_evento_pagamento(p_x_request_id text, p_topico text, p_recurso_id text)
RETURNS TABLE (evento_id uuid, processado boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  INSERT INTO public.eventos_pagamento (provedor, x_request_id, topico, recurso_id)
  VALUES ('mercado_pago', p_x_request_id, p_topico, p_recurso_id)
  ON CONFLICT (provedor, x_request_id) DO NOTHING;

  RETURN QUERY
    SELECT e.id, e.processado_em IS NOT NULL
      FROM public.eventos_pagamento e
     WHERE e.provedor = 'mercado_pago' AND e.x_request_id = p_x_request_id;
END
$$;

REVOKE ALL ON FUNCTION app.registrar_evento_pagamento(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.registrar_evento_pagamento(text, text, text) TO app_runtime;
ALTER FUNCTION app.registrar_evento_pagamento(text, text, text) OWNER TO funcoes_privilegiadas;

CREATE FUNCTION app.listar_restaurantes_para_cobranca(p_apos uuid, p_limite integer)
RETURNS TABLE (restaurante_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT r.id FROM public.restaurantes r
   WHERE r.situacao <> 'cancelado' AND (p_apos IS NULL OR r.id > p_apos)
   ORDER BY r.id
   LIMIT least(greatest(p_limite, 1), 500);
$$;

REVOKE ALL ON FUNCTION app.listar_restaurantes_para_cobranca(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.listar_restaurantes_para_cobranca(uuid, integer) TO app_sistema;
ALTER FUNCTION app.listar_restaurantes_para_cobranca(uuid, integer) OWNER TO funcoes_privilegiadas;

-- O dono da tabela passa pela RLS forçada; desligá-la só nesta transação permite o backfill: docs/adr/0014-assinaturas-e-cobranca.md
ALTER TABLE public.restaurantes NO FORCE ROW LEVEL SECURITY;
UPDATE public.restaurantes SET teste_termina_em = criado_em + interval '10 days' WHERE teste_termina_em IS NULL;
ALTER TABLE public.restaurantes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.restaurantes
  ALTER COLUMN teste_termina_em SET DEFAULT now() + interval '10 days',
  ALTER COLUMN teste_termina_em SET NOT NULL;
