# Nouveaux affichages — Grossiste Pro

Décompressez ce zip **à la racine du projet** (là où se trouve package.json) et acceptez de remplacer les fichiers.
Aucun changement de base de données, d'actions serveur ni de dépendances. Puis : `npm run dev`.

## Fichiers nouveaux
- components/app-header.tsx : en-tête unique (logo, espace, déconnexion, navigation), collé en haut de l'écran
- components/filter-chips.tsx : filtres en pastilles (un seul toucher)
- components/empty-state.tsx : écrans vides explicites avec action
- app/vendeur/loading.tsx : squelette de chargement de l'espace pré-vendeur

## Ce qui change (par écran)
- Toute l'application : en-tête commun (il était copié 3 fois), navigation collante avec indice de défilement, zones tactiles >= 40 px, tailles de texte des liens « Modifier » agrandies, mouvement réduit respecté.
- Admin > Tableau de bord : période en pastilles (Aujourd'hui / 7 jours / Mois) + période personnalisée repliée, règles de calcul repliées, alerte stock plus visible, raccourcis compacts.
- Admin > Commandes : pastilles de statut, cartes sur téléphone (plus de tableau à faire défiler), état vide utile.
- Admin > Commande : lien de retour au-dessus du titre, historique en frise, boutons pleine largeur sur téléphone.
- Admin > Clients / Utilisateurs / Stock : filtres en pastilles, états vides, actions plus faciles à toucher, tableau de stock sans défilement horizontal.
- Admin > Planning : jours en boutons cochables, libellé du bouton simplifié.
- Admin > Journées : dates lisibles, cartes sur téléphone.
- Admin > Produits : liste repliée avec alertes, une ligne par parfum, modification dans le détail.
- Pré-vendeur : barre d'avancement de la tournée, onglets raccourcis, boutons - / + pour les quantités, total estimé dans la barre du bas.
