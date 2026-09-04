/**
 * GOOGLE APPS SCRIPT: brongegevens subsidiereglement Stad Tielt
 * ==============================================================
 *
 * Dit script hangt aan de Google Sheet en doet vier dingen:
 *
 *   1. doGet()                  publiceert de sheet als JSON voor de rekentool
 *   2. vulAfstandenAan()        berekent ontbrekende afstanden via Google Maps
 *   3. synchroniseerTabbladen() houdt de matrices in lijn met de lijsten
 *   4. berekenOki()             rekent stap voor stap een OKI-factor uit voor
 *                               een school die er zelf geen krijgt
 *
 * SHEETSTRUCTUUR
 * --------------
 * De structuur is bewust generiek: het script kent geen enkel gegeven bij naam.
 * Een kolom bijzetten in GEGEVENS of een rij in INFRASTRUCTUUR volstaat om een
 * nieuw gegeven of een nieuwe locatie in de rekentool te krijgen.
 *
 *   META            sleutel | waarde
 *                   'opmerkingen' verschijnt als notitie in de tool; elke
 *                   andere sleutel die overeenkomt met een instelling uit
 *                   js/config.js stuurt het model bij, bv. 'fluofactuur'.
 *   VESTIGINGEN     sleutel | instellingsnummer | schoolnaam | vestiging |
 *                   adres | postcode | gemeente | deelgemeente
 *   GEGEVENS        sleutel | school | <veldnaam> | <veldnaam> | ...
 *                   Kolomkoppen zijn de veldnamen uit js/config.js:
 *                   lln, oki
 *   INFRASTRUCTUUR  id | naam | type | adres
 *   AFSTANDEN       sleutel | school | <infra-id> | ...   waarden in km
 *   BEZOEKEN        sleutel | school | <infra-id> | ...   aantal kinderen
 *   PROJECTEN       id | naam | omschrijving
 *   PROJECTBEDRAGEN sleutel | school | <project-id> | ... factuurbedrag in euro
 *   LOG             timestamp | parameters | user agent
 *
 * De kolom 'sleutel' koppelt de tabbladen aan elkaar en wordt automatisch
 * ingevuld door synchroniseerTabbladen(). Hernoem hem niet.
 *
 * De kolom 'school' ernaast is er enkel om te kunnen zien welke rij je invult.
 * Ze bevat een formule die de naam uit VESTIGINGEN haalt, wordt genegeerd bij
 * het uitlezen, en hoef je nooit met de hand bij te werken.
 */

var TAB_META = 'META';
var TAB_VESTIGINGEN = 'VESTIGINGEN';
var TAB_GEGEVENS = 'GEGEVENS';
var TAB_INFRASTRUCTUUR = 'INFRASTRUCTUUR';
var TAB_AFSTANDEN = 'AFSTANDEN';
var TAB_BEZOEKEN = 'BEZOEKEN';
var TAB_PROJECTEN = 'PROJECTEN';
var TAB_PROJECTBEDRAGEN = 'PROJECTBEDRAGEN';
var TAB_LOG = 'LOG';
var TAB_OUD = 'APP_DATA';

// Puur ter herkenning in de sheet; nooit als gegeven ingelezen.
var KOLOM_LABEL = 'school';

/* ================================================================== */
/* Menu                                                                */
/* ================================================================== */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Subsidietool')
    .addItem('Tabbladen aanmaken', 'maakTabbladen')
    .addItem('Tabbladen synchroniseren', 'synchroniseerTabbladen')
    .addItem('Ontbrekende afstanden berekenen', 'vulAfstandenAan')
    .addItem('Project toevoegen', 'voegProjectToe')
    .addItem('OKI berekenen uit leerlingenkenmerken', 'berekenOki')
    .addSeparator()
    .addItem('Eenmalig: migreren van APP_DATA', 'migreerVanAppData')
    .addToUi();
}

/* ================================================================== */
/* Lezen                                                               */
/* ================================================================== */

function blad(naam) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(naam);
}

/** Leest een tabblad als lijst van objecten, met rij 1 als kolomkoppen. */
function leesTabel(naam) {
  var sheet = blad(naam);
  if (!sheet) return { koppen: [], rijen: [] };

  var waarden = sheet.getDataRange().getValues();
  if (waarden.length < 2) return { koppen: (waarden[0] || []).map(normaliseerKop), rijen: [] };

  var koppen = waarden[0].map(normaliseerKop);
  var rijen = [];

  for (var i = 1; i < waarden.length; i++) {
    var rij = {};
    var leeg = true;
    for (var k = 0; k < koppen.length; k++) {
      if (!koppen[k]) continue;
      var waarde = waarden[i][k];
      rij[koppen[k]] = waarde;
      if (waarde !== '' && waarde !== null) leeg = false;
    }
    if (!leeg) rijen.push(rij);
  }
  return { koppen: koppen, rijen: rijen };
}

function normaliseerKop(waarde) {
  return String(waarde === null || waarde === undefined ? '' : waarde).trim();
}

function getalOfNull(waarde) {
  if (waarde === '' || waarde === null || waarde === undefined) return null;
  var n = Number(waarde);
  return isFinite(n) ? n : null;
}

function tekst(waarde) {
  return String(waarde === null || waarde === undefined ? '' : waarde).trim();
}

/* ================================================================== */
/* JSON-uitvoer                                                        */
/* ================================================================== */

/**
 * Bouwt de payload die js/data.js verwacht. Alle kolomkoppen worden
 * doorgegeven zoals ze in de sheet staan; de rekentool pikt eruit wat ze kent.
 */
function bouwPayload() {
  var meta = leesTabel(TAB_META);
  var opmerkingen = '';
  var instellingen = {};
  meta.rijen.forEach(function (rij) {
    var sleutel = tekst(rij.sleutel);
    if (sleutel.toLowerCase() === 'opmerkingen') opmerkingen = tekst(rij.waarde);
    else if (sleutel) instellingen[sleutel] = rij.waarde;
  });

  var infraTabel = leesTabel(TAB_INFRASTRUCTUUR);
  var infrastructuur = infraTabel.rijen
    .filter(function (rij) { return tekst(rij.id) !== ''; })
    .map(function (rij) {
      return {
        id: tekst(rij.id),
        naam: tekst(rij.naam) || tekst(rij.id),
        type: tekst(rij.type) || 'overig',
        adres: tekst(rij.adres)
      };
    });

  var projecten = leesTabel(TAB_PROJECTEN).rijen
    .filter(function (rij) { return tekst(rij.id) !== ''; })
    .map(function (rij) {
      return {
        id: tekst(rij.id),
        naam: tekst(rij.naam) || tekst(rij.id),
        omschrijving: tekst(rij.omschrijving)
      };
    });

  var gegevensTabel = leesTabel(TAB_GEGEVENS);
  var gegevensPerSleutel = {};
  gegevensTabel.rijen.forEach(function (rij) {
    var waarden = {};
    gegevensTabel.koppen.forEach(function (kop) {
      if (!kop || kop === 'sleutel' || kop === KOLOM_LABEL) return;
      waarden[kop] = getalOfNull(rij[kop]);
    });
    gegevensPerSleutel[tekst(rij.sleutel)] = waarden;
  });

  var afstandenPerSleutel = leesMatrix(TAB_AFSTANDEN);
  var bezoekenPerSleutel = leesMatrix(TAB_BEZOEKEN);
  var projectenPerSleutel = leesMatrix(TAB_PROJECTBEDRAGEN);

  var vestigingen = leesTabel(TAB_VESTIGINGEN).rijen
    .filter(function (rij) { return tekst(rij.sleutel) !== ''; })
    .map(function (rij) {
      var sleutel = tekst(rij.sleutel);
      return {
        instellingsnummer: tekst(rij.instellingsnummer),
        schoolNaam: tekst(rij.schoolnaam),
        vestigingNaam: tekst(rij.vestiging) || tekst(rij.adres),
        adres: tekst(rij.adres),
        postcode: tekst(rij.postcode),
        gemeente: tekst(rij.gemeente),
        deelgemeente: tekst(rij.deelgemeente),
        gegevens: gegevensPerSleutel[sleutel] || {},
        afstanden: afstandenPerSleutel[sleutel] || {},
        bezoeken: bezoekenPerSleutel[sleutel] || {},
        projecten: projectenPerSleutel[sleutel] || {}
      };
    });

  return {
    meta: {
      opmerkingen: opmerkingen,
      instellingen: instellingen,
      gegenereerd_op: new Date().toISOString()
    },
    infrastructuur: infrastructuur,
    projecten: projecten,
    vestigingen: vestigingen
  };
}

/** Leest een matrixtabblad (rij 1 = infra-ids, kolom A = vestigingssleutel). */
function leesMatrix(naam) {
  var tabel = leesTabel(naam);
  var resultaat = {};
  tabel.rijen.forEach(function (rij) {
    var waarden = {};
    tabel.koppen.forEach(function (kop) {
      if (!kop || kop === 'sleutel' || kop === KOLOM_LABEL) return;
      waarden[kop] = getalOfNull(rij[kop]);
    });
    resultaat[tekst(rij.sleutel)] = waarden;
  });
  return resultaat;
}

function doGet(e) {
  logGebruik(e);

  var json = JSON.stringify(bouwPayload());
  var callback = e && e.parameter && e.parameter.callback ? String(e.parameter.callback).trim() : '';

  // JSONP, voor browsers waar de gewone fetch op CORS strandt.
  if (callback && /^[A-Za-z_$][0-9A-Za-z_$]*(\.[A-Za-z_$][0-9A-Za-z_$]*)*$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function logGebruik(e) {
  try {
    var sheet = blad(TAB_LOG);
    if (!sheet) {
      sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet(TAB_LOG);
      sheet.appendRow(['Timestamp', 'Parameters', 'User agent']);
      sheet.hideSheet();
    }
    sheet.appendRow([
      new Date(),
      e && e.parameter ? JSON.stringify(e.parameter) : 'geen parameters',
      e && e.context && e.context.userAgent ? e.context.userAgent : 'onbekend'
    ]);
  } catch (fout) {
    console.error('Loggen mislukt: ' + fout);
  }
}

/* ================================================================== */
/* Tabbladen aanmaken en synchroniseren                                */
/* ================================================================== */

function zorgVoorTabblad(naam, koppen) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(naam);
  if (!sheet) {
    sheet = ss.insertSheet(naam);
    sheet.getRange(1, 1, 1, koppen.length).setValues([koppen]);
    sheet.getRange(1, 1, 1, koppen.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setFrozenColumns(1);
  }
  return sheet;
}

function zorgVoorAlleTabbladen() {
  zorgVoorTabblad(TAB_META, ['sleutel', 'waarde']);
  zorgVoorTabblad(TAB_VESTIGINGEN, ['sleutel', 'instellingsnummer', 'schoolnaam', 'vestiging', 'adres', 'postcode', 'gemeente', 'deelgemeente']);
  zorgVoorTabblad(TAB_GEGEVENS, ['sleutel', KOLOM_LABEL, 'lln', 'oki']);
  zorgVoorTabblad(TAB_INFRASTRUCTUUR, ['id', 'naam', 'type', 'adres']);
  zorgVoorTabblad(TAB_AFSTANDEN, ['sleutel', KOLOM_LABEL]);
  zorgVoorTabblad(TAB_BEZOEKEN, ['sleutel', KOLOM_LABEL]);
  zorgVoorTabblad(TAB_PROJECTEN, ['id', 'naam', 'omschrijving']);
  zorgVoorTabblad(TAB_PROJECTBEDRAGEN, ['sleutel', KOLOM_LABEL]);
}

function maakTabbladen() {
  zorgVoorAlleTabbladen();
  SpreadsheetApp.getUi().alert('Tabbladen klaar. Vul VESTIGINGEN en INFRASTRUCTUUR aan en kies daarna "Tabbladen synchroniseren".');
}

/**
 * Zorgt dat elke vestiging een rij heeft in GEGEVENS, AFSTANDEN en BEZOEKEN,
 * en dat elke infrastructuur een kolom heeft in AFSTANDEN en BEZOEKEN.
 * Bestaande waarden blijven staan; er wordt enkel bijgezet.
 */
function synchroniseerTabbladen() {
  // Ook meteen de vangnet voor een sheet die nog van voor de projecttabbladen
  // dateert: ontbrekende tabbladen worden aangemaakt, bestaande blijven.
  zorgVoorAlleTabbladen();

  var vestigingen = leesTabel(TAB_VESTIGINGEN).rijen;
  var sleutels = vestigingen.map(function (v) { return tekst(v.sleutel); }).filter(String);

  var infraIds = leesTabel(TAB_INFRASTRUCTUUR).rijen
    .map(function (i) { return tekst(i.id); })
    .filter(String);

  var projectIds = leesTabel(TAB_PROJECTEN).rijen
    .map(function (p) { return tekst(p.id); })
    .filter(String);

  var toegevoegd = [];
  toegevoegd.push(vulRijenAan(TAB_GEGEVENS, sleutels) + ' rijen in GEGEVENS');
  toegevoegd.push(vulKolommenAan(TAB_AFSTANDEN, infraIds) + ' kolommen in AFSTANDEN');
  toegevoegd.push(vulRijenAan(TAB_AFSTANDEN, sleutels) + ' rijen in AFSTANDEN');
  toegevoegd.push(vulKolommenAan(TAB_BEZOEKEN, infraIds) + ' kolommen in BEZOEKEN');
  toegevoegd.push(vulRijenAan(TAB_BEZOEKEN, sleutels) + ' rijen in BEZOEKEN');
  toegevoegd.push(vulKolommenAan(TAB_PROJECTBEDRAGEN, projectIds) + ' kolommen in PROJECTBEDRAGEN');
  toegevoegd.push(vulRijenAan(TAB_PROJECTBEDRAGEN, sleutels) + ' rijen in PROJECTBEDRAGEN');

  [TAB_GEGEVENS, TAB_AFSTANDEN, TAB_BEZOEKEN, TAB_PROJECTBEDRAGEN].forEach(vulLabelsAan);

  SpreadsheetApp.getUi().alert('Gesynchroniseerd.\n\nToegevoegd: ' + toegevoegd.join(', ') + '.');
}

/**
 * Zet naast de sleutelkolom een leesbare kolom 'school' met de schoolnaam en de
 * vestiging. Het is een formule die naar VESTIGINGEN wijst, zodat een naam die
 * daar wijzigt hier vanzelf mee verandert. De rekentool negeert deze kolom.
 */
function vulLabelsAan(naam) {
  var sheet = blad(naam);
  if (!sheet) return;

  var koppen = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn()))
    .getValues()[0].map(normaliseerKop);
  var positie = koppen.indexOf(KOLOM_LABEL);

  if (positie === -1) {
    sheet.insertColumnAfter(1);
    sheet.getRange(1, 2).setValue(KOLOM_LABEL).setFontWeight('bold');
  } else if (positie !== 1) {
    // Iemand heeft de kolom verplaatst; dan laten we ze met rust.
    return;
  }

  var laatsteRij = sheet.getLastRow();
  if (laatsteRij < 2) return;

  // Let op de puntkomma's als argumentscheiding. setFormulas() volgt de locale
  // van de spreadsheet, en die staat hier Belgisch: met een komma weigert Sheets
  // de formule. Verander dit niet naar de Amerikaanse schrijfwijze.
  var formules = [];
  for (var r = 2; r <= laatsteRij; r++) {
    formules.push(['=IFERROR(VLOOKUP($A' + r + ';' + TAB_VESTIGINGEN + '!$A:$D;3;FALSE)' +
      '&" - "&VLOOKUP($A' + r + ';' + TAB_VESTIGINGEN + '!$A:$D;4;FALSE);"")']);
  }
  sheet.getRange(2, 2, formules.length, 1).setFormulas(formules);
  sheet.setFrozenColumns(2);
}

function vulRijenAan(naam, sleutels) {
  var sheet = blad(naam);
  if (!sheet) return 0;

  var bestaand = {};
  var laatsteRij = sheet.getLastRow();
  if (laatsteRij > 1) {
    sheet.getRange(2, 1, laatsteRij - 1, 1).getValues().forEach(function (rij) {
      bestaand[tekst(rij[0])] = true;
    });
  }

  var nieuw = sleutels.filter(function (s) { return !bestaand[s]; });
  if (nieuw.length === 0) return 0;

  sheet.getRange(sheet.getLastRow() + 1, 1, nieuw.length, 1)
    .setValues(nieuw.map(function (s) { return [s]; }));
  return nieuw.length;
}

function vulKolommenAan(naam, ids) {
  var sheet = blad(naam);
  if (!sheet) return 0;

  var laatsteKolom = Math.max(1, sheet.getLastColumn());
  var koppen = sheet.getRange(1, 1, 1, laatsteKolom).getValues()[0].map(normaliseerKop);

  var nieuw = ids.filter(function (id) { return koppen.indexOf(id) === -1; });
  if (nieuw.length === 0) return 0;

  sheet.getRange(1, laatsteKolom + 1, 1, nieuw.length).setValues([nieuw]).setFontWeight('bold');
  return nieuw.length;
}

/* ================================================================== */
/* Projecten                                                           */
/* ================================================================== */

/**
 * Vraagt naar een nieuw project en zet het klaar: een rij in PROJECTEN met de
 * omschrijving, en een kolom in PROJECTBEDRAGEN waar per school het
 * factuurbedrag ingetypt kan worden.
 */
function voegProjectToe() {
  var ui = SpreadsheetApp.getUi();
  zorgVoorAlleTabbladen();

  var naamAntwoord = ui.prompt(
    'Nieuw project',
    'Naam van het project, zoals het in de tool moet verschijnen (bv. "Reanimatielessen Rode Kruis"):',
    ui.ButtonSet.OK_CANCEL);
  if (naamAntwoord.getSelectedButton() !== ui.Button.OK) return;
  var naam = tekst(naamAntwoord.getResponseText());
  if (!naam) { ui.alert('Geen naam ingevuld; er is niets toegevoegd.'); return; }

  var omschrijvingAntwoord = ui.prompt(
    'Korte omschrijving',
    'Wat houdt het project in? Deze tekst verschijnt bij het bedrag in de tool. Mag leeg blijven.',
    ui.ButtonSet.OK_CANCEL);
  if (omschrijvingAntwoord.getSelectedButton() !== ui.Button.OK) return;

  var bestaandeIds = leesTabel(TAB_PROJECTEN).rijen
    .map(function (rij) { return tekst(rij.id); })
    .filter(String);
  var id = maakProjectId(naam, bestaandeIds);

  blad(TAB_PROJECTEN).appendRow([id, naam, tekst(omschrijvingAntwoord.getResponseText())]);

  vulKolommenAan(TAB_PROJECTBEDRAGEN, [id]);
  vulRijenAan(TAB_PROJECTBEDRAGEN, leesTabel(TAB_VESTIGINGEN).rijen
    .map(function (v) { return tekst(v.sleutel); }).filter(String));
  vulLabelsAan(TAB_PROJECTBEDRAGEN);
  maakEuroKolom(TAB_PROJECTBEDRAGEN, id);

  ui.alert('Project "' + naam + '" toegevoegd.\n\nVul de factuurbedragen in in de kolom "' +
           id + '" van het tabblad ' + TAB_PROJECTBEDRAGEN + '.');
}

/** Een leesbaar, uniek kolom-id: "Reanimatielessen Rode Kruis" -> reanimatielessen_rode_kruis */
function maakProjectId(naam, bestaandeIds) {
  var basis = naam.toLowerCase()
    .replace(/[àáâäã]/g, 'a').replace(/[èéêë]/g, 'e').replace(/[ìíîï]/g, 'i')
    .replace(/[òóôöõ]/g, 'o').replace(/[ùúûü]/g, 'u').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'project';

  var id = basis;
  var teller = 2;
  while (bestaandeIds.indexOf(id) !== -1) { id = basis + '_' + teller; teller++; }
  return id;
}

/** Zet een kolom van een matrixtabblad in euro-opmaak. */
function maakEuroKolom(naam, kop) {
  var sheet = blad(naam);
  if (!sheet) return;
  var koppen = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0].map(normaliseerKop);
  var kolom = koppen.indexOf(kop) + 1;
  if (kolom < 1) return;
  sheet.getRange(2, kolom, Math.max(1, sheet.getMaxRows() - 1), 1).setNumberFormat('€#,##0.00');
}

/* ================================================================== */
/* OKI berekenen uit de leerlingenkenmerken                            */
/* ================================================================== */

/**
 * De kenmerken waaruit de OKI-factor wordt samengesteld, in de volgorde waarin
 * de wizard ernaar vraagt.
 *
 * LET OP: de gewichten hieronder staan allemaal op 1. De uitkomst is dan het
 * gemiddelde aantal kenmerken per leerling: een school waar elke leerling er
 * precies één heeft, komt op 1,00 uit. Dat is een verdedigbare en gangbare
 * definitie, maar het is niet noodzakelijk de wegingsformule die AgODi voor de
 * officiele OKI hanteert. Krijgt de stad die formule te pakken, dan volstaat
 * het de gewichten hier aan te passen; de wizard toont ze bij elke stap en in
 * de eindberekening, zodat altijd zichtbaar is waarmee gerekend is.
 *
 * naam     de vraag zoals ze in de wizard verschijnt
 * gewicht  het gewicht van dit kenmerk in de formule
 * hulp     korte verduidelijking, zodat wie invult weet wat meetelt
 */
var OKI_KENMERKEN = [
  {
    naam: 'Opleidingsniveau van de moeder',
    gewicht: 1,
    hulp: 'De moeder is niet in het bezit van een diploma of getuigschrift van het secundair onderwijs.'
  },
  {
    naam: 'Schooltoeslag',
    gewicht: 1,
    hulp: 'De leerling ontving het voorbije schooljaar een schooltoeslag (de vroegere schooltoelage, nu de selectieve participatietoeslag).'
  },
  {
    naam: 'Thuistaal',
    gewicht: 1,
    hulp: 'De taal die de leerling thuis spreekt met moeder, vader of broers en zussen is niet het Nederlands.'
  },
  {
    naam: 'Buurt',
    gewicht: 1,
    hulp: 'De leerling woont in een buurt met een hoge mate van schoolse vertraging. Weet je dit niet, vul dan 0 in; het kenmerk telt dan gewoon niet mee.'
  }
];

/**
 * Wizard die de OKI-factor uitrekent voor een school die er zelf geen krijgt,
 * zoals een school voor buitengewoon onderwijs. Ze vraagt stap voor stap het
 * leerlingenaantal en per kenmerk hoeveel leerlingen eraan voldoen, en toont
 * op het einde de volledige berekening.
 *
 * De uitkomst wordt bewust NIET weggeschreven: het is een hulpmiddel, geen
 * automatisme. De stad noteert het cijfer zelf in de kolom 'oki' van GEGEVENS,
 * zodat er altijd een mens tussen de berekening en het reglement staat.
 */
function berekenOki() {
  var ui = SpreadsheetApp.getUi();
  var aantalStappen = OKI_KENMERKEN.length + 1;

  var start = ui.alert(
    'OKI berekenen',
    'Deze wizard rekent de OKI-factor uit voor een school waarvoor geen officieel ' +
    'OKI-cijfer bestaat, bijvoorbeeld een school voor buitengewoon onderwijs.\n\n' +
    'Je krijgt ' + aantalStappen + ' vragen: eerst het leerlingenaantal, daarna per ' +
    'leerlingenkenmerk hoeveel leerlingen eraan voldoen. Telkens een aantal ' +
    'leerlingen dus, geen percentage. Een leerling mag in meerdere kenmerken ' +
    'meegeteld worden.\n\n' +
    'Op het einde zie je de volledige berekening. Het cijfer wordt niet ' +
    'automatisch weggeschreven: je typt het zelf in de kolom "oki" van het ' +
    'tabblad ' + TAB_GEGEVENS + '.\n\n' +
    'Doorgaan?',
    ui.ButtonSet.OK_CANCEL);
  if (start !== ui.Button.OK) return;

  var lln = vraagGeheelGetal(ui,
    'Stap 1 van ' + aantalStappen + ': leerlingen',
    'Hoeveel leerlingen telt de school op de teldatum?',
    1, null);
  if (lln === null) return;

  var metingen = [];
  for (var i = 0; i < OKI_KENMERKEN.length; i++) {
    var kenmerk = OKI_KENMERKEN[i];
    var aantal = vraagGeheelGetal(ui,
      'Stap ' + (i + 2) + ' van ' + aantalStappen + ': ' + kenmerk.naam,
      kenmerk.hulp + '\n\n' +
      'Hoeveel van de ' + lln + ' leerlingen voldoen hieraan?\n' +
      '(gewicht van dit kenmerk in de formule: ' + formatteerGetal(kenmerk.gewicht, 2) + ')',
      0, lln);
    if (aantal === null) return;
    metingen.push(aantal);
  }

  ui.alert('OKI-berekening', bouwOkiVerslag(lln, metingen), ui.ButtonSet.OK);
}

/**
 * Zet de ingevulde aantallen om in een leesbare berekening: per kenmerk het
 * aandeel maal het gewicht, en onderaan de som. Wie de uitkomst achteraf moet
 * verantwoorden, kan ze zo regel per regel narekenen.
 */
function bouwOkiVerslag(lln, metingen) {
  var regels = ['Aantal leerlingen: ' + lln, ''];
  var oki = 0;

  OKI_KENMERKEN.forEach(function (kenmerk, i) {
    var aandeel = metingen[i] / lln;
    var bijdrage = aandeel * kenmerk.gewicht;
    oki += bijdrage;
    regels.push(kenmerk.naam);
    regels.push('   ' + metingen[i] + ' / ' + lln + ' = ' + formatteerGetal(aandeel, 3) +
                '  ×  gewicht ' + formatteerGetal(kenmerk.gewicht, 2) +
                '  =  ' + formatteerGetal(bijdrage, 3));
  });

  regels.push('');
  regels.push('OKI = ' + OKI_KENMERKEN.map(function (kenmerk, i) {
    return formatteerGetal((metingen[i] / lln) * kenmerk.gewicht, 3);
  }).join(' + ') + ' = ' + formatteerGetal(oki, 2));
  regels.push('');
  regels.push('Noteer ' + formatteerGetal(oki, 2) + ' in de kolom "oki" van het tabblad ' +
              TAB_GEGEVENS + ', op de rij van deze school.');
  regels.push('');
  regels.push('Ter vergelijking: bij deze gewichten betekent 1,00 dat elke leerling ' +
              'gemiddeld aan één kenmerk voldoet. Controleer of dat op dezelfde schaal ' +
              'staat als de officiële OKI-cijfers van de andere scholen; staat het dat ' +
              'niet, dan worden in luik 3 twee schalen door elkaar gebruikt.');

  return regels.join('\n');
}

/**
 * Vraagt een geheel getal en blijft vragen tot het klopt of tot de gebruiker
 * annuleert. `maximum` mag null zijn. Geeft null terug bij annuleren.
 */
function vraagGeheelGetal(ui, titel, vraag, minimum, maximum) {
  var toelichting = '';

  while (true) {
    var antwoord = ui.prompt(titel, toelichting + vraag, ui.ButtonSet.OK_CANCEL);
    if (antwoord.getSelectedButton() !== ui.Button.OK) return null;

    // Belgische invoer: een komma als decimaalteken laten we door, punten in
    // duizendtallen ("1.250") niet: die zijn niet van een decimaal te
    // onderscheiden en horen hier toch niet thuis.
    var ruw = tekst(antwoord.getResponseText()).replace(',', '.');
    var getal = ruw === '' ? NaN : Number(ruw);

    if (!isFinite(getal) || getal !== Math.round(getal)) {
      toelichting = '"' + tekst(antwoord.getResponseText()) + '" is geen geheel getal.\n\n';
    } else if (getal < minimum) {
      toelichting = 'Het antwoord moet minstens ' + minimum + ' zijn.\n\n';
    } else if (maximum !== null && getal > maximum) {
      toelichting = 'Het antwoord kan niet groter zijn dan ' + maximum + '. ' +
                    'Vul een aantal leerlingen in, geen percentage.\n\n';
    } else {
      return getal;
    }
  }
}

/** Getal als tekst, met de komma als decimaalteken. */
function formatteerGetal(getal, decimalen) {
  return getal.toFixed(decimalen).replace('.', ',');
}

/* ================================================================== */
/* Afstanden berekenen                                                 */
/* ================================================================== */

/**
 * Vult elke lege cel in AFSTANDEN met de rijafstand over de weg, in kilometer.
 * Reeds ingevulde cellen worden niet overschreven, zodat handmatige correcties
 * blijven staan. De Maps-dienst van Apps Script heeft een dagquotum: bij een
 * grote sheet kan het nodig zijn de actie een tweede keer te draaien.
 */
function vulAfstandenAan() {
  var sheet = blad(TAB_AFSTANDEN);
  if (!sheet) throw new Error('Tabblad AFSTANDEN bestaat niet. Kies eerst "Tabbladen aanmaken".');

  var adresPerSleutel = {};
  leesTabel(TAB_VESTIGINGEN).rijen.forEach(function (rij) {
    adresPerSleutel[tekst(rij.sleutel)] = tekst(rij.adres);
  });

  var adresPerInfra = {};
  leesTabel(TAB_INFRASTRUCTUUR).rijen.forEach(function (rij) {
    adresPerInfra[tekst(rij.id)] = tekst(rij.adres);
  });

  var waarden = sheet.getDataRange().getValues();
  if (waarden.length < 2) return;

  var koppen = waarden[0].map(normaliseerKop);
  var berekend = 0;
  var mislukt = [];
  var overgeslagen = 0;

  for (var r = 1; r < waarden.length; r++) {
    var sleutel = tekst(waarden[r][0]);
    var vanAdres = adresPerSleutel[sleutel];
    if (!sleutel || !vanAdres) continue;

    for (var k = 1; k < koppen.length; k++) {
      var infraId = koppen[k];
      if (!infraId || infraId === KOLOM_LABEL) continue;
      if (waarden[r][k] !== '' && waarden[r][k] !== null) continue;

      var naarAdres = adresPerInfra[infraId];
      if (!naarAdres) { overgeslagen++; continue; }

      var km = berekenAfstandKm(vanAdres, naarAdres);
      if (km === null) {
        mislukt.push(sleutel + ' -> ' + infraId);
      } else {
        // Cel per cel schrijven: het hele bereik terugschrijven zou de formules
        // in de kolom 'school' vervangen door hun huidige tekst.
        sheet.getRange(r + 1, k + 1).setValue(km);
        berekend++;
      }
      Utilities.sleep(200);
    }
  }

  var bericht = berekend + ' afstand(en) berekend.';
  if (overgeslagen > 0) bericht += '\n' + overgeslagen + ' cel(len) overgeslagen: die infrastructuur heeft nog geen adres.';
  if (mislukt.length > 0) bericht += '\nNiet gelukt: ' + mislukt.join(', ');
  SpreadsheetApp.getUi().alert(bericht);
}

function berekenAfstandKm(vanAdres, naarAdres) {
  try {
    var route = Maps.newDirectionFinder()
      .setOrigin(vanAdres)
      .setDestination(naarAdres)
      .setMode(Maps.DirectionFinder.Mode.DRIVING)
      .getDirections();

    if (!route || !route.routes || route.routes.length === 0) return null;
    var meters = route.routes[0].legs[0].distance.value;
    return Math.round(meters / 10) / 100;
  } catch (fout) {
    console.error('Afstand ' + vanAdres + ' -> ' + naarAdres + ' mislukt: ' + fout);
    return null;
  }
}

/* ================================================================== */
/* Eenmalige migratie van de oude APP_DATA-structuur                   */
/* ================================================================== */

/**
 * Zet de oude, brede APP_DATA om naar de nieuwe tabbladen. Draai dit één keer;
 * daarna is APP_DATA overbodig en kan het verborgen of bewaard blijven als
 * archief.
 */
function migreerVanAppData() {
  var oud = blad(TAB_OUD);
  if (!oud) throw new Error('Tabblad ' + TAB_OUD + ' niet gevonden.');

  // Een tweede migratie zou alle rijen verdubbelen. Liever weigeren dan de
  // brongegevens stukmaken.
  var bestaande = leesTabel(TAB_VESTIGINGEN).rijen;
  if (bestaande.length > 0) {
    SpreadsheetApp.getUi().alert(
      'VESTIGINGEN bevat al ' + bestaande.length + ' rijen. De migratie is blijkbaar al gedraaid.\n\n' +
      'Wil je echt opnieuw migreren, maak dan eerst de tabbladen VESTIGINGEN, GEGEVENS, ' +
      'AFSTANDEN, BEZOEKEN, INFRASTRUCTUUR en META leeg (of verwijder ze).'
    );
    return;
  }

  // De oude sheet had de infrastructuur als vaste kolommen D t/m I, met het
  // adres in rij 1 en de naam in rij 3.
  var kolomNaarInfra = {
    3: 'zwembad_meulebeke', 4: 'zwembad_tielt',
    5: 'cc_meulebeke', 6: 'cc_tielt',
    7: 'bib_meulebeke', 8: 'bib_tielt'
  };
  // Tielt en Meulebeke zijn gefusioneerd: de gemeente is overal Tielt, de
  // postcode bepaalt enkel nog de deelgemeente.
  var deelgemeentePerPostcode = { '8700': 'Tielt', '8760': 'Meulebeke' };

  var waarden = oud.getDataRange().getValues();
  zorgVoorAlleTabbladen();

  var infraRijen = [];
  for (var kolom in kolomNaarInfra) {
    infraRijen.push([
      kolomNaarInfra[kolom],
      tekst(waarden[2][kolom]),
      tekst(waarden[2][kolom]).toLowerCase().indexOf('zwembad') === 0 ? 'zwembad'
        : tekst(waarden[2][kolom]).toLowerCase().indexOf('bib') === 0 ? 'bibliotheek' : 'cultuur',
      tekst(waarden[0][kolom])
    ]);
  }
  infraRijen.push(['sporthal_tielt', 'Sporthal Tielt', 'sport', '']);
  schrijfOnder(TAB_INFRASTRUCTUUR, infraRijen);

  var vestigingRijen = [];
  var gegevensRijen = [];
  var afstandRijen = [];
  var bezoekRijen = [];
  var teller = {};

  for (var r = 3; r < waarden.length; r++) {
    var ruwNummer = tekst(waarden[r][1]);
    if (!ruwNummer) continue;

    var instellingsnummer = ('000000' + String(Math.round(Number(ruwNummer)))).slice(-6);
    teller[instellingsnummer] = (teller[instellingsnummer] || 0) + 1;
    var sleutel = instellingsnummer + '-' + teller[instellingsnummer];

    var adres = tekst(waarden[r][2]);
    var postcode = (adres.match(/\b(\d{4})\b/) || [])[1] || '';

    vestigingRijen.push([sleutel, instellingsnummer, tekst(waarden[r][0]), adres, adres,
      postcode, 'Tielt', deelgemeentePerPostcode[postcode] || '']);

    // lln | oki
    gegevensRijen.push([sleutel, '', getalOfNull(waarden[r][9]), '']);

    var afstandRij = [sleutel, ''];
    var dichtstbijZwembad = null;
    var kleinsteAfstand = Infinity;

    infraRijen.forEach(function (infra, index) {
      var kolom = null;
      for (var k in kolomNaarInfra) { if (kolomNaarInfra[k] === infra[0]) kolom = Number(k); }
      if (kolom === null) { afstandRij.push(''); return; }

      var km = getalOfNull(waarden[r][kolom]);
      if (km === null || km >= 99999) { afstandRij.push(''); return; }
      afstandRij.push(km);
      if (infra[2] === 'zwembad' && km < kleinsteAfstand) { kleinsteAfstand = km; dichtstbijZwembad = infra[0]; }
    });
    afstandRijen.push(afstandRij);

    // De oude sheet kende maar twee cumulatieve bezoekersaantallen: kolom L
    // voor het zwembad en kolom M voor de sportinfrastructuur.
    var bezoekRij = [sleutel, ''];
    infraRijen.forEach(function (infra) {
      if (infra[0] === dichtstbijZwembad) bezoekRij.push(getalOfNull(waarden[r][11]));
      else if (infra[0] === 'sporthal_tielt') bezoekRij.push(getalOfNull(waarden[r][12]));
      else bezoekRij.push('');
    });
    bezoekRijen.push(bezoekRij);
  }

  schrijfOnder(TAB_VESTIGINGEN, vestigingRijen);
  schrijfOnder(TAB_GEGEVENS, gegevensRijen);
  vulKolommenAan(TAB_AFSTANDEN, infraRijen.map(function (i) { return i[0]; }));
  vulKolommenAan(TAB_BEZOEKEN, infraRijen.map(function (i) { return i[0]; }));
  schrijfOnder(TAB_AFSTANDEN, afstandRijen);
  schrijfOnder(TAB_BEZOEKEN, bezoekRijen);
  schrijfOnder(TAB_META, [['opmerkingen', tekst(waarden[0][0])]]);

  vulRijenAan(TAB_PROJECTBEDRAGEN, vestigingRijen.map(function (r) { return r[0]; }));
  [TAB_GEGEVENS, TAB_AFSTANDEN, TAB_BEZOEKEN, TAB_PROJECTBEDRAGEN].forEach(vulLabelsAan);

  SpreadsheetApp.getUi().alert(
    'Migratie klaar: ' + vestigingRijen.length + ' vestigingen, ' + infraRijen.length + ' infrastructuren.\n\n' +
    'Nog aan te vullen: oki in GEGEVENS, fluofactuur in META, de bezoekersaantallen voor ' +
    'cultuurcentrum en bibliotheek, en het adres van de sporthal (kies daarna ' +
    '"Ontbrekende afstanden berekenen").'
  );
}

function schrijfOnder(naam, rijen) {
  if (!rijen.length) return;
  var sheet = blad(naam);
  var breedte = Math.max.apply(null, rijen.map(function (r) { return r.length; }));
  var genormaliseerd = rijen.map(function (r) {
    var kopie = r.slice();
    while (kopie.length < breedte) kopie.push('');
    return kopie;
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, genormaliseerd.length, breedte).setValues(genormaliseerd);
}
