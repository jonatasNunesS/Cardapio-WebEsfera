SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE public.contadores_pedido (
  restaurante_id uuid PRIMARY KEY REFERENCES public.restaurantes (id),
  ultimo_numero integer NOT NULL CHECK (ultimo_numero > 0)
);

ALTER TABLE public.contadores_pedido ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contadores_pedido FORCE ROW LEVEL SECURITY;

CREATE POLICY contadores_pedido_isolamento ON public.contadores_pedido
  FOR ALL TO app_runtime
  USING (restaurante_id = app.restaurante_atual())
  WITH CHECK (restaurante_id = app.restaurante_atual());

GRANT SELECT, INSERT, UPDATE (ultimo_numero) ON public.contadores_pedido TO app_runtime;

CREATE TABLE public.pedidos (
  restaurante_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT uuidv7(),
  sessao_mesa_id uuid NOT NULL,
  mesa_id uuid NOT NULL,
  numero integer NOT NULL CHECK (numero > 0),
  situacao text NOT NULL DEFAULT 'enviado'
    CHECK (situacao IN ('enviado', 'em_preparo', 'pronto', 'entregue', 'cancelado')),
  total_centavos integer NOT NULL CHECK (total_centavos BETWEEN 0 AND 100000000),
  chave_idempotencia uuid NOT NULL,
  hash_conteudo text NOT NULL CHECK (hash_conteudo ~ '^[0-9a-f]{64}$'),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurante_id, id),
  UNIQUE (restaurante_id, chave_idempotencia),
  UNIQUE (restaurante_id, numero),
  FOREIGN KEY (restaurante_id, sessao_mesa_id) REFERENCES public.sessoes_mesa (restaurante_id, id),
  FOREIGN KEY (restaurante_id, mesa_id) REFERENCES public.mesas (restaurante_id, id)
);

CREATE INDEX pedidos_da_sessao_idx ON public.pedidos (restaurante_id, sessao_mesa_id, criado_em);

ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos FORCE ROW LEVEL SECURITY;

CREATE POLICY pedidos_isolamento ON public.pedidos
  FOR ALL TO app_runtime
  USING (restaurante_id = app.restaurante_atual())
  WITH CHECK (restaurante_id = app.restaurante_atual());

GRANT SELECT, INSERT, UPDATE (situacao, atualizado_em) ON public.pedidos TO app_runtime;

-- A máquina de estados também vale no banco, contra um UPDATE errado: docs/adr/0015-pedido-do-cliente.md
CREATE FUNCTION app.exigir_transicao_do_pedido() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW.situacao = OLD.situacao THEN
    RETURN NEW;
  END IF;
  IF (OLD.situacao, NEW.situacao) NOT IN (
    ('enviado', 'em_preparo'), ('em_preparo', 'pronto'), ('pronto', 'entregue'),
    ('enviado', 'cancelado'), ('em_preparo', 'cancelado'), ('pronto', 'cancelado')
  ) THEN
    RAISE EXCEPTION 'Transição de pedido inválida: % para %', OLD.situacao, NEW.situacao
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER pedidos_transicao
  BEFORE UPDATE OF situacao ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION app.exigir_transicao_do_pedido();

GRANT EXECUTE ON FUNCTION app.exigir_transicao_do_pedido() TO app_runtime;

CREATE TABLE public.itens_pedido (
  restaurante_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT uuidv7(),
  pedido_id uuid NOT NULL,
  prato_id uuid NOT NULL,
  nome_no_momento text NOT NULL CHECK (char_length(nome_no_momento) BETWEEN 1 AND 240),
  preco_no_momento_centavos integer NOT NULL CHECK (preco_no_momento_centavos BETWEEN 0 AND 100000000),
  quantidade integer NOT NULL CHECK (quantidade BETWEEN 1 AND 99),
  observacao text NOT NULL DEFAULT '' CHECK (char_length(observacao) <= 140),
  PRIMARY KEY (restaurante_id, id),
  FOREIGN KEY (restaurante_id, pedido_id) REFERENCES public.pedidos (restaurante_id, id),
  FOREIGN KEY (restaurante_id, prato_id) REFERENCES public.pratos (restaurante_id, id)
);

CREATE INDEX itens_pedido_do_pedido_idx ON public.itens_pedido (restaurante_id, pedido_id);

ALTER TABLE public.itens_pedido ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_pedido FORCE ROW LEVEL SECURITY;

CREATE POLICY itens_pedido_isolamento ON public.itens_pedido
  FOR ALL TO app_runtime
  USING (restaurante_id = app.restaurante_atual())
  WITH CHECK (restaurante_id = app.restaurante_atual());

GRANT SELECT, INSERT ON public.itens_pedido TO app_runtime;
