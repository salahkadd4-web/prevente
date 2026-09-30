-- Grossiste Pro — Migration 004 : photo au niveau du produit (PROPOSÉE — NON APPLIQUÉE)
--
-- Permet d'ajouter une photo directement à un produit (notamment sans parfum).
-- Seules les références Cloudinary sont stockées (public_id + secure_url), jamais le fichier.
--
-- Impact : 100 % ADDITIVE. Deux colonnes NULLABLES sur public.products, sans valeur
-- par défaut : aucune ligne existante n'est modifiée, aucune contrainte touchée, verrou
-- très bref. Ne touche ni au schéma auth ni à public.profiles. Réversible :
--   ALTER TABLE public.products DROP COLUMN image_public_id, DROP COLUMN image_secure_url;
-- À tester d'abord sur une branche / base de test.
--
-- ⚠ À appliquer AVANT de déployer le code : le client Prisma sélectionne ces colonnes ;
--   sans elles, la page /admin/products échoue.

BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS image_public_id  TEXT,
  ADD COLUMN IF NOT EXISTS image_secure_url TEXT;

COMMIT;
