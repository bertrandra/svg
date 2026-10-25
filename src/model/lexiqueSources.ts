// Le lexique des sources libres de la bibliotheque (Material, Phosphor, Tabler, Healthicons, Lucide) : les mots de leurs
// identifiants que le lexique de game-icons ne connaissait pas, et leur francais. Meme format que model/lexique.ts, qui
// les reunit ; en cas de doublon, le lexique de game-icons l'emporte, pour qu'aucun nom de game-icons ne change.
//
// Ces jeux nomment surtout des objets d'interface et de sante (« account-arrow-left », « blood-bag ») : les mots sont
// traduits pour se lire tete en premier, dans l'ordre de l'identifiant (« compte fleche gauche »). Les lettres, les sigles
// et les codes se gardent tels qu'on les ecrit en francais (A, PDF, 4G) ; un mot vide (« farthing » apres « penny ») est
// absorbe par la traduction de son voisin.

export const TABLE_SOURCES = `
left:gauche
file:fichier
variant:variante
number:nombre
device:appareil
text:texte
x:X
alert:alerte
message:message
remove:retrait
format:format
align:alignement
simple:simple
account:compte
search:recherche
dashed:en tirets
code:code
alpha:lettre
user:utilisateur
filter:filtre
edit:modification
rounded:arrondi
question:question
hexagon:hexagone
dollar:dollar
numeric:chiffre
image:image
chevron:chevron
exclamation:exclamation
list:liste
layout:mise en page
mood:humeur
bold:gras
vector:vecteur
building:immeuble
math:maths
sort:tri
ipad:tablette
clipboard:presse-papiers
rotate:rotation
scan:scan
monitor:moniteur
relation:relation
a:A
dots:points
pointer:pointeur
wash:lavage
weather:météo
u:U
dotted:pointé
border:bordure
view:vue
printer:imprimante
refresh:actualisation
mobile:mobile
receipt:reçu
bluetooth:Bluetooth
lightbulb:ampoule
navigation:navigation
cellphone:téléphone portable
link:lien
type:type
sync:synchronisation
git:Git
h:H
desktop:ordinateur de bureau
invoice:facture
location:position
chevrons:chevrons
many:plusieurs
zero:zéro
caret:caret
credit:crédit
grid:grille
panel:panneau
medium:moyen
wireless:sans fil
email:courriel
movie:film
equal:égal
close:fermeture
devices:appareils
gender:genre
rewind:retour rapide
adjustments:réglages
circuit:circuit
package:colis
axis:axe
start:début
percent:pour cent
comment:commentaire
emoticon:émoticône
cell:cellule
source:source
imac:ordinateur tout-en-un
rdt:test de diagnostic rapide
result:résultat
b:B
cards:cartes
pos:point de vente
ai:IA
percentage:pourcentage
http:HTTP
p:P
alphabet:alphabet
send:envoi
temperature:température
layers:calques
descending:décroissant
discount:remise
transfer:transfert
timeline:frise chronologique
gesture:geste
progress:progression
selection:sélection
volume:volume
bitcoin:bitcoin
zoom:zoom
n:N
content:contenu
pentagon:pentagone
worker:travailleur
distribute:répartition
thin:fin
input:entrée
page:page
merge:fusion
pound:livre
rectangle:rectangle
rosette:rosette
dry:séchage
octagon:octogone
c:C
e:E
collapse:repli
size:taille
store:magasin
k:K
m:M
v:V
information:information
brightness:luminosité
case:casse
television:télévision
d:D
q:Q
r:R
w:W
brackets:crochets
export:export
color:couleur
document:document
hour:heure
lines:lignes
zodiac:zodiaque
narrow:étroit
topology:topologie
import:import
thick:épais
blank:vierge
data:données
playing:à jouer
copy:copie
delete:suppression
focus:mise au point
header:en-tête
sidebar:barre latérale
playlist:liste de lecture
set:ensemble
skip:saut
sticker:autocollant
smiley:smiley
no:sans
rectangular:rectangulaire
ppe:équipement de protection
child:enfant
alphabetical:alphabétique
application:application
none:aucun
crop:recadrage
app:application
justify:justification
only:seulement
shape:forme
tooltip:infobulle
euro:euro
route:itinéraire
ui:interface
access:accès
angle:angle
asterisk:astérisque
points:pointes
parking:stationnement
tags:balises
step:pas
wrap:habillage
rows:rangées
magnify:loupe
numeral:chiffre
commit:validation
row:rangée
toggle:interrupteur
divide:division
from:depuis
diagonal:diagonale
rhombus:losange
antenna:antenne
braces:accolades
variable:variable
brake:frein
bulleted:à puces
nfc:NFC
station:station
tab:onglet
order:ordre
panorama:panorama
record:enregistrement
sim:carte SIM
request:demande
yen:yen
invalid:invalide
radius:rayon
matrix:matrice
underline:soulignement
marked:coché
than:que
less:moins
quote:citation
compare:comparaison
passenger:passager
ev:véhicule électrique
form:formulaire
float:flottant
function:fonction
area:zone
dashboard:tableau de bord
bool:booléen
paperclip:trombone
picture:image
script:script
language:langue
social:social
trending:tendance
browser:navigateur
squares:carrés
turn:virage
creative:creative
commons:commons
report:rapport
heading:titre
blister:plaquette
attachment:pièce jointe
restore:restauration
beaker:bécher
classic:classique
loop:boucle
replace:remplacement
indent:retrait
spacing:espacement
pilcrow:pied-de-mouche
binary:binaire
tilt:inclinaison
inbox:boîte de réception
label:étiquette
library:bibliothèque
reply:réponse
mixed:mixte
quarter:quart
more:plus
motion:mouvement
qrcode:code QR
regex:expression régulière
repeat:répétition
oval:ovale
shuffle:lecture aléatoire
surround:son surround
tools:outils
circles:cercles
fold:pli
users:utilisateurs
ad:publicité
autofit:ajustement automatique
event:événement
exposure:exposition
ironing:repassage
loader:chargement
moneybag:sac d’argent
transaction:transaction
increasing:en hausse
care:soins
ccw:sens antihoraire
cw:sens horaire
details:détails
voice:voix
parentheses:parenthèses
arrange:disposition
bicycle:bicyclette
blinds:stores
connected:connecté
certificate:certificat
curve:courbe
shimmer:scintillement
nine:neuf
greater:plus grand
comma:virgule
contain:contenir
contrast:contraste
free:libre
decimal:décimale
neutral:neutre
wink:clin d’œil
presentation:présentation
fingerprint:empreinte digitale
zip:archive zip
password:mot de passe
lower:minuscule
model:modèle
port:port
definition:définition
analytics:analyse
boy:garçon
queue:file d’attente
wheelchair:fauteuil roulant
last:dernier
mower:tondeuse
pi:pi
polygon:polygone
silverware:couverts
storefront:devanture
stretch:étirement
transit:transport en commun
transition:transition
award:récompense
unfold:dépli
gallery:galerie
partly:partiellement
maximize:agrandissement
minimize:réduction
shutter:volet roulant
intersect:intersection
sparkle:étincelle
ramp:bretelle
rotated:pivoté
ease:accélération
forbid:interdiction
decreasing:en baisse
logo:logo
between:entre
ellipsis:points de suspension
octagram:octogramme
api:API
shift:majuscule
reality:réalité
counterclockwise:sens antihoraire
barcode:code-barres
unknown:inconnu
helper:aide
emergency:urgence
scatter:dispersion
connection:connexion
domain:domaine
ellipse:ellipse
ethernet:Ethernet
undo:annulation
floppy:disquette
textbox:zone de texte
pregnant:enceinte
kettle:bouilloire
lan:réseau local
meter:compteur
sd:carte SD
accidental:altération
rest:silence
pail:seau
swatch:échantillon
signature:signature
subtitles:sous-titres
drive:disque
thermostat:thermostat
container:conteneur
tumble:tambour
bezier:Bézier
polyline:polyligne
vibrate:vibreur
sconce:applique
rainy:pluvieux
snowy:neigeux
centered:centré
teardrop:goutte
tool:outil
diff:différence
hemisphere:hémisphère
kanban:kanban
terminal:terminal
eco:éco
stats:statistiques
ripple:ondulation
ruble:rouble
hierarchy:hiérarchie
rating:classement
electricity:électricité
vaccine:vaccin
neg:négatif
malaria:paludisme
pf:P. falciparum
pv:P. vivax
minimal:minimal
mic:micro
ab:AB
album:album
approximately:approximativement
personal:personnel
negative:négatif
positive:positif
connect:connexion
blur:flou
style:style
metering:mesure
spot:spot
plot:tracé
checkerboard:damier
chip:puce
opacity:opacité
counter:compteur
crosshairs:réticule
current:courant
default:par défaut
cylinder:cylindre
dna:ADN
eject:éjection
confused:perplexe
jpg:JPG
pdf:PDF
png:PNG
xml:XML
filmstrip:pellicule
clear:effacement
highlight:surlignage
italic:italique
strikethrough:barré
forum:forum
industrial:industriel
fuse:fusible
grill:gril
dryer:sèche-linge
roof:toit
girl:fille
incognito:incognito
plots:parcelles
cfl:fluocompacte
whole:ronde
nozzle:buse
redo:rétablissement
restart:redémarrage
cellular:cellulaire
skew:inclinaison
local:local
syllabary:syllabaire
cells:cellules
tea:thé
transmission:transmission
difference:différence
boiler:chaudière
sunny:ensoleillé
article:article
chalkboard:tableau noir
corners:coins
pennant:fanion
keyhole:trou de serrure
numbers:nombres
sliders:curseurs
spinner:toupie
subtract:soustraction
airpods:écouteurs
baseline:ligne de base
bleach:javel
category:catégorie
typography:typographie
yuan:yuan
insert:insertion
lira:livre turque
dental:dentaire
exercise:exercice
rate:taux
keyframe:image clé
wreath:couronne
bottombar:barre du bas
inactive:inactif
navbar:barre de navigation
letters:lettres
messages:messages
multiplier:multiplicateur
tax:taxe
stroke:trait
tallymark:bâton de comptage
spline:spline
viewport:fenêtre d’affichage
writing:écriture
unit:unité
contact:contact
contraceptive:contraceptif
surgery:chirurgie
hiv:VIH
icd:CIM
patient:patient
sterling:sterling
fading:estompé
zap:éclair
2x2:2 × 2
centerline:axe central
landing:atterrissage
decagram:décagramme
caps:majuscules
command:commande
apps:applications
bring:avancer
ratio:rapport
augmented:augmentée
mode:mode
backspace:retour arrière
reverse:inverse
carry:bagage
hoop:panier
single:simple
pedal:pédale
tonic:tonique
broadcast:diffusion
week:semaine
estate:break
heater:chauffage
sensitive:sensible
refund:remboursement
screenshot:capture d’écran
stacked:empilé
gantt:Gantt
processing:traitement
checkbook:chéquier
paste:collage
copyright:droit d’auteur
dance:danse
debug:débogage
dishwasher:lave-vaisselle
service:service
sliding:coulissante
eraser:gomme
recognition:reconnaissance
excel:tableur
word:mot
hydrant:bouche d’incendie
drumstick:pilon
font:police
upper:majuscule
checks:coches
paragraph:paragraphe
subscript:indice
superscript:exposant
cherries:cerises
citrus:agrume
non:non
gondola:gondole
gradient:dégradé
graph:graphe
hail:grêle
harddisk:disque dur
hdr:HDR
history:historique
automation:domotique
greeting:salut
slab:dalle
status:état
enter:entrée
reset:réinitialisation
login:connexion
logout:déconnexion
lotion:lotion
integral:intégrale
memory:mémoire
moped:cyclomoteur
motorbike:moto
eighth:croche
sixteenth:double croche
people:personnes
notification:notification
octahedron:octaèdre
quality:qualité
radiator:radiateur
radiobox:bouton radio
registered:déposée
trademark:marque
reorder:réorganisation
resistor:résistance
scanner:scanner
legroom:espace pour les jambes
sneaker:basket
shovel:pelle
sigma:sigma
4g:4G
sprinkler:arroseur
stadium:stade
katakana:katakana
guide:guide
thumbs:pouces
tilde:tilde
toilet:toilettes
hopper:trémie
tram:tramway
translate:traduction
waveform:forme d’onde
moonset:coucher de lune
webcam:webcam
wiper:essuie-glace
disk:disque
address:adresses
tabs:onglets
equals:égal
bookmarks:signets
chats:discussions
bean:grain
exam:examen
exclude:exclusion
sample:échantillon
csv:CSV
html:HTML
sql:SQL
svg:SVG
txt:TXT
east:est
west:ouest
lego:briques
subset:sous-ensemble
superset:sur-ensemble
notepad:bloc-notes
scribble:gribouillis
shapes:formes
nervous:nerveux
gap:écart
proper:strict
unite:union
activity:activité
bounce:rebond
iteration:itération
assembly:assemblage
ban:interdiction
density:densité
community:communauté
christmas:Noël
taka:taka
cent:centime
krone:couronne
peso:peso
diabolo:diabolo
error:erreur
eyeglass:lunettes
frustum:tronc de cône
sanitizer:désinfectant
options:options
patch:correctif
irregular:irrégulier
polyhedron:polyèdre
selected:sélectionné
live:en direct
pinned:épinglé
marquee:sélection rectangulaire
michelin:Michelin
dizzy:étourdi
separator:séparateur
template:modèle
thinking:réflexion
complex:complexe
triangles:triangles
vip:VIP
agriculture:agriculture
cessation:arrêt
circumference:tour
0203m:2 à 3 mois
0306m:3 à 6 mois
cardiogram:cardiogramme
infected:infectés
clinical:clinique
implant:implant
cpap:PPC
bioassays:essais biologiques
utensils:ustensiles
therapy:thérapie
paved:pavée
russian:russe
franc:franc
turkish:turc
slightly:légèrement
locate:localisation
panels:panneaux
testing:test
abjad:abjad
hebrew:hébreu
abugida:abugida
devanagari:devanagari
thai:thaï
supervisor:superviseur
adjust:réglage
advertisements:publicités
humidifier:humidificateur
purifier:purificateur
takeoff:décollage
airport:aéroport
inclusive:compris
amplifier:amplificateur
animation:animation
option:option
decision:décision
oscillating:oscillant
artboard:plan de travail
aspect:aspect
stereo:stéréo
fix:correction
autorenew:renouvellement automatique
buggy:poussette
carriage:landau
ballot:bulletin de vote
barley:orge
fill:remplissage
billiards:billard
bio:bio
education:éducation
mix:mélange
bullhorn:porte-voix
articulated:articulé
missed:manqué
camcorder:caméscope
cannabis:cannabis
hold:maintien
coolant:liquide de refroidissement
defrost:dégivrage
basic:basique
charity:bienfaisance
areaspline:aires lissées
sankey:Sankey
intermediate:intermédiaire
flow:flux
caption:légende
coach:carrosse
json:JSON
maker:machine
collage:collage
contactless:sans contact
payment:paiement
duplicate:duplication
copyleft:copyleft
bit:bits
landscape:paysage
crowd:foule
eur:EUR
php:PHP
rial:rial
usd:USD
into:dans
delta:delta
diabetes:diabète
dialpad:clavier numérique
diameter:diamètre
diaper:couche
dip:DIP
division:division
dolly:diable
doorbell:sonnette
drawing:dessin
elevation:dénivelé
cry:pleurs
excited:enthousiaste
sick:malade
expansion:extension
exponent:exposant
agent:agent
faucet:robinet
cad:CAO
find:recherche
gif:GIF
powerpoint:diaporama
finance:finance
fit:ajustement
dual:double
torchiere:halogène
tulip:tulipe
turkey:dinde
australian:australien
annotation:annotation
numbered:numérotée
rtl:de droite à gauche
overline:surlignement
fullscreen:plein écran
furigana:furigana
buffer:tampon
xnor:NON-OU exclusif
transgender:transgenre
spread:écartement
cocktail:cocktail
pint:pinte
kart:kart
business:entreprise
podcast:podcast
spreadsheet:feuille de calcul
clap:clap
handball:handball
pray:prière
handshake:poignée de main
hdmi:HDMI
hours:heures
capacity:capacité
poll:sondage
hvac:climatisation
hydraulic:hydraulique
ideogram:idéogramme
cjk:CJK
integrated:intégré
invert:inversion
colors:couleurs
ip:IP
change:changement
f2:F2
f3:F3
f4:F4
f5:F5
f6:F6
f7:F7
f8:F8
f9:F9
disconnect:déconnexion
latitude:latitude
launch:lancement
license:licence
lifebuoy:bouée de sauvetage
loading:chargement
locker:casier
longitude:longitude
margin:marge
norm:norme
menorah:menorah
microwave:micro-ondes
waning:décroissante
gibbous:gibbeuse
waxing:croissante
mother:mère
multiplication:multiplication
alto:ut
treble:sol
nature:nature
ornament:ornement
footer:pied de page
outgoing:sortant
paused:en pause
pinwheel:moulinet
sale:vente
pokeball:Poké Ball
it:italienne
prescription:ordonnance
priority:priorité
radiology:radiologie
vertex:sommet
rename:renommage
nodes:nœuds
rickshaw:pousse-pousse
rollerblade:roller
routes:itinéraires
sack:sac
safe:coffre-fort
sawtooth:dents de scie
scent:parfum
recline:inclinable
segment:segment
inverse:inverse
shipping:expédition
shredder:déchiqueteuse
real:immobilier
2g:2G
3g:3G
5g:5G
hspa:HSPA
clean:propre
sine:sinusoïdale
sitemap:plan du site
country:de fond
slope:pente
reader:lecteur
repository:dépôt
soy:soja
sauce:sauce
spellcheck:correcteur orthographique
thread:fil
spotlight:projecteur
standard:standard
david:de David
shooting:filante
subdirectory:sous-dossier
swim:nage
hiragana:hiragana
after:après
before:avant
width:largeur
headers:en-têtes
picnic:pique-nique
taxi:taxi
short:court
texture:texture
probe:sonde
trackpad:pavé tactile
centerbeam:à poutre centrale
transcribe:transcription
trailer:remorque
tshirt:tee-shirt
utility:utilitaire
vanish:disparition
combine:combinaison
intersection:intersection
4k:4K
component:composantes
wallpaper:fond d’écran
hurricane:ouragan
webhook:webhook
lifter:haltérophile
accessibility:accessibilité
yoga:yoga
cardinal:cardinal
barbell:barre d’haltères
books:livres
confetti:confettis
faders:potentiomètres
css:CSS
doc:DOC
js:JS
jsx:JSX
ppt:PPT
rs:RS
ts:TS
tsx:TSX
vue:Vue
xls:XLS
folders:dossiers
grains:céréales
handbag:sac à main
hash:dièse
heartbeat:battement de cœur
identification:identification
images:images
laminated:laminé
operations:opérations
member:élément
nib:plume
plugs:prises
prohibit:interdiction
qr:QR
radical:racine
background:arrière-plan
signpost:panneau indicateur
swimming:natation
tote:cabas
trend:tendance
trolley:chariot
vinyl:vinyle
accessible:accessible
conditioning:climatisation
georgian:géorgien
analyze:analyse
both:deux côtés
roundabout:rond-point
ne:nord-est
sw:sud-ouest
nw:nord-ouest
se:sud-est
gearbox:boîte de vitesses
hd:HD
badges:badges
ballpen:stylo à bille
bath:bain
chlorine:chlore
blend:fusion
blocks:blocs
bmp:BMP
bong:bang
capture:capture
crash:accident
cardboards:cartons
ce:CE
arcs:arcs
capacitor:condensateur
diode:diode
formatting:mise en forme
monero:monero
picker:sélecteur
components:composants
crutches:béquilles
dram:dram
lari:lari
naira:naira
riyal:riyal
tenge:tenge
won:won
pro:pro
dimensions:dimensions
empathize:empathie
explicit:explicite
external:externe
orientation:orientation
symlink:lien symbolique
rights:droits
garden:jardin
conflict:conflit
gpu:processeur graphique
4x4:4 × 4
hotel:hôtel
get:GET
put:PUT
que:QUE
skating:patinage
icons:icônes
add:ajout
luggage:bagages
macro:macro
markdown:Markdown
max:maximum
min:minimum
mist:brume
mobiledata:données mobiles
annoyed:agacé
xd:mort de rire
5x:5 ×
news:actualités
olympics:jeux Olympiques
collaboration:collaboration
rollercoaster:montagnes russes
schema:schéma
soup:soupe
stretching:étirements
sum:somme
unlink:suppression du lien
index:indice
versions:versions
viewfinder:viseur
vocabulary:vocabulaire
dryclean:nettoyage à sec
press:pressing
zzz:sommeil
alcohol:alcool
clinic:clinique
asthma:asthme
0609m:6 à 9 mois
laboratory:laboratoire
bladder:vessie
x1:× 1
x14:× 14
x16:× 16
x4:× 4
rh:rhésus
0105y:1 à 5 ans
1015y:10 à 15 ans
quarantine:quarantaine
nuclei:noyaux
cured:guéris
chills:frissons
fever:fièvre
chlamydia:chlamydia
cleaning:nettoyage
policy:politique
gaps:lacunes
iud:stérilet
coughing:toux
crying:pleurs
discharge:sortie
domestic:domestique
throat:gorge
condom:préservatif
reproductive:reproducteur
sex:sexe
gluten:gluten
gonorrhea:gonorrhée
hematology:hématologie
documents:documents
insecticide:insecticide
intravenous:intraveineuse
lactose:lactose
letrina:latrines
mental:mental
odontology:odontologie
oral:oral
contraception:contraception
outpatient:consultation externe
band:bracelet
penis:pénis
pharmacy:pharmacie
plantation:plantation
prostate:prostate
oximeter:oxymètre
rural:rural
secure:sécurisé
distancing:distanciation
speech:parole
thyroid:thyroïde
vagina:vagin
ventilator:respirateur
around:autour
beef:bœuf
captions:sous-titres
decimals:décimales
smiling:souriant
headphone:casque audio
output:sortie
conical:conique
germ:germe
create:création
hop:houblon
layer:calque
mop:serpillière
paintbrush:pinceau
squircle:carré arrondi
tickets:billets
touchpad:pavé tactile
convert:conversion
reactivate:réactivation
conditioner:climatiseur
airbag:airbag
airballoon:montgolfière
snooze:répétition
allergy:allergie
aurebesh:aurebesh
cyrillic:cyrillique
latin:latin
piqad:piqad
tengwar:tengwar
altimeter:altimètre
ammunition:munitions
ampersand:esperluette
acute:aigu
obtuse:obtus
flex:flexion
assistant:assistant
atm:distributeur de billets
atv:quad
rca:RCA
minijack:mini-jack
xlr:XLR
aurora:aurore boréale
av:AV
awning:auvent
backburger:menu arrière
bacteria:bactéries
badminton:badminton
baguette:baguette
balcony:balcon
recount:recomptage
unfill:vidé
beekeeper:apiculteur
beta:bêta
betamax:Betamax
biathlon:biathlon
penny:grand-bi
farthing:
clipless:automatique
billboard:panneau d’affichage
linear:linéaire
outside:extérieur
buffet:buffet
bulkhead:hublot
bulletin:affichage
decker:à étage
uncovered:sans abri
cached:en cache
made:émis
received:reçu
enhance:amélioration
gopro:caméra sport
partial:partielle
candycane:sucre d’orge
abs:ABS
retarder:ralentisseur
worn:usées
linings:garnitures
convertible:cabriolet
cruise:croisière
esp:ESP
hatchback:berline à hayon
lifted:surélevé
dimmed:code
limousine:limousine
limiter:limiteur
sports:de sport
traction:motricité
turbocharger:turbocompresseur
windshield:pare-brise
chandelier:lustre
cumulative:cumulative
multiline:multiligne
ppf:frontière des possibles
hexbin:alvéoles
mild:doux
clippy:trombone
eleven:onze
ten:dix
twelve:douze
clouds:nuages
cogs:engrenages
compost:compost
consolidate:regroupement
contacts:contacts
cosine:cosinus
countertop:plan de travail
creation:création
bolnisi:de Bolnissi
celtic:celtique
unfolded:déplié
cupboard:placard
bdt:BDT
brl:BRL
btc:BTC
cny:CNY
eth:ETH
fra:FRA
gbp:GBP
ils:ILS
inr:INR
jpy:JPY
krw:KRW
kzt:KZT
mnt:MNT
ngn:NGN
thb:THB
try:TRY
twd:TWD
uah:UAH
ac:alternatif
dc:continu
ballroom:de salon
deathly:reliques
hallows:de la mort
forever:définitive
deskphone:téléphone de bureau
developer:développement
dharmachakra:dharmachakra
d20:D20
d6:D6
d8:D8
diversify:diversification
flippers:palmes
dns:DNS
dresser:commode
dumbbell:haltère
decline:descente
rise:montée
as:comme
unread:non lu
newsletter:lettre d’information
frown:moue
kiss:bisou
lol:mort de rire
poop:caca
epsilon:epsilon
equalizer:égaliseur
et:extraterrestre
ccs1:CCS1
ccs2:CCS2
chademo:CHAdeMO
type1:type 1
type2:type 2
fax:fax
feature:fonctionnalité
fencing:escrime
ferris:grande roue
ferry:ferry
cabinet:classeur
delimited:délimité
firewire:FireWire
fishbowl:aquarium
lis:lis
plan:plan
halal:halal
kosher:casher
takeout:à emporter
dropdown:liste déroulante
textarea:zone de texte
ends:finit
matches:correspond
starts:commence
overflow:débordement
title:titre
inline:aligné
tight:serré
forwardburger:menu avant
fraction:fraction
frequently:foire
asked:aux
questions:questions
gamma:gamma
gantry:portique
burner:brûleur
use:service
portable:portable
stationary:fixe
pinch:pincement
fragile:fragile
stange:flûte
downasaur:dinosaure
nearby:à proximité
guy:Guy
fawkes:Fawkes
halloween:Halloween
okay:d’accord
heating:chauffante
hexadecimal:hexadécimal
hexagram:hexagramme
highway:autoroute
puck:palet
sticks:crosses
hololens:casque de réalité mixte
tub:spa
hub:concentrateur
hubspot:HubSpot
changing:à langer
proximity:proximité
handsdown:mains baissées
handsup:mains levées
walker:déambulateur
hydro:hydraulique
hydrogen:hydrogène
identifier:identifiant
weak:faible
frames:cadres
actual:réelle
induction:induction
instrument:instrument
ipod:baladeur
jeepney:jeepney
kabaddi:kabaddi
karate:karaté
kayaking:kayak
keg:fût
pour:filtre
kettlebell:kettlebell
esc:Échap
f10:F10
f11:F11
f12:F12
khanda:khanda
kitesurfing:kitesurf
lamps:lampes
pending:en attente
fields:champs
landslide:glissement de terrain
lectern:pupitre
shelves:étagères
recessed:encastrée
fluorescent:fluorescent
lingerie:lingerie
liquor:spiritueux
looks:apparence
loupe:loupe
legend:légende
cos:cosinus
sin:sinus
tan:tangente
swab:coton-tige
medication:médicament
micro:micro
middleware:intergiciel
midi:MIDI
minidisc:MiniDisc
martial:martiaux
arts:arts
co:CO
co2:CO2
muffin:muffin
multicast:multidiffusion
multimedia:multimédia
natural:bécarre
nas:serveur de stockage
near:près de
nuke:bombe atomique
null:nul
oar:rame
ocr:reconnaissance de texte
offer:offre
om:om
outdoor:extérieure
overscan:surbalayage
pac:Pac
fisheye:fisheye
paragliding:parapente
biometric:biométrique
pasta:pâtes
patio:terrasse
periodic:périodique
ph:pH
hangup:raccroché
voip:voix sur IP
disconnected:déconnecté
piston:piston
protected:protégé
pliers:pince
bronze:bronze
postage:postal
au:AU
ch:CH
eu:EU
fr:FR
jp:JP
uk:UK
us:US
standby:veille
powershell:PowerShell
professional:professionnel
quadcopter:drone
quora:Quora
racing:de course
racquetball:racquetball
am:AM
fm:FM
indeterminate:indéterminé
railroad:ferroviaire
rec:REC
reiterate:réitération
relative:relative
reminder:rappel
replay:relecture
reproduction:reproduction
responsive:adaptatif
rivet:rivet
rodent:rongeur
rowing:aviron
uplink:liaison montante
bathroom:salle de bain
cutting:découpe
lag:tire-fond
angled:incliné
individual:individuel
suite:suite
reduced:réduit
seesaw:tape-cul
place:placement
serial:série
pallet:palette
ballet:ballerine
cleat:crampons
formal:habillée
shore:rivage
caution:attention
yield:cédez-le-passage
freehand:à main levée
xl:XL
xs:XS
xxl:XXL
xxs:XXS
xxxl:XXXL
sledding:luge
downhill:descente
uphill:montée
smog:smog
melt:fonte
snowmobile:motoneige
snowshoeing:raquettes
meters:mètres
soundbar:barre de son
invaders:Invaders
squeegee:raclette
ssh:SSH
state:état
emoji:émoji
stocking:bas
storage:stockage
strategy:stratégie
surfing:surf
hangul:hangeul
halfwidth:demi-chasse
synagogue:synagogue
unselected:non sélectionné
furniture:mobilier
contents:matières
pivot:croisée dynamique
taco:taco
tangram:tangram
tanker:citerne
ambient:ambiante
celsius:Celsius
fahrenheit:Fahrenheit
kelvin:kelvin
buddhist:bouddhiste
hindu:hindou
terrain:relief
theme:thème
confirmation:confirmation
timelapse:accéléré
complete:écoulé
timetable:horaires
toslink:Toslink
touch:tactile
tournament:tournoi
town:mairie
hall:
autorack:porte-voitures
caboose:fourgon de queue
intermodal:intermodal
crew:col rond
tsunami:tsunami
factor:facteurs
authentication:authentification
typewriter:machine à écrire
ultra:ultra
ungroup:dégroupement
update:mise à jour
vanity:de coiffeuse
above:dessus
below:dessous
ba:BA
2d:2D
scart:péritel
svideo:S-Vidéo
stabilization:stabilisation
headline:gros titre
voicemail:messagerie vocale
vpn:VPN
bifold:à deux volets
giftcard:carte cadeau
membership:carte de membre
wan:réseau étendu
wardrobe:armoire
watermark:filigrane
undercurrent:courant de fond
hazy:brumeux
gram:gramme
kilogram:kilogramme
barrow:brouette
incandescent:incandescent
iridescent:irisé
widgets:widgets
yeast:levure
yurt:yourte
taxiing:roulage
airplay:diffusion sans fil
approximate:approximativement
ny:New York
times:Times
bandaids:pansements
boules:boules
bounding:englobante
browsers:navigateurs
droid:robot
apartment:appartements
buildings:immeubles
cardholder:porte-cartes
offset:décalé
cheers:santé
notch:encoche
afternoon:après-midi
countdown:compte à rebours
captioning:sous-titrage
couch:canapé
detective:détective
disco:disco
eyeglasses:lunettes
cpp:CPP
ini:INI
md:MD
py:PY
reel:bobine
slate:clap
finn:Finn
saucer:soucoupe
footprints:empreintes de pas
fine:fin
intersex:intersexe
neuter:neutre
nonbinary:non binaire
stand:pied
graphics:graphique
deposit:dépôt
grabbing:qui saisit
waving:qui salue
withdraw:retrait
clapping:qui applaudissent
drives:disques
headlights:phares
filament:filament
segments:segments
dashes:tirets
trifold:à trois volets
stage:scène
clipping:coupure
notches:encoches
numpad:pavé numérique
onigiri:onigiri
household:ménager
parallelogram:parallélogramme
hike:randonnée
tai:tai-chi
chi:
throw:lancer
placeholder:espace réservé
popsicle:glace à l’eau
potted:en pot
inset:intérieur
quotes:guillemets
racquet:raquette
ranking:classement
screencast:enregistrement d’écran
foreground:premier plan
slideshow:diaporama
meh:bof
sock:chaussette
hifi:hi-fi
steps:marches
student:étudiant
dim:tamisé
swatches:échantillons
aa:Aa
outdent:retrait négatif
regional:régional
evergreen:persistant
structure:structure
vault:coffre
vignette:vignette
visor:visière
abc:ABC
affiliate:affiliation
agents:agents
gateway:passerelle
average:moyen
justified:justifié
bangla:bengali
chinese:chinois
ethiopic:éthiopien
korean:coréen
polish:polonais
runes:runes
zag:zag
asset:ressource
auth:authentification
2fa:à deux facteurs
backhoe:pelleteuse
backslash:barre oblique inverse
2k:2K
3k:3K
5k:5K
8k:8K
ar:RA
cc:CC
tm:TM
vo:VO
wc:WC
automotive:automobile
blind:aveugle
blockquote:bloc de citation
ios:iOS
outer:extérieure
sides:côtés
padding:marge intérieure
burj:Burj
al:al-
arab:Arab
circus:cirque
cottage:chaumière
eiffel:Eiffel
skyscraper:gratte-ciel
burger:burger
businessplan:plan d’affaires
due:échéance
selfie:selfie
camper:camping-car
canary:canari
projecting:saillante
popular:populaire
cohort:cohorte
covariate:covariable
infographic:infographie
treemap:carte proportionnelle
checkup:contrôle
ammeter:ampèremètre
polarized:polarisé
changeover:inverseur
zener:Zener
inductor:bobine
motor:moteur
pushbutton:bouton-poussoir
voltmeter:voltmètre
codeblock:bloc de code
confucius:Confucius
congruent:congru
by:BY
nc:NC
nd:ND
sa:SA
afghani:afghani
bahraini:bahreïni
baht:baht
dinar:dinar
dirham:dirham
dogecoin:dogecoin
brunei:de Brunei
guyanese:guyanien
singapore:de Singapour
zimbabwean:zimbabwéen
dong:dong
ethereum:ether
florin:florin
forint:forint
frank:franc
guarani:guarani
hryvnia:hryvnia
husd:HUSD
iranian:iranien
kip:kip
czech:tchèque
danish:danoise
swedish:suédoise
leu:leu
litecoin:litecoin
lyd:LYD
manat:manat
paanga:pa’anga
quetzal:quetzal
renminbi:renminbi
rufiyaa:rufiyaa
nepalese:népalaise
shekel:shekel
solana:solana
som:som
tether:tether
tugrik:tugrik
xrp:XRP
zcash:zcash
zloty:zloty
deaf:sourd
deselect:désélection
airtag:balise
landline:fixe
vibration:vibration
workstation:poste de travail
earphone:écouteur
bulk:par lot
emphasis:emphase
dislike:je n’aime pas
isr:ISR
like:j’aime
docx:DOCX
firetruck:camion de pompiers
christianity:chrétien
forms:formulaires
agender:agenre
androgyne:androgyne
bigender:bigenre
demiboy:demi-garçon
demigirl:demi-fille
epicene:épicène
femme:femme
genderfluid:fluide
genderless:sans genre
genderqueer:queer
hermaphrodite:hermaphrodite
intergender:intergenre
neutrois:neutrois
travesti:travesti
geometry:géométrie
deleted:supprimée
draft:brouillon
unlisted:non listée
gizmo:manipulateur
gin:gin
gradienter:niveau à bulle
grape:raisin
3x3:3 × 3
goldenratio:nombre d’or
spatula:spatule
little:petit
you:je t’aime
hula:hula
icosahedron:icosaèdre
generation:génération
jetski:jet-ski
jewish:juive
bevel:biseau
kayak:kayak
kerning:crénage
show:affichage
keyframes:images clés
important:important
lane:voie
lawn:à gazon
concave:concave
convex:convexe
balancer:répartiteur
logs:journaux
magnetic:magnétique
pins:repères
massage:massage
matchstick:allumette
avg:moyenne
ctg:cotangente
integrals:intégrales
sec:sécante
symbols:symboles
tg:tangente
xy:XY
syrup:sirop
deep:profond
chatbot:agent conversationnel
bib:Bib
gourmand:Gourmand
mickey:souris
microfrontends:micro-interfaces
milkshake:milk-shake
monkeybar:échelle horizontale
crazy:fou
nerd:intello
puzzled:perplexe
squint:plissé
unamused:blasé
wrrr:grr
moustache:moustache
1x:1 ×
2x:2 ×
derivatives:dérivés
noise:bruit
reduction:réduction
notdef:glyphe manquant
object:objet
olympic:olympique
orbits:orbites
outbound:sortant
outlet:prise
packages:colis
pacman:Pac-Man
paywall:accès payant
calling:appel en cours
done:terminé
physiotherapist:kinésithérapeute
invoke:épingler
pipeline:chaîne de traitement
inflight:en vol
bugs:bogues
prev:précédente
poo:caca
premium:premium
prison:prison
prompt:invite
prong:fourche
scary:effrayante
recharging:recharge
reduce:réduction
reference:référence
reserved:réservée
roulette:roulette
salad:salade
sandbox:bac à sable
traces:traces
sdk:SDK
phrases:phrases
segway:gyropode
selector:sélecteur
seo:référencement
serverless:sans serveur
servicemark:marque de service
shareplay:partage
pitchforks:fourches
6g:6G
lte:LTE
sketching:croquis
sleigh:traîneau
snowboarding:snowboard
sos:SOS
spaces:espaces
speakerphone:haut-parleur
speedboat:hors-bord
billiard:billard
f0:F0
curved:courbe
dynamic:dynamique
subtask:sous-tâche
alias:alias
shortcut:raccourci
starred:favori
taiwan:Taïwan
tallymarks:bâtons de comptage
tex:TeX
ltr:de gauche à droite
grammar:grammaire
timezone:fuseau horaire
tir:TIR
toml:TOML
torii:torii
treadmill:tapis de course
trekking:trekking
twig:brindille
typeface:police de caractères
uhd:UHD
universe:univers
urgent:urgent
uv:UV
ux:UX
vs:contre
gentle:délicat
waterpolo:water-polo
whirl:tourbillon
www:WWW
xxx:XXX
config:configuration
construction:chantier
month:mois
once:une fois
range:plage
nutrition:nutrition
polaroid:instantané
rug:tapis
scoreboard:tableau des scores
seatbelt:ceinture de sécurité
graduation:remise de diplôme
digit:chiffre
braille:braille
multiselect:sélection multiple
today:aujourd’hui
begin:début
weekend:week-end
retake:nouvelle prise
gymnastics:gymnastique
extended:tendue
iv:perfusion
pickaxe:pioche
propane:propane
protocol:protocole
publish:publication
rolodex:fichier rotatif
room:chambre
rv:camping-car
crossbones:os croisés
spa:spa
agenda:agenda
comfy:confortable
day:jour
parallel:parallèle
quilt:mosaïque
sequential:séquentielle
4wd:4 × 4
suv:SUV
favicon:icône de site
fidget:anti-stress
cv:CV
description:description
filters:filtres
bible:bible
workflow:flux de travail
accident:accident
admissions:admissions
allergies:allergies
ambulatory:ambulatoire
ancv:ANCV
mosquitos:moustiques
anus:anus
inhaler:inhalateur
autoimmune:auto-immune
disease:maladie
formula:lait infantile
adhesive:adhésif
bills:billets
pharma:pharmaceutique
biochemistry:biochimie
biomarker:biomarqueur
biopsy:biopsie
transfusion:transfusion
breast:sein
breasts:seins
breeding:reproduction
sites:sites
centre:centre
calm:calme
cancerous:cancéreuse
carbohydrates:glucides
cardiology:cardiologie
cervical:du col de l’utérus
chaplaincy:aumônerie
cognition:cognition
program:programme
cholera:choléra
fe:fer
cochlear:cochléaire
colon:côlon
colorectal:colorectal
healthworker:agent de santé
nets:moustiquaires
walls:murs
voucher:bon
copper:au cuivre
coronary:coronarienne
cpr:réanimation
crisis:crise
response:intervention
critical:critiques
dairy:produits laitiers
alt2:variante 2
defibrillator:défibrillateur
hygiene:hygiène
dhis2:DHIS2
diagnostics:diagnostic
dialysis:dialyse
diarrhea:diarrhée
lounge:salon
discriminating:discriminante
disinfecting:désinfectantes
wipes:lingettes
ears:oreilles
ecmo:ECMO
elderly:personne âgée
endocrinology:endocrinologie
endotracheal:endotrachéale
enzyme:enzyme
expectorate:expectoration
planning:planification
fhir:FHIR
dept:service
persons:personnes
fruits:fruits
gallbladder:vésicule biliaire
gastroenterology:gastro-entérologie
general:générale
geo:géo
geriatrics:gériatrie
ghana:Ghana
global:mondiale
pandemic:pandémie
meetingx3:réunion à trois
gynecology:gynécologie
wipe:essuyage
hazardous:dangereux
headache:mal de tête
literacy:littératie
vulnerability:vulnérabilité
through:par les
determinants:déterminants
healthcare:santé
hepatology:hépatologie
ind:IND
hl7v2:HL7v2
hormonal:hormonal
hospice:soins palliatifs
hospitalized:hospitalisé
hpv:VPH
resoruces:ressources
accepted:acceptés
denied:refusés
qualification:qualification
groups:groupes
action:action
schedule:emploi du temps
date:date
training:formation
imm:IMM
campaign:campagne
infusion:perfusion
inpatient:hospitalisation
insurance:assurance
intensity:intensité
intensive:intensifs
interoperability:interopérabilité
intestinal:intestinale
intestine:intestin
job:emploi
joints:articulations
lactation:allaitement
laryngoscope:laryngoscope
llin:moustiquaire imprégnée
loinc:LOINC
loss:perte
smell:odorat
loudly:fort
income:revenu
lymph:lymphatiques
lymphoma:lymphome
machinery:machines
malnutrition:malnutrition
market:marché
stall:étal
measles:rougeole
advice:conseil
records:dossiers
disorders:troubles
specimen:échantillon
ministry:ministère
collection:collecte
msm:HSH
nappy:lange
nausea:nausée
nauseous:nauséeux
nephrology:néphrologie
nerve:nerf
neuro:neuro
neurology:neurologie
observation:observation
obstetricsmonia:obstétrique
occupational:ergothérapie
oesophagus:œsophage
oncology:oncologie
openmrs:OpenMRS
opthalmology:ophtalmologie
pillsx21:21 comprimés
pillsx28:28 comprimés
orthopaedics:orthopédie
orthotics:orthèses
outbreak:épidémie
department:service
overweight:surpoids
oxygen:oxygène
managment:prise en charge
palliative:palliatifs
pancreas:pancréas
pancreatic:du pancréas
pediatric:pédiatrique
pediatrics:pédiatrie
physical:physique
pneumonia:pneumonie
apron:tablier
gown:blouse
n95:FFP2
santizer:désinfectant
0812w:8 à 12 semaines
2426w:24 à 26 semaines
32w:32 semaines
3638w:36 à 38 semaines
provider:soignant
fst:FST
psychology:psychologie
pwid:usager de drogues injectables
referral:orientation
refused:refusé
regular:régulier
resilient:résilient
migration:migrations
respirator:masque respiratoire
respirology:pneumologie
rheumatology:rhumatologie
risk:risque
analysis:analyse
rmnh:santé maternelle et néonatale
rx:ordonnance
sayana:Sayana
sexual:sexuelle
skin:peau
work:travail
sodium:sel
sonogram:échographie
sonography:échographie
spleen:rate
spraying:pulvérisation
spreadsheets:feuilles de calcul
staples:agrafes
stent:stent
sti:IST
stitches:points de suture
surgical:chirurgicale
sterilization:stérilisation
surveilance:surveillance
sweating:transpiration
symptom:symptôme
synergist:synergiste
syphilis:syphilis
tb:tuberculose
telemedicine:télémédecine
testicles:testicules
tissue:mouchoir
traumatism:traumatisme
treated:traitée
tumour:tumeur
preferences:préférences
un:non
underweight:insuffisance pondérale
unhealthy:malsaine
urine:urine
urology:urologie
varicose:variqueuse
vein:veine
vascular:vasculaire
vegetables:légumes
vespa:scooter
vih:VIH
viral:virale
lung:pulmonaire
infection:infection
mutation:mutation
vomitting:vomissements
waist:taille
supported:aidée
sanitation:assainissement
treatment:traitement
weights:poids
woozy:vaseux
xray:radiographie
yes:oui
young:jeunes
vent:aération
ampersands:esperluettes
armenian:arménien
astroid:astroïde
baggage:bagages
claim:retrait des
bangladeshi:bangladais
flexed:contracté
birdhouse:nichoir
searching:recherche
fracture:fracture
boxes:boîtes
conveyor:tapis
days:jours
calendars:calendriers
combined:combiné
drizzle:bruine
concierge:conciergerie
cuboid:pavé
dessert:dessert
stairwell:cage d’escalier
drafting:de dessinateur
charger:chargeur
expressionless:inexpressif
grinning:grand sourire
frowning:renfrogné
kindling:petit bois
thumbnails:vignettes
directional:directionnelle
3x2:3 × 2
groceries:courses
helping:d’aide
platter:plateau
houses:maisons
lanyard:tour de cou
upscale:agrandissement
inspection:inspection
kazakh:kazakh
landmark:monument
languages:langues
freeform:libre
leafy:à feuilles
ligature:ligature
squiggle:gribouillis
ordered:ordonnée
todo:de tâches
fixed:fixe
mails:courriels
vocal:vocal
milestone:jalon
nepali:népalaise
origami:origami
parasol:parasol
phi:phi
philippine:philippin
forwarded:transféré
pipette:pipette
proportions:proportions
radiation:rayonnement
receiver:récepteur
refrigerator:réfrigérateur
coaster:russes
dimension:cote
saudi:saoudien
scaling:mise à l’échelle
scratch:Scratch
shelving:étagère
shrink:réduction
shrub:arbuste
dispenser:distributeur
summary:résumé
properties:propriétés
tablets:comprimés
tangent:tangente
initial:initiale
torus:tore
deciduous:caduc
turntable:platine
university:université
unplug:débranchement
vegan:végan
venetian:vénitien
videotape:cassette vidéo
waypoints:points de passage
`;

/**
 * Les noms composes anglais des sources libres, qui ne se traduisent pas mot a mot dans l'ordre de l'identifiant (« ice-cream »
 * n'est pas « glace creme »). Ils ne servent qu'aux sources lues tete en premier : les noms de game-icons ne les voient pas.
 */
export const EXPRESSIONS_SOURCES: Readonly<Record<string, string>> = {
  'access-point': 'point d’accès',
  'alarm-clock': 'réveil',
  'app-window': 'fenêtre d’application',
  'baby-buggy': 'poussette',
  'baby-carriage': 'landau',
  'ballpoint-pen': 'stylo à bille',
  'beer-mug': 'chope de bière',
  'blood-bag': 'poche de sang',
  'blood-pressure': 'tension artérielle',
  'boom-gate': 'barrière levante',
  'bow-tie': 'nœud papillon',
  'candy-cane': 'sucre d’orge',
  'car-brake': 'frein',
  'car-wash': 'lavage auto',
  'cards-playing': 'cartes à jouer',
  'cash-banknote': 'billet de banque',
  'cell-signal': 'signal cellulaire',
  'chart-bar': 'graphique en barres',
  'chart-column': 'graphique en colonnes',
  'chart-donut': 'graphique en anneau',
  'chart-line': 'graphique en courbe',
  'chart-pie': 'graphique en secteurs',
  'chart-scatter': 'nuage de points',
  'check-circle': 'cercle coché',
  'check-square': 'carré coché',
  'chef-hat': 'toque',
  'chemical-weapon': 'arme chimique',
  'christmas-ball': 'boule de Noël',
  'christmas-tree': 'sapin de Noël',
  'coffee-cup': 'tasse de café',
  'coffee-maker': 'cafetière',
  'content-save': 'sauvegarde',
  'cooking-pot': 'marmite',
  'credit-card': 'carte bancaire',
  'cupcake': 'cupcake',
  'desk-lamp': 'lampe de bureau',
  'exclamation-mark': 'point d’exclamation',
  'face-mask': 'masque',
  'fast-forward': 'avance rapide',
  'ferris-wheel': 'grande roue',
  'file-document': 'document',
  'fire-hydrant': 'bouche d’incendie',
  'fire-truck': 'camion de pompiers',
  'first-aid': 'premiers secours',
  'first-quarter': 'premier quartier',
  'floor-lamp': 'lampadaire',
  'floppy-disk': 'disquette',
  'flower-pot': 'pot de fleurs',
  'fork-knife': 'fourchette et couteau',
  'fountain-pen': 'stylo plume',
  'full-moon': 'pleine lune',
  'game-controller': 'manette de jeu',
  'gas-pump': 'pompe à essence',
  'gas-station': 'station-service',
  'gift-card': 'carte cadeau',
  'git-pull-request': 'demande de fusion',
  'glass-cocktail': 'verre à cocktail',
  'glass-wine': 'verre à vin',
  'greater-than': 'supérieur à',
  'greater-than-or-equal': 'supérieur ou égal',
  'hair-dryer': 'sèche-cheveux',
  'hand-heart': 'main cœur',
  'hand-love-you': 'je t’aime en langue des signes',
  'hand-wash': 'lavage des mains',
  'hard-drive': 'disque dur',
  'hard-hat': 'casque de chantier',
  'heart-handshake': 'poignée de main cœur',
  'heart-pulse': 'pouls',
  'heart-rate': 'fréquence cardiaque',
  'heat-wave': 'canicule',
  'high-definition': 'haute définition',
  'home-floor': 'étage',
  'hot-air-balloon': 'montgolfière',
  'hot-tub': 'spa',
  'human-female': 'femme',
  'human-male': 'homme',
  'human-male-female': 'homme et femme',
  'ice-cream': 'glace',
  'ice-skate': 'patin à glace',
  'ice-skating': 'patinage',
  'id-card': 'carte d’identité',
  'identification-badge': 'badge d’identité',
  'identification-card': 'carte d’identité',
  'inner-shadow': 'ombre intérieure',
  'knife-fork': 'couteau et fourchette',
  'last-quarter': 'dernier quartier',
  'laurel-wreath': 'couronne de laurier',
  'less-than': 'inférieur à',
  'less-than-or-equal': 'inférieur ou égal',
  'light-bulb': 'ampoule',
  'light-switch': 'interrupteur',
  'lightbulb-on': 'ampoule allumée',
  'link-break': 'lien rompu',
  'magnifying-glass': 'loupe',
  'map-marker': 'repère',
  'map-pin': 'repère',
  'member-of': 'élément de',
  'mouse-pointer': 'pointeur de souris',
  'music-note': 'note de musique',
  'network-strength': 'réseau',
  'new-moon': 'nouvelle lune',
  'note-pencil': 'note',
  'office-building': 'immeuble de bureaux',
  'paint-brush': 'pinceau',
  'paint-bucket': 'pot de peinture',
  'paint-roller': 'rouleau à peindre',
  'paw-print': 'empreinte de patte',
  'pen-nib': 'plume',
  'picture-in-picture': 'image dans l’image',
  'play-card': 'carte à jouer',
  'post-it': 'pense-bête',
  'potted-plant': 'plante en pot',
  'power-off': 'arrêt',
  'power-on': 'marche',
  'power-plug': 'fiche électrique',
  'power-socket': 'prise électrique',
  'power-standby': 'veille',
  'printer-3d': 'imprimante 3D',
  'projector-screen': 'écran de projection',
  'pull-request': 'demande de fusion',
  'pumpkin-scary': 'citrouille effrayante',
  'push-pin': 'punaise',
  'question-mark': 'point d’interrogation',
  'radio-tower': 'pylône radio',
  'recycle-bin': 'corbeille',
  'robot-vacuum': 'robot aspirateur',
  'roller-coaster': 'montagnes russes',
  'roman-numeral': 'chiffre romain',
  'rubber-duck': 'canard en caoutchouc',
  'safety-pin': 'épingle de sûreté',
  'santa-claus': 'père Noël',
  'sewing-machine': 'machine à coudre',
  'shopping-bag': 'sac de courses',
  'shopping-basket': 'panier de courses',
  'shopping-cart': 'caddie',
  'silverware-fork-knife': 'couverts',
  'smart-card': 'carte à puce',
  'smoke-detector': 'détecteur de fumée',
  'snow-man': 'bonhomme de neige',
  'social-distance': 'distanciation sociale',
  'social-distancing': 'distanciation sociale',
  'solar-panel': 'panneau solaire',
  'source-branch': 'branche',
  'source-commit': 'validation',
  'soy-sauce': 'sauce soja',
  'spray-can': 'bombe de peinture',
  'star-four-points': 'étoile à quatre branches',
  'sticky-note': 'pense-bête',
  'sticky-notes': 'pense-bêtes',
  'string-lights': 'guirlande lumineuse',
  'sun-glasses': 'lunettes de soleil',
  'surround-sound': 'son surround',
  'swimming-pool': 'piscine',
  'tea-cup': 'tasse de thé',
  'test-tube': 'éprouvette',
  'time-duration': 'durée',
  'toy-brick': 'brique de construction',
  'traffic-cone': 'cône de signalisation',
  'traffic-light': 'feu tricolore',
  'train-car': 'wagon',
  'trash-can': 'poubelle',
  'tree-view': 'arborescence',
  'tumble-dryer': 'sèche-linge',
  'usb-flash-drive': 'clé USB',
  'video-game': 'jeu vidéo',
  'vinyl-record': 'disque vinyle',
  'wall-sconce': 'applique murale',
  'washing-machine': 'lave-linge',
  'waste-basket': 'corbeille',
  'watering-can': 'arrosoir',
  'web-camera': 'webcam',
  'wifi-strength': 'wifi',
  'wine-glass': 'verre à vin',
  'x-circle': 'cercle croix',
  'x-square': 'carré croix',
  'zip-disk': 'disquette zip'
};

/**
 * Les mots dont le sens change dans un jeu d'interface : « top » est une toupie chez game-icons, le haut ailleurs ; « off » y
 * dit qu'une chose est coupee. Ces sens l'emportent pour les sources libres seulement : les noms de game-icons ne bougent pas.
 */
export const SENS_SOURCES = `
off:barré
top:haut
slash:barré
charging:en charge
split:partagé
back:arrière
fan:ventilateur
tank:réservoir
seal:sceau
cone:cône
web:web
club:trèfle
spade:pique
bars:barres
pan:panoramique
pull:tirage
post:publication
cast:diffusion
drag:glisser
board:tableau
bolt:éclair
i:I
clutch:embrayage
smoking:fumeur
stock:stock
strength:intensité
`;
