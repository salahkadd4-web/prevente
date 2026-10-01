-- Grossiste Pro — Migration 007 : module livreur / tentatives de livraison (PROPOSÉE — NON APPLIQUÉE)
--
-- Prérequis : migrations 002 à 006 déjà appliquées (tables orders, order_assignments, profiles).
--
-- Contenu :
--  * delivery_attempt_result  : en_cours | livree | echec | interrompue
--  * delivery_failure_reason  : client_absent | client_refuse | adresse_introuvable | client_injoignable | autre
--  * delivery_attempts        : une ligne par tentative de livraison (journal append-only, jamais écrasé).
--      - « Commencer la livraison »      -> ligne `en_cours` (une seule ouverte par commande) ;
--      - « Confirmer la livraison »      -> la ligne passe à `livree` (une seule par commande) ;
--      - « Livraison non effectuée »     -> la ligne passe à `echec` + motif (+ commentaire).
--      - `interrompue` : tentative restée ouverte quand l'admin a réaffecté la commande à un autre
--        livreur ; elle est refermée automatiquement au démarrage par le nouveau livreur.
--
-- AUCUN nouveau statut de commande : les statuts existants (assignee / en_livraison / livree / annulee)
-- sont réutilisés. Une livraison échouée ramène la commande à « assignee » (même livreur, nouvelle
-- tentative possible).
--
-- Impact : 100 % ADDITIVE. Aucune table existante n'est modifiée, aucune donnée existante n'est touchée.
-- Idempotente (CREATE ... IF NOT EXISTS / blocs DO). Ne touche ni au schéma auth ni à public.profiles.
--
-- Réversible (aucune donnée métier existante n'est concernée) :
--   DROP TABLE public.delivery_attempts;
--   DROP TYPE public.delivery_failure_reason, public.delivery_attempt_result;
--
-- ⚠ À appliquer AVANT de déployer le code livreur. À tester d'abord sur une branche / base de test.

BEGIN;

-- 1. Types ----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.delivery_attempt_result AS ENUM ('en_cours', 'livree', 'echec', 'interrompue');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.delivery_failure_reason AS ENUM
    ('client_absent', 'client_refuse', 'adresse_introuvable', 'client_injoignable', 'autre');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Tentatives de livraison ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.delivery_attempts (
  id             UUID                          PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID                          NOT NULL REFERENCES public.orders(id)   ON DELETE RESTRICT,
  driver_id      UUID                          NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  started_at     TIMESTAMPTZ                   NOT NULL DEFAULT now(),
  ended_at       TIMESTAMPTZ,
  result         public.delivery_attempt_result NOT NULL DEFAULT 'en_cours',
  failure_reason public.delivery_failure_reason,
  comment        TEXT,
  created_at     TIMESTAMPTZ                   NOT NULL DEFAULT now(),
  -- ended_at est NULL si et seulement si la tentative est encore en cours.
  CONSTRAINT delivery_attempts_ended_check CHECK ((result = 'en_cours') = (ended_at IS NULL)),
  -- Un motif existe si et seulement si la tentative est un échec.
  CONSTRAINT delivery_attempts_reason_check CHECK ((result = 'echec') = (failure_reason IS NOT NULL)),
  -- Motif « autre » : commentaire obligatoire ; commentaire limité à 500 caractères.
  CONSTRAINT delivery_attempts_comment_check CHECK (
    (failure_reason IS DISTINCT FROM 'autre' OR length(btrim(coalesce(comment, ''))) > 0)
    AND (comment IS NULL OR length(comment) <= 500)
  )
);

-- Au plus une tentative ouverte et une seule livraison réussie par commande :
-- pas de double démarrage, pas de double confirmation, pas de double comptage du chiffre d'affaires.
CREATE UNIQUE INDEX IF NOT EXISTS delivery_attempts_one_open_per_order_key
  ON public.delivery_attempts (order_id) WHERE result = 'en_cours';
CREATE UNIQUE INDEX IF NOT EXISTS delivery_attempts_one_delivered_per_order_key
  ON public.delivery_attempts (order_id) WHERE result = 'livree';

CREATE INDEX IF NOT EXISTS delivery_attempts_order_started_idx ON public.delivery_attempts (order_id, started_at);
CREATE INDEX IF NOT EXISTS delivery_attempts_driver_result_ended_idx ON public.delivery_attempts (driver_id, result, ended_at);

-- 3. Sécurité : mêmes règles que les autres tables métier (accès serveur uniquement) ---------
ALTER TABLE public.delivery_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.delivery_attempts FROM anon, authenticated;

COMMIT;

-- Vérification après application (à lancer à la main) :
--   SELECT to_regclass('public.delivery_attempts');                                  -- non NULL
--   SELECT count(*) FROM public.delivery_attempts;                                   -- 0
--   SELECT indexname FROM pg_indexes WHERE tablename = 'delivery_attempts' ORDER BY 1; -- 5 index (+ pkey)
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.delivery_attempts'::regclass; -- t
