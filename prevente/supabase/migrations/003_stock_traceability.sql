-- Grossiste Pro — Migration 003 : traçabilité du stock (PROPOSÉE — NON APPLIQUÉE)
--
-- Prérequis : la migration 002 doit déjà être appliquée (tables stock_lots,
-- order_items, profiles…). Vérifier avant :
--   SELECT to_regclass('public.stock_lots'), to_regclass('public.order_items');
--
-- Impact : 100 % ADDITIVE. Deux nouvelles tables vides ; aucune table, colonne,
-- contrainte ou donnée existante n'est modifiée ni supprimée. Ne touche ni au
-- schéma auth ni à public.profiles. Réversible : DROP TABLE des deux tables
-- (aucune autre table n'en dépend).
-- À exécuter d'abord sur une base de test / branche Supabase, dans une transaction.
--
-- Pourquoi :
--  * stock_adjustments : trace de chaque correction manuelle d'inventaire.
--  * order_item_allocations : quelles quantités de quels lots ont été prélevées
--    (FEFO) pour chaque ligne de commande => restitution exacte à l'annulation
--    et impossibilité de restituer deux fois (released_at).
--
-- ⚠ Les commandes déjà existantes n'ont pas d'allocation : annuler l'une d'elles
--   ne restituera aucun stock (rien n'avait été suivi pour elle).

BEGIN;

CREATE TABLE public.stock_adjustments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id            UUID NOT NULL,
  previous_quantity INTEGER NOT NULL,
  new_quantity      INTEGER NOT NULL,
  reason            TEXT NOT NULL,
  changed_by_id     UUID NOT NULL,
  created_at        TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT stock_adjustments_lot_id_fkey FOREIGN KEY (lot_id)
    REFERENCES public.stock_lots (id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT stock_adjustments_changed_by_id_fkey FOREIGN KEY (changed_by_id)
    REFERENCES public.profiles (id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT stock_adjustments_quantities_check CHECK (previous_quantity >= 0 AND new_quantity >= 0)
);
CREATE INDEX stock_adjustments_lot_id_created_at_idx ON public.stock_adjustments (lot_id, created_at);
CREATE INDEX stock_adjustments_changed_by_id_idx ON public.stock_adjustments (changed_by_id);

CREATE TABLE public.order_item_allocations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id UUID NOT NULL,
  lot_id        UUID NOT NULL,
  quantity      INTEGER NOT NULL,
  created_at    TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  released_at   TIMESTAMPTZ(6),
  CONSTRAINT order_item_allocations_order_item_id_fkey FOREIGN KEY (order_item_id)
    REFERENCES public.order_items (id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT order_item_allocations_lot_id_fkey FOREIGN KEY (lot_id)
    REFERENCES public.stock_lots (id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT order_item_allocations_quantity_check CHECK (quantity > 0)
);
CREATE INDEX order_item_allocations_order_item_id_idx ON public.order_item_allocations (order_item_id);
CREATE INDEX order_item_allocations_lot_id_idx ON public.order_item_allocations (lot_id);

-- Même modèle de sécurité que la migration 002 : accès serveur uniquement (Prisma),
-- RLS activée sans politique + REVOKE pour anon/authenticated.
ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stock_adjustments FROM anon, authenticated;
REVOKE ALL ON public.order_item_allocations FROM anon, authenticated;

COMMIT;
