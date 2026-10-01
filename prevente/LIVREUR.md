# Module livreur — Grossiste Pro

## Pages
| Page | Rôle |
|---|---|
| `/livreur/dashboard` | Indicateurs (à livrer, en cours, livrées, échecs, CA livré), progression de la tournée, période, raccourcis, « Actualiser » |
| `/livreur/commandes` | Commandes à livrer (recherche instantanée, pagination) |
| `/livreur/commandes/[id]` | Détail, « Commencer », « Confirmer la livraison », « Livraison non effectuée », tentatives |
| `/livreur/livraisons` | Livraisons du jour : Toutes / À livrer / En cours / Livrées / Échec |
| `/livreur/historique` | Historique par tentative, filtres statut et dates |

## Règles
- **Statuts** : ceux de la commande, aucun nouveau. `assignee → en_livraison → livree`. Échec : `en_livraison → assignee` (même livreur, nouvelle tentative). L'« échec » est dérivé de la dernière tentative (`delivery_attempts`).
- **Éligibilité** : affectation courante à ce livreur + statut `assignee`/`en_livraison` + (pas de journée **ou** journée du pré-vendeur `cloturee`). La clôture fait passer les commandes confirmées de `brouillon` à `en_attente` (réservation du stock), l'admin les affecte ensuite.
- **Affectation** : celle de l'admin (`order_assignments`). Le livreur ne s'approprie rien ; commande d'un autre livreur = « introuvable ».
- **Stock** : jamais modifié à la livraison (réservé à la clôture, restitué à l'annulation).
- **CA livré** : Σ quantité × prix unitaire des lignes des commandes `livree` ayant une tentative `livree` de ce livreur dont `ended_at` est dans la période. Prix historiques, une commande comptée une fois (index unique partiel).
- **Paiement** : aucun suivi de paiement dans le modèle → « à encaisser » / « encaissé » non affichés.
- **Échec** : motif obligatoire (« Autre » → commentaire obligatoire), tentative conservée, note ajoutée à l'historique de statuts visible de l'admin.
- **Actualiser** : les données sont lues directement en base ; le bouton relit les commandes affectées (pas de système externe).

## Migration 007 (manuelle, non appliquée)
Fichier : `supabase/migrations/007_delivery_attempts.sql` — additive, idempotente, aucune donnée existante touchée.
1. Sauvegarde / branche de test. 2. Supabase > SQL Editor : coller et exécuter le fichier. 3. Vérifier (requêtes en bas du fichier) : table présente, 0 ligne, 5 index, RLS activée. 4. Seulement ensuite : déployer le code.
Retour arrière : `DROP TABLE public.delivery_attempts; DROP TYPE public.delivery_failure_reason, public.delivery_attempt_result;`
Le client Prisma (`app/generated/prisma`) a été régénéré localement (`prisma generate`, aucun accès base).

## Tests
`npm test` : règles pures. Intégration (base jetable locale uniquement, refuse tout hôte non local) :
`LIVREUR_TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/base_jetable npx vitest run tests/livreur.db.test.ts`
(base avec migrations 002 à 007 appliquées).
