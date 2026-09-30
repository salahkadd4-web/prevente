-- Grossiste Pro — Migration 005 : prix de vente et prix d'achat (PROPOSÉE — NON APPLIQUÉE)
--
-- Prérequis : migrations 002, 003 et 004 déjà appliquées. Vérifier avant :
--   SELECT to_regclass('public.stock_lots'), to_regclass('public.order_item_allocations');
--
-- Modèle retenu :
--  * products.sale_price          : prix de vente catalogue par unité de vente (défaut du produit).
--  * product_variants.sale_price  : prix de vente propre à un parfum ; NULL = utilise celui du produit.
--  * stock_lots.unit_cost         : prix d'achat unitaire de CE lot (un lot = un achat distinct).
--                                   Une nouvelle réception avec un nouveau prix crée un nouveau lot :
--                                   les anciens lots ne sont jamais écrasés (historique conservé).
--  * order_items.unit_price       : INCHANGÉ — c'est déjà l'instantané du prix de vente au moment de la
--                                   commande. Modifier un prix catalogue ne touche donc aucune commande.
--
-- Idempotente (peut être relancée sans risque).
-- Impact : 100 % ADDITIVE. Trois colonnes NULLABLES, sans valeur par défaut ; aucune ligne existante
-- n'est modifiée, aucune donnée supprimée. Ne touche ni au schéma auth ni à public.profiles.
--  * Produits / parfums existants : prix de vente NULL = « non défini » (à renseigner depuis l'admin).
--  * Lots existants : prix d'achat NULL = « inconnu ». Le dashboard signale ces lots au lieu d'inventer
--    un coût ; l'admin peut renseigner le prix d'achat d'un ancien lot une seule fois (NULL -> valeur).
-- Réversible :
--   ALTER TABLE public.products         DROP COLUMN sale_price;
--   ALTER TABLE public.product_variants DROP COLUMN sale_price;
--   ALTER TABLE public.stock_lots       DROP COLUMN unit_cost;
-- À tester d'abord sur une branche / base de test.
--
-- ⚠ À appliquer AVANT de déployer le code : le client Prisma sélectionne ces colonnes ;
--   sans elles, les pages Produits et Stock échouent.

BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sale_price NUMERIC(12,2);
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS sale_price NUMERIC(12,2);
ALTER TABLE public.stock_lots
  ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12,2);

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_sale_price_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_sale_price_check CHECK (sale_price IS NULL OR sale_price >= 0);
ALTER TABLE public.product_variants DROP CONSTRAINT IF EXISTS product_variants_sale_price_check;
ALTER TABLE public.product_variants
  ADD CONSTRAINT product_variants_sale_price_check CHECK (sale_price IS NULL OR sale_price >= 0);
ALTER TABLE public.stock_lots DROP CONSTRAINT IF EXISTS stock_lots_unit_cost_check;
ALTER TABLE public.stock_lots
  ADD CONSTRAINT stock_lots_unit_cost_check CHECK (unit_cost IS NULL OR unit_cost >= 0);

COMMIT;
