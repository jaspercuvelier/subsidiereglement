/**
 * In dit bestand staat de Google Apps Script code die ervoor zorgt dat de data uit de Google Sheet wordt opgehaald en als JSON wordt geretourneerd wanneer de web-app URL wordt bezocht.
 * Daarnaast wordt er gelogd wanneer de web-app wordt bezocht, inclusief eventuele parameters en de user agent.
 * 
 * De data wordt opgehaald uit de sheet 'APP_DATA', waarbij de opmerking uit cel A1 wordt meegenomen en de scholen worden gestructureerd op basis van het instellingsnummer.
 * De afstanden worden gecontroleerd en indien nodig omgezet naar null als ze niet geldig zijn.
 * Kolom L bevat het cumulatieve bezoekersaantal voor het zwembad; kolom M bevat het cumulatieve bezoekersaantal voor de sportinfrastructuur.
 * 
 * De logging wordt opgeslagen in een aparte sheet 'LOG', waarbij elke aanroep wordt gelogd met een timestamp, parameters en user agent.
 */


/**
 * De doGet functie wordt aangeroepen wanneer de web-app URL wordt bezocht.
 * Hier wordt de logging geactiveerd en de data geretourneerd.
 */
function doGet(e) {
  // 1. Log het gebruik
  logUsage(e);
  
  // 2. Haal de data op
  const data = getSchoolsData(); 
  const json = JSON.stringify(data);
  const callback = e && e.parameter && e.parameter.callback ? String(e.parameter.callback).trim() : "";

  // JSONP ondersteuning voor browsers waar fetch door CORS geblokkeerd wordt.
  if (callback && /^[A-Za-z_$][0-9A-Za-z_$]*(\.[A-Za-z_$][0-9A-Za-z_$]*)*$/.test(callback)) {
    return ContentService.createTextOutput(callback + "(" + json + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  
  // 3. Retourneer de JSON
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Haalt de data op uit 'APP_DATA', inclusief opmerking en cumulatieve bezoekersaantallen.
 */
function getSchoolsData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("APP_DATA");
  
  // Haal de opmerking op uit cel A1
  const opmerking = sheet.getRange("A1").getValue();

  const lastRow = sheet.getLastRow();
  // We halen 13 kolommen op (t/m kolom M voor cumulatief bezoekersaantal sportinfrastructuur)
  const data = sheet.getRange(1, 1, lastRow, 13).getValues();
  
  const result = {
    metadata: {
      opmerkingen: opmerking,
      gegenereerd_op: new Date().toISOString()
    },
    scholen: {}
  };

  // Loop door de data vanaf rij 4
  for (let i = 3; i < data.length; i++) {
    const row = data[i];
    
    let rawId = row[1].toString().trim();
    if (!rawId) continue;
    
    // Formatteer instellingsnummer naar 6 tekens
    const instellingsnummer = rawId.padStart(6, '0');

    const schoolnaam = row[0];
    const adres = row[2];
    const aantalLeerlingen = row[9] || 0;
    const aantalSchooleters = row[10] || 0;
    const cumulatiefZwembad = row[11] || 0;
    const cumulatiefSportinfrastructuur = row[12] || 0;
    
    const afstandZwemmen = distanceCheck(row[3], row[4]);
    const afstandCC = distanceCheck(row[5], row[6]);
    const afstandBib = distanceCheck(row[7], row[8]);

    const vestigingData = {
      schoolnaam: schoolnaam,
      adres: adres,
      leerlingen: aantalLeerlingen,
      schooleters: aantalSchooleters,
      zwembad_bezoekers: cumulatiefZwembad,
      sportinfrastructuur_bezoekers: cumulatiefSportinfrastructuur,
      zwemmers: cumulatiefZwembad,
      afstanden: {
        zwemmen_min: isFinite(afstandZwemmen) ? afstandZwemmen : null,
        cc_min: isFinite(afstandCC) ? afstandCC : null,
        bib_min: isFinite(afstandBib) ? afstandBib : null
      }
    };

    if (!result.scholen[instellingsnummer]) {
      result.scholen[instellingsnummer] = [vestigingData];
    } else {
      result.scholen[instellingsnummer].push(vestigingData);
    }
  }
  return result;
}

/**
 * Logt het tijdstip en eventuele parameters van de aanroep in de sheet 'LOG'.
 */
function logUsage(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let logSheet = ss.getSheetByName("LOG");
    
    // Maak de LOG sheet aan als deze nog niet bestaat
    if (!logSheet) {
      logSheet = ss.insertSheet("LOG");
      logSheet.appendRow(["Timestamp", "Parameters", "User Agent"]);
    }

    // Haal parameters op uit het event object 'e'
    const params = e && e.parameter ? JSON.stringify(e.parameter) : "Geen parameters";
    const userAgent = e && e.context && e.context.userAgent ? e.context.userAgent : "Onbekend";

    // Voeg een rij toe aan de log
    logSheet.appendRow([new Date(), params, userAgent]);
  } catch (err) {
    console.error("Logging mislukt: " + err.toString());
  }
}

/**
 * Hulpfunctie om de kleinste afstand te bepalen.
 */
function distanceCheck(val1, val2) {
  const parseDist = (val) => {
    const num = parseFloat(val);
    return (isNaN(num) || num === 99999) ? Infinity : num;
  };
  const d1 = parseDist(val1);
  const d2 = parseDist(val2);
  return Math.min(d1, d2);
}
