#!/usr/bin/env python3
"""
Zet de oude, brede APP_DATA-sheet om naar de nieuwe genormaliseerde structuur
(vestigingen + infrastructuur + afstanden-matrix + bezoeken-matrix).

Gebruik:  python3 tools/migreer_sheet.py "DB-VOORSTEL SUBSIDIEREGLEMENT TIELT.xlsx" data/2026.json
"""
import json, re, sys, zipfile
from xml.etree import ElementTree as ET

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'

# De oude sheet had de infrastructuur als vaste kolomparen. Hier ligt vast welke
# kolom bij welke infrastructuur hoort; na deze eenmalige migratie is dit niet
# meer nodig omdat de nieuwe sheet een echte INFRASTRUCTUUR-tab heeft.
INFRASTRUCTUUR = [
    {"id": "zwembad_meulebeke", "naam": "Zwembad Meulebeke",        "type": "zwembad",     "adres": "Ter Borchtlaan 9, 8760 Meulebeke",        "_kolom": "D"},
    {"id": "zwembad_tielt",     "naam": "Zwembad Tielt",            "type": "zwembad",     "adres": "",                                        "_kolom": "E"},
    {"id": "cc_meulebeke",      "naam": "Cultureel Centrum Meulebeke", "type": "cultuur",  "adres": "Karel van Manderstraat 26, 8760 Meulebeke","_kolom": "F"},
    {"id": "cc_tielt",          "naam": "Cultuurcentrum Tielt",     "type": "cultuur",     "adres": "Sint-Michielstraat 9, 8700 Tielt",        "_kolom": "G"},
    {"id": "bib_meulebeke",     "naam": "Bibliotheek Meulebeke",    "type": "bibliotheek", "adres": "Karel van Manderstraat 26, 8760 Meulebeke","_kolom": "H"},
    {"id": "bib_tielt",         "naam": "Bibliotheek Tielt",        "type": "bibliotheek", "adres": "Lakenmarkt 9, 8700 Tielt",                "_kolom": "I"},
    # Stond nog niet in de oude sheet: er was enkel een cumulatief bezoekersaantal
    # "sportinfrastructuur" zonder bijhorende afstand.
    {"id": "sporthal_tielt",    "naam": "Sporthal Tielt",           "type": "sport",       "adres": "",                                        "_kolom": None},
]

# Tielt en Meulebeke zijn gefusioneerd: alles hoort bij de stad Tielt. De
# postcode zegt enkel nog in welke deelgemeente een vestiging ligt, en in de
# praktijk schrijft men voor beide vaak gewoon 'Tielt'.
GEMEENTE = "Tielt"
DEELGEMEENTE_PER_POSTCODE = {"8700": "Tielt", "8760": "Meulebeke"}


def lees_sheet(pad, sheetnaam):
    z = zipfile.ZipFile(pad)
    strings = []
    try:
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')).iter(NS + 'si'):
            strings.append(''.join(t.text or '' for t in si.iter(NS + 't')))
    except KeyError:
        pass

    wb = ET.fromstring(z.read('xl/workbook.xml'))
    rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    rel_pad = {r.get('Id'): r.get('Target') for r in rels}
    doel = None
    for s in wb.iter(NS + 'sheet'):
        if s.get('name') == sheetnaam:
            doel = rel_pad[s.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')]
    if doel is None:
        raise SystemExit(f'Sheet {sheetnaam} niet gevonden')

    root = ET.fromstring(z.read('xl/' + doel.lstrip('/')))
    rijen = {}
    for r in root.iter(NS + 'row'):
        cellen = {}
        for c in r.iter(NS + 'c'):
            kolom = ''.join(ch for ch in c.get('r') if ch.isalpha())
            t, v, inline = c.get('t'), c.find(NS + 'v'), c.find(NS + 'is')
            if t == 's' and v is not None:
                waarde = strings[int(v.text)]
            elif t == 'inlineStr' and inline is not None:
                waarde = ''.join(x.text or '' for x in inline.iter(NS + 't'))
            elif v is not None:
                waarde = v.text
            else:
                continue
            if waarde != '':
                cellen[kolom] = waarde
        rijen[int(r.get('r'))] = cellen
    return rijen


def getal(waarde):
    if waarde is None:
        return None
    try:
        return float(waarde)
    except (TypeError, ValueError):
        return None


def afstand(waarde):
    """99999 betekende in de oude sheet 'niet van toepassing'."""
    n = getal(waarde)
    if n is None or n >= 99999:
        return None
    return round(n, 3)


def geheel(waarde):
    n = getal(waarde)
    return None if n is None else int(round(n))


def migreer(xlsx_pad, json_pad):
    rijen = lees_sheet(xlsx_pad, 'APP_DATA')
    opmerkingen = rijen.get(1, {}).get('A', '')

    vestigingen = []
    for rijnummer in sorted(rijen):
        if rijnummer < 4:
            continue
        rij = rijen[rijnummer]
        ruw_nummer = rij.get('B')
        if not ruw_nummer:
            continue

        instellingsnummer = str(geheel(ruw_nummer)).zfill(6)
        adres = rij.get('C', '')
        postcode_match = re.search(r'\b(\d{4})\b', adres)
        postcode = postcode_match.group(1) if postcode_match else ''

        afstanden, bezoeken = {}, {}
        for infra in INFRASTRUCTUUR:
            kolom = infra['_kolom']
            afstanden[infra['id']] = afstand(rij.get(kolom)) if kolom else None
            bezoeken[infra['id']] = None

        # De oude sheet had één cumulatief bezoekersaantal voor 'zwembad' en één
        # voor 'sportinfrastructuur'. We hangen die aan het dichtstbijzijnde
        # zwembad, respectievelijk aan de sporthal. Zodra de nieuwe BEZOEKEN-tab
        # per infrastructuur ingevuld is, vervalt deze aanname.
        zwembaden = [i['id'] for i in INFRASTRUCTUUR if i['type'] == 'zwembad' and afstanden.get(i['id']) is not None]
        if zwembaden:
            dichtstbij = min(zwembaden, key=lambda i: afstanden[i])
            bezoeken[dichtstbij] = geheel(rij.get('L'))
        bezoeken['sporthal_tielt'] = geheel(rij.get('M'))

        vestigingen.append({
            "instellingsnummer": instellingsnummer,
            "schoolNaam": rij.get('A', ''),
            "vestigingNaam": adres,
            "adres": adres,
            "postcode": postcode,
            "gemeente": GEMEENTE,
            "deelgemeente": DEELGEMEENTE_PER_POSTCODE.get(postcode, ""),
            "gegevens": {
                "lln": geheel(rij.get('J')),
                "lln_l1": None,
                "lln_l4": None,
                "oki": None,
            },
            "afstanden": afstanden,
            "bezoeken": bezoeken,
            # De projectfacturen bestonden nog niet in de oude sheet; ze worden
            # per project ingevuld in het tabblad PROJECTBEDRAGEN.
            "projecten": {},
        })

    payload = {
        "meta": {
            "bron": "migratie van APP_DATA (DB-VOORSTEL SUBSIDIEREGLEMENT TIELT.xlsx)",
            "opmerkingen": opmerkingen,
            "gegenereerd_op": None,
            "instellingen": {"fluofactuur": 0},
        },
        "infrastructuur": [{k: v for k, v in i.items() if k != '_kolom'} for i in INFRASTRUCTUUR],
        "projecten": [],
        "vestigingen": vestigingen,
    }

    with open(json_pad, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write('\n')

    print(f'{len(vestigingen)} vestigingen, {len(INFRASTRUCTUUR)} infrastructuren -> {json_pad}')


if __name__ == '__main__':
    migreer(sys.argv[1], sys.argv[2])
