SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Preços provisórios; trocar com uma migração nova igual a esta: docs/adr/0014-assinaturas-e-cobranca.md
INSERT INTO public.planos (codigo, nome, preco_centavos, limite_mesas, recursos)
VALUES
  ('basico', 'Básico', 9900, 10, '{}'::jsonb),
  ('pro', 'Pro', 14900, 30, '{}'::jsonb)
ON CONFLICT (codigo) DO UPDATE
  SET nome = EXCLUDED.nome,
      preco_centavos = EXCLUDED.preco_centavos,
      limite_mesas = EXCLUDED.limite_mesas,
      ativo = true;
