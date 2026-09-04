/**
 * DATALAAG
 * ========
 *
 * Haalt de brongegevens op en normaliseert ze tot één vorm waar de rest van de
 * tool mee werkt:
 *
 *   { meta, infrastructuur: [{id, naam, type, adres}],
 *     vestigingen: [{ id, instellingsnummer, schoolNaam, vestigingNaam, adres,
 *                     postcode, gemeente,
 *                     gegevens:  { <veldkey>: getal|null },
 *                     afstanden: { <infraId>: km|null },
 *                     bezoeken:  { <infraId>: aantal|null } }] }
 *
 * Er zijn twee bronnen, in deze volgorde:
 *   1. het Apps Script-endpoint op de Google Sheet (live)
 *   2. de snapshot in data/<jaar>.json (offline, en het archief per jaar)
 */
const Data = (function () {

  const ENDPOINT_URL = 'https://script.google.com/macros/s/AKfycbwBLiwvWUS33k7jKMQ0oVwOqoq0Jya2d8V1S8Dc9p6uFlmqKbgYpkOJ-AM9xcAETXCXCQ/exec';
  const SNAPSHOT_URL = 'data/2026.json';

  // Tielt en Meulebeke zijn gefusioneerd tot één stad. De postcode bepaalt enkel
  // nog de deelgemeente; als gemeente staat overal Tielt.
  const GEMEENTE = 'Tielt';
  const DEELGEMEENTE_PER_POSTCODE = { '8700': 'Tielt', '8760': 'Meulebeke' };

  let volgendeId = 1;

  function getalOfNull(waarde) {
    if (waarde === null || waarde === undefined || waarde === '') return null;
    const n = Number(waarde);
    return Number.isFinite(n) ? n : null;
  }

  function tekst(waarde, terugval = '') {
    if (typeof waarde !== 'string') return terugval;
    const geknipt = waarde.trim();
    return geknipt === '' ? terugval : geknipt;
  }

  function leidDeelgemeenteAf(vestiging) {
    const bestaand = tekst(vestiging.deelgemeente);
    if (bestaand) return bestaand;
    const postcode = tekst(vestiging.postcode) || (tekst(vestiging.adres).match(/\b(\d{4})\b/) || [])[1];
    return DEELGEMEENTE_PER_POSTCODE[postcode] || '';
  }

  /**
   * Maakt van een willekeurige payload de vorm hierboven. Onbekende velden uit
   * de sheet worden bewust genegeerd; velden uit VELDEN die de sheet (nog) niet
   * levert worden op null gezet, zodat de engine ze als ontbrekend meldt.
   */
  function normaliseer(payload, bronOmschrijving) {
    const infrastructuur = (payload.infrastructuur || []).map(infra => ({
      id: tekst(infra.id),
      naam: tekst(infra.naam, tekst(infra.id)),
      type: tekst(infra.type, 'overig'),
      adres: tekst(infra.adres)
    })).filter(infra => infra.id);

    const vestigingen = (payload.vestigingen || []).map(ruw => {
      const adres = tekst(ruw.adres) || tekst(ruw.vestigingNaam);
      const postcode = tekst(ruw.postcode) || (adres.match(/\b(\d{4})\b/) || [])[1] || '';

      const gegevens = {};
      VELDEN.forEach(veld => {
        gegevens[veld.key] = getalOfNull(ruw.gegevens ? ruw.gegevens[veld.key] : null);
      });

      const afstanden = {};
      const bezoeken = {};
      infrastructuur.forEach(infra => {
        afstanden[infra.id] = getalOfNull(ruw.afstanden ? ruw.afstanden[infra.id] : null);
        bezoeken[infra.id] = getalOfNull(ruw.bezoeken ? ruw.bezoeken[infra.id] : null);
      });

      const vestiging = {
        id: volgendeId++,
        instellingsnummer: tekst(ruw.instellingsnummer).padStart(6, '0'),
        schoolNaam: tekst(ruw.schoolNaam, 'Naamloze school'),
        vestigingNaam: tekst(ruw.vestigingNaam, adres),
        adres,
        postcode,
        gegevens,
        afstanden,
        bezoeken
      };
      vestiging.gemeente = tekst(ruw.gemeente) || GEMEENTE;
      vestiging.deelgemeente = leidDeelgemeenteAf(Object.assign({}, ruw, { adres, postcode }));
      return vestiging;
    });

    return {
      meta: {
        bron: bronOmschrijving,
        opmerkingen: tekst(payload.meta && payload.meta.opmerkingen),
        gegenereerd_op: (payload.meta && payload.meta.gegenereerd_op) || null
      },
      infrastructuur,
      vestigingen
    };
  }

  /**
   * Google Apps Script stuurt geen CORS-headers wanneer het script als
   * "iedereen met de link" gepubliceerd is. Lukt fetch niet, dan halen we de
   * data alsnog op via een JSONP-callback.
   */
  function haalViaJsonp(url, timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
      const callbackNaam = `__subsidieData_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      const script = document.createElement('script');
      let timer = null;
      let opgeruimd = false;

      function ruimOp() {
        if (opgeruimd) return;
        opgeruimd = true;
        if (timer) clearTimeout(timer);
        delete window[callbackNaam];
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      window[callbackNaam] = payload => { ruimOp(); resolve(payload); };
      script.onerror = () => { ruimOp(); reject(new Error('JSONP-aanroep mislukt.')); };
      timer = setTimeout(() => { ruimOp(); reject(new Error('JSONP-aanroep verlopen.')); }, timeoutMs);

      script.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + callbackNaam;
      document.body.appendChild(script);
    });
  }

  async function haalVanEndpoint() {
    try {
      const antwoord = await fetch(ENDPOINT_URL, { method: 'GET', redirect: 'follow' });
      if (!antwoord.ok) throw new Error(`Endpoint antwoordde met status ${antwoord.status}.`);
      return await antwoord.json();
    } catch (fout) {
      const corsWaarschijnlijk = fout instanceof TypeError || /Failed to fetch|NetworkError/i.test(String(fout.message || ''));
      if (!corsWaarschijnlijk) throw fout;
      return await haalViaJsonp(ENDPOINT_URL);
    }
  }

  async function haalSnapshot() {
    const antwoord = await fetch(SNAPSHOT_URL, { cache: 'no-store' });
    if (!antwoord.ok) throw new Error(`Snapshot niet gevonden (status ${antwoord.status}).`);
    return await antwoord.json();
  }

  async function laad(voorkeur = 'endpoint') {
    const bronnen = voorkeur === 'snapshot'
      ? [['snapshot', haalSnapshot], ['endpoint', haalVanEndpoint]]
      : [['endpoint', haalVanEndpoint], ['snapshot', haalSnapshot]];

    const fouten = [];
    for (const [naam, ophalen] of bronnen) {
      try {
        const payload = await ophalen();
        const omschrijving = naam === 'endpoint' ? 'Google Sheet (live)' : `Snapshot ${SNAPSHOT_URL}`;
        const genormaliseerd = normaliseer(payload, omschrijving);

        // Een bron die wel antwoordt maar geen bruikbare vestigingen oplevert,
        // bijvoorbeeld een Apps Script dat nog de oude structuur teruggeeft,
        // telt als mislukt zodat we doorschuiven naar de volgende bron.
        if (genormaliseerd.vestigingen.length === 0) {
          throw new Error('antwoordde zonder vestigingen (verouderde sheetstructuur?)');
        }
        return { data: genormaliseerd, bron: naam, fouten };
      } catch (fout) {
        fouten.push(`${naam}: ${fout.message}`);
      }
    }
    throw new Error('Geen enkele bron kon geladen worden.\n' + fouten.join('\n'));
  }

  /** Exporteert de huidige (eventueel handmatig bijgewerkte) data als snapshot. */
  function exporteer(data) {
    return {
      meta: {
        bron: data.meta.bron,
        opmerkingen: data.meta.opmerkingen,
        gegenereerd_op: new Date().toISOString()
      },
      infrastructuur: data.infrastructuur,
      vestigingen: data.vestigingen.map(v => ({
        instellingsnummer: v.instellingsnummer,
        schoolNaam: v.schoolNaam,
        vestigingNaam: v.vestigingNaam,
        adres: v.adres,
        postcode: v.postcode,
        gemeente: v.gemeente,
        deelgemeente: v.deelgemeente,
        gegevens: v.gegevens,
        afstanden: v.afstanden,
        bezoeken: v.bezoeken
      }))
    };
  }

  return { laad, normaliseer, exporteer, ENDPOINT_URL, SNAPSHOT_URL };
})();
