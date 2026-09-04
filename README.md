# Subsidieverdeling scholen Tielt

Rekentool voor de verdeling van de enveloppe flankerend onderwijs van Stad Tielt
(€110.000) over de scholen, volgens de afspraken van de werkgroep van 1 juli 2026
(zie `afspraken.md` en de notities in pdf).

## De vijf luiken

| # | Luik | Budget | Verdeelsleutel |
|---|------|--------|----------------|
| 1 | Fluojasjes | €5.000 | leerlingen 1e + 4e leerjaar |
| 2 | Projecten | €15.000 | leerlingen, optioneel geplafonneerd op de ingediende facturen |
| 3 | Sociaal engagement | €20.000 | leerlingen × OKI-factor |
| 4 | Vervoer stedelijke infrastructuur | €35.000 | bezoekers × afstand, vanaf 1 km |
| 5 | Middagtoezicht | €35.000 | leerlingen |

Er is geen sokkelbedrag: de volledige enveloppe zit in de vijf luiken.
Fluostrips voor kleuters komen uit het budget van Huis van het Kind en vallen
buiten deze €110.000.

## Bestanden

```
index.html          markup, verder niets
js/config.js        BELEID — velden, instellingen en de vijf luiken
js/engine.js        rekenkern: groeperen, verdelen, afronden, databeschikbaarheid
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
in `data/`. Zet de repo op private als dat niet de bedoeling is — Pages blijft
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
5. *Subsidietool → Tabbladen synchroniseren*.

### 3. De web-app opnieuw uitrollen

De rekentool leest een vast `/exec`-adres, dus houd dezelfde deployment aan:

*Deploy → Manage deployments → potlood bij de bestaande deployment →
Version: New version → Deploy*

Kies je *New deployment*, dan krijg je een ander adres en moet je `ENDPOINT_URL`
bovenaan `js/data.js` aanpassen.

### 4. De gaten vullen

In de sheet, in deze volgorde:

1. `INFRASTRUCTUUR`: adres van de sporthal invullen.
2. *Subsidietool → Ontbrekende afstanden berekenen* — vult enkel lege cellen, dus
   handmatige correcties blijven staan.
3. `BEZOEKEN`: aantallen voor cultuurcentrum, bibliotheek en sporthal.
4. `GEGEVENS`: `lln_l1`, `lln_l4` en `oki`.

Na elke stap herlaadt de tool met *Herladen uit sheet*.

## Iets toevoegen of wijzigen

**Een gegeven toevoegen** (bv. het aantal leerlingen in het 6e leerjaar):

1. Voeg een object toe aan `VELDEN` in `js/config.js`.
2. Voeg in de sheet een kolom met diezelfde `key` toe aan het tabblad `GEGEVENS`.

Meer is er niet: de invoertabel, de totalen en de databeschikbaarheid volgen
automatisch.

**Een luik toevoegen of een verdeelsleutel wijzigen:** voeg een object toe aan
`LUIKEN`, of pas de `grondslag`-functie van een bestaand luik aan. De
resultatentabel, het detailpaneel en de reglementtekst passen zich aan.

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
| `META` | sleutel \| waarde (o.a. `opmerkingen`) |
| `VESTIGINGEN` | sleutel \| instellingsnummer \| schoolnaam \| vestiging \| adres \| postcode \| gemeente \| deelgemeente |
| `GEGEVENS` | sleutel \| school \| lln \| schooleters \| lln_l1 \| lln_l4 \| oki \| projectbedrag |
| `INFRASTRUCTUUR` | id \| naam \| type \| adres |
| `AFSTANDEN` | sleutel \| school \| één kolom per infrastructuur, in km |
| `BEZOEKEN` | sleutel \| school \| één kolom per infrastructuur, aantal kinderen |

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

- **`oki`** — nergens ingevuld. Luik 3 verdeelt daardoor voorlopig zuiver op
  leerlingenaantal (de tool rekent met OKI = 1,00 voor iedereen). Het OKI-cijfer
  is telkens dat van twee schooljaren geleden.
- **`lln_l1` en `lln_l4`** — nergens ingevuld. Luik 1 verdeelt daardoor niets.
- **Bezoekersaantallen voor cultuurcentrum en bibliotheek** — ontbreken volledig.
- **Adres en afstanden van de sporthal** — ontbreken, terwijl de
  bezoekersaantallen er wel zijn.
- **Leerlingenaantallen** — volgens de opmerking in de sheet enkel correct voor
  de scholen van SGFV.

Zolang die gaten er zijn, rust luik 4 volledig op één infrastructuur (het zwembad
van Meulebeke): dat is de enige waarvoor zowel de afstand als het bezoekersaantal
bekend is.

## Tielt en Meulebeke

Tielt en Meulebeke zijn gefusioneerd tot één stad. Alle 14 scholen vallen dus
onder dit reglement, ook die met postcode 8760. De postcode bepaalt enkel nog de
deelgemeente — in de praktijk schrijft men voor beide vaak gewoon "Tielt" — en
die staat in de tool alleen ter informatie in de kolom *Deelgem.*

Dat verklaart ook de infrastructuurlijst: er is een zwembad, cultuurcentrum en
bibliotheek aan de kant van Meulebeke en een cultuurcentrum en bibliotheek aan de
kant van Tielt. `zwembad_tielt` staat in de lijst zonder adres en zonder
afstanden: aan de Tieltse kant is er geen zwembad, iedereen gaat naar Meulebeke.
