-- Grossiste Pro — Migration 002 : schéma métier (BROUILLON — NON APPLIQUÉ)
-- À relire puis exécuter manuellement dans Supabase > SQL Editor (idéalement d'abord
-- sur une branche Supabase ou une base de test). Ne touche NI à public.profiles
-- (structure), NI au schéma auth. Ne supprime rien. Reflète prisma/schema.prisma.
-- Non idempotent : à exécuter une seule fois, dans une transaction.

BEGIN;

-- 1. Enums --------------------------------------------------------------------
CREATE TYPE public.sale_unit AS ENUM ('carton','sachet','triplette','pot','boite','bouteille','unite');
CREATE TYPE public.order_status AS ENUM ('brouillon','en_attente','assignee','en_livraison','livree','annulee');

-- 2. Catalogue ----------------------------------------------------------------
CREATE TABLE public.categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) NOT NULL
);
CREATE UNIQUE INDEX categories_name_key ON public.categories (name);

CREATE TABLE public.products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  category_id UUID,
  sale_unit   public.sale_unit NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id)
    REFERENCES public.categories (id) ON DELETE RESTRICT ON UPDATE NO ACTION
);
CREATE INDEX products_category_id_idx ON public.products (category_id);
CREATE INDEX products_name_idx ON public.products (name);

CREATE TABLE public.product_variants (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       UUID NOT NULL,
  name             TEXT NOT NULL,
  sku              TEXT,
  image_public_id  TEXT,
  image_secure_url TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT product_variants_product_id_fkey FOREIGN KEY (product_id)
    REFERENCES public.products (id) ON DELETE RESTRICT ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX product_variants_sku_key ON public.product_variants (sku);
CREATE UNIQUE INDEX product_variants_product_id_name_key ON public.product_variants (product_id, name);

-- 3. Stock par lot ------------------------------------------------------------
CREATE TABLE public.stock_lots (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id         UUID NOT NULL,
  lot_number         TEXT,
  initial_quantity   INTEGER NOT NULL,
  available_quantity INTEGER NOT NULL,
  expires_at         DATE,
  received_at        DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at         TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT stock_lots_variant_id_fkey FOREIGN KEY (variant_id)
    REFERENCES public.product_variants (id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT stock_lots_initial_quantity_check   CHECK (initial_quantity > 0),
  CONSTRAINT stock_lots_available_quantity_check CHECK (available_quantity >= 0 AND available_quantity <= initial_quantity)
);
CREATE UNIQUE INDEX stock_lots_variant_id_lot_number_key ON public.stock_lots (variant_id, lot_number);
CREATE INDEX stock_lots_variant_id_expires_at_idx ON public.stock_lots (variant_id, expires_at);
CREATE INDEX stock_lots_expires_at_idx ON public.stock_lots (expires_at);
CREATE INDEX stock_lots_fefo_available_idx ON public.stock_lots (variant_id, expires_at) WHERE (available_quantity > 0);

-- 4. Clients et photos --------------------------------------------------------
CREATE TABLE public.customers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name   TEXT NOT NULL,
  phone           TEXT,
  address         TEXT NOT NULL,
  google_maps_url TEXT,
  notes           TEXT,
  created_by_id   UUID NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT customers_created_by_id_fkey FOREIGN KEY (created_by_id)
    REFERENCES public.profiles (id) ON DELETE RESTRICT ON UPDATE NO ACTION
);
CREATE INDEX customers_created_by_id_idx ON public.customers (created_by_id);
CREATE INDEX customers_business_name_idx ON public.customers (business_name);

CREATE TABLE public.customer_photos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      UUID NOT NULL,
  image_secure_url TEXT NOT NULL,
  image_public_id  TEXT NOT NULL,
  taken_at         TIMESTAMPTZ(6),
  added_by_id      UUID NOT NULL,
  caption          TEXT,
  created_at       TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT customer_photos_customer_id_fkey FOREIGN KEY (customer_id)
    REFERENCES public.customers (id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT customer_photos_added_by_id_fkey FOREIGN KEY (added_by_id)
    REFERENCES public.profiles (id) ON DELETE RESTRICT ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX customer_photos_image_public_id_key ON public.customer_photos (image_public_id);
CREATE INDEX customer_photos_customer_id_idx ON public.customer_photos (customer_id);
CREATE INDEX customer_photos_added_by_id_idx ON public.customer_photos (added_by_id);

-- 5. Commandes ----------------------------------------------------------------
CREATE TABLE public.orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number        SERIAL NOT NULL,
  customer_id   UUID NOT NULL,
  created_by_id UUID NOT NULL,
  status        public.order_status NOT NULL DEFAULT 'brouillon',
  notes         TEXT,
  created_at    TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id)
    REFERENCES public.customers (id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT orders_created_by_id_fkey FOREIGN KEY (created_by_id)
    REFERENCES public.profiles (id) ON DELETE RESTRICT ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX orders_number_key ON public.orders (number);
CREATE INDEX orders_status_idx ON public.orders (status);
CREATE INDEX orders_customer_id_idx ON public.orders (customer_id);
CREATE INDEX orders_created_by_id_idx ON public.orders (created_by_id);
CREATE INDEX orders_created_at_idx ON public.orders (created_at);

CREATE TABLE public.order_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              UUID NOT NULL,
  variant_id            UUID NOT NULL,
  product_name_snapshot TEXT NOT NULL,
  flavor_name_snapshot  TEXT NOT NULL,
  sale_unit_snapshot    public.sale_unit NOT NULL,
  quantity              INTEGER NOT NULL,
  unit_price            DECIMAL(12,2) NOT NULL,
  created_at            TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id)
    REFERENCES public.orders (id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT order_items_variant_id_fkey FOREIGN KEY (variant_id)
    REFERENCES public.product_variants (id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT order_items_quantity_check   CHECK (quantity > 0),
  CONSTRAINT order_items_unit_price_check CHECK (unit_price >= 0)
);
CREATE UNIQUE INDEX order_items_order_id_variant_id_key ON public.order_items (order_id, variant_id);
CREATE INDEX order_items_variant_id_idx ON public.order_items (variant_id);

CREATE TABLE public.order_status_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL,
  from_status   public.order_status,
  to_status     public.order_status NOT NULL,
  changed_by_id UUID NOT NULL,
  note          TEXT,
  created_at    TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT order_status_history_order_id_fkey FOREIGN KEY (order_id)
    REFERENCES public.orders (id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT order_status_history_changed_by_id_fkey FOREIGN KEY (changed_by_id)
    REFERENCES public.profiles (id) ON DELETE RESTRICT ON UPDATE NO ACTION
);
CREATE INDEX order_status_history_order_id_created_at_idx ON public.order_status_history (order_id, created_at);
CREATE INDEX order_status_history_changed_by_id_idx ON public.order_status_history (changed_by_id);

CREATE TABLE public.order_assignments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID NOT NULL,
  driver_id      UUID NOT NULL,
  assigned_by_id UUID NOT NULL,
  assigned_at    TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  unassigned_at  TIMESTAMPTZ(6),
  CONSTRAINT order_assignments_order_id_fkey FOREIGN KEY (order_id)
    REFERENCES public.orders (id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT order_assignments_driver_id_fkey FOREIGN KEY (driver_id)
    REFERENCES public.profiles (id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT order_assignments_assigned_by_id_fkey FOREIGN KEY (assigned_by_id)
    REFERENCES public.profiles (id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT order_assignments_dates_check CHECK (unassigned_at IS NULL OR unassigned_at >= assigned_at)
);
CREATE UNIQUE INDEX order_assignments_one_active_per_order_key
  ON public.order_assignments (order_id) WHERE (unassigned_at IS NULL);
CREATE INDEX order_assignments_order_id_idx ON public.order_assignments (order_id);
CREATE INDEX order_assignments_driver_id_unassigned_at_idx ON public.order_assignments (driver_id, unassigned_at);
CREATE INDEX order_assignments_assigned_by_id_idx ON public.order_assignments (assigned_by_id);

-- 6. Sécurité : aucun accès direct via l'API Supabase (PostgREST) ----------------
-- Supabase accorde par défaut des droits à anon/authenticated sur les nouvelles tables
-- de `public`. Ces tables sont lues/écrites uniquement par le serveur Next.js
-- (Prisma, rôle propriétaire qui contourne la RLS). RLS activée sans aucune politique
-- = refus total pour anon/authenticated ; les REVOKE en sont la 2e barrière.
-- Ajouter des politiques RLS plus tard SEULEMENT si le client navigateur doit
-- interroger ces tables directement (non prévu).
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'categories','products','product_variants','stock_lots','customers','customer_photos',
    'orders','order_items','order_status_history','order_assignments'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;
REVOKE ALL ON SEQUENCE public.orders_number_seq FROM anon, authenticated;

-- 7. Optionnel (à décider) : restreindre profiles.role aux 3 rôles connus.
-- Vérifier d'abord qu'aucune ligne existante n'a une autre valeur.
-- ALTER TABLE public.profiles
--   ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin','vendeur','livreur'));

COMMIT;
