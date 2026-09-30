-- Grossiste Pro — Migration 006 : module pré-vendeur (PROPOSÉE — NON APPLIQUÉE)
--
-- Prérequis : migrations 002 à 005 déjà appliquées.
--
-- Contenu :
--  * customer_schedules  : planning hebdomadaire (client x pré-vendeur x jour ISO 1=lundi … 7=dimanche).
--                          Le vendredi (5) est interdit : aucun client n'y est planifié automatiquement.
--  * work_days           : journée de travail d'un pré-vendeur (une seule par pré-vendeur et par date).
--  * work_day_customers  : clients de la journée (planifiés ou ajoutés à la main). Retrait = removed_at
--                          (l'historique est conservé).
--  * visits              : une visite par client et par journée ; résultat « sans commande » + motif.
--  * orders              : 3 colonnes NULLABLES ajoutées (work_day_id, visit_id, confirmed_at).
--
-- Impact : 100 % ADDITIVE. Aucune donnée existante n'est modifiée ni supprimée. Les commandes
-- existantes gardent work_day_id / visit_id / confirmed_at = NULL. Idempotente.
-- Ne touche ni au schéma auth ni à public.profiles.
--
-- Réversible :
--   ALTER TABLE public.orders DROP COLUMN work_day_id, DROP COLUMN visit_id, DROP COLUMN confirmed_at;
--   DROP TABLE public.visits, public.work_day_customers, public.work_days, public.customer_schedules;
--   DROP TYPE public.visit_status, public.no_order_reason, public.work_day_status, public.work_day_customer_source;
--
-- ⚠ À appliquer AVANT de déployer le code. À tester d'abord sur une branche / base de test.

BEGIN;

-- 1. Types ----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.work_day_status AS ENUM ('ouverte', 'cloturee');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.work_day_customer_source AS ENUM ('planning', 'manuel');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- « À faire » n'est pas un statut stocké : c'est l'absence de ligne dans visits.
DO $$ BEGIN
  CREATE TYPE public.visit_status AS ENUM ('en_cours', 'commandee', 'sans_commande', 'annulee');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.no_order_reason AS ENUM ('client_absent', 'pas_de_besoin', 'produit_indisponible');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Planning hebdomadaire -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_schedules (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID        NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  vendeur_id  UUID        NOT NULL REFERENCES public.profiles(id)  ON DELETE RESTRICT,
  weekday     SMALLINT    NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT customer_schedules_weekday_check CHECK (weekday BETWEEN 1 AND 7 AND weekday <> 5),
  CONSTRAINT customer_schedules_unique UNIQUE (customer_id, vendeur_id, weekday)
);
CREATE INDEX IF NOT EXISTS customer_schedules_vendeur_weekday_idx ON public.customer_schedules (vendeur_id, weekday);

-- 3. Journées de travail -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_days (
  id          UUID                   PRIMARY KEY DEFAULT gen_random_uuid(),
  vendeur_id  UUID                   NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  work_date   DATE                   NOT NULL,
  status      public.work_day_status NOT NULL DEFAULT 'ouverte',
  started_at  TIMESTAMPTZ            NOT NULL DEFAULT now(),
  closed_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ            NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ            NOT NULL DEFAULT now(),
  CONSTRAINT work_days_vendeur_date_key UNIQUE (vendeur_id, work_date),
  CONSTRAINT work_days_closed_check CHECK ((status = 'cloturee') = (closed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS work_days_work_date_idx ON public.work_days (work_date);

CREATE TABLE IF NOT EXISTS public.work_day_customers (
  id          UUID                          PRIMARY KEY DEFAULT gen_random_uuid(),
  work_day_id UUID                          NOT NULL REFERENCES public.work_days(id) ON DELETE RESTRICT,
  customer_id UUID                          NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  source      public.work_day_customer_source NOT NULL,
  added_at    TIMESTAMPTZ                   NOT NULL DEFAULT now(),
  removed_at  TIMESTAMPTZ,
  CONSTRAINT work_day_customers_unique UNIQUE (work_day_id, customer_id)
);
CREATE INDEX IF NOT EXISTS work_day_customers_customer_idx ON public.work_day_customers (customer_id);

-- 4. Visites ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.visits (
  id              UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  work_day_id     UUID                 NOT NULL REFERENCES public.work_days(id) ON DELETE RESTRICT,
  customer_id     UUID                 NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  vendeur_id      UUID                 NOT NULL REFERENCES public.profiles(id)  ON DELETE RESTRICT,
  status          public.visit_status  NOT NULL DEFAULT 'en_cours',
  no_order_reason public.no_order_reason,
  started_at      TIMESTAMPTZ          NOT NULL DEFAULT now(),
  ended_at        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ          NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ          NOT NULL DEFAULT now(),
  CONSTRAINT visits_work_day_customer_key UNIQUE (work_day_id, customer_id),
  -- Un motif existe si et seulement si la visite est terminée sans commande.
  CONSTRAINT visits_reason_check CHECK ((status = 'sans_commande') = (no_order_reason IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS visits_vendeur_idx   ON public.visits (vendeur_id);
CREATE INDEX IF NOT EXISTS visits_customer_idx  ON public.visits (customer_id);
CREATE INDEX IF NOT EXISTS visits_work_day_status_idx ON public.visits (work_day_id, status);

-- 5. Lien commandes -> journée / visite ----------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS work_day_id  UUID REFERENCES public.work_days(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS visit_id     UUID REFERENCES public.visits(id)    ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS orders_work_day_id_idx ON public.orders (work_day_id);
-- Au plus une commande ACTIVE (non annulée) par visite : une commande annulée peut être remplacée.
CREATE UNIQUE INDEX IF NOT EXISTS orders_one_active_per_visit_key
  ON public.orders (visit_id) WHERE visit_id IS NOT NULL AND status <> 'annulee';

-- 6. Sécurité : mêmes règles que les autres tables métier (accès serveur uniquement) -----------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['customer_schedules','work_days','work_day_customers','visits'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;

COMMIT;
