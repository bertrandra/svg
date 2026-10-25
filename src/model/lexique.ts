// Le lexique des noms d'icones : chaque mot anglais d'un identifiant de game-icons.net, et son
// equivalent francais. Un nom se traduit mot a mot, tete en premier (« broken-heart » devient
// « coeur brise ») ; les expressions qui ne se traduisent pas mot a mot sont dans EXPRESSIONS. Un
// mot absent reste en anglais : on le voit, et on l'ajoute ici (ou, pour les sources libres, dans lexiqueSources.ts).

import { EXPRESSIONS_SOURCES, SENS_SOURCES, TABLE_SOURCES } from './lexiqueSources.js';

const TABLE = `
abstract:abstrait
card:carte
shield:bouclier
head:tête
skull:crâne
arrow:flèche
heart:cœur
star:étoile
sword:épée
dice:dés
fire:feu
mask:masque
ball:balle
lightning:éclair
eye:œil
tarot:tarot
helmet:casque
armor:armure
stone:pierre
gate:porte
bag:sac
hand:main
tree:arbre
the:
bottle:bouteille
face:visage
spiked:à pointes
six:six
flag:drapeau
hat:chapeau
diamonds:carreau
hearts:cœurs
tower:tour
faces:visages
water:eau
fish:poisson
gun:pistolet
door:porte
target:cible
bolt:boulon
ring:anneau
clubs:trèfle
paper:papier
sun:soleil
bomb:bombe
flower:fleur
spades:pique
leaf:feuille
metal:métal
ice:glace
shell:coquille
axe:hache
bucket:seau
cross:croix
boot:botte
of:de
spiral:spirale
light:lumière
crown:couronne
wood:bois
evil:maléfique
perspective:perspective
egg:œuf
book:livre
broken:brisé
burning:en flammes
shot:tir
bridge:pont
bat:chauve-souris
battery:batterie
claw:griffe
helm:heaume
knife:couteau
key:clé
tentacle:tentacule
king:roi
crossed:croisés
heavy:lourd
magic:magique
triple:triple
hammer:marteau
spider:araignée
house:maison
wound:blessure
fishing:pêche
brick:brique
round:rond
claws:griffes
crystal:cristal
three:trois
double:double
dragon:dragon
necklace:collier
shuriken:shuriken
box:boîte
sea:mer
time:temps
blade:lame
wing:aile
tank:char
bird:oiseau
black:noir
drop:goutte
button:bouton
car:voiture
orb:orbe
two:deux
love:amour
falling:qui tombe
mushroom:champignon
open:ouvert
wooden:en bois
tail:queue
emblem:emblème
body:corps
wheel:roue
flame:flamme
circle:cercle
cloud:nuage
disc:disque
cracked:fissuré
glass:verre
dripping:qui goutte
full:plein
high:haut
laser:laser
level:niveau
robot:robot
pirate:pirate
snake:serpent
meeple:pion
man:homme
chain:chaîne
arrows:flèches
in:dans
dog:chien
barbed:barbelé
spear:lance
beam:rayon
bowl:bol
diamond:diamant
boat:bateau
saw:scie
bow:arc
trap:piège
explosion:explosion
dagger:dague
field:champ
pot:pot
half:demi
ship:navire
life:vie
egyptian:égyptien
energy:énergie
moon:lune
hook:crochet
swirl:tourbillon
flying:volant
stick:bâton
power:puissance
logic:logique
ninja:ninja
ace:as
alien:extraterrestre
one:un
eyes:yeux
impact:impact
punch:coup de poing
lantern:lanterne
bar:barre
gear:engrenage
horn:corne
cap:casquette
blast:souffle
pile:tas
ribbon:ruban
brain:cerveau
slice:tranche
wall:mur
grenade:grenade
cannon:canon
jack:valet
queen:reine
mouth:bouche
chess:échecs
chest:coffre
jar:bocal
lock:serrure
saber:sabre
palm:palmier
death:mort
sign:panneau
handle:poignée
scales:balance
earth:terre
empty:vide
paw:patte
shirt:chemise
gold:or
mine:mine
potion:potion
inverted:inversé
iron:fer
pipe:tuyau
skeleton:squelette
machine:machine
sharp:aiguisé
winged:ailé
3d:3D
tube:tube
air:air
zigzag:zigzag
player:joueur
wings:ailes
arm:bras
aura:aura
pyramid:pyramide
coil:bobine
pack:paquet
wave:vague
hole:trou
spell:sort
bone:os
strike:frappe
forest:forêt
temple:temple
tap:robinet
plant:plante
cat:chat
leg:jambe
fork:fourchette
swords:épées
rose:rose
dead:mort
four:quatre
lights:lumières
rocket:fusée
smoking:fumant
trident:trident
flat:plat
fluffy:duveteux
truck:camion
frog:grenouille
frozen:gelé
stack:pile
golem:golem
gooey:gluant
tornado:tornade
health:santé
holy:sacré
hot:chaud
rope:corde
locked:verrouillé
medal:médaille
missile:missile
needle:aiguille
can:canette
plain:simple
rolling:roulant
shiny:brillant
top:toupie
sonic:sonique
spiky:hérissé
spinning:tournant
striking:frappant
traffic:circulation
viking:viking
weight:poids
stairs:escalier
acid:acide
blob:blob
africa:afrique
airplane:avion
bug:insecte
american:américain
dress:robe
ancient:antique
apple:pomme
bandage:bandage
boomerang:boomerang
cluster:grappe
block:bloc
pocket:poche
slashes:entailles
breath:souffle
fountain:fontaine
banana:banane
glove:gant
alt:variante
battle:bataille
satellite:satellite
lamp:lampe
belt:ceinture
fangs:crocs
big:grand
cage:cage
knight:chevalier
bite:morsure
fall:chute
mace:masse d'armes
kick:coup de pied
stomp:piétinement
shadow:ombre
string:corde
tie:cravate
bowling:bowling
tablet:tablette
flask:fiole
bullet:balle
butterfly:papillon
camp:camp
candle:bougie
profile:profil
closed:fermé
castle:château
entrance:entrée
mark:marque
chemical:chimique
chicken:poule
on:sur
coffee:café
spark:étincelle
cube:cube
jaws:mâchoires
earrings:boucles d'oreilles
shrine:sanctuaire
wand:baguette
desert:désert
padlock:cadenas
trophy:trophée
five:cinq
chair:chaise
golf:golf
square:carré
ringed:cerclé
goo:gelée
eclipse:éclipse
whip:fouet
hood:capuche
planet:planète
fast:rapide
feather:plume
female:femme
vampire:vampire
gem:gemme
flaming:enflammé
platform:plateforme
tire:pneu
floating:flottant
tentacles:tentacules
trefoil:trèfle
fox:renard
foot:pied
and:et
gas:gaz
war:guerre
thorny:épineux
road:route
human:humain
test:test
fence:clôture
path:chemin
scale:échelle
thrust:estoc
paint:peinture
turret:tourelle
vest:gilet
meat:viande
medical:médical
thermometer:thermomètre
medieval:médiéval
mighty:puissant
money:argent
up:haut
nuclear:nucléaire
oil:pétrole
old:vieux
podium:podium
poison:poison
police:police
waves:vagues
shoulder:épaule
totem:totem
south:sud
spade:bêche
spikes:pointes
split:fendu
spotted:tacheté
vine:vigne
thrown:lancé
trench:tranchée
tribal:tribal
glasses:lunettes
harpoon:harpon
clock:horloge
football:football
fossil:fossile
core:noyau
upgrade:amélioration
dunk:dunk
hive:ruche
log:bûche
swing:balançoire
calendar:calendrier
shoes:chaussures
nails:clous
barracks:caserne
barrel:tonneau
leak:fuite
dome:dôme
basket:panier
basketball:basket
beach:plage
bear:ours
bed:lit
beer:bière
beetle:scarabée
bell:cloche
bolas:bolas
bleeding:saignant
boar:sanglier
tusks:défenses
balance:balance
cutter:cutter
cast:lancer
knot:nœud
pin:épingle
boxing:boxe
bread:pain
zone:zone
bubble:bulle
bubbling:bouillonnant
bull:taureau
bundle:fagot
meteor:météore
bus:bus
doors:portes
finger:doigt
cactus:cactus
cooking:cuisine
phone:téléphone
cape:cape
pick:pioche
cargo:cargaison
crane:grue
cave:grotte
camera:appareil photo
mail:courrier
chalice:calice
explosive:explosif
cloak:cape
wagon:chariot
cup:coupe
coins:pièces
glider:planeur
corner:coin
crab:crabe
crescent:croissant
staff:bâton
bones:os
nest:nid
crowned:couronné
bars:barreaux
growth:croissance
cut:coupe
daemon:démon
deer:cerf
eagle:aigle
red:rouge
hilt:garde
smile:sourire
eight:huit
twenty:vingt
dinosaur:dinosaure
direction:direction
roller:rouleau
dove:colombe
balls:balles
splash:éclaboussure
drum:tambour
duck:canard
dwarf:nain
crack:fissure
spit:broche
worm:ver
electrical:électrique
elf:elfe
rays:rayons
extra:extra
to:vers
fairy:fée
down:bas
forward:avant
film:film
print:empreinte
iris:iris
ray:raie
eggs:œufs
spoon:cuillère
fist:poing
mass:masse
flip:retournement
ghost:fantôme
food:nourriture
front:avant
teeth:dents
fruit:fruit
pizza:pizza
pump:pompe
pendant:pendentif
squid:calmar
globe:globe
goblin:gobelin
grass:herbe
grave:tombe
symbol:symbole
sprout:pousse
guitar:guitare
halberd:hallebarde
suit:costume
disabled:handicapé
organ:organe
fighter:combattant
white:blanc
hieroglyph:hiéroglyphe
oak:chêne
internal:interne
horned:cornu
keys:clés
village:village
i:
plug:prise
kitchen:cuisine
knee:genou
banner:bannière
large:large
brush:pinceau
leather:cuir
advanced:avancé
jacket:veste
spanner:clé à molette
rings:anneaux
soap:savon
tongue:langue
magnet:aimant
manual:manuel
maze:labyrinthe
submarine:sous-marin
mirror:miroir
moebius:moebius
triangle:triangle
mountain:montagne
watering:arrosage
musical:musical
nested:emboîté
night:nuit
velociraptor:vélociraptor
orange:orange
pearl:perle
plane:avion
party:fête
pencil:crayon
person:personne
pool:billard
table:table
speaker:haut-parleur
pumpkin:citrouille
slash:entaille
quill:plume d'oie
radar:radar
ram:bélier
rank:grade
robber:voleur
struck:frappé
sailboat:voilier
off:éteint
shotgun:fusil à pompe
scroll:parchemin
turtle:tortue
sewing:couture
shark:requin
shattered:éclaté
shining:rayonnant
sliced:tranché
snail:escargot
snowflake:flocon de neige
soccer:football
solar:solaire
sound:son
space:espace
stapler:agrafeuse
static:statique
steam:vapeur
subway:métro
t:T
team:équipe
tracks:traces
templar:templier
tennis:tennis
tesla:tesla
thunder:tonnerre
tv:télévision
vibrating:vibrant
walking:marchant
wind:vent
wolf:loup
heel:talon
megaphone:mégaphone
signal:signal
bike:vélo
balloon:ballon
force:force
hatch:trappe
alarm:alarme
all:tout
clip:trombone
ambulance:ambulance
ammonite:ammonite
ruins:ruines
screw:vis
angel:ange
animal:animal
rotation:rotation
anvil:enclume
capsule:capsule
maggot:asticot
arc:arc
archive:archive
sling:fronde
armadillo:tatou
downgrade:rétrogradation
armored:blindé
arrowhead:pointe de flèche
artificial:artificiel
assassin:assassin
at:arobase
atom:atome
stump:souche
flake:flocon
baby:bébé
players:joueurs
back:dos
backpack:sac à dos
backward:arrière
bad:mauvais
bamboo:bambou
gavel:marteau de juge
bank:banque
wire:fil
barbute:barbute
barn:grange
owl:hibou
tent:tente
barrier:barrière
base:base
baseball:baseball
hound:chien de chasse
baton:bâton
minus:moins
plus:plus
mech:mecha
bayonet:baïonnette
beehive:ruche
pepper:poivron
limb:membre
scepter:sceptre
bloody:sanglant
pass:col
horizon:horizon
propeller:hélice
bubbles:bulles
bomber:bombardier
bombing:bombardement
run:course
storm:tempête
boots:bottes
bottled:en bouteille
bottom:bas
boulder:rocher
dash:ruée
bouncing:bondissant
spring:ressort
rice:riz
branch:branche
brass:cuivre
brazil:brésil
pottery:poterie
broom:balai
bud:bourgeon
net:filet
bulb:ampoule
bullets:balles
minion:sbire
bunker:bunker
assault:assaut
slippers:pantoufles
buoy:bouée
burn:brûlure
burst:éclatement
stop:stop
butter:beurre
warning:avertissement
cake:gâteau
camel:chameau
goose:oie
canoe:canoë
captain:capitaine
play:lecture
random:aléatoire
cardboard:carton
crate:caisse
carpet:tapis
ceiling:plafond
celebration:célébration
centaur:centaure
chained:enchaîné
drops:gouttes
cork:bouchon
charging:chargeant
chariot:char
chart:graphique
checkered:à damier
pawn:pion
chewed:mâché
church:église
sparks:étincelles
circular:circulaire
city:ville
knowledge:savoir
cleaver:hachoir
cliff:falaise
crossing:traversée
figure:silhouette
cloth:tissu
clover:trèfle
de:de
coal:charbon
beans:grains
mug:chope
cog:rouage
cold:froid
column:colonne
vase:vase
comet:comète
fan:éventail
console:console
controller:manette
shoe:chaussure
spices:épices
catcher:attrape-rêves
corn:maïs
covered:couvert
cowboy:cow-boy
cpu:processeur
crafting:artisanat
cricket:cricket
tape:ruban adhésif
croc:crocodile
pupil:pupille
crook:houlette
flail:fléau
flare:fusée éclairante
chains:chaînes
crosshair:réticule
crow:corbeau
dive:plongeon
crush:écrasement
cubes:cubes
curled:recourbé
curling:curling
vines:vignes
curly:bouclé
lemon:citron
cycle:cycle
pull:traction
daggers:dagues
dart:fléchette
note:note
defense:défense
perfume:parfum
delivery:livraison
desk:bureau
devil:diable
dig:fouille
rex:rex
divided:divisé
diving:plongée
pillar:pilier
doctor:médecin
domino:domino
kebab:kebab
street:rue
drakkar:drakkar
dread:effroi
drill:perceuse
honey:miel
weapon:arme
kit:trousse
duality:dualité
dumpling:ravioli
dungeon:donjon
dust:poussière
dynamite:dynamite
america:amérique
eating:mangeant
pod:cosse
sphinx:sphinx
walk:marche
pad:coussinet
electric:électrique
elephant:éléphant
ear:oreille
emerald:émeraude
hourglass:sablier
materials:matériaux
vision:vision
horus:horus
clef:clé de sol
factory:usine
family:famille
noodles:nouilles
fat:gros
legs:jambes
projector:projecteur
first:premier
monster:monstre
spin:rotation
flamethrower:lance-flammes
flatbed:plateau
flexible:souple
floor:sol
twirl:tourbillon
flowers:fleurs
flute:flûte
fog:brouillard
folded:plié
plaster:plâtre
fragmented:fragmenté
creature:créature
french:français
fried:frit
mallet:maillet
folder:dossier
fur:fourrure
gamepad:manette de jeu
giant:géant
gift:cadeau
gloves:gants
glowing:luisant
hands:mains
goal:but
scarab:scarabée
tee:tee
eyed:aux yeux
molecule:molécule
grab:saisie
grain:grain
piano:piano
grasping:agrippant
grease:graisse
great:grand
greek:grec
green:vert
griffin:griffon
reaper:faucheuse
hamburger:hamburger
break:rupture
sickle:faucille
hanging:suspendu
healing:guérison
inside:intérieur
stake:pieu
collar:collier
triskelion:triskèle
helicopter:hélicoptère
tide:marée
hill:colline
conquest:conquête
fort:fort
hobbit:hobbit
ladder:échelle
garage:garage
hooded:encapuchonné
reptile:reptile
horse:cheval
hospital:hôpital
meal:repas
hunting:chasse
hydra:hydre
hypersonic:hypersonique
cream:crème
cone:cornet
skate:patin
icicles:stalactites de glace
idea:idée
imp:diablotin
infinity:infini
ink:encre
self:soi
interleaved:entrelacé
invisible:invisible
aperture:diaphragme
jelly:gelée
jet:jet
jigsaw:puzzle
piece:pièce
juggling:jonglage
seal:phoque
jumping:sautant
justice:justice
pearls:perles
kevlar:kevlar
keyboard:clavier
scooter:trottinette
kiwi:kiwi
stars:étoiles
coat:manteau
laurels:lauriers
letter:lettre
sabers:sabres
helix:hélice
shout:cri
tear:larme
lily:lys
lips:lèvres
candelabra:candélabre
spy:espion
long:long
lotus:lotus
howl:hurlement
lovers:amoureux
lunar:lunaire
portal:portail
male:homme
mars:mars
match:allumette
tip:pointe
mecha:mecha
army:armée
melting:fondant
mesh:maille
network:réseau
plate:assiette
skirt:jupe
microphone:micro
microscope:microscope
military:militaire
mineral:minéral
mining:minage
mite:acarien
monkey:singe
wrench:clé à molette
grasp:prise
valley:vallée
orbit:orbite
mortar:mortier
mouse:souris
muscle:muscle
mushrooms:champignons
nailed:cloué
bot:robot
new:nouveau
next:suivant
nose:nez
nurse:infirmière
office:bureau
omega:oméga
sight:visée
treasure:trésor
orbital:orbital
oyster:huître
planks:planches
windmill:moulin à vent
bust:buste
pie:tarte
pierced:percé
pig:cochon
pill:pilule
pistol:pistolet
roots:racines
previous:précédent
radio:radio
watch:montre
third:troisième
pointy:pointu
polar:polaire
polo:polo
marker:marqueur
post:poteau
with:avec
beads:perles
pouring:versant
powder:poudre
prayer:prière
cooker:cuiseur
primitive:primitif
torch:torche
private:privé
quick:rapide
rabbit:lapin
radiations:radiations
raise:lever
zombie:zombie
razor:rasoir
scythe:faux
rifle:fusil
ringing:sonnant
rock:rocher
flight:vol
suitcase:valise
roman:romain
rune:rune
running:courant
tooth:dent
saloon:saloon
sand:sable
sauropod:sauropode
sausage:saucisse
save:sauvegarde
scalpel:scalpel
school:école
schrodingers:de Schrödinger
scorpion:scorpion
scout:éclaireur
scuba:plongée
secret:secret
rack:râtelier
pointed:pointu
shambling:titubant
shinto:shinto
stork:cigogne
shopping:courses
shorts:short
siege:siège
sinking:coulant
skateboarding:skateboard
syringe:seringue
slap:gifle
sleeveless:sans manches
slime:gelée
small:petit
smartphone:smartphone
volcano:volcan
soda:soda
soul:âme
spartan:spartiate
spectre:spectre
whale:baleine
web:toile
trunk:tronc
altar:autel
steel:acier
frame:cadre
throne:trône
striped:rayé
strong:fort
supersonic:supersonique
surfer:surfeur
van:camionnette
surprised:surpris
surrounded:encerclé
swamp:marais
swan:cygne
tread:chenille
world:monde
teapot:théière
leaves:feuilles
tubes:tubes
theater:théâtre
thompson:thompson
thor:thor
thumb:pouce
tiger:tigre
transparent:transparent
yin:yin
trumpet:trompette
tune:mélodie
turbine:turbine
umbrella:parapluie
underwear:sous-vêtement
unlit:éteint
unstable:instable
venus:vénus
vertical:vertical
video:vidéo
warlock:sorcier
wavy:ondulé
wax:cire
lifting:haltérophilie
william:guillaume
tell:tell
window:fenêtre
wine:vin
winter:hiver
witch:sorcière
wizard:magicien
wrapped:emballé
abacus:boulier
abbot:abbé
abdominal:abdominal
accordion:accordéon
achievement:succès
achilles:achille
acorn:gland
acoustic:acoustique
acrobatic:acrobatique
aerial:aérien
aero:aéro
aerodynamic:aérodynamique
aerosol:aérosol
afterburn:postcombustion
agave:agave
ages:âges
arrival:arrivée
departure:départ
airtight:hermétique
akhet:akhet
algae:algues
algeria:algérie
stare:regard fixe
for:pour
seeing:voyant
allied:allié
alligator:alligator
almond:amande
amber:ambre
mosquito:moustique
amethyst:améthyste
ammo:munitions
amphora:amphore
ample:ample
amplitude:amplitude
amputation:amputation
anarchy:anarchie
anatomy:anatomie
anchor:ancre
columns:colonnes
android:androïde
andromeda:andromède
outfit:tenue
angler:baudroie
angola:angola
angry:en colère
angular:anguleux
hide:peau
ankh:ankh
annexation:annexion
ant:fourmi
antarctica:antarctique
anteater:fourmilier
anthem:hymne
anti:anti
aircraft:aérien
antibody:anticorps
anticlockwise:antihoraire
ants:fourmis
anubis:anubis
apc:blindé
apollo:apollon
apothecary:apothicaire
seeds:graines
aquarium:aquarium
aquarius:verseau
aqueduct:aqueduc
arabic:arabe
triomphe:triomphe
arch:arche
archaeopteryx:archéoptéryx
archer:archer
archery:tir à l'arc
architect:architecte
register:registre
research:recherche
arcing:en arc
arena:arène
aries:bélier
armchair:fauteuil
blueprint:plan
cuisses:cuissards
pants:pantalon
armoured:blindé
arrest:arrestation
cursor:curseur
flights:vols
scope:lunette de visée
arrowed:fléché
arson:incendie
artichoke:artichaut
intelligence:intelligence
artillery:artillerie
ascending:ascendant
asian:asiatique
asparagus:asperge
aspergillum:goupillon
asteroid:astéroïde
astrolabe:astrolabe
astronaut:astronaute
atlas:atlas
atomic:atomique
attached:attaché
attack:attaque
gauge:jauge
aubergine:aubergine
audio:audio
cassette:cassette
australia:australie
auto:auto
repair:réparation
autogun:canon automatique
automatic:automatique
avocado:avocat
avoidance:évitement
awareness:conscience
axolotl:axolotl
aztec:aztèque
azul:azul
babyfoot:baby-foot
forth:en avant
pain:douleur
backbone:colonne vertébrale
backgammon:backgammon
backstab:coup dans le dos
backup:sauvegarde
bacon:bacon
gnome:gnome
badger:blaireau
bagpipes:cornemuse
balaclava:cagoule
balkenkreuz:balkenkreuz
glow:lueur
ballerina:ballerine
ballista:baliste
balloons:ballons
bunch:régime
peel:pelure
peeled:épluché
roll:rouleau
bandaged:bandé
bandana:bandana
bandit:bandit
banging:cognant
banjo:banjo
banknote:billet de banque
baobab:baobab
stool:tabouret
barbarian:barbare
barbecue:barbecue
barefoot:pieds nus
barricade:barricade
jersey:maillot
basset:basset
bassoon:basson
bastet:bastet
bathtub:baignoire
battered:cabossé
batteries:piles
battleship:cuirassé
batwing:aile de chauve-souris
wake:sillage
beams:poutres
beanstalk:haricot magique
beard:barbe
beast:bête
beaver:castor
bee:abeille
beech:hêtre
stein:chope
beet:betterave
behold:contemplation
belgium:belgique
bellows:soufflet
buckles:boucles
berries:baies
berry:baie
bush:buisson
bestial:bestial
beveled:biseauté
biceps:biceps
billed:à bec
bindle:baluchon
binoculars:jumelles
biohazard:risque biologique
biplane:biplan
birch:bouleau
trees:arbres
twitter:oiseau bleu
bison:bison
blackball:boule noire
blackcurrant:cassis
blacksmith:forgeron
drag:traînée
blanket:couverture
blaster:blaster
blender:mixeur
blindfold:bandeau
blood:sang
stash:planque
blunderbuss:tromblon
bo:bâton bo
ensign:enseigne
boarding:abordage
engine:moteur
boba:boba
height:hauteur
swapping:échange
boiling:bouillant
bok:bok
choy:choy
bolivia:bolivie
bolter:bolter
gnawer:rongeur
bonsai:bonsaï
cover:couverture
bookmark:marque-page
bookmarklet:signet
bookshelf:bibliothèque
boombox:radiocassette
prints:empreintes
booze:alcool
bordered:bordé
boss:chef
vapors:vapeurs
right:droite
bowels:entrailles
bowen:bowen
bowie:bowie
alley:allée
propulsion:propulsion
bowman:archer
unpacking:déballage
surprise:surprise
bracer:brassard
bracers:brassards
dump:décharge
freeze:gel
stem:tige
brainstorm:remue-méninges
brandy:cognac
brasero:brasero
knuckles:poing américain
breaking:cassant
breastplate:plastron
briefcase:mallette
bright:brillant
broad:large
broadhead:pointe large
broadsword:épée large
broccoli:brocoli
brodie:brodie
brutal:brutal
brute:brute
excavator:pelleteuse
buffalo:buffle
bugle:clairon
call:appel
bulgaria:bulgarie
horns:cornes
bulldozer:bulldozer
bill:facture
impacts:impacts
bullseye:mille
bully:brute
bunk:superposés
beds:lits
bunny:lapin
blobs:blobs
dot:point
embers:braises
passion:passion
toast:toast
buy:achat
byzantin:byzantin
c96:C96
cabbage:chou
cable:câble
stayed:haubané
cadillac:cadillac
caduceus:caducée
caesar:césar
caged:en cage
calavera:calavera
calculator:calculatrice
caldera:caldeira
year:année
caltrops:chausse-trapes
camargue:camargue
cambodia:cambodge
campfire:feu de camp
camping:camping
canadian:canadien
cancel:annuler
cancer:cancer
holder:support
candlebright:bougie vive
candles:bougies
candlestick:chandelier
candy:bonbon
canes:cannes
canned:en conserve
cannister:bidon
cantua:cantua
capitol:capitole
capricorn:capricorne
capybara:capybara
seat:siège
carabiner:mousqueton
carambola:carambole
caravan:caravane
caravel:caravelle
discard:défausse
draw:pioche
exchange:échange
joker:joker
pickup:pick-up
carillon:carillon
carnival:carnaval
carnivore:carnivore
carnivorous:carnivore
carnyx:carnyx
carousel:carrousel
carrier:porte-avions
carrion:charogne
carrot:carotte
cartwheel:roue de charrette
cash:espèces
cassowary:casoar
catapult:catapulte
catch:prise
caterpillar:chenille
cauldron:chaudron
cavalry:cavalerie
caveman:homme des cavernes
cctv:caméra de surveillance
barnacle:bernache
cellar:cave
barrels:tonneaux
cement:ciment
centipede:mille-pattes
centurion:centurion
ceremonial:cérémoniel
heads:têtes
chaingun:mitrailleuse
chainsaw:tronçonneuse
chakram:chakram
chalk:craie
outline:contour
murder:meurtre
chameleon:caméléon
glyph:glyphe
champagne:champagne
champions:champions
chanterelles:chanterelles
character:personnage
charcuterie:charcuterie
charged:chargé
charm:breloque
chat:discussion
check:coche
checkbox:case à cocher
checked:coché
checklist:liste
cheerful:joyeux
cheese:fromage
wedge:part
chef:chef
toque:toque
chelsea:chelsea
cherish:chérir
cherry:cerise
bishop:fou
rook:tour
chestnut:châtaigne
oven:four
chili:piment
chimney:cheminée
chips:frites
chisel:ciseau
chocolate:chocolat
choice:choix
chopped:haché
chopsticks:baguettes
cigale:cigale
cigar:cigare
cigarette:cigarette
circling:tournoyant
circuitry:circuits
sawblade:lame de scie
clamp:serre-joint
clapperboard:clap
clarinet:clarinette
classical:classique
clay:argile
claymore:claymore
cleopatra:cléopâtre
click:clic
cloaked:encapé
horseback:à cheval
clockwise:horaire
clockwork:mécanisme
clothes:vêtements
clothesline:corde à linge
clothespin:pince à linge
download:téléchargement
upload:envoi
cloudy:nuageux
clout:claque
clown:clown
clownfish:poisson-clown
coa:armoiries
jima:jima
cobra:cobra
cobweb:toile d'araignée
coconuts:noix de coco
coffin:cercueil
cogsplosion:explosion de rouages
coiled:enroulé
nail:clou
coiling:s'enroulant
curl:boucle
coinflip:pile ou face
coliseum:colisée
colombia:colombie
colombian:colombien
statue:statue
colt:colt
m1911:M1911
coma:coma
comb:peigne
combination:combinaison
commercial:commercial
compact:compact
companion:compagnon
compass:boussole
computer:ordinateur
computing:informatique
concentration:concentration
concentric:concentrique
crescents:croissants
concrete:béton
condor:condor
condylura:condylure
confirmed:confirmé
confrontation:confrontation
congress:congrès
conqueror:conquérant
contortionist:contorsionniste
contract:contrat
control:contrôle
convergence:convergence
conversation:conversation
converse:basket
convict:bagnard
convince:persuasion
conway:conway
cook:cuisinier
cookie:biscuit
cool:cool
cooler:glacière
cootie:cootie
coral:corail
corked:bouché
corkscrew:tire-bouchon
cornucopia:corne d'abondance
coronation:couronnement
corporal:caporal
corset:corset
corsica:corse
cosmic:cosmique
cotton:coton
cow:vache
holster:étui
cowled:encapuchonné
crags:rochers
credits:crédits
currency:monnaie
crenel:créneau
crenulated:crénelé
crested:à crête
crime:crime
scene:scène
croissant:croissant
croissants:croissants
crossbow:arbalète
crosscut:coupe transversale
flows:flux
axes:haches
pistols:pistolets
sabres:sabres
crossroad:carrefour
crowbar:pied-de-biche
coin:pièce
thorns:épines
crucifix:crucifix
cruiser:croiseur
crumbling:qui s'effrite
cryo:cryo
chamber:chambre
crypt:crypte
shine:éclat
crystalize:cristallisation
cuauhtli:cuauhtli
cubeforce:force cubique
cuckoo:coucou
cultist:cultiste
cupcake:cupcake
cupidon:cupidon
cursed:maudit
curvy:courbe
custodian:gardien
cyber:cyber
cyborg:cyborg
cycling:cyclisme
cyclops:cyclope
cz:CZ
skorpion:skorpion
d10:d10
d12:d12
d4:d4
daisy:marguerite
dam:barrage
damaged:endommagé
dandelion:pissenlit
dango:dango
dark:sombre
squad:escouade
database:base de données
deadly:mortel
juice:jus
deathcab:corbillard
decapitation:décapitation
track:piste
defensive:défensif
defibrilate:défibrillation
deku:deku
delicate:délicat
delighted:ravi
drone:drone
demolish:démolition
dervish:derviche
deshret:deshret
despair:désespoir
detonator:détonateur
detour:détour
dew:rosée
diablo:diabolo
diagram:diagramme
dial:cadran
hard:dur
dug:creusé
digital:numérique
trace:tracé
dimetrodon:dimétrodon
diplodocus:diplodocus
diploma:diplôme
signs:signes
director:réalisateur
direwolf:loup géant
discobolus:discobole
discussion:discussion
disintegrate:désintégration
distraction:distraction
distress:détresse
divergence:divergence
divert:dérivation
djed:djed
djembe:djembé
djinn:djinn
dna1:ADN
dna2:ADN
dodge:esquive
dodging:esquivant
dodo:dodo
dolmen:dolmen
dolphin:dauphin
tiles:tuiles
doner:döner
donkey:âne
donut:donut
watcher:guetteur
doorway:embrasure
dorsal:dorsal
diaphragm:diaphragme
quaver:croche
doubled:doublé
dough:pâte
dozen:douzaine
dragonfly:libellule
drama:théâtre
masks:masques
drawbridge:pont-levis
dreadnought:cuirassé
dream:rêve
drink:boisson
me:moi
drinking:buvant
droplet:gouttelette
droplets:gouttelettes
drowning:noyade
duel:duel
duffel:polochon
bao:bao
dunce:bonnet d'âne
duration:durée
dutch:néerlandais
dwennimmen:dwennimmen
earbuds:écouteurs
europe:europe
asia:asie
oceania:océanie
earwig:perce-oreille
easel:chevalet
easter:pâques
pelican:pélican
echo:écho
ripples:ondulations
ecology:écologie
edge:bord
edged:tranchant
eel:anguille
clutch:couvée
egypt:égypte
pyramids:pyramides
urns:urnes
elbow:coude
elderberry:sureau
resistance:résistance
socket:prise
elevator:ascenseur
elven:elfique
elysium:élysée
shade:ombre
ember:braise
embrassed:gêné
embryo:embryon
chessboard:échiquier
encirclement:encerclement
encrypted:chiffré
channel:canal
energise:dynamisation
engagement:engagement
enlightenment:illumination
enrage:rage
ent:ent
entangled:emmêlé
typhoon:typhon
entry:entrée
envelope:enveloppe
erlenmeyer:erlenmeyer
ermine:hermine
eruption:éruption
escalator:escalator
eternal:éternel
european:européen
evasion:évasion
executioner:bourreau
exit:sortie
expand:agrandissement
expanded:agrandi
expander:extenseur
expense:dépense
exploding:explosant
meeting:réunion
lucid:lucide
extraction:extraction
eyeball:globe oculaire
eyedropper:pipette
eyelashes:cils
eyepatch:cache-œil
eyestalk:œil pédonculé
f:F
f1:F1
falcon:faucon
ovoid:ovoïde
rocks:rochers
fallout:retombées
shelter:abri
famas:famas
fanged:à crocs
farm:ferme
tractor:tracteur
farmer:fermier
feathered:à plumes
fedora:fedora
feline:félin
fencer:escrimeur
fern:fougère
fertilizer:engrais
fetus:fœtus
fez:fez
figurehead:figure de proue
files:fichiers
spool:bobine
strip:bande
finch:pinson
fingernail:ongle
fingers:doigts
finish:arrivée
line:ligne
extinguisher:extincteur
silhouette:silhouette
fireball:boule de feu
fireflake:flocon de feu
fireplace:cheminée
firewall:pare-feu
firework:feu d'artifice
aid:secours
cooked:cuit
corpse:cadavre
escape:évasion
fishbone:arête
fishhook:hameçon
jig:leurre
lure:leurre
pole:canne
fission:fission
fizzing:pétillant
objective:objectif
tunnel:tunnel
flamed:flambé
flamer:lance-flammes
soldier:soldat
sheet:feuille
flamingo:flamant rose
flanged:à ailettes
flash:flash
flashlight:lampe torche
flatfish:poisson plat
flax:lin
fleshy:charnu
fleur:fleur
lys:de lys
flint:silex
flops:tongs
platforms:plateformes
flood:inondation
polisher:polisseuse
flour:farine
fly:mouche
trout:truite
fn:FN
fal:FAL
foam:mousse
foamy:mousseux
focused:concentré
fomorian:fomoire
trip:croche-pied
footprint:empreinte de pas
footsteps:pas
footy:football
forearm:avant-bras
forklift:chariot élévateur
foundry:fonderie
pen:stylo
fragrance:parfum
france:france
frankenstein:frankenstein
frayed:effiloché
freedom:liberté
freemasonry:franc-maçonnerie
fries:frites
fridge:réfrigérateur
frisbee:frisbee
froe:départoir
prince:prince
frontal:frontal
lobe:lobe
frostfire:feu de givre
fruiting:fructifiant
fuel:carburant
fuji:fuji
fulguro:fulguro
motorcycle:moto
funnel:entonnoir
furnace:fourneau
g:G
galaxy:galaxie
galea:galea
galleon:galion
galley:galère
game:jeu
gardening:jardinage
gargoyle:gargouille
garlic:ail
stove:cuisinière
gauls:gaulois
gauntlet:gantelet
gaze:regard
pattern:motif
gears:engrenages
gecko:gecko
gemini:gémeaux
gems:gemmes
ally:allié
gibbet:gibet
gingerbread:pain d'épices
ginkgo:ginkgo
gladius:glaive
glaive:glaive
glock:glock
gloop:glu
artifact:artefact
gluttonous:glouton
gluttony:gourmandise
keeper:gardien
goat:chèvre
nuggets:pépites
gong:gong
spurt:jet
gorilla:gorille
gothic:gothique
gps:GPS
graduate:diplômé
granary:grenier
grand:grand
grapes:raisin
grapple:grappin
slug:limace
graveyard:cimetière
gravitation:gravitation
greaves:jambières
greenhouse:serre
grim:sinistre
ground:sol
groundbreaker:fend-terre
grouped:groupé
guarded:gardé
guards:gardes
guatemala:guatemala
guillotine:guillotine
bass:basse
stock:crosse
gunshot:coup de feu
gym:salle de sport
gyroscope:gyroscope
h2o:H2O
habitat:habitat
hades:hadès
hair:cheveux
strands:mèches
crawling:rampant
halt:halte
ham:jambon
shank:jarret
menu:menu
grip:prise
god:dieu
ok:OK
handcuffed:menotté
handcuffs:menottes
handheld:portable
hang:pendaison
hanger:cintre
happy:heureux
harbor:port
dock:quai
harp:harpe
harpy:harpie
harry:harry
potter:potter
hasty:hâtif
hatchet:hachette
hatchets:hachettes
haunting:hanté
hawk:faucon
hazard:danger
hazmat:hazmat
headband:bandeau
headphones:casque audio
headshot:tir à la tête
decrease:baisse
increase:hausse
normal:normal
hearing:ouïe
beats:battements
heartburn:brûlure de cœur
heat:chaleur
haze:brume
heaven:paradis
rain:pluie
timer:minuteur
hedgehog:hérisson
hedjet:hedjet
helicoprion:hélicoprion
hell:enfer
crosses:croix
help:aide
hemp:chanvre
heptagram:heptagramme
heraldic:héraldique
herbs:herbes
heron:héron
hexagonal:hexagonal
nut:écrou
hexes:hexagones
hidden:caché
y:Y
highlighter:surligneur
hiking:randonnée
hills:collines
histogram:histogramme
mind:esprit
dwelling:habitation
hockey:hockey
hollow:creux
holosphere:holosphère
grail:graal
home:maison
honeycomb:rayon de miel
honeypot:pot de miel
hoodie:sweat à capuche
hoof:sabot
hops:houblon
horizontal:horizontal
horseshoe:fer à cheval
surface:surface
cannonball:boulet de canon
hummingbird:colibri
hungary:hongrie
hunter:chasseur
hut:hutte
huts:huttes
hyena:hyène
melon:melon
hypodermic:hypodermique
ibis:ibis
icarus:icare
scoop:boule
pop:glace à l'eau
iceberg:iceberg
icebergs:icebergs
iceland:islande
id:identité
ifrit:ifrit
igloo:igloo
imbricated:imbriqué
laugh:rire
point:point
imperial:impérial
implosion:implosion
imprisoned:emprisonné
inauguration:inauguration
incense:encens
incisors:incisives
incoming:entrant
incubator:incubateur
india:inde
indian:indien
palace:palais
inferno:brasier
infested:infesté
info:info
injustice:injustice
inner:intérieur
insect:insecte
inspiration:inspiration
interceptor:intercepteur
interdiction:interdiction
interlaced:entrelacé
injury:blessure
interstellar:interstellaire
intricate:complexe
ion:ion
ionic:ionique
iraq:irak
hulled:à coque
warship:navire de guerre
island:île
italia:italie
ivory:ivoire
j:J
james:james
bond:bond
japan:japon
japanese:japonais
jasmine:jasmin
jason:jason
jawbone:mâchoire
jawless:sans mâchoire
cyclop:cyclope
jeep:jeep
jellyfish:méduse
jerrycan:jerrican
jerusalem:jérusalem
jester:bouffon
jetpack:jetpack
jewel:bijou
jeweled:serti
join:jonction
joint:articulation
journey:voyage
joystick:joystick
jug:cruche
juggler:jongleur
jump:saut
across:à travers
jungle:jungle
jupiter:jupiter
kaleidoscope:kaléidoscope
kangaroo:kangourou
katana:katana
kenku:kenku
kenya:kenya
ketchup:ketchup
keyring:porte-clés
kid:enfant
slide:toboggan
kidneys:reins
kimono:kimono
kindle:liseuse
ju:ju
knives:couteaux
kite:cerf-volant
klingon:klingon
knapsack:havresac
kneeling:à genoux
knocked:assommé
out:dehors
knockout:K.-O.
koala:koala
koholint:koholint
kraken:kraken
kusarigama:kusarigama
l:L
lab:laboratoire
labrador:labrador
ladders:échelles
ladle:louche
ladybug:coccinelle
lambda:lambda
lamellar:lamellaire
lamprey:lamproie
land:terre
laptop:ordinateur portable
precision:précision
laserburn:brûlure laser
lasso:lasso
latvia:lettonie
laurel:laurier
lava:lave
law:loi
layered:en couches
lead:plomb
leaky:qui fuit
leapfrog:saute-mouton
led:LED
lee:lee
enfield:enfield
leeching:sangsue
leek:poireau
leo:lion
end:fin
lever:levier
liar:menteur
liberty:liberté
libra:balance
libya:libye
support:soutien
lift:ascenseur
lighter:briquet
lighthouse:phare
branches:branches
dissipation:dissipation
electron:électron
frequency:fréquence
trio:trio
pads:coussinets
linden:tilleul
linked:lié
lion:lion
lipstick:rouge à lèvres
liquid:liquide
lit:allumé
liver:foie
lizard:lézard
lizardman:homme-lézard
load:chargement
lob:lob
picking:crochetage
fortress:forteresse
lockers:casiers
lockpicks:crochets
logging:bûcheronnage
nand:NON-ET
nor:NON-OU
not:NON
nxor:NON-OU exclusif
or:OU
xor:OU exclusif
loincloth:pagne
antennae:antennes
legged:à pattes
look:regard
lorgnette:face-à-main
lost:perdu
louvre:louvre
injection:injection
mystery:mystère
song:chanson
low:bas
luchador:luchador
lucifer:lucifer
lucky:chanceux
fisherman:pêcheur
luger:luger
module:module
lungs:poumons
lynx:lynx
lyre:lyre
m3:M3
mac:mac
machete:machette
magazine:chargeur
mad:fou
scientist:scientifique
magick:magie
trick:tour
magnifying:loupe
mailbox:boîte aux lettres
mailed:cotte de mailles
mammoth:mammouth
manacles:fers
mandrill:mandrill
manta:raie manta
mantrap:piège à homme
juicer:presse-agrumes
grinder:moulin
maple:érable
maracas:maracas
marble:marbre
marbles:billes
marrow:moelle
drain:bonde
curiosity:curiosité
pathfinder:éclaireur
marshmallows:guimauves
martini:martini
martyr:martyr
memorial:mémorial
masked:masqué
mason:maçon
driver:conducteur
master:maître
arms:armes
matchbox:boîte d'allumettes
science:science
matryoshka:matriochka
dolls:poupées
matter:matière
states:états
mayan:maya
cornea:cornée
measure:mesure
mechanic:mécanicien
mechanical:mécanique
medallist:médaillé
drip:perfusion
medicine:médicament
pills:pilules
medicines:médicaments
pavilion:pavillon
meditation:méditation
medusa:méduse
group:groupe
megabot:mégarobot
menhir:menhir
mermaid:sirène
detector:détecteur
metroid:metroid
metronome:métronome
mexico:mexique
microchip:puce
lens:objectif
mid:mi
summit:sommet
middle:milieu
midnight:minuit
boosh:boosh
milk:lait
carton:brique
millenium:millénaire
mimic:mimique
minefield:champ de mines
miner:mineur
minerals:minéraux
mini:mini
minigun:minigun
minions:sbires
minotaur:minotaure
miracle:miracle
medecine:médecine
misdirection:diversion
launcher:lanceur
swarm:essaim
moai:moaï
modern:moderne
moka:moka
moldova:moldavie
mole:taupe
molotov:molotov
mona:mona
lisa:lisa
moncler:moncler
mongolia:mongolie
monk:moine
mono:mono
monstera:monstera
monument:monument
bats:chauves-souris
mooring:amarrage
bollard:bollard
morbid:morbide
humour:humour
morgue:morgue
feet:pieds
morph:métamorphose
climbing:escalade
mountains:montagnes
mountaintop:sommet
mounted:monté
move:déplacement
movement:mouvement
sensor:capteur
mp:MP
mp5:MP5
mp5k:MP5K
mucous:muqueux
multi:multi
directions:directions
multiple:multiples
targets:cibles
mummy:momie
muscular:musclé
torso:torse
music:musique
notes:notes
score:partition
musket:mousquet
mussel:moule
mustache:moustache
mute:muet
nachos:nachos
nano:nano
nautilus:nautile
neck:cou
display:affichage
nectar:nectar
nefertiti:néfertiti
birds:oiseaux
eclipses:éclipses
hexagons:hexagones
born:né
shoot:pousse
newspaper:journal
nigeria:nigeria
sky:ciel
sleep:sommeil
heroic:héroïque
stance:posture
nodular:noueux
noodle:nouille
north:nord
side:côté
notebook:carnet
nothing:rien
say:dire
waste:déchet
nun:religieuse
nunchaku:nunchaku
o:O
oasis:oasis
oat:avoine
obelisk:obélisque
observatory:observatoire
ocarina:ocarina
occupy:occupation
octogonal:octogonal
octoman:homme-pieuvre
octopus:pieuvre
oden:oden
offshore:en mer
ogre:ogre
rig:plateforme pétrolière
oily:huileux
olive:olive
oni:oni
onigori:onigiri
opened:ouvert
opening:ouverture
ophanim:ophanim
ophiuchus:serpentaire
oppidum:oppidum
opposite:opposé
oppression:oppression
orc:orque
ore:minerai
organigram:organigramme
orrery:planétaire
ostrich:autruche
otamatone:otamatone
ouroboros:ouroboros
outback:outback
over:au-dessus
overdose:surdose
overdrive:surrégime
overhead:en hauteur
overkill:surpuissance
overlord:suzerain
overmind:surintelligence
p90:P90
packed:emballé
paddle:pagaie
steamer:vapeur
paddles:pagaies
pagoda:pagode
painted:peint
palette:palette
palisade:palissade
pan:poêle
panda:panda
pangolin:pangolin
panzerfaust:panzerfaust
crumpled:froissé
tray:plateau
papers:papiers
papyrus:papyrus
parachute:parachute
paraguay:paraguay
paranoia:paranoïa
parasaurolophus:parasaurolophus
park:parc
bench:banc
parmecia:paramécie
parrot:perroquet
flags:drapeaux
popper:pétard
passport:passeport
distance:distance
tile:tuile
pauldrons:épaulières
pause:pause
pay:paiement
pc:PC
peace:paix
peach:pêche
peaks:sommets
peanut:cacahuète
pear:poire
earring:boucle d'oreille
peas:petits pois
pegasus:pégase
pelvis:bassin
ruler:règle
pendulum:pendule
penguin:pingouin
pentacle:pentacle
pentagram:pentagramme
pentarrows:cinq flèches
periscope:périscope
perpendicular:perpendiculaire
blizzard:blizzard
peru:pérou
pestle:pilon
pharoah:pharaon
philosopher:philosophe
photo:photo
phrygian:phrygien
pianist:pianiste
destiny:destin
pickelhaube:casque à pointe
pickle:cornichon
piercing:perçant
piggy:tirelire
pikeman:piquier
pilgrim:pèlerin
pillow:oreiller
pimiento:piment
pinata:piñata
pinball:flipper
flipper:flipper
pincers:pinces
pine:pin
pineapple:ananas
ping:ping
pong:pong
pipes:tuyaux
piranha:piranha
pisa:pise
pisces:poissons
pitchfork:fourche
plague:peste
pilot:pilote
seed:graine
plants:plantes
animals:animaux
plasma:plasma
plastic:plastique
plastron:plastron
plesiosaurus:plésiosaure
plow:charrue
plum:prune
plunger:ventouse
second:deuxième
winner:gagnant
pointing:pointant
pokecog:pokérouage
poker:poker
poland:pologne
badge:badge
officer:officier
pollen:pollen
poncho:poncho
popcorn:pop-corn
pope:pape
poppy:coquelicot
porcelain:porcelaine
porcupine:porc-épic
porcupinefish:poisson porc-épic
portculis:herse
portrait:portrait
portugal:portugal
position:position
stamp:tampon
potato:pomme de terre
madness:folie
pouch:bourse
pounce:bond
generator:générateur
prank:farce
praying:priant
mantis:mante religieuse
present:cadeau
pressure:pression
pretty:joli
pretzel:bretzel
price:prix
tag:étiquette
prism:prisme
prisoner:prisonnier
class:classe
processor:processeur
profit:profit
progression:progression
beanie:bonnet
protection:protection
pschent:pschent
psychic:psychique
pterodactylus:ptérodactyle
pteruges:ptéruges
public:public
pulley:poulie
pulse:pouls
pummeled:roué de coups
punching:frappant
puppet:marionnette
purple:violet
push:poussée
puzzle:puzzle
pylon:pylône
pyre:bûcher
pyromaniac:pyromane
qaitbay:qaitbay
citadel:citadelle
quake:séisme
quicksand:sables mouvants
quiver:carquois
raccoon:raton laveur
race:course
section:section
dish:antenne
sweep:balayage
raddish:radis
radial:radial
radioactive:radioactif
raft:radeau
ragged:déchiré
rail:rail
railway:chemin de fer
rainbow:arc-en-ciel
raining:pluvieux
rake:râteau
rally:ralliement
troops:troupes
ranch:ranch
rapidshare:partage rapide
raspberry:framboise
rat:rat
rattlesnake:crotale
raven:corbeau
raw:cru
reactor:réacteur
read:lecture
rear:arrière
receive:réception
recycle:recyclage
reed:roseau
refinery:raffinerie
regeneration:régénération
relationship:relation
bounds:limites
relic:relique
reload:rechargement
remedy:remède
rempart:rempart
resize:redimensionnement
resonance:résonance
resting:au repos
reticule:réticule
retro:rétro
return:retour
revolt:révolte
revolver:revolver
rhinoceros:rhinocéros
rialto:rialto
ribcage:cage thoracique
ricochet:ricochet
mould:moule
ringmaster:monsieur loyal
riot:émeute
riposte:riposte
river:rivière
roast:rôti
robe:robe
robin:rouge-gorge
antennas:antennes
thruster:propulseur
rocking:à bascule
rod:bâton
asclepius:asclépios
rogue:voleur
rolled:roulé
dices:dés
toga:toge
rooster:coq
root:racine
ropeway:téléphérique
rosa:rosa
rotary:rotatif
rough:rugueux
knob:bouton
silo:silo
straw:paille
bale:botte
royal:royal
rss:RSS
rub:rub
el:el
hizb:hizb
rubber:caoutchouc
rugby:rugby
conversion:transformation
rule:règle
rupee:roupie
rusty:rouillé
s:S
toothed:denté
choc:choc
sacrificial:sacrificiel
sad:triste
saddle:selle
safety:sécurité
sagittarius:sagittaire
sai:saï
sail:voile
saint:saint
basil:basile
cathedral:cathédrale
saiyan:saiyan
sake:saké
salamander:salamandre
salmon:saumon
salt:sel
shaker:salière
samara:samara
mosque:mosquée
samurai:samouraï
samus:samus
sandal:sandale
sands:sables
sandstorm:tempête de sable
sandwich:sandwich
santa:père noël
saphir:saphir
sarcophagus:sarcophage
sasquatch:sasquatch
communication:communication
saucepan:casserole
sausages:saucisses
sawed:scié
saxophone:saxophone
scabbard:fourreau
scallop:coquille saint-jacques
scar:cicatrice
scarecrow:épouvantail
alive:vivant
scissors:ciseaux
scorpio:scorpion
screaming:hurlant
screen:écran
screwdriver:tournevis
unfurled:déployé
tanks:chars
serpent:serpent
urchin:oursin
seagull:mouette
seahorse:hippocampe
seated:assis
security:sécurité
seedling:semis
select:sélection
sell:vente
semi:semi
sensuousness:sensualité
sentry:sentinelle
sergeant:sergent
serrated:dentelé
server:serveur
sesame:sésame
settings:réglages
knobs:boutons
seven:sept
severed:tranché
sewed:cousu
sextant:sextant
follower:disciple
shaking:tremblant
mound:monticule
shamrock:trèfle
shard:éclat
share:partage
fin:nageoire
sharped:aiguisé
shatter:éclatement
sheep:mouton
sheikah:sheikah
shepherds:bergers
sherlock:sherlock
holmes:holmes
bash:coup
bounces:rebonds
echoes:échos
opposition:opposition
reflect:réflexion
shieldcomb:peigne-bouclier
purse:porte-monnaie
wreck:épave
shoebill:bec-en-sabot
shooner:goélette
shop:boutique
cart:caddie
rounds:cartouches
shouting:criant
shower:douche
shrimp:crevette
shrug:haussement d'épaules
shut:fermé
shuttlecock:volant
sideswipe:coup de côté
silence:silence
silenced:avec silencieux
silex:silex
silver:argent
sinagot:sinagot
sing:chant
sink:évier
sinusoidal:sinusoïdal
siren:sirène
sitting:assis
skateboard:skateboard
skeletal:squelettique
ski:ski
skid:dérapage
skier:skieur
skills:compétences
skimmer:écumoire
skipping:corde à sauter
skis:skis
sabertooth:dents de sabre
signet:chevalière
slices:tranches
slalom:slalom
slashed:tailladé
slavery:esclavage
sleeping:endormi
sleepy:somnolent
slicing:tranchant
slingshot:lance-pierre
slipknot:nœud coulant
slot:machine à sous
sloth:paresseux
slow:lent
slumbering:assoupi
sanctuary:sanctuaire
sly:rusé
smart:intelligent
smash:fracas
smitten:épris
smoke:fumée
snatch:arraché
sniffing:reniflant
snitch:vif d'or
quidditch:quidditch
snorkel:tuba
snout:museau
snow:neige
snowboard:snowboard
snowing:neigeant
snowman:bonhomme de neige
experiment:expérience
socks:chaussettes
sofa:canapé
system:système
soldering:soudure
solid:solide
sombrero:sombrero
boom:boum
screech:crissement
vessel:vaisseau
korea:corée
shuttle:navette
spaceship:vaisseau spatial
spain:espagne
spirit:esprit
sparkles:étincelles
sparkling:scintillant
sabre:sabre
sparky:étincelant
sparrow:moineau
spatter:éclaboussure
spawn:apparition
node:nœud
spearfishing:chasse sous-marine
spears:lances
spectacle:spectacle
lenses:verres
spectacles:lunettes
m4:M4
speed:vitesse
speedometer:compteur de vitesse
sperm:spermatozoïde
spikeball:boule à pointes
halo:halo
init:initialisation
pit:fosse
spill:déversement
spinal:spinal
spine:colonne vertébrale
blades:lames
ribbons:rubans
bloom:floraison
lollipop:sucette
splashy:éclaboussant
stream:ruisseau
splurt:giclée
spock:spock
spooky:effrayant
sport:sport
spoted:tacheté
spoutnik:spoutnik
spray:spray
sprint:sprint
spyglass:longue-vue
squib:pétard
squirrel:écureuil
sri:sri
lanka:lanka
stabbed:poignardé
stable:écurie
stag:cerf
stahlhelm:stahlhelm
stakes:pieux
stalactites:stalactites
stalagtite:stalagmite
stamper:tampon
standing:debout
duty:service
pneumatic:pneumatique
formation:formation
prominences:protubérances
satellites:satellites
starfighter:chasseur stellaire
staryu:staryu
guard:garde
steak:steak
stealth:furtif
locomotive:locomotive
steampunk:steampunk
goggles:lunettes
steamroller:rouleau compresseur
steeltoe:coquée
steelwing:aile d'acier
steering:volant
stegosaurus:stégosaure
stethoscope:stéthoscope
steyr:steyr
aug:AUG
splitting:fendant
sticking:collant
sticky:collant
stigmata:stigmates
stiletto:stylet
stitched:cousu
stockpiles:réserves
stomach:estomac
sphere:sphère
stoned:lapidé
stopwatch:chronomètre
strafe:mitraillage
straight:droit
strawberry:fraise
clamps:pinces
splinter:écharde
strongbox:coffre-fort
regrowth:repousse
stun:étourdissement
train:train
suckered:à ventouses
sugar:sucre
cane:canne
suicide:suicide
suits:couleurs
summits:sommets
priest:prêtre
sunbeams:rayons de soleil
sundial:cadran solaire
sunflower:tournesol
sunglasses:lunettes de soleil
sunken:englouti
sunrise:lever de soleil
sunset:coucher de soleil
super:super
surf:surf
board:planche
sushis:sushis
suspension:suspension
suspicious:suspicieux
sverd:sverd
fjell:fjell
swallow:hirondelle
swallower:avaleur
breeze:brise
swap:échange
swimfins:palmes
swipe:balayage
swirled:tourbillonné
swiss:suisse
switch:interrupteur
switchblade:couteau à cran d'arrêt
switzerland:suisse
array:tableau
brandish:brandi
clash:choc
mold:moule
smithing:forge
swordman:épéiste
swordwoman:épéiste
sydney:sydney
opera:opéra
tabi:tabi
tabletop:jeu de plateau
tacos:tacos
tadpole:têtard
take:prise
my:mon
talk:parole
tall:grand
tally:décompte
tambourine:tambourin
tangerine:mandarine
tanzania:tanzanie
tapir:tapir
dummy:mannequin
poster:affiche
prize:prix
targeted:ciblé
targeting:ciblage
fool:fou
magician:magicien
priestess:prêtresse
empress:impératrice
emperor:empereur
hierophant:hiérophante
strength:force
hermit:ermite
fortune:fortune
hanged:pendu
temperance:tempérance
judgement:jugement
tattered:en lambeaux
taurus:taureau
tavern:taverne
teacher:enseignant
tearing:déchirant
tec:tec
techno:techno
telefrag:téléfrag
telepathy:télépathie
teleport:téléportation
telescope:télescope
telescopic:télescopique
teller:guichet
temporary:temporaire
temptation:tentation
court:tribunal
racket:raquette
tension:tension
tentacurl:tentacule enroulé
terror:terreur
held:tenu
texas:texas
curtains:rideaux
think:réflexion
m1:M1
m1928:M1928
thorn:épine
thorned:épineux
thought:pensée
friends:amis
throwing:lancer
charcoal:fusain
bend:virage
thunderball:boule de tonnerre
thwomp:thwomp
tiara:diadème
tic:tic
tac:tac
toe:toe
tick:tique
ticket:billet
tied:attaché
tightrope:funambule
synchronization:synchronisation
tinker:bricoleur
tipi:tipi
tired:fatigué
toad:crapaud
toaster:grille-pain
toggles:interrupteurs
token:jeton
tomahawk:tomahawk
tomato:tomate
tombstone:pierre tombale
toolbox:boîte à outils
toothbrush:brosse à dents
topaz:topaze
torc:torque
discs:disques
torpedo:torpille
tortoise:tortue
toucan:toucan
tow:remorquage
towel:serviette
toy:jouet
tracked:chenillé
trade:commerce
ready:prêt
go:partez
trail:sentier
trample:piétinement
transform:transformation
transfuse:transfusion
transportation:transport
trash:poubelle
travel:voyage
map:carte
trebuchet:trébuchet
treehouse:cabane dans un arbre
tribunal:tribunal
jury:jury
triceratops:tricératops
triforce:triforce
trigger:gâchette
hurt:blessé
trilobite:trilobite
trinacria:trinacria
triorb:triorbe
beak:bec
plier:pince
scratches:griffures
shells:coquillages
skulls:crânes
tripwire:fil-piège
triquetra:triquetra
trireme:trirème
triton:triton
troglodyte:troglodyte
trojan:troyen
troll:troll
trombone:trombone
tron:tron
trophies:trophées
shelf:étagère
tropical:tropical
trousers:pantalon
trowel:truelle
truce:trêve
tuba:tuba
tumbleweed:virevoltant
tumor:tumeur
tumulus:tumulus
pitch:tangage
tunisia:tunisie
turban:turban
turd:crotte
turnstile:tourniquet
remote:télécommande
twin:jumeau
center:centre
twirly:tourbillonnant
twister:tornade
feathers:plumes
handed:à main
shadows:ombres
tyre:pneu
ubisoft:ubisoft
udder:pis
ufo:ovni
ultrasound:échographie
uluru:uluru
unbalanced:déséquilibré
uncertainty:incertitude
underground:souterrain
underhand:par en dessous
unfriendly:hostile
unicorn:licorne
unicycle:monocycle
union:union
unlocking:déverrouillage
unplugged:débranché
projectile:projectile
uprising:soulèvement
ursa:grande
major:ourse
uruguay:uruguay
usa:états-unis
usable:utilisable
usb:USB
ushanka:chapka
uzi:uzi
vacuum:aspirateur
cleaner:aspirateur
valve:valve
dracula:dracula
damme:damme
vanilla:vanille
velocipede:vélocipède
vending:distributeur
venezuela:venezuela
flytrap:dionée
willendorf:willendorf
vhs:VHS
vial:fiole
conference:conférence
longhouse:longue maison
vile:infâme
fluid:fluide
vintage:ancien
viola:alto
violin:violon
virgo:vierge
virtual:virtuel
virus:virus
visored:à visière
vitruvian:vitruve
volleyball:volley-ball
vomiting:vomissant
voodoo:vaudou
doll:poupée
vortex:vortex
vote:vote
vr:VR
headset:casque
vulture:vautour
vuvuzelas:vuvuzelas
walkie:talkie
talkie:walkie
wallet:portefeuille
walrus:morse
walther:walther
ppk:PPK
wanted:recherché
reward:récompense
bonnet:bonnet
warehouse:entrepôt
warhammer:marteau de guerre
warlord:seigneur de guerre
warp:distorsion
washing:lavage
wasp:guêpe
sting:dard
watchtower:tour de guet
diviner:devin
gallon:gallon
mill:moulin
recycling:recyclage
waterfall:cascade
watermelon:pastèque
waterskin:outre
crest:crête
itinerary:itinéraire
well:puits
werewolf:loup-garou
western:western
wheat:blé
wheelbarrow:brouette
whiplash:coup de fouet
whirlpool:tourbillon
whirlwind:tourbillon
whisk:fouet
whistle:sifflet
wide:large
wifi:wifi
router:routeur
wildfires:feux de forêt
willow:saule
winchester:winchester
windchimes:carillon éolien
windpump:éolienne de pompage
windsock:manche à air
windy:venteux
stripes:rayures
wingfoot:pied ailé
wireframe:fil de fer
wisdom:sagesse
wok:wok
wolverine:glouton
woman:femme
cabin:cabane
club:gourdin
clogs:sabots
pegleg:jambe de bois
pier:jetée
wool:laine
worms:vers
worried:inquiet
sweet:sucré
wrapping:emballage
wrecking:démolition
wyvern:vouivre
xylophone:xylophone
yarn:pelote
yang:yang
yunluo:yunluo
z:Z
zat:zat
zebra:zèbre
zeppelin:zeppelin
zeus:zeus
zig:zig
zipper:fermeture éclair
`;

/** Les expressions qui ne se traduisent pas mot a mot : l'identifiant entier, ou un morceau. */
export const EXPRESSIONS: Readonly<Record<string, string>> = {
  'pumpkin-lantern': 'citrouille-lanterne',
  'pine-tree': 'pin',
  'oak-leaf': 'feuille de chêne',
  'maple-leaf': 'feuille d’érable',
  'christmas': 'noël',
  'santa-hat': 'bonnet de père noël',
  'easter-egg': 'œuf de pâques',
  'birthday-cake': 'gâteau d’anniversaire',
  'party-popper': 'pétard de fête',
  'party-hat': 'chapeau de fête',
  'party-flags': 'guirlande de fanions',
  'baby-bottle': 'biberon',
  'baby-face': 'visage de bébé',
  'witch-flight': 'sorcière en vol',
  'witch-face': 'visage de sorcière',
  'graduate-cap': 'chapeau de diplômé',
  'musical-notes': 'notes de musique',
  'music-notes': 'notes de musique',
  'musical-score': 'partition',
  'musical-keyboard': 'clavier',
  'wedding-rings': 'alliances',
  'ice-cream-cone': 'cornet de glace',
  'ice-cream-scoop': 'boule de glace',
  'ice-pop': 'glace à l’eau',
  'fire-extinguisher': 'extincteur',
  'first-aid-kit': 'trousse de secours',
  'french-fries': 'frites',
  'fleur-de-lys': 'fleur de lys',
  'arc-triomphe': 'arc de triomphe',
  'eiffel-tower': 'tour eiffel',
  'ursa-major': 'grande ourse',
  'walkie-talkie': 'talkie-walkie',
  'jack-o-lantern': 'citrouille d’halloween',
  'yin-yang': 'yin-yang',
  'tic-tac-toe': 'morpion',
  'ping-pong': 'ping-pong',
  'rub-el-hizb': 'rub el hizb',
  'hot-dog': 'hot-dog',
  'bok-choy': 'pak-choï',
  'sri-lanka': 'sri lanka',
  'james-bond': 'james bond',
  'harry-potter': 'harry potter',
  'sherlock-holmes': 'sherlock holmes',
  'mona-lisa': 'joconde',
  'william-tell': 'guillaume tell',
  'saint-basil-cathedral': 'cathédrale saint-basile',
  'sydney-opera': 'opéra de sydney',
  'tower-bridge': 'tower bridge',
  'big-ben': 'big ben',
  'statue-of-liberty': 'statue de la liberté',
  'leaning-tower-of-pisa': 'tour de pise',
  'egyptian-pyramids': 'pyramides d’égypte',
  'greek-temple': 'temple grec',
  'cathedral': 'cathédrale',
  'mosque': 'mosquée',
  'north-star-shuriken': 'shuriken étoile du nord',
  'heart-beats': 'battements de cœur',
  'broken-heart': 'cœur brisé',
  'bleeding-heart': 'cœur saignant',
  'shining-heart': 'cœur rayonnant',
  'crowned-heart': 'cœur couronné',
  'locked-heart': 'cœur verrouillé',
  'glass-heart': 'cœur de verre',
  'half-heart': 'demi-cœur',
  'heart-wings': 'cœur ailé',
  'love-letter': 'lettre d’amour',
  'love-injection': 'piqûre d’amour',
  'love-mystery': 'mystère de l’amour',
  'love-song': 'chanson d’amour',
  'lovers': 'amoureux',
  'kiss': 'baiser',
  'champagne-cork': 'bouchon de champagne',
  'firework-rocket': 'fusée de feu d’artifice',
  'fireworks': 'feu d’artifice',
  'snowman': 'bonhomme de neige',
  'snowflake-1': 'flocon de neige',
  'snowflake-2': 'flocon de neige (variante)',
  'stairs-cake': 'pièce montée',
  'cake-slice': 'part de gâteau',
  'candle-light': 'bougie allumée',
  'candle-flame': 'flamme de bougie',
  'candle-holder': 'bougeoir',
  'candle-skull': 'crâne à bougie',
  'ringing-bell': 'cloche qui sonne',
  'church': 'église',
  'viking-church': 'église viking',
  'castle-ruins': 'ruines de château',
  'elven-castle': 'château elfique',
  'sand-castle': 'château de sable',
  'skull-crossed-bones': 'tête de mort',
  'spider-web': 'toile d’araignée',
  'long-legged-spider': 'araignée à longues pattes',
  'bat-blade': 'lame chauve-souris',
  'floating-ghost': 'fantôme flottant',
  'ghost-ally': 'fantôme allié',
  'haunting': 'hantise',
  'coffin': 'cercueil',
  'tombstone': 'pierre tombale',
  'graveyard': 'cimetière',
  'carnival-mask': 'masque de carnaval',
  'drama-masks': 'masques de théâtre',
  'carousel': 'carrousel',
  'cupidon': 'cupidon',
  'rose': 'rose',
  'clover': 'trèfle',
  'shamrock': 'trèfle irlandais',
  'four-leaf-clover': 'trèfle à quatre feuilles',
  'rabbit': 'lapin',
  'rabbit-head': 'tête de lapin',
  'bunny-slippers': 'pantoufles lapin',
  'egg-clutch': 'couvée d’œufs',
  'nest-eggs': 'œufs au nid',
  'big-egg': 'gros œuf',
  'chicken': 'poule',
  'rooster': 'coq',
  'stork': 'cigogne',
  'stork-delivery': 'cigogne qui livre',
  'cradle': 'berceau',
  'pregnant': 'enceinte',
  'fetus': 'fœtus',
  'embryo': 'embryon',
  'toy-mallet': 'maillet jouet',
  'teddy-bear': 'ours en peluche',
  'balloon-dog': 'chien en ballon',
  'air-balloon': 'montgolfière',
  'balloons': 'ballons',
  'gift-of-knowledge': 'cadeau du savoir',
  'gift-trap': 'cadeau piégé',
  'present': 'cadeau',
  'wrapped-sweet': 'bonbon emballé',
  'wrapped-heart': 'cœur emballé',
  'candy-canes': 'sucres d’orge',
  'gingerbread-man': 'bonhomme en pain d’épices',
  'microphone': 'micro',
  'guitar': 'guitare',
  'guitar-head': 'tête de guitare',
  'guitar-bass-head': 'tête de basse',
  'drum': 'tambour',
  'drum-kit': 'batterie',
  'djembe': 'djembé',
  'trumpet': 'trompette',
  'saxophone': 'saxophone',
  'violin': 'violon',
  'piano-keys': 'touches de piano',
  'grand-piano': 'piano à queue',
  'pianist': 'pianiste',
  'speaker': 'haut-parleur',
  'boombox': 'radiocassette',
  'sound-waves': 'ondes sonores',
  'stage': 'scène',
  'theater-curtains': 'rideaux de théâtre',
  'ticket': 'billet',
  'vuvuzelas': 'vuvuzelas',
  'house': 'maison',
  'family-house': 'maison familiale',
  'wooden-house': 'maison en bois',
  'tree-house': 'cabane dans un arbre',
  'village': 'village',
  'modern-city': 'ville moderne',
  'castle': 'château',
  'tower': 'tour',
  'watchtower': 'tour de guet',
  'lighthouse': 'phare',
  'windmill': 'moulin à vent',
  'barn': 'grange',
  'factory': 'usine',
  'hospital': 'hôpital',
  'temple-gate': 'porte de temple',
  'shinto-shrine': 'sanctuaire shinto',
  'pagoda': 'pagode',
  'obelisk': 'obélisque',
  'stone-tower': 'tour de pierre',
  'medieval-gate': 'porte médiévale',
  'city': 'ville',
  'school-bag': 'cartable',
  'school-of-fish': 'banc de poissons',
  'bus': 'bus',
  'tank': 'char d’assaut',
  'water-tank': 'citerne',
  'drop': 'goutte',
  'oil-drop': 'goutte de pétrole',
  'kneeling': 'à genoux',
  'medal': 'médaille',
  'medal-skull': 'médaille à crâne',
  'dove': 'colombe',
  'poppy': 'coquelicot',
  'sperm-whale': 'cachalot',
  'rank-1': 'grade 1',
  'rank-2': 'grade 2',
  'rank-3': 'grade 3'
};

const lireTable = (table: string): Array<[string, string]> => table.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
  const k = l.indexOf(':');
  return [l.slice(0, k), l.slice(k + 1)] as [string, string];
});

// Les mots des sources libres d'abord, ceux de game-icons ensuite : a doublon, game-icons l'emporte et ses noms ne bougent pas.
const LEXIQUE: ReadonlyMap<string, string> = new Map([...lireTable(TABLE_SOURCES), ...lireTable(TABLE)]);

/** Les expressions des sources libres : celles de game-icons, et les noms composes propres a ces jeux (game-icons l'emporte). */
export const EXPRESSIONS_LIBRES: Readonly<Record<string, string>> = { ...EXPRESSIONS_SOURCES, ...EXPRESSIONS };

/** Le francais d'un mot anglais d'identifiant, ou undefined s'il n'est pas dans le lexique. */
export const traduireMot = (mot: string): string | undefined => LEXIQUE.get(mot);

const SENS_LIBRES: ReadonlyMap<string, string> = new Map(lireTable(SENS_SOURCES));

/** Le francais d'un mot d'une source libre : son sens dans un jeu d'interface s'il en a un, sinon celui du lexique. */
export const traduireMotLibre = (mot: string): string | undefined => SENS_LIBRES.get(mot) ?? LEXIQUE.get(mot);

/** Les mots du lexique, pour le compter et le verifier. */
export const tailleLexique = (): number => LEXIQUE.size;
