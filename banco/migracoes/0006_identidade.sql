SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE public.usuarios (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  nome text NOT NULL CHECK (length(nome) BETWEEN 1 AND 120),
  email text NOT NULL UNIQUE CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
  hash_senha text NOT NULL CHECK (hash_senha LIKE '$argon2id$%'),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.usuarios TO funcoes_privilegiadas;

CREATE TABLE public.vinculos (
  restaurante_id uuid NOT NULL REFERENCES public.restaurantes (id),
  id uuid NOT NULL DEFAULT uuidv7(),
  usuario_id uuid NOT NULL REFERENCES public.usuarios (id),
  papel text NOT NULL CHECK (papel IN ('dono', 'gerente', 'garcom', 'cozinha')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurante_id, id),
  UNIQUE (restaurante_id, usuario_id)
);

CREATE INDEX vinculos_usuario_idx ON public.vinculos (usuario_id);

ALTER TABLE public.vinculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vinculos FORCE ROW LEVEL SECURITY;

CREATE POLICY vinculos_isolamento ON public.vinculos
  FOR ALL TO app_runtime
  USING (restaurante_id = app.restaurante_atual())
  WITH CHECK (restaurante_id = app.restaurante_atual());

GRANT SELECT, INSERT ON public.vinculos TO app_runtime;
GRANT SELECT ON public.vinculos TO funcoes_privilegiadas;

CREATE TABLE public.administradores (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  nome text NOT NULL CHECK (length(nome) BETWEEN 1 AND 120),
  email text NOT NULL UNIQUE CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
  hash_senha text NOT NULL CHECK (hash_senha LIKE '$argon2id$%'),
  papel text NOT NULL CHECK (papel IN ('suporte', 'financeiro', 'dono_plataforma')),
  troca_de_senha_obrigatoria boolean NOT NULL DEFAULT true,
  segredo_totp_cifrado text,
  segredo_totp_pendente_cifrado text,
  ultimo_passo_totp bigint NOT NULL DEFAULT 0 CHECK (ultimo_passo_totp >= 0),
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CHECK (troca_de_senha_obrigatoria OR segredo_totp_cifrado IS NOT NULL)
);

GRANT SELECT, UPDATE ON public.administradores TO funcoes_privilegiadas;

CREATE TABLE public.codigos_recuperacao_admin (
  administrador_id uuid NOT NULL REFERENCES public.administradores (id),
  id uuid NOT NULL DEFAULT uuidv7(),
  hash_codigo text NOT NULL CHECK (hash_codigo ~ '^[0-9a-f]{64}$'),
  usado_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (administrador_id, id),
  UNIQUE (administrador_id, hash_codigo)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.codigos_recuperacao_admin TO funcoes_privilegiadas;

CREATE TABLE public.sessoes (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  hash_id text NOT NULL UNIQUE CHECK (hash_id ~ '^[0-9a-f]{64}$'),
  publico text NOT NULL CHECK (publico IN ('painel', 'admin')),
  usuario_id uuid REFERENCES public.usuarios (id),
  administrador_id uuid REFERENCES public.administradores (id),
  restaurante_atual_id uuid REFERENCES public.restaurantes (id),
  nivel text NOT NULL CHECK (nivel IN ('completa', 'segundo_fator', 'cadastro')),
  criada_em timestamptz NOT NULL,
  ultimo_uso_em timestamptz NOT NULL,
  expira_em timestamptz NOT NULL,
  revogada_em timestamptz,
  CHECK (expira_em > criada_em),
  CHECK (
    (publico = 'painel' AND usuario_id IS NOT NULL AND administrador_id IS NULL AND nivel = 'completa')
    OR (publico = 'admin' AND administrador_id IS NOT NULL AND usuario_id IS NULL AND restaurante_atual_id IS NULL)
  )
);

CREATE INDEX sessoes_usuario_ativas_idx ON public.sessoes (usuario_id) WHERE revogada_em IS NULL;
CREATE INDEX sessoes_administrador_ativas_idx ON public.sessoes (administrador_id) WHERE revogada_em IS NULL;

GRANT SELECT, INSERT, UPDATE ON public.sessoes TO funcoes_privilegiadas;

CREATE TABLE public.tokens_redefinicao_senha (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  usuario_id uuid NOT NULL REFERENCES public.usuarios (id),
  hash_token text NOT NULL UNIQUE CHECK (hash_token ~ '^[0-9a-f]{64}$'),
  criado_em timestamptz NOT NULL,
  expira_em timestamptz NOT NULL,
  usado_em timestamptz,
  CHECK (expira_em > criado_em)
);

CREATE INDEX tokens_redefinicao_senha_usuario_idx ON public.tokens_redefinicao_senha (usuario_id)
  WHERE usado_em IS NULL;

GRANT SELECT, INSERT, UPDATE ON public.tokens_redefinicao_senha TO funcoes_privilegiadas;

CREATE TABLE public.tentativas_login (
  publico text NOT NULL CHECK (publico IN ('painel', 'admin')),
  alvo text NOT NULL CHECK (alvo ~ '^[0-9a-f]{64}$'),
  falhas integer NOT NULL CHECK (falhas > 0),
  ultima_falha_em timestamptz NOT NULL,
  PRIMARY KEY (publico, alvo)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tentativas_login TO funcoes_privilegiadas;

CREATE FUNCTION app.criar_usuario(p_nome text, p_email text, p_hash_senha text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  INSERT INTO public.usuarios (nome, email, hash_senha)
  VALUES (p_nome, p_email, p_hash_senha)
  ON CONFLICT (email) DO NOTHING
  RETURNING id
$$;

CREATE FUNCTION app.buscar_credenciais(p_email text)
RETURNS TABLE (usuario_id uuid, hash_senha text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT u.id, u.hash_senha FROM public.usuarios u WHERE u.email = p_email
$$;

CREATE FUNCTION app.listar_vinculos(p_usuario_id uuid)
RETURNS TABLE (restaurante_id uuid, papel text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT v.restaurante_id, v.papel
    FROM public.vinculos v
    JOIN public.restaurantes r ON r.id = v.restaurante_id
   WHERE v.usuario_id = p_usuario_id AND r.situacao <> 'cancelado'
   ORDER BY v.criado_em, v.id
$$;

CREATE FUNCTION app.criar_sessao(
  p_hash_id text,
  p_publico text,
  p_titular_id uuid,
  p_restaurante_id uuid,
  p_nivel text,
  p_agora timestamptz,
  p_expira_em timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF p_publico = 'painel' THEN
    IF p_restaurante_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.vinculos v WHERE v.usuario_id = p_titular_id AND v.restaurante_id = p_restaurante_id
    ) THEN
      RETURN false;
    END IF;
    INSERT INTO public.sessoes (hash_id, publico, usuario_id, restaurante_atual_id, nivel, criada_em, ultimo_uso_em, expira_em)
    VALUES (p_hash_id, 'painel', p_titular_id, p_restaurante_id, p_nivel, p_agora, p_agora, p_expira_em);
    RETURN true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.administradores a WHERE a.id = p_titular_id AND a.ativo) THEN
    RETURN false;
  END IF;
  INSERT INTO public.sessoes (hash_id, publico, administrador_id, nivel, criada_em, ultimo_uso_em, expira_em)
  VALUES (p_hash_id, p_publico, p_titular_id, p_nivel, p_agora, p_agora, p_expira_em);
  RETURN true;
END
$$;

CREATE FUNCTION app.buscar_sessao(p_hash_id text)
RETURNS TABLE (
  sessao_id uuid,
  publico text,
  titular_id uuid,
  nivel text,
  restaurante_id uuid,
  papel text,
  criada_em timestamptz,
  ultimo_uso_em timestamptz,
  expira_em timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT s.id, s.publico, coalesce(s.usuario_id, s.administrador_id), s.nivel, s.restaurante_atual_id, v.papel,
         s.criada_em, s.ultimo_uso_em, s.expira_em
    FROM public.sessoes s
    LEFT JOIN public.vinculos v
      ON v.usuario_id = s.usuario_id AND v.restaurante_id = s.restaurante_atual_id
    LEFT JOIN public.administradores a ON a.id = s.administrador_id
   WHERE s.hash_id = p_hash_id
     AND s.revogada_em IS NULL
     AND (s.publico = 'painel' OR a.ativo)
$$;

CREATE FUNCTION app.renovar_sessao(p_hash_id text, p_agora timestamptz)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  UPDATE public.sessoes SET ultimo_uso_em = p_agora
   WHERE hash_id = p_hash_id AND revogada_em IS NULL AND ultimo_uso_em < p_agora
$$;

CREATE FUNCTION app.revogar_sessao(p_hash_id text, p_agora timestamptz)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  UPDATE public.sessoes SET revogada_em = p_agora WHERE hash_id = p_hash_id AND revogada_em IS NULL
$$;

CREATE FUNCTION app.definir_restaurante_da_sessao(p_hash_id text, p_restaurante_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  WITH alterada AS (
    UPDATE public.sessoes s SET restaurante_atual_id = p_restaurante_id
     WHERE s.hash_id = p_hash_id
       AND s.publico = 'painel'
       AND s.revogada_em IS NULL
       AND EXISTS (
         SELECT 1 FROM public.vinculos v WHERE v.usuario_id = s.usuario_id AND v.restaurante_id = p_restaurante_id
       )
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM alterada)
$$;

CREATE FUNCTION app.criar_token_redefinicao(
  p_email text,
  p_hash_token text,
  p_agora timestamptz,
  p_expira_em timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_usuario_id uuid;
BEGIN
  SELECT u.id INTO v_usuario_id FROM public.usuarios u WHERE u.email = p_email;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  UPDATE public.tokens_redefinicao_senha SET usado_em = p_agora
   WHERE usuario_id = v_usuario_id AND usado_em IS NULL;
  INSERT INTO public.tokens_redefinicao_senha (usuario_id, hash_token, criado_em, expira_em)
  VALUES (v_usuario_id, p_hash_token, p_agora, p_expira_em);
  RETURN true;
END
$$;

CREATE FUNCTION app.redefinir_senha(p_hash_token text, p_hash_senha text, p_agora timestamptz)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_usuario_id uuid;
BEGIN
  UPDATE public.tokens_redefinicao_senha SET usado_em = p_agora
   WHERE hash_token = p_hash_token AND usado_em IS NULL AND expira_em > p_agora
  RETURNING usuario_id INTO v_usuario_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  UPDATE public.usuarios SET hash_senha = p_hash_senha, atualizado_em = p_agora WHERE id = v_usuario_id;
  UPDATE public.sessoes SET revogada_em = p_agora WHERE usuario_id = v_usuario_id AND revogada_em IS NULL;
  RETURN true;
END
$$;

CREATE FUNCTION app.buscar_admin(p_email text)
RETURNS TABLE (
  administrador_id uuid,
  hash_senha text,
  troca_de_senha_obrigatoria boolean,
  segundo_fator_cadastrado boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT a.id, a.hash_senha, a.troca_de_senha_obrigatoria, a.segredo_totp_cifrado IS NOT NULL
    FROM public.administradores a
   WHERE a.email = p_email AND a.ativo
$$;

CREATE FUNCTION app.buscar_segundo_fator_admin(p_administrador_id uuid)
RETURNS TABLE (segredo_cifrado text, segredo_pendente_cifrado text, ultimo_passo bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT a.segredo_totp_cifrado, a.segredo_totp_pendente_cifrado, a.ultimo_passo_totp
    FROM public.administradores a
   WHERE a.id = p_administrador_id AND a.ativo
$$;

CREATE FUNCTION app.iniciar_cadastro_segundo_fator(p_administrador_id uuid, p_segredo_pendente_cifrado text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  WITH alterado AS (
    UPDATE public.administradores SET segredo_totp_pendente_cifrado = p_segredo_pendente_cifrado
     WHERE id = p_administrador_id AND ativo AND troca_de_senha_obrigatoria
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM alterado)
$$;

CREATE FUNCTION app.concluir_cadastro_segundo_fator(
  p_administrador_id uuid,
  p_passo bigint,
  p_hash_senha text,
  p_hashes_recuperacao text[],
  p_agora timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  UPDATE public.administradores
     SET segredo_totp_cifrado = segredo_totp_pendente_cifrado,
         segredo_totp_pendente_cifrado = NULL,
         ultimo_passo_totp = p_passo,
         hash_senha = p_hash_senha,
         troca_de_senha_obrigatoria = false,
         atualizado_em = p_agora
   WHERE id = p_administrador_id
     AND ativo
     AND troca_de_senha_obrigatoria
     AND segredo_totp_pendente_cifrado IS NOT NULL
     AND ultimo_passo_totp < p_passo;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  DELETE FROM public.codigos_recuperacao_admin WHERE administrador_id = p_administrador_id;
  INSERT INTO public.codigos_recuperacao_admin (administrador_id, hash_codigo)
  SELECT p_administrador_id, h FROM unnest(p_hashes_recuperacao) AS h;
  UPDATE public.sessoes SET revogada_em = p_agora
   WHERE administrador_id = p_administrador_id AND revogada_em IS NULL;
  RETURN true;
END
$$;

CREATE FUNCTION app.usar_passo_totp(p_administrador_id uuid, p_passo bigint)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  WITH alterado AS (
    UPDATE public.administradores SET ultimo_passo_totp = p_passo
     WHERE id = p_administrador_id AND ativo AND segredo_totp_cifrado IS NOT NULL AND ultimo_passo_totp < p_passo
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM alterado)
$$;

CREATE FUNCTION app.usar_codigo_recuperacao(p_administrador_id uuid, p_hash_codigo text, p_agora timestamptz)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  WITH usado AS (
    UPDATE public.codigos_recuperacao_admin SET usado_em = p_agora
     WHERE administrador_id = p_administrador_id AND hash_codigo = p_hash_codigo AND usado_em IS NULL
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM usado)
$$;

CREATE FUNCTION app.registrar_falha_login(
  p_publico text,
  p_alvo text,
  p_agora timestamptz,
  p_esquecer_antes_de timestamptz
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  INSERT INTO public.tentativas_login AS t (publico, alvo, falhas, ultima_falha_em)
  VALUES (p_publico, p_alvo, 1, p_agora)
  ON CONFLICT (publico, alvo) DO UPDATE
     SET falhas = CASE WHEN t.ultima_falha_em < p_esquecer_antes_de THEN 1 ELSE t.falhas + 1 END,
         ultima_falha_em = p_agora
  RETURNING falhas
$$;

CREATE FUNCTION app.consultar_tentativas_login(p_publico text, p_alvos text[])
RETURNS TABLE (alvo text, falhas integer, ultima_falha_em timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT t.alvo, t.falhas, t.ultima_falha_em
    FROM public.tentativas_login t
   WHERE t.publico = p_publico AND t.alvo = ANY (p_alvos)
$$;

CREATE FUNCTION app.limpar_tentativas_login(p_publico text, p_alvo text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  DELETE FROM public.tentativas_login WHERE publico = p_publico AND alvo = p_alvo
$$;

DO $$
DECLARE
  assinatura text;
BEGIN
  FOREACH assinatura IN ARRAY ARRAY[
    'app.criar_usuario(text, text, text)',
    'app.buscar_credenciais(text)',
    'app.listar_vinculos(uuid)',
    'app.criar_sessao(text, text, uuid, uuid, text, timestamptz, timestamptz)',
    'app.buscar_sessao(text)',
    'app.renovar_sessao(text, timestamptz)',
    'app.revogar_sessao(text, timestamptz)',
    'app.definir_restaurante_da_sessao(text, uuid)',
    'app.criar_token_redefinicao(text, text, timestamptz, timestamptz)',
    'app.redefinir_senha(text, text, timestamptz)',
    'app.buscar_admin(text)',
    'app.buscar_segundo_fator_admin(uuid)',
    'app.iniciar_cadastro_segundo_fator(uuid, text)',
    'app.concluir_cadastro_segundo_fator(uuid, bigint, text, text[], timestamptz)',
    'app.usar_passo_totp(uuid, bigint)',
    'app.usar_codigo_recuperacao(uuid, text, timestamptz)',
    'app.registrar_falha_login(text, text, timestamptz, timestamptz)',
    'app.consultar_tentativas_login(text, text[])',
    'app.limpar_tentativas_login(text, text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', assinatura);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO app_runtime', assinatura);
    EXECUTE format('ALTER FUNCTION %s OWNER TO funcoes_privilegiadas', assinatura);
  END LOOP;
END
$$;
