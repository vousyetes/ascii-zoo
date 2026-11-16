# Spec Terrarium (reçue de David, à intégrer au moteur ascii zoo)

Idée d'origine : une page HTML où tout l'écran est une grille fine ; les animaux sont faits de cases allumées. Chaque case prend la couleur du motif et affiche un caractère ASCII quand une bête passe dessus, puis s'efface en traînée. Notre moteur (src/renderer.ts, Pen, pen.shape, pen.spot, pen.shed) fait déjà ça : on réutilise le moteur, on n'écrit pas un nouveau rendu.

## Salamandres (onglet par défaut de l'original)
- 8 à 12, réparties au hasard sur l'écran, chacune marche seule. Jamais en troupeau.
- Corps = chaîne de 17 points espacés de 0,9 cellule. La tête dirige, chaque point suivant est tiré pour rester exactement à un espacement derrière le précédent (follow-the-leader).
- Rayons de la tête à la queue (en cellules) : 0.9, 1.05, 0.78 (cou), 1.1, 1.22, 1.25, 1.22, 1.12, 0.98, 0.82, 0.68, 0.56, 0.46, 0.37, 0.3, 0.24, 0.2. Taille aléatoire 0,9 à 1,22.
- Marche par à-coups : marche 0,7 à 2,9 s, pause 0,35 à 1,5 s avec un petit regard autour. Ondulation latérale : cap += sin(gait) * 0.42, gait avance avec la distance parcourue. Virage max ~2,2 rad/s. Murs doux.
- 4 pattes aux points 3 et 8 : deux capsules chacune (cuisse + jambe finissant par un pied un peu plus large), allure en diagonale.
- Yeux : deux cellules d'accent sur les côtés de la tête.
- 6 motifs, tous utilisés : axolotl (rose 244,168,190, tachetures pâles + 3 branchies de chaque côté de la tête qui ondulent), salamandre de feu (ardoise 46,48,56 avec grandes taches jaunes 246,198,52, yeux jaunes), gecko léopard (sable 236,198,108, taches brun foncé), triton (orange 242,128,58, taches rouges, ligne dorsale chaude), scinque (brun foncé, deux bandes crème, queue qui vire au bleu électrique 76,162,255), émeraude (vert 104,198,122, points pâles). Les taches viennent d'un hash de (floor(position le long du corps * 1.15 + graine), round(latéral * 1.6)) pour suivre l'animal.
- Un peu plus sombre vers les flancs.

## Nourrir (clic n'importe où)
- Un clic lâche 6 ou 7 grillons : 1 case d'accent jaune-vert vif + 1 case de bord derrière. Ils sautent en petit arc toutes les 0,6 à 2,2 s, et sautent plus vite quand une tête approche à ~80 px.
- Chaque salamandre choisit le grillon le plus proche, se tourne vers lui et le traque : sprint, gel 0,1 à 0,5 s, sprint, ralentit de près.
- À ~4,6 cellules et face à la tête : coup de langue. Langue = fine capsule rose (255,112,150) qui part au grillon en 0,13 s et revient en 0,13 s avec lui. Puis courte pause.
- Chaque clic dessine aussi une onde : un anneau de cases qui s'allume et s'étend jusqu'à ~8 cellules. Clic maintenu = continue de lâcher des grillons.

## Lucioles
- ~1 pour 9000 px² d'écran. Chacune : une case + un halo de cases dont le rayon grandit avec l'éclair. Dérive en bruit sinusoïdal lisse, éclair bref (pow(max(0, cos(phase)), 10)). Synchro de Kuramoto : phase += (fréquence propre + 1.5 * r * sin(phase moyenne - phase)) * dt, r = paramètre d'ordre. Afficher "sync XX%" quelque part discret (ou ne pas l'afficher). Clic = lâcher du nectar : une tache chaude qui pulse, que les lucioles orbitent et vident lentement. Scène un peu plus sombre.

## Fourmis
- 3 cellules par fourmi (abdomen, thorax plus sombre, tête) + 2 cellules de bord comme pattes qui alternent "/" et "\" avec la marche. Une fourmilière (anneau de cases brunes autour d'un "@" sombre) en bas à gauche. Elles errent au hasard. Clic = lâcher un morceau de sucre (bloc carré d'~22 cases blanches). Elles y vont, prennent une case chacune, la portent (case blanche devant la tête) jusqu'au nid, et recommencent. Leurs traces dessinent des chemins visibles.

## Notre cadre (ascii zoo / vousyetes)
- Fond noir #04050A, couleurs de la marque en lumière : soleil [255,176,103], corail [255,111,97], rose [200,111,208], violet [138,116,255], cyan [92,200,255], vert [126,226,168]. Les couleurs de motifs de la spec peuvent rester si elles lisent bien sur le noir.
- Petites bêtes fines et nombreuses (retour de David), detail 1.6 (ne pas l'augmenter : fluidité), tailles variées. Pas de gros blocs.
- Le clic doit marcher via le hook `tap(x, y, flock)` de l'animal (voir src/flock.ts : si l'animal a `tap`, le moteur l'appelle au clic au lieu de `startle`).
