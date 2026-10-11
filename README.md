# Subsidieverdeling scholen Tielt

Rekentool voor de verdeling van de enveloppe flankerend onderwijs van Stad Tielt
(€110.000) over de scholen, volgens de afspraken van de werkgroep van 1 juli 2026
(zie `afspraken.md` en de notities in pdf).

## De vijf luiken

| # | Luik | Budget | Verdeelsleutel |
|---|------|--------|----------------|
| 1 | Fluojasjes | €5.000 | niet verdeeld: de stad koopt centraal aan |
| 2 | Projecten | €15.000 ± saldo luik 1 | leerlingen, optioneel geplafonneerd op de ingediende facturen |
| 3 | Sociaal engagement | €20.000 | leerlingen × OKI-factor |
| 4 | Vervoer stedelijke infrastructuur | €35.000 | bezoekers × afstand, vanaf 1 km |
| 5 | Middagtoezicht | €35.000 | leerlingen |

Er is geen sokkelbedrag: de volledige enveloppe zit in de vijf luiken.
Fluostrips voor kleuters komen uit het budget van Huis van het Kind en vallen
buiten deze €110.000.

### Luik 1 en luik 2 hangen samen

De stad bestelt de fluojasjes voor alle scholen samen en betaalt die factuur
zelf; er gaat dus geen euro van luik 1 naar een school. In de sheet vult de stad
één totaalbedrag in (`fluofactuur` in het tabblad `META`), niet een bedrag per
school. Het verschil met de gereserveerde €5.000 schuift door naar luik 2:
blijft er €1.800 over, dan wordt de projectenpot €16.800; kost het €6.500, dan
zakt ze naar €13.500. De enveloppe blijft in beide gevallen €110.000.

### Per vestiging

De werkgroep sprak af per vestiging te werken: elke rij in `VESTIGINGEN` krijgt
een eigen bedrag per luik en een eigen projectenpot, ook als twee vestigingen
hetzelfde instellingsnummer hebben. Klik in de tool op het totaal van zo'n
vestiging, dan zie je ook de andere vestigingen en het totaal voor de hele
school. Wil men ooit terug naar één bedrag per instellingsnummer, dan volstaat
`VERDEELEENHEID = 'school'` in `js/config.js`.

Een vestiging bijzetten:

1. `VESTIGINGEN`: een nieuwe rij met een nieuwe sleutel (bv. `110478-2`), het
   instellingsnummer van de school, schoolnaam, vestiging en adres.
2. *Subsidietool → Tabbladen synchroniseren*: de rij verschijnt in `GEGEVENS`,
   `AFSTANDEN`, `BEZOEKEN` en `PROJECTBEDRAGEN`.
3. *Subsidietool → Ontbrekende afstanden berekenen*.
4. Leerlingen, OKI, bezoekers en projectfacturen verdelen over de vestigingen.
   Laat je de cijfers van de hele school bij één vestiging staan, dan krijgt
   die vestiging alles en de nieuwe niets.

### De projecten per vestiging

Elke vestiging heeft in luik 2 een eigen pot naar rato van haar leerlingenaantal.
De stad noteert de projectfacturen in de sheet: elk project is een kolom in
`PROJECTBEDRAGEN`, met naam en korte omschrijving in `PROJECTEN`, en elke
vestiging een rij. De tool toont per vestiging de pot, wat er al besteed is (met
de facturen erachter) en wat er nog beschikbaar is, zodat een vestiging kan
aflezen dat ze bijvoorbeeld nog €200 heeft staan.

Zet je de instelling *Herverdeel onbenut projectbudget* aan, dan wordt de
eindafrekening gemaakt: elke school wordt geplafonneerd op wat ze effectief
besteedde en wat de andere scholen niet opgebruikten, gaat in extra rondes naar
de scholen die hun eigen pot wél overschreden.

## Bestanden

```
index.html          markup, verder niets
js/config.js        BELEID: velden, instellingen en de vijf luiken
js/engine.js        rekenkern: deelnemers bepalen, verdelen, afronden, databeschikbaarheid
js/data.js          ophalen en normaliseren (Apps Script-endpoint of snapshot)
js/ui.js            tabellen, detailpaneel, reglementtekst
data/2026.json      snapshot van de brongegevens
apps_script.js      het script dat aan de Google Sheet hangt
tools/migreer_sheet.py  eenmalige omzetting van de oude xlsx naar de snapshot
tools/test_engine.js    controles op de rekenkern
```

`js/config.js` is het enige bestand dat je moet aanraken om het reglement te
wijzigen. De rekenkern en de weergave kennen geen enkel luik of gegeven bij naam.

## Lokaal draaien

De tool haalt `data/2026.json` op met `fetch`, en dat werkt niet als je
`index.html` gewoon dubbelklikt (`file://` blokkeert dat). Start dus een
webservertje:

```bash
python3 -m http.server 8765
# open http://localhost:8765/index.html
```

Op GitHub Pages werkt het zonder meer.

Controles op de rekenkern draaien:

```bash
node tools/test_engine.js
```

## Live zetten

### 1. De tool publiceren

GitHub Pages staat aan op `main` / root. Committen en pushen volstaat:

    https://jaspercuvelier.github.io/subsidiereglement/

Doe dit gerust vóór de sheet gemigreerd is: zolang het endpoint nog de oude
structuur teruggeeft, valt de tool terug op `data/2026.json` en zegt de
statusregel dat ook. Er gaat dus niets stuk.

Let op: de repository is publiek, en dus ook de leerlingenaantallen en adressen
in `data/`. Zet de repo op private als dat niet de bedoeling is. Pages blijft
dan werken op een betalend plan, anders moet je een andere host kiezen.

### 2. De sheet migreren

Je hoeft géén nieuwe sheet te maken; de bestaande wordt omgezet. `APP_DATA`
blijft ongemoeid staan als archief.

1. Maak eerst een kopie van de sheet als vangnet (*Bestand → Een kopie maken*).
2. *Extensies → Apps Script*, vervang de volledige inhoud door `apps_script.js`
   en sla op.
3. Herlaad de sheet. Er verschijnt een menu **Subsidietool**.
4. *Subsidietool → Eenmalig: migreren van APP_DATA*. De eerste keer vraagt Google
   toestemming voor de Spreadsheet- en Maps-diensten. De migratie weigert te
   draaien als `VESTIGINGEN` al rijen bevat, zodat je ze niet per ongeluk
   verdubbelt.
5. *Subsidietool → Tabbladen synchroniseren*. Dat maakt meteen de tabbladen
   `PROJECTEN` en `PROJECTBEDRAGEN` aan als ze nog niet bestaan.

### 3. De web-app opnieuw uitrollen

De rekentool leest een vast `/exec`-adres, dus houd dezelfde deployment aan:

*Deploy → Manage deployments → potlood bij de bestaande deployment →
Version: New version → Deploy*

Kies je *New deployment*, dan krijg je een ander adres en moet je `ENDPOINT_URL`
bovenaan `js/data.js` aanpassen.

### 4. De gaten vullen

In de sheet, in deze volgorde:

1. `INFRASTRUCTUUR`: adres van de sporthal invullen.
2. *Subsidietool → Ontbrekende afstanden berekenen*. Dat vult enkel lege cellen,
   dus handmatige correcties blijven staan.
3. `BEZOEKEN`: aantallen voor cultuurcentrum, bibliotheek en sporthal.
4. `GEGEVENS`: `oki` (zie *Het OKI-cijfer* hieronder).
5. `META`: een rij `fluofactuur` met het totaalbedrag van de factuur voor de
   fluojasjes.

Na elke stap herlaadt de tool met *Herladen uit sheet*.

## Het OKI-cijfer

De OKI-factor van luik 3 wordt voor de gewone scholen gewoon opgevraagd. Eén
school in de lijst krijgt er geen: De Vlinder is een school voor buitengewoon
onderwijs, en daar wordt de indicator niet berekend, omdat het buitengewoon
onderwijs per type en opleidingsvorm gefinancierd wordt in plaats van via de
leerlingenkenmerken.

Voor die school berekent de stad het cijfer zelf, met menu *Subsidietool → OKI
berekenen uit leerlingenkenmerken*. De wizard vraagt eerst het leerlingenaantal
en daarna per kenmerk hoeveel leerlingen eraan voldoen:

| Kenmerk | Telt mee als |
|---------|--------------|
| Opleidingsniveau van de moeder | de moeder heeft geen diploma secundair onderwijs |
| Schooltoeslag | de leerling ontving een schooltoeslag |
| Thuistaal | de thuistaal is niet het Nederlands |
| Buurt | de leerling woont in een buurt met veel schoolse vertraging |

Een leerling mag in meerdere kenmerken meegeteld worden. De uitkomst is de som
van de aandelen maal hun gewicht; de laatste stap toont die berekening regel per
regel. De stad neemt het cijfer over in de kolom `oki` van `GEGEVENS`. Er wordt
niets automatisch weggeschreven: zo staat er altijd een mens tussen de
berekening en het reglement, en blijft de kolom `oki` één plek met één soort
cijfer.

De kenmerken en hun gewichten staan in `OKI_KENMERKEN` bovenaan het blok *OKI
berekenen* in `apps_script.js`. Ze staan nu allemaal op 1, waardoor de uitkomst
het gemiddelde aantal kenmerken per leerling is: 1,00 betekent dan dat elke
leerling gemiddeld aan één kenmerk voldoet. Dat is een verdedigbare definitie,
maar niet noodzakelijk de wegingsformule van AgODi. Raakt de stad aan die
formule, dan volstaat het de gewichten daar aan te passen; de wizard toont ze
bij elke stap en in de eindberekening, zodat altijd zichtbaar blijft waarmee
gerekend is.

Let daarbij op de schaal. Luik 3 verdeelt op `leerlingen × OKI`, dus enkel de
verhoudingen tellen — maar dan wel de verhoudingen binnen één schaal. Staat het
berekende cijfer van De Vlinder niet op dezelfde schaal als de opgevraagde
cijfers van de andere scholen, dan klopt de verdeling niet. De wizard zet die
waarschuwing ook onder het resultaat.

## Iets toevoegen of wijzigen

**Een gegeven toevoegen** (bv. het aantal leerlingen in het 6e leerjaar):

1. Voeg een object toe aan `VELDEN` in `js/config.js`.
2. Voeg in de sheet een kolom met diezelfde `key` toe aan het tabblad `GEGEVENS`.

Meer is er niet: de invoertabel, de totalen en de databeschikbaarheid volgen
automatisch.

**Een luik toevoegen of een verdeelsleutel wijzigen:** voeg een object toe aan
`LUIKEN`, of pas de `grondslag`-functie van een bestaand luik aan. De
resultatentabel, het detailpaneel en de reglementtekst passen zich aan.

**Een project toevoegen** (bv. reanimatielessen):

Menu *Subsidietool → Project toevoegen*. Het script vraagt naar de naam en een
korte omschrijving, zet die in `PROJECTEN` en maakt in `PROJECTBEDRAGEN` een
kolom waar je per school het factuurbedrag intypt. De omschrijving verschijnt in
de tool bij het bedrag, zodat elke school ziet waaraan haar pot opging.

Wie liever met de hand werkt: een rij bijzetten in `PROJECTEN` en daarna
*Tabbladen synchroniseren* doet hetzelfde.

**Een stedelijke infrastructuur toevoegen** (bv. een jeugdcentrum):

1. Voeg een rij toe aan het tabblad `INFRASTRUCTUUR` (id, naam, type, adres).
2. Menu *Subsidietool → Tabbladen synchroniseren*: de kolom verschijnt in
   `AFSTANDEN` en `BEZOEKEN`.
3. Menu *Subsidietool → Ontbrekende afstanden berekenen*: de afstanden worden
   via Google Maps ingevuld.
4. Vul de bezoekersaantallen in.

Er komt geen regel code aan te pas.

## De Google Sheet

| Tabblad | Kolommen |
|---------|----------|
| `META` | sleutel \| waarde (`opmerkingen`, en elke instelling uit `js/config.js`, bv. `fluofactuur`) |
| `VESTIGINGEN` | sleutel \| instellingsnummer \| schoolnaam \| vestiging \| adres \| postcode \| gemeente \| deelgemeente |
| `GEGEVENS` | sleutel \| school \| lln \| oki |
| `INFRASTRUCTUUR` | id \| naam \| type \| adres |
| `AFSTANDEN` | sleutel \| school \| één kolom per infrastructuur, in km |
| `BEZOEKEN` | sleutel \| school \| één kolom per infrastructuur, aantal kinderen |
| `PROJECTEN` | id \| naam \| omschrijving |
| `PROJECTBEDRAGEN` | sleutel \| school \| één kolom per project, factuurbedrag in euro |

De kolom `sleutel` koppelt de tabbladen aan elkaar; hernoem hem niet.

De kolom `school` ernaast is er enkel om te zien welke rij je invult. Ze bevat
een formule die de schoolnaam en de vestiging uit `VESTIGINGEN` haalt, staat
vastgezet zodat ze zichtbaar blijft als je naar rechts scrolt, en wordt bij het
uitlezen genegeerd. Wijzigt een naam in `VESTIGINGEN`, dan volgt ze vanzelf.
*Tabbladen synchroniseren* zet de kolom er ook bij als ze nog ontbreekt.

De oude, brede `APP_DATA` wordt omgezet met menu *Subsidietool → Eenmalig:
migreren van APP_DATA*. Draai daarna *Tabbladen synchroniseren*.

## Snapshots

De tool leest eerst het live endpoint en valt terug op `data/2026.json`. Antwoordt
het endpoint nog met de oude structuur, dan wordt de snapshot gebruikt en zegt de
statusregel dat ook.

Commit bij elke definitieve verdeling een snapshot (knop *Snapshot bewaren* in de
tool, bestand in `data/` zetten). Zo blijft achteraf aantoonbaar op welke cijfers
een toekenning gebaseerd was.

## Wat nog ontbreekt in de brongegevens

- **`oki`**: nergens ingevuld. Luik 3 verdeelt daardoor voorlopig zuiver op
  leerlingenaantal (de tool rekent met OKI = 1,00 voor iedereen). Het OKI-cijfer
  is telkens dat van twee schooljaren geleden. Voor De Vlinder bestaat er geen;
  zie *Het OKI-cijfer*.
- **`fluofactuur`**: nog niet ingevuld in `META`. Zolang dat zo is, schuift de
  volledige €5.000 van luik 1 door naar de projectenpot van luik 2.
- **Projectfacturen**: er staat nog geen enkel project in `PROJECTEN`. De pot van
  elke school staat dus nog helemaal open.
- **Bezoekersaantallen voor cultuurcentrum en bibliotheek**: ontbreken volledig.
- **Adres en afstanden van de sporthal**: ontbreken, terwijl de
  bezoekersaantallen er wel zijn.
- **Leerlingenaantallen**: volgens de opmerking in de sheet enkel correct voor
  de scholen van SGFV.

Zolang die gaten er zijn, rust luik 4 volledig op één infrastructuur (het zwembad
van Meulebeke): dat is de enige waarvoor zowel de afstand als het bezoekersaantal
bekend is.

## Tielt en Meulebeke

Tielt en Meulebeke zijn gefusioneerd tot één stad. Alle 14 scholen vallen dus
onder dit reglement, ook die met postcode 8760. De postcode bepaalt enkel nog de
deelgemeente (in de praktijk schrijft men voor beide vaak gewoon "Tielt") en
die staat in de tool alleen ter informatie in de kolom *Deelgem.*

Dat verklaart ook de infrastructuurlijst: er is een zwembad, cultuurcentrum en
bibliotheek aan de kant van Meulebeke en een cultuurcentrum en bibliotheek aan de
kant van Tielt. `zwembad_tielt` staat in de lijst zonder adres en zonder
afstanden: aan de Tieltse kant is er geen zwembad, iedereen gaat naar Meulebeke.
