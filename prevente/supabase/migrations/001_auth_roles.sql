-- Grossiste Pro — Migration 001 : durcissement de public.profiles
-- À exécuter dans Supabase > SQL Editor. Idempotente (peut être relancée sans risque).
-- Ne supprime ni ne désactive aucune politique RLS existante.

-- 1. La RLS reste activée (sans effet si déjà le cas).
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Aucun utilisateur connecté ne peut écrire dans profiles depuis l'application :
--    impossible de modifier son propre role / is_active.
--    Les profils sont créés et modifiés par SQL Editor (ou, plus tard, par le serveur
--    avec une vérification stricte du rôle admin).
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM anon, authenticated;
REVOKE ALL ON public.profiles FROM anon;

-- 3. Fonction utilitaire : l'utilisateur courant est-il un admin actif ?
--    SECURITY DEFINER pour éviter la récursion RLS sur profiles.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin' AND is_active = TRUE
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- 4. Un admin peut consulter tous les profils (utile pour la future gestion des utilisateurs).
--    La politique « lecture de son propre profil » existante est conservée.
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- 5. Maintien automatique de updated_at.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
