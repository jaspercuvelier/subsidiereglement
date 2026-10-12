/**
 * WEERGAVE
 * ========
 *
 * Bouwt alle tabellen en panelen op uit de registers in config.js en het
 * resultaat van engine.js. Er staat hier geen enkele luik- of veldnaam
 * hardgecodeerd: een luik of gegeven bijzetten in config.js volstaat.
 */
const UI = (function () {

  /* ---------------------------------------------------------------- */
  /* Toestand                                                         */
  /* ---------------------------------------------------------------- */

  let data = null;
  let resultaat = null;
  let bewerkModus = false;
  let actiefTabblad = 'gegevens';
  let actieveDetailSleutel = null;
  const details = new Map();

  const instellingen = {};
  INSTELLINGEN.forEach(i => { instellingen[i.key] = i.standaard; });
  instellingen.infraActief = {};

  /* ---------------------------------------------------------------- */
  /* Opmaak                                                           */
  /* ---------------------------------------------------------------- */

  const euro = new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' });
  const euroFijn = new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 4, maximumFractionDigits: 4 });
  const aantal = new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 0 });
  const decimaal = new Intl.NumberFormat('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function formatteer(waarde, formaat) {
    const n = Number(waarde);
    if (!Number.isFinite(n)) return '-';
    switch (formaat) {
      case 'euro': return euro.format(n);
      case 'euroFijn': return euroFijn.format(n);
      case 'aantal': return aantal.format(n);
      case 'decimaal': return decimaal.format(n);
      case 'km': return `${decimaal.format(n)} km`;
      case 'procent': return `${decimaal.format(n * 100)} %`;
      default: return decimaal.format(n);
    }
  }

  function formatteerVeld(waarde, veld) {
    if (waarde === null || waarde === undefined || waarde === '') return '-';
    if (veld.type === 'euro') return euro.format(Number(waarde));
    if (veld.type === 'decimaal') return decimaal.format(Number(waarde));
    return aantal.format(Number(waarde));
  }

  // Wie een eigen bedrag krijgt: een vestiging of een school (zie VERDEELEENHEID).
  const PER_SCHOOL = VERDEELEENHEID === 'school';
  const EENHEID = PER_SCHOOL
    ? { enkelvoud: 'school', meervoud: 'scholen', kop: 'School' }
    : { enkelvoud: 'vestiging', meervoud: 'vestigingen', kop: 'Vestiging' };

  /** Naam van een deelnemer in één regel, voor het detailpaneel. */
  function deelnemerTitel(school) {
    return [school.schoolNaam, school.vestigingNaam, school.instellingsnummer || 'geen nummer']
      .filter(Boolean).join(' · ');
  }

  /** De naamcel van een deelnemer in de tabellen: school, en eronder vestiging en nummer. */
  function deelnemerCel(school, extra = '') {
    const onder = [
      school.vestigingNaam,
      school.instellingsnummer || 'geen nummer',
      !school.vestigingNaam && school.vestigingen.length > 1 ? `${school.vestigingen.length} vestigingen` : '',
      extra
    ].filter(Boolean).join(' · ');
    return `<div class="font-medium text-slate-900">${esc(school.schoolNaam)}</div>
            <div class="text-xs text-slate-400">${esc(onder)}</div>`;
  }

  function aantalScholen() {
    return new Set(resultaat.scholen.map(s => s.instellingsnummer || s.sleutel)).size;
  }

  function esc(waarde) {
    return String(waarde === null || waarde === undefined ? '' : waarde)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function el(id) { return document.getElementById(id); }

  /* ---------------------------------------------------------------- */
  /* Luiken en instellingen                                           */
  /* ---------------------------------------------------------------- */

  function werkBudgetTotaalBij() {
    const totaal = LUIKEN.filter(l => l.actief !== false).reduce((t, l) => t + Number(l.budget || 0), 0);
    el('budget-totaal').textContent = euro.format(totaal);
  }

  function tekenLuiken() {
    werkBudgetTotaalBij();

    el('luiken-config').innerHTML = LUIKEN.map(luik => `
      <div class="rounded-lg border border-slate-200 bg-white p-4 ${luik.actief === false ? 'opacity-50' : ''}">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Luik ${luik.nummer}</p>
            <p class="font-semibold text-slate-900">${esc(luik.naam)}</p>
          </div>
          <label class="shrink-0 text-xs text-slate-500">
            <input type="checkbox" class="luik-actief align-middle" data-luik="${esc(luik.id)}" ${luik.actief === false ? '' : 'checked'}>
            actief
          </label>
        </div>
        <p class="mt-2 text-xs leading-5 text-slate-500">${esc(luik.doel)}</p>
        <div class="mt-3 flex items-center gap-2">
          <span class="text-slate-400">€</span>
          <input type="number" step="500" min="0" value="${Number(luik.budget)}"
                 class="luik-budget w-full rounded-md border border-slate-300 py-2 px-2 text-right font-bold text-slate-900 focus:border-blue-500 focus:ring-blue-500"
                 data-luik="${esc(luik.id)}">
        </div>
        <p class="mt-2 text-xs text-slate-500">${luik.centraal
          ? `<span class="font-medium text-slate-700">Centraal betaald door de stad</span>, niet verdeeld`
          : `Verdeeld op <span class="font-medium text-slate-700">${esc(luik.grondslagLabel)}</span>`}</p>
      </div>
    `).join('');
  }

  function tekenInstellingen() {
    el('instellingen-config').innerHTML = INSTELLINGEN.map(instelling => {
      const waarde = instellingen[instelling.key];
      if (instelling.type === 'schakelaar') {
        return `
          <label class="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white p-3">
            <input type="checkbox" class="instelling mt-0.5" data-key="${esc(instelling.key)}" data-type="schakelaar" ${waarde ? 'checked' : ''}>
            <span class="min-w-0">
              <span class="block text-sm font-medium text-slate-800">${esc(instelling.label)}</span>
              <span class="block text-xs leading-5 text-slate-500">${esc(instelling.toelichting)}</span>
            </span>
          </label>`;
      }
      return `
        <div class="rounded-lg border border-slate-200 bg-white p-3">
          <label class="block text-sm font-medium text-slate-800">${esc(instelling.label)}</label>
          <div class="mt-1 flex items-center gap-2">
            <input type="number" step="${instelling.stap || 1}" value="${waarde}"
                   class="instelling w-28 rounded-md border border-slate-300 py-1.5 px-2 text-right" data-key="${esc(instelling.key)}" data-type="getal">
            <span class="text-xs text-slate-500">${esc(instelling.eenheid || '')}</span>
          </div>
          <p class="mt-1 text-xs leading-5 text-slate-500">${esc(instelling.toelichting)}</p>
        </div>`;
    }).join('');
  }

  function tekenInfrastructuur() {
    if (!data) return;
    el('infrastructuur-config').innerHTML = data.infrastructuur.map(infra => {
      const actief = instellingen.infraActief[infra.id] !== false;
      const metAfstand = data.vestigingen.filter(v => v.afstanden[infra.id] !== null).length;
      const metBezoek = data.vestigingen.filter(v => v.bezoeken[infra.id] !== null).length;
      const totaal = data.vestigingen.length;
      const compleet = metAfstand === totaal && metBezoek === totaal;
      return `
        <label class="flex cursor-pointer items-center gap-2 rounded-md border ${compleet ? 'border-slate-200' : 'border-amber-300 bg-amber-50'} px-3 py-2 text-sm">
          <input type="checkbox" class="infra-actief" data-infra="${esc(infra.id)}" ${actief ? 'checked' : ''}>
          <span class="font-medium text-slate-800">${esc(infra.naam)}</span>
          <span class="text-xs text-slate-500">${metAfstand}/${totaal} afst. · ${metBezoek}/${totaal} bez.</span>
        </label>`;
    }).join('');
  }

  /* ---------------------------------------------------------------- */
  /* Databeschikbaarheid                                              */
  /* ---------------------------------------------------------------- */

  function tekenDataStatus() {
    const meldingen = [];

    resultaat.luiken.forEach(r => {
      r.dataStatus.ontbrekendeVelden.forEach(m => meldingen.push({
        ernst: 'blokkerend', luik: r.luik,
        tekst: `<strong>${esc(m.label)}</strong> ontbreekt bij ${m.aantal} van de ${m.totaal} vestigingen. Zonder dit gegeven kan luik ${r.luik.nummer} niet correct verdeeld worden.`
      }));
      r.dataStatus.geschatteVelden.forEach(m => meldingen.push({
        ernst: 'aanname', luik: r.luik,
        tekst: `<strong>${esc(m.label)}</strong> ontbreekt bij ${m.aantal} van de ${m.totaal} vestigingen. De tool rekent daar voorlopig met ${esc(String(m.standaard))}.`
      }));
      r.dataStatus.infrastructuurGaten.forEach(m => {
        const stukken = [];
        if (m.zonderAfstand) stukken.push(`afstand ontbreekt bij ${m.zonderAfstand}/${m.totaal}`);
        if (m.zonderBezoek) stukken.push(`bezoekersaantal ontbreekt bij ${m.zonderBezoek}/${m.totaal}`);
        meldingen.push({
          ernst: 'aanname', luik: r.luik,
          tekst: `<strong>${esc(m.naam)}</strong>: ${stukken.join(' en ')}. Die verplaatsingen tellen nu niet mee.`
        });
      });
    });

    const kleuren = {
      blokkerend: 'border-red-300 bg-red-50 text-red-900',
      aanname: 'border-amber-300 bg-amber-50 text-amber-900',
      nazicht: 'border-sky-300 bg-sky-50 text-sky-900'
    };
    const labels = { blokkerend: 'Ontbreekt', aanname: 'Aanname', nazicht: 'Nazicht' };

    el('data-status-teller').textContent = meldingen.length === 0
      ? 'Alle gegevens aanwezig'
      : `${meldingen.length} aandachtspunt${meldingen.length === 1 ? '' : 'en'}`;

    el('data-status').innerHTML = meldingen.length === 0
      ? '<p class="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">Alle gegevens die de luiken nodig hebben, zijn ingevuld.</p>'
      : meldingen.map(m => `
          <div class="rounded-md border ${kleuren[m.ernst]} p-3 text-sm leading-6">
            <span class="mr-2 rounded bg-white/70 px-1.5 py-0.5 text-xs font-semibold uppercase">${labels[m.ernst]}</span>
            ${m.luik ? `<span class="text-xs font-medium">Luik ${m.luik.nummer}</span> · ` : ''}${m.tekst}
          </div>`).join('');
  }

  /* ---------------------------------------------------------------- */
  /* Brongegevens                                                     */
  /* ---------------------------------------------------------------- */

  /** index: de vestigingsindex, of het instellingsnummer voor de projectbedragen. */
  function invoerCel(index, soort, sleutel, waarde, stap) {
    if (!bewerkModus) return null;
    return `<input type="number" step="${stap}" value="${waarde === null || waarde === undefined ? '' : waarde}"
              class="bron-invoer w-24 rounded border border-slate-300 px-1 py-0.5 text-right"
              data-index="${esc(index)}" data-soort="${soort}" data-sleutel="${esc(sleutel)}">`;
  }

  /** Eén regel per instellingsnummer, met de schoolnaam en haar vestigingen. */
  function projectRegels() {
    return Object.keys(data.projectbedragen).map(nummer => {
      const vestigingen = data.vestigingen.filter(v => v.instellingsnummer === nummer);
      return {
        nummer,
        schoolNaam: vestigingen.length ? vestigingen[0].schoolNaam : nummer,
        onder: vestigingen.length > 1 ? `${nummer} · ${vestigingen.length} vestigingen` : nummer
      };
    }).sort((a, b) => a.schoolNaam.localeCompare(b.schoolNaam, 'nl'));
  }

  function tekenGegevensTabel() {
    const koppen = ['School', 'Vestiging', 'Deelgem.'].concat(VELDEN.map(v => v.kort));
    const rijen = data.vestigingen.map((v, index) => {
      const cellen = VELDEN.map(veld => {
        const waarde = v.gegevens[veld.key];
        const invoer = invoerCel(index, 'gegevens', veld.key, waarde, veld.type === 'decimaal' ? 0.01 : 1);
        const inhoud = invoer || `<span class="${waarde === null ? 'text-slate-300' : ''}">${formatteerVeld(waarde, veld)}</span>`;
        return `<td class="px-3 py-2 text-right whitespace-nowrap">${inhoud}</td>`;
      }).join('');
      return `
        <tr>
          <td class="px-3 py-2"><div class="max-w-56 truncate font-medium text-slate-900" title="${esc(v.schoolNaam)}">${esc(v.schoolNaam)}</div>
            <div class="text-xs text-slate-400">${esc(v.instellingsnummer)}</div></td>
          <td class="px-3 py-2"><div class="max-w-56 truncate text-slate-600" title="${esc(v.vestigingNaam)}">${esc(v.vestigingNaam)}</div></td>
          <td class="px-3 py-2 text-xs text-slate-600">${esc(v.deelgemeente || '-')}</td>
          ${cellen}
        </tr>`;
    }).join('');

    const totalen = VELDEN.map(veld => {
      if (!veld.optelbaar) return '<td class="px-3 py-2 text-right text-slate-400">-</td>';
      const som = data.vestigingen.reduce((t, v) => t + (Number(v.gegevens[veld.key]) || 0), 0);
      return `<td class="px-3 py-2 text-right">${formatteerVeld(som, veld)}</td>`;
    }).join('');

    return `
      <table class="min-w-full text-sm">
        <thead class="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr>${koppen.map((k, i) => `<th class="px-3 py-3 ${i > 2 ? 'text-right' : 'text-left'} font-medium">${esc(k)}</th>`).join('')}</tr>
        </thead>
        <tbody class="divide-y divide-slate-200 bg-white">${rijen}</tbody>
        <tfoot class="bg-slate-100 font-semibold text-slate-800">
          <tr><td class="px-3 py-2" colspan="3">Totaal (${data.vestigingen.length} vestigingen)</td>${totalen}</tr>
        </tfoot>
      </table>`;
  }

  /**
   * Eén tabel voor elke matrix: afstanden en bezoeken hebben een kolom per
   * infrastructuur, de projectfacturen een kolom per project.
   */
  function tekenMatrixTabel(soort) {
    const isAfstand = soort === 'afstanden';
    const isBedrag = soort === 'projecten';
    const kolommen = isBedrag ? data.projecten : data.infrastructuur;

    if (kolommen.length === 0) {
      return `<p class="p-6 text-sm leading-6 text-slate-500">
        Er zijn nog geen projecten. Voeg ze toe in de Google Sheet via
        <em>Subsidietool → Project toevoegen</em>: dat maakt een kolom aan waar je per school
        het factuurbedrag kan intypen, met een korte omschrijving erbij.
      </p>`;
    }

    // De projectfacturen staan per school (instellingsnummer), de afstanden en
    // bezoeken per vestiging.
    const regels = isBedrag
      ? projectRegels().map(r => ({
          index: r.nummer, bron: 'projectbedragen', waarden: data.projectbedragen[r.nummer],
          naam: r.schoolNaam, onder: r.onder
        }))
      : data.vestigingen.map((v, index) => ({
          index, bron: soort, waarden: v[soort], naam: v.schoolNaam, onder: v.vestigingNaam
        }));

    const rijen = regels.map(regel => {
      const cellen = kolommen.map(kolom => {
        const waarde = regel.waarden[kolom.id];
        const invoer = invoerCel(regel.index, regel.bron, kolom.id, waarde, isAfstand ? 0.1 : (isBedrag ? 0.01 : 1));
        if (invoer) return `<td class="px-3 py-2 text-right">${invoer}</td>`;
        if (waarde === null) return '<td class="px-3 py-2 text-right text-slate-300">-</td>';
        const teKort = isAfstand && waarde < instellingen.minimumAfstandKm;
        return `<td class="px-3 py-2 text-right whitespace-nowrap ${teKort ? 'text-slate-400 line-through' : ''}"
                    ${teKort ? `title="Onder de minimumafstand van ${instellingen.minimumAfstandKm} km, telt niet mee"` : ''}>
                  ${isAfstand ? formatteer(waarde, 'km') : (isBedrag ? euro.format(waarde) : aantal.format(waarde))}</td>`;
      }).join('');
      return `<tr>
          <td class="px-3 py-2"><div class="max-w-48 truncate font-medium text-slate-900" title="${esc(regel.naam)}">${esc(regel.naam)}</div>
            <div class="max-w-48 truncate text-xs text-slate-400" title="${esc(regel.onder)}">${esc(regel.onder)}</div></td>
          ${cellen}
        </tr>`;
    }).join('');

    const voet = !isBedrag ? '' : `
      <tfoot class="bg-slate-100 font-semibold text-slate-800">
        <tr>
          <td class="px-3 py-2">Totaal besteed</td>
          ${kolommen.map(kolom => {
            const som = Object.values(data.projectbedragen).reduce((t, b) => t + (Number(b[kolom.id]) || 0), 0);
            return `<td class="px-3 py-2 text-right whitespace-nowrap">${euro.format(som)}</td>`;
          }).join('')}
        </tr>
      </tfoot>`;

    return `
      <table class="min-w-full text-sm">
        <thead class="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th class="px-3 py-3 text-left font-medium">${isBedrag ? 'School' : 'Vestiging'}</th>
            ${kolommen.map(kolom => `
              <th class="px-3 py-3 text-right font-medium ${!isBedrag && instellingen.infraActief[kolom.id] === false ? 'opacity-40' : ''}"
                  ${kolom.omschrijving ? `title="${esc(kolom.omschrijving)}"` : ''}>${esc(kolom.naam)}</th>`).join('')}
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 bg-white">${rijen}</tbody>
        ${voet}
      </table>`;
  }

  function tekenBrongegevens() {
    const tabbladen = [
      { id: 'gegevens', label: 'Gegevens per vestiging' },
      { id: 'afstanden', label: 'Afstanden (km)' },
      { id: 'bezoeken', label: 'Bezoekersaantallen' },
      { id: 'projecten', label: 'Projectfacturen' }
    ];
    el('bron-tabs').innerHTML = tabbladen.map(t => `
      <button class="bron-tab rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${actiefTabblad === t.id ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}"
              data-tab="${t.id}">${esc(t.label)}</button>`).join('');

    el('bron-tabel').innerHTML = actiefTabblad === 'gegevens'
      ? tekenGegevensTabel()
      : tekenMatrixTabel(actiefTabblad);

    el('bewerk-knop').textContent = bewerkModus ? '✓ Klaar met bewerken' : '✎ Bewerken';
    el('bewerk-knop').className = bewerkModus
      ? 'rounded bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700'
      : 'rounded bg-slate-700 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800';
  }

  /* ---------------------------------------------------------------- */
  /* Resultaten                                                       */
  /* ---------------------------------------------------------------- */

  function knop(sleutel, bedrag, extra = '') {
    return `<button type="button" class="bedrag-knop w-full rounded border-b border-dotted border-slate-400 px-1 py-0.5 text-right hover:bg-blue-50 hover:text-blue-700 ${extra}"
              data-detail="${esc(sleutel)}">${euro.format(bedrag)}</button>`;
  }

  function tekenResultaten() {
    details.clear();

    const gesorteerd = resultaat.scholen.slice().sort(
      (a, b) => resultaat.totaalPerSchool[b.sleutel] - resultaat.totaalPerSchool[a.sleutel]
    );

    const verdelend = resultaat.luiken.filter(r => !r.centraal);

    const rijen = gesorteerd.map(school => {
      const cellen = verdelend.map(r => {
        const eigen = r.perSchool[school.sleutel];
        const sleutel = `${school.sleutel}::${r.luik.id}`;
        details.set(sleutel, maakLuikDetail(r, school, eigen));
        return `<td class="px-2 py-3 text-right">${knop(sleutel, eigen.bedrag)}</td>`;
      }).join('');

      const totaalSleutel = `${school.sleutel}::totaal`;
      details.set(totaalSleutel, maakTotaalDetail(school));

      return `
        <tr>
          <td class="px-3 py-3">${deelnemerCel(school)}</td>
          <td class="px-3 py-3 text-right text-slate-600">${aantal.format(school.gegevens.lln)}</td>
          ${cellen}
          <td class="px-2 py-3 text-right font-bold text-emerald-700">${knop(totaalSleutel, resultaat.totaalPerSchool[school.sleutel], 'text-emerald-700')}</td>
        </tr>`;
    }).join('');

    const kolomTotalen = verdelend.map(r => {
      const sleutel = `kolom::${r.luik.id}`;
      details.set(sleutel, maakKolomDetail(r));
      const verdeeld = r.budget - r.nietVerdeeld;
      return `<td class="px-2 py-3 text-right">${knop(sleutel, verdeeld)}</td>`;
    }).join('');

    el('resultaten').innerHTML = `
      <table class="min-w-full text-sm">
        <thead class="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th class="px-3 py-3 text-left font-medium">${EENHEID.kop}</th>
            <th class="px-3 py-3 text-right font-medium">Lln</th>
            ${verdelend.map(r => `<th class="px-2 py-3 text-right font-medium">Luik ${r.luik.nummer}<div class="font-normal normal-case text-slate-400">${esc(r.luik.naam)}</div></th>`).join('')}
            <th class="px-2 py-3 text-right font-medium">Totaal</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 bg-white">${rijen}</tbody>
        <tfoot class="bg-slate-100 font-semibold text-slate-800">
          <tr>
            <td class="px-3 py-3">Totaal (${resultaat.scholen.length} ${EENHEID.meervoud})</td>
            <td class="px-3 py-3 text-right">${aantal.format(resultaat.scholen.reduce((t, s) => t + s.gegevens.lln, 0))}</td>
            ${kolomTotalen}
            <td class="px-2 py-3 text-right text-lg text-emerald-700">${euro.format(resultaat.totaalVerdeeld)}</td>
          </tr>
        </tfoot>
      </table>`;

    tekenCentraleLuiken();

    const restant = resultaat.nietVerdeeld;
    el('resultaat-melding').innerHTML = restant > 0.005
      ? `<div class="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
           ${euro.format(restant)} van de ${euro.format(resultaat.totaalBudget)} kon niet verdeeld worden.
           Dat gebeurt wanneer geen enkele ${EENHEID.enkelvoud} een grondslag heeft voor een luik (bv. een ontbrekend gegeven),
           of wanneer alle ${EENHEID.meervoud} hun plafond bereikt hebben.
         </div>`
      : '';
  }

  /**
   * Luiken die de stad zelf betaalt staan niet in de tabel hierboven: er gaat
   * geen euro naar de scholen. Ze krijgen een eigen blok, met twee balken op
   * dezelfde schaal: wat er van het gereserveerde bedrag naar de factuur ging,
   * en hoe het saldo de pot van het volgende luik groter of kleiner maakt.
   */
  function tekenCentraleLuiken() {
    const centraal = resultaat.luiken.filter(r => r.centraal);

    el('centrale-luiken').innerHTML = centraal.map(r => {
      const sleutel = `kolom::${r.luik.id}`;
      details.set(sleutel, maakKolomDetail(r));
      const doel = resultaat.luiken.find(x => !x.centraal && x.luik.id === r.overdrachtNaar);
      return tekenDoorstroming(r, doel, sleutel);
    }).join('');
  }

  const STREEP = 'repeating-linear-gradient(45deg, #fda4af 0 6px, #fecdd3 6px 12px)';

  /** Eén segment van een balk; breedte in procent van de balk zelf. */
  function segment(breedte, opmaak, label) {
    if (breedte <= 0.05) return '';
    const stijl = opmaak.streep
      ? `width:${breedte}%;background-image:${STREEP}`
      : `width:${breedte}%`;
    return `<div class="${opmaak.klasse}" style="${stijl}" title="${esc(label)}"></div>`;
  }

  function stip(opmaak) {
    return opmaak.streep
      ? `<span class="inline-block h-3 w-3 shrink-0 rounded-sm align-middle" style="background-image:${STREEP}"></span>`
      : `<span class="inline-block h-3 w-3 shrink-0 rounded-sm align-middle ${opmaak.klasse}"></span>`;
  }

  function legende(items) {
    return `<div class="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
      ${items.map(item => `<span class="flex items-center gap-1.5">
          ${stip(item.opmaak)}<span>${item.label}</span>
          <span class="font-semibold text-slate-900">${item.waarde}</span>
        </span>`).join('')}
    </div>`;
  }

  function balk(titel, totaalLabel, breedtePercent, segmenten) {
    return `
      <div>
        <div class="flex flex-wrap items-baseline justify-between gap-2 text-xs">
          <span class="font-semibold text-slate-700">${titel}</span>
          <span class="text-slate-500">${totaalLabel}</span>
        </div>
        <div class="mt-1 flex h-7 overflow-hidden rounded bg-slate-200" style="width:${breedtePercent}%">
          ${segmenten}
        </div>
      </div>`;
  }

  /**
   * Beide balken staan op één schaal (euro per pixel), zodat het stuk dat uit
   * het ene luik verdwijnt even breed is als het stuk dat in het andere luik
   * bijkomt. Dat is precies wat er te zien moet zijn.
   */
  function tekenDoorstroming(r, doel, detailSleutel) {
    const FACTUUR = { klasse: 'bg-slate-400' };
    const SALDO = { klasse: 'bg-emerald-400' };
    const EIGEN = { klasse: 'bg-sky-500' };
    const TEKORT = { streep: true };

    const tekort = r.saldo < 0;
    const bron = Math.max(r.budget, r.besteed);
    const pot = doel ? Math.max(doel.basisbudget, doel.budget) : 0;
    const schaal = Math.max(bron, pot, 1);
    const deel = (bedrag, van) => (van > 0 ? (bedrag / van) * 100 : 0);

    const bronSegmenten = tekort
      ? segment(deel(r.budget, bron), FACTUUR, 'Gereserveerd en opgegaan aan de factuur')
        + segment(deel(-r.saldo, bron), TEKORT, 'Tekort')
      : segment(deel(r.besteed, bron), FACTUUR, 'Factuur')
        + segment(deel(r.saldo, bron), SALDO, 'Saldo, gaat naar het volgende luik');

    const bronBalk = balk(
      `Luik ${r.luik.nummer} · ${esc(r.luik.naam)}`,
      tekort
        ? `${euro.format(r.besteed)} factuur, ${euro.format(r.budget)} gereserveerd`
        : `${euro.format(r.budget)} gereserveerd`,
      deel(bron, schaal),
      bronSegmenten);

    const bronLegende = legende(tekort
      ? [{ opmaak: FACTUUR, label: 'Factuur (tot het gereserveerde bedrag)', waarde: euro.format(r.budget) },
         { opmaak: TEKORT, label: 'Tekort bovenop de reservering', waarde: euro.format(-r.saldo) }]
      : [{ opmaak: FACTUUR, label: 'Factuur fluojasjes', waarde: euro.format(r.besteed) },
         { opmaak: SALDO, label: 'Blijft over', waarde: euro.format(r.saldo) }]);

    if (!doel) {
      return `<div class="rounded-lg border border-slate-200 bg-slate-50 p-4">${bronBalk}${bronLegende}</div>`;
    }

    const doelSegmenten = tekort
      ? segment(deel(doel.budget, pot), EIGEN, 'Wat er van de pot overblijft')
        + segment(deel(-doel.overdracht, pot), TEKORT, 'Afgetrokken voor het tekort')
      : segment(deel(doel.basisbudget, pot), EIGEN, 'Eigen budget van dit luik')
        + segment(deel(doel.overdracht, pot), SALDO, 'Bijgekomen uit het vorige luik');

    const doelBalk = balk(
      `Luik ${doel.luik.nummer} · ${esc(doel.luik.naam)}`,
      `${euro.format(doel.budget)} te verdelen over de ${EENHEID.meervoud}`,
      deel(pot, schaal),
      doelSegmenten);

    const doelLegende = legende(tekort
      ? [{ opmaak: EIGEN, label: 'Pot die overblijft', waarde: euro.format(doel.budget) },
         { opmaak: TEKORT, label: `Afgetrokken voor luik ${r.luik.nummer}`, waarde: euro.format(-doel.overdracht) }]
      : [{ opmaak: EIGEN, label: 'Eigen budget', waarde: euro.format(doel.basisbudget) },
         { opmaak: SALDO, label: `Uit luik ${r.luik.nummer}`, waarde: euro.format(doel.overdracht) }]);

    const som = tekort
      ? `${euro.format(doel.basisbudget)} − ${euro.format(-doel.overdracht)} = ${euro.format(doel.budget)}`
      : `${euro.format(doel.basisbudget)} + ${euro.format(doel.overdracht)} = ${euro.format(doel.budget)}`;

    return `
      <div class="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Van luik ${r.luik.nummer} naar luik ${doel.luik.nummer}
          </p>
          <button type="button" class="bedrag-knop rounded border-b border-dotted border-slate-400 px-1 text-xs text-slate-500 hover:bg-blue-50 hover:text-blue-700"
                  data-detail="${esc(detailSleutel)}">de berekening</button>
        </div>
        <p class="mt-1 text-sm leading-6 text-slate-600">
          Luik ${r.luik.nummer} staat niet in de tabel hierboven: de stad koopt centraal aan en betaalt
          de factuur zelf, er gaat dus geen euro rechtstreeks naar een ${EENHEID.enkelvoud}.
          ${tekort
            ? `De factuur is ${euro.format(-r.saldo)} duurder dan de ${euro.format(r.budget)} die ervoor
               opzijgezet was, en dat tekort wordt van de pot van luik ${doel.luik.nummer} afgetrokken.`
            : r.besteed === 0
              ? `Er is nog geen factuurbedrag ingevuld (rij <code class="rounded bg-white px-1">fluofactuur</code>
                 in het tabblad META van de sheet), dus schuift voorlopig de volledige
                 ${euro.format(r.budget)} door naar de pot van luik ${doel.luik.nummer}.`
              : `Wat er van de ${euro.format(r.budget)} overblijft, ${euro.format(r.saldo)}, gaat naar de pot
                 van luik ${doel.luik.nummer} en wordt daar mee over de ${EENHEID.meervoud} verdeeld.`}
        </p>

        <div class="mt-4 space-y-4">
          <div>${bronBalk}${bronLegende}</div>
          <div>${doelBalk}${doelLegende}</div>
        </div>

        <p class="mt-4 border-t border-slate-200 pt-3 text-sm text-slate-700">
          Pot van luik ${doel.luik.nummer}: <span class="font-semibold text-slate-900">${som}</span>
        </p>
      </div>`;
  }

  /* ---------------------------------------------------------------- */
  /* Projecten per deelnemer                                          */
  /* ---------------------------------------------------------------- */

  /** Over wie de pot van een luik verdeeld wordt: de deelnemers, of de scholen. */
  function potEenheid(luik) {
    return luik.eenheid === 'school'
      ? { enkelvoud: 'school', meervoud: 'scholen', kop: 'School' }
      : EENHEID;
  }

  /**
   * Het overzicht waar een school aan afleest hoeveel van haar pot al opging
   * aan projecten en hoeveel er nog beschikbaar is.
   */
  function tekenProjecten() {
    const r = resultaat.luiken.find(x => x.luik.metFacturen);
    if (!r) { el('projecten-overzicht').innerHTML = ''; return; }

    const projecten = data.projecten || [];
    const E = potEenheid(r.luik);
    const gesorteerd = r.groepen.slice()
      .sort((a, b) => a.schoolNaam.localeCompare(b.schoolNaam, 'nl')
        || a.vestigingNaam.localeCompare(b.vestigingNaam, 'nl'));

    // Waar de pot vandaan komt, meteen boven de tabel: het bedrag in de
    // kolomvoet is niet het budget dat in de configuratie staat.
    const bron = LUIKEN.find(l => l.overdrachtNaar === r.luik.id);
    const potHerkomst = !r.overdracht ? '' : `
      <p class="mx-1 mb-3 text-sm leading-6 text-slate-600">
        De pot die hier verdeeld wordt is
        <span class="font-semibold text-slate-900">${euro.format(r.budget)}</span>:
        ${euro.format(r.basisbudget)} eigen budget
        ${r.overdracht >= 0
          ? `plus ${euro.format(r.overdracht)} die overbleef`
          : `min ${euro.format(-r.overdracht)} tekort`}
        ${bron ? `van luik ${bron.nummer} (${esc(bron.naam)})` : ''}.
      </p>`;

    const inleiding = potHerkomst + (projecten.length === 0
      ? `<p class="mx-1 mb-3 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm leading-6 text-sky-900">
           Er zijn nog geen projecten ingegeven. Voeg ze toe in de Google Sheet via
           <em>Subsidietool → Project toevoegen</em>; elk project wordt een kolom waar de stad
           per ${E.enkelvoud} het factuurbedrag intypt. Zolang er niets ingevuld is, staat de volledige
           pot van elke ${E.enkelvoud} nog open.
         </p>`
      : '');

    const rijen = gesorteerd.map(school => {
      const eigen = r.perGroep[school.sleutel];
      const besteed = school.projectenTotaal;
      const beschikbaar = eigen.basisaandeel - besteed;

      const sleutel = `${school.sleutel}::facturen`;
      details.set(sleutel, maakProjectDetail(r, school));

      const projectCellen = projecten.map(project => {
        const bedrag = school.projecten[project.id] || 0;
        return `<td class="px-3 py-3 text-right whitespace-nowrap ${bedrag === 0 ? 'text-slate-300' : 'text-slate-700'}">${euro.format(bedrag)}</td>`;
      }).join('');

      return `
        <tr>
          <td class="px-3 py-3">${deelnemerCel(school, `${aantal.format(school.gegevens.lln)} lln`)}</td>
          <td class="px-3 py-3 text-right whitespace-nowrap text-slate-700">${euro.format(eigen.basisaandeel)}</td>
          <td class="px-2 py-3 text-right">${knop(sleutel, besteed)}</td>
          <td class="px-3 py-3 text-right whitespace-nowrap font-semibold ${beschikbaar < -0.005 ? 'text-amber-700' : 'text-emerald-700'}">${euro.format(beschikbaar)}</td>
          ${projectCellen}
          ${r.herverdeel ? `<td class="px-3 py-3 text-right whitespace-nowrap font-semibold text-slate-900">${euro.format(eigen.bedrag)}</td>` : ''}
        </tr>`;
    }).join('');

    const somPot = r.groepen.reduce((t, s) => t + r.perGroep[s.sleutel].basisaandeel, 0);
    const somBesteed = r.groepen.reduce((t, s) => t + s.projectenTotaal, 0);

    el('projecten-overzicht').innerHTML = `
      ${inleiding}
      <table class="min-w-full text-sm">
        <thead class="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th class="px-3 py-3 text-left font-medium">${E.kop}</th>
            <th class="px-3 py-3 text-right font-medium">Pot<div class="font-normal normal-case text-slate-400">aandeel luik ${r.luik.nummer}</div></th>
            <th class="px-2 py-3 text-right font-medium">Besteed<div class="font-normal normal-case text-slate-400">facturen</div></th>
            <th class="px-3 py-3 text-right font-medium">Nog beschikbaar</th>
            ${projecten.map(p => `<th class="px-3 py-3 text-right font-medium" ${p.omschrijving ? `title="${esc(p.omschrijving)}"` : ''}>${esc(p.naam)}</th>`).join('')}
            ${r.herverdeel ? '<th class="px-3 py-3 text-right font-medium">Toegekend<div class="font-normal normal-case text-slate-400">na herverdeling</div></th>' : ''}
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 bg-white">${rijen}</tbody>
        <tfoot class="bg-slate-100 font-semibold text-slate-800">
          <tr>
            <td class="px-3 py-3">Totaal (${r.groepen.length} ${E.meervoud})</td>
            <td class="px-3 py-3 text-right whitespace-nowrap">${euro.format(somPot)}</td>
            <td class="px-3 py-3 text-right whitespace-nowrap">${euro.format(somBesteed)}</td>
            <td class="px-3 py-3 text-right whitespace-nowrap ${somPot - somBesteed < -0.005 ? 'text-amber-700' : 'text-emerald-700'}">${euro.format(somPot - somBesteed)}</td>
            ${projecten.map(p => {
              const som = r.groepen.reduce((t, s) => t + (s.projecten[p.id] || 0), 0);
              return `<td class="px-3 py-3 text-right whitespace-nowrap">${euro.format(som)}</td>`;
            }).join('')}
            ${r.herverdeel ? `<td class="px-3 py-3 text-right whitespace-nowrap">${euro.format(r.budget - r.nietVerdeeld)}</td>` : ''}
          </tr>
        </tfoot>
      </table>`;
  }

  /* ---------------------------------------------------------------- */
  /* Detailpaneel                                                     */
  /* ---------------------------------------------------------------- */

  function maakLuikDetail(r, school, eigen) {
    const luik = r.luik;
    const stappen = [
      { label: `Budget luik ${luik.nummer}`, waarde: euro.format(r.budget) },
      { label: `Grondslag deze ${EENHEID.enkelvoud} (${luik.grondslagLabel})`, waarde: `${decimaal.format(eigen.grondslag)} ${luik.grondslagEenheid || ''}`.trim() },
      { label: `Grondslag alle ${EENHEID.meervoud}`, waarde: `${decimaal.format(r.totaleGrondslag)} ${luik.grondslagEenheid || ''}`.trim() },
      { label: 'Aandeel', waarde: formatteer(eigen.aandeel, 'procent') }
    ];

    if (r.overdracht) {
      const bron = LUIKEN.find(l => l.overdrachtNaar === luik.id);
      stappen.splice(1, 0, {
        label: bron ? `Waarvan uit luik ${bron.nummer} (${bron.naam})` : 'Waarvan overgedragen',
        waarde: euro.format(r.overdracht)
      });
    }
    // Per school verdeeld: de pot, de facturen en het plafond zijn die van de
    // hele school, deze vestiging krijgt er haar deel van.
    const groep = eigen.groep ? r.groepen.find(g => g.sleutel === eigen.groep) : school;
    const vanGroep = eigen.groep ? r.perGroep[eigen.groep] : eigen;
    const viaSchool = Boolean(eigen.groep);
    if (viaSchool) {
      stappen.push({ label: 'Bedrag voor de hele school', waarde: euro.format(vanGroep.bedrag) });
      stappen.push({ label: `Deel deze vestiging (${luik.grondslagLabel})`,
                     waarde: `${decimaal.format(eigen.grondslag)} van ${decimaal.format(vanGroep.grondslag)}` });
    }
    if (luik.metFacturen) {
      const wie = viaSchool ? ' (hele school)' : '';
      stappen.push({ label: `Aandeel in de pot${wie}`, waarde: euro.format(vanGroep.basisaandeel) });
      stappen.push({ label: `Besteed aan projecten${wie}`, waarde: euro.format(groep.projectenTotaal) });
      stappen.push({ label: `Nog beschikbaar${wie}`, waarde: euro.format(vanGroep.basisaandeel - groep.projectenTotaal) });
    }
    if (vanGroep.plafond !== null) {
      stappen.push({ label: `Plafond (ingediende facturen${viaSchool ? ' van de school' : ''})`, waarde: euro.format(vanGroep.plafond) });
    }
    if (r.herverdeel && r.rondes.length > 1) {
      stappen.push({ label: 'Verdeelrondes', waarde: `${r.rondes.length} (herverdeling van onbenut budget)` });
    }
    eigen.afgeleiden.forEach(a => stappen.push({ label: a.label, waarde: formatteer(a.waarde, a.formaat) }));

    return {
      titel: `Luik ${luik.nummer}: ${luik.naam}`,
      school: deelnemerTitel(school),
      bedrag: eigen.bedrag,
      uitleg: luik.toelichting,
      formule: viaSchool
        ? `${euro.format(vanGroep.bedrag)} × ${decimaal.format(eigen.grondslag)} / ${decimaal.format(vanGroep.grondslag)} = ${euro.format(eigen.bedrag)}`
        : `${euro.format(r.budget)} × ${decimaal.format(eigen.grondslag)} / ${decimaal.format(r.totaleGrondslag)} = ${euro.format(eigen.bedrag)}`,
      stappen,
      voorwaarden: luik.voorwaarden || [],
      opmerking: [
        viaSchool ? `Dit luik wordt per school verdeeld. De school krijgt ${euro.format(vanGroep.bedrag)}; elke vestiging krijgt daarvan een deel naar ${luik.grondslagLabel}.` : '',
        eigen.geplafonneerd ? `De ${viaSchool ? 'school' : EENHEID.enkelvoud} zit op haar plafond: het bedrag is begrensd door de ingediende facturen.` : ''
      ].filter(Boolean).join(' ')
    };
  }

  /** Waar het bestede bedrag van één school vandaan komt: factuur per factuur. */
  function maakProjectDetail(r, school) {
    const projecten = data.projecten || [];
    const eigen = r.perGroep[school.sleutel];
    const E = potEenheid(r.luik);
    const besteed = school.projectenTotaal;
    const gebruikt = projecten.filter(p => (school.projecten[p.id] || 0) !== 0);

    const stappen = gebruikt.map(p => ({
      label: p.omschrijving ? `${p.naam} — ${p.omschrijving}` : p.naam,
      waarde: euro.format(school.projecten[p.id])
    }));
    stappen.push({ label: 'Totaal besteed', waarde: euro.format(besteed) });
    stappen.push({ label: `Pot (aandeel luik ${r.luik.nummer})`, waarde: euro.format(eigen.basisaandeel) });
    stappen.push({ label: 'Nog beschikbaar', waarde: euro.format(eigen.basisaandeel - besteed) });

    const beschikbaar = eigen.basisaandeel - besteed;
    return {
      titel: 'Projecten',
      school: deelnemerTitel(school),
      bedrag: besteed,
      uitleg: gebruikt.length === 0
        ? `Voor deze ${E.enkelvoud} zijn er nog geen projectfacturen ingegeven. De volledige pot van ${euro.format(eigen.basisaandeel)} staat dus nog open.`
        : `De facturen die de stad voor deze ${E.enkelvoud} noteerde. Samen ${euro.format(besteed)} van een pot van ${euro.format(eigen.basisaandeel)}.`,
      formule: gebruikt.length === 0
        ? `${euro.format(eigen.basisaandeel)} pot - ${euro.format(0)} besteed = ${euro.format(eigen.basisaandeel)} beschikbaar`
        : `${gebruikt.map(p => euro.format(school.projecten[p.id])).join(' + ')} = ${euro.format(besteed)}`,
      stappen,
      voorwaarden: r.luik.voorwaarden || [],
      opmerking: beschikbaar < -0.005
        ? `Deze ${E.enkelvoud} besteedde ${euro.format(-beschikbaar)} meer dan haar eigen pot. Bij de eindafrekening kan dat opgevangen worden met wat andere ${E.meervoud} niet gebruikten.`
        : ''
    };
  }

  /**
   * Heeft de school nog andere vestigingen, dan ook hun bedrag en het totaal
   * per instellingsnummer: de stad betaalt uit aan de school.
   */
  function zusterStappen(school) {
    if (!school.zusters || school.zusters.length === 0) return [];
    const zusters = school.zusters.map(sleutel => resultaat.scholen.find(s => s.sleutel === sleutel));
    const totaal = [school].concat(zusters)
      .reduce((t, s) => t + resultaat.totaalPerSchool[s.sleutel], 0);
    return zusters.map(s => ({
      label: `Andere vestiging: ${s.vestigingNaam}`,
      waarde: euro.format(resultaat.totaalPerSchool[s.sleutel])
    })).concat([{ label: `Totaal school (${zusters.length + 1} vestigingen)`, waarde: euro.format(totaal) }]);
  }

  function maakTotaalDetail(school) {
    return {
      titel: 'Totale subsidie',
      school: deelnemerTitel(school),
      bedrag: resultaat.totaalPerSchool[school.sleutel],
      uitleg: 'De som van alle luiken. Elk luik heeft een eigen budget en een eigen verdeelsleutel; er is geen sokkelbedrag.',
      formule: resultaat.luiken.map(r => euro.format(r.perSchool[school.sleutel].bedrag)).join(' + '),
      stappen: resultaat.luiken.map(r => ({
        label: `Luik ${r.luik.nummer}: ${r.luik.naam}`,
        waarde: euro.format(r.perSchool[school.sleutel].bedrag)
      })).concat([
        { label: 'Leerlingen', waarde: aantal.format(school.gegevens.lln) },
        { label: 'Bedrag per leerling', waarde: school.gegevens.lln > 0 ? euro.format(resultaat.totaalPerSchool[school.sleutel] / school.gegevens.lln) : '-' }
      ]).concat(zusterStappen(school)),
      voorwaarden: [],
      opmerking: ''
    };
  }

  function maakKolomDetail(r) {
    if (r.centraal) {
      const doelLuik = LUIKEN.find(l => l.id === r.overdrachtNaar);
      return {
        titel: `Luik ${r.luik.nummer}: ${r.luik.naam}`,
        school: 'Centraal betaald door de stad',
        bedrag: r.besteed,
        uitleg: r.luik.toelichting,
        formule: `${euro.format(r.budget)} gereserveerd - ${euro.format(r.besteed)} factuur = ${euro.format(r.saldo)} saldo`,
        stappen: [
          { label: 'Gereserveerd budget', waarde: euro.format(r.budget) },
          { label: 'Totale factuur', waarde: euro.format(r.besteed) },
          { label: r.saldo >= 0 ? 'Saldo' : 'Tekort', waarde: euro.format(Math.abs(r.saldo)) },
          { label: 'Bestemming saldo', waarde: doelLuik ? `Luik ${doelLuik.nummer}: ${doelLuik.naam}` : 'blijft staan' }
        ],
        voorwaarden: r.luik.voorwaarden || [],
        opmerking: r.besteed === 0
          ? 'Er is nog geen factuurbedrag ingevuld. Zolang dat zo is, schuift het volledige gereserveerde bedrag door.'
          : ''
      };
    }

    const stappen = [
      { label: 'Budget', waarde: euro.format(r.budget) },
      { label: 'Verdeeld', waarde: euro.format(r.budget - r.nietVerdeeld) },
      { label: 'Niet verdeeld', waarde: euro.format(r.nietVerdeeld) },
      { label: 'Totale grondslag', waarde: `${decimaal.format(r.totaleGrondslag)} ${r.luik.grondslagEenheid || ''}`.trim() },
      { label: `Aantal ${potEenheid(r.luik).meervoud}`, waarde: aantal.format(r.groepen.length) }
    ];
    if (r.overdracht) {
      const bron = LUIKEN.find(l => l.overdrachtNaar === r.luik.id);
      stappen.splice(1, 0,
        { label: 'Eigen budget', waarde: euro.format(r.basisbudget) },
        { label: bron ? `Uit luik ${bron.nummer} (${bron.naam})` : 'Overgedragen', waarde: euro.format(r.overdracht) });
    }
    r.rondes.forEach(ronde => stappen.push({
      label: `Ronde ${ronde.ronde} (${ronde.aantalDeelnemers} ${potEenheid(r.luik).meervoud})`,
      waarde: `${euro.format(ronde.uitgedeeld)} uitgedeeld`
    }));

    return {
      titel: `Luik ${r.luik.nummer}: ${r.luik.naam}`,
      school: `Alle ${EENHEID.meervoud} samen`,
      bedrag: r.budget - r.nietVerdeeld,
      uitleg: r.luik.toelichting,
      formule: `${euro.format(r.budget)} verdeeld op ${r.luik.grondslagLabel}`,
      stappen,
      voorwaarden: r.luik.voorwaarden || [],
      opmerking: r.onverrekendTekort > 0.005
        ? `De pot van dit luik is helemaal opgegaan aan het tekort van een ander luik; ${euro.format(r.onverrekendTekort)} kon niet meer verrekend worden.`
        : (r.nietVerdeeld > 0.005 ? `${euro.format(r.nietVerdeeld)} blijft onverdeeld.` : '')
    };
  }

  function toonDetail(sleutel) {
    const detail = details.get(sleutel);
    if (!detail) return;
    actieveDetailSleutel = sleutel;

    el('paneel-titel').textContent = detail.titel;
    el('paneel-school').textContent = detail.school;
    el('paneel-bedrag').textContent = euro.format(detail.bedrag);
    el('paneel-uitleg').textContent = detail.uitleg;
    el('paneel-formule').textContent = detail.formule;
    el('paneel-stappen').innerHTML = detail.stappen.map(s => `
      <div class="flex items-baseline justify-between gap-4 py-2">
        <dt class="text-slate-500">${esc(s.label)}</dt>
        <dd class="text-right font-medium text-slate-900">${esc(s.waarde)}</dd>
      </div>`).join('');

    el('paneel-voorwaarden').innerHTML = detail.voorwaarden.length
      ? `<p class="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Voorwaarden</p>
         <ul class="list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600">${detail.voorwaarden.map(v => `<li>${esc(v)}</li>`).join('')}</ul>`
      : '';
    el('paneel-opmerking').innerHTML = detail.opmerking
      ? `<div class="rounded border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">${esc(detail.opmerking)}</div>`
      : '';

    el('paneel').classList.remove('hidden');
    el('paneel-achtergrond').classList.remove('hidden');
    markeerActieveKnop();
  }

  function sluitPaneel() {
    actieveDetailSleutel = null;
    el('paneel').classList.add('hidden');
    el('paneel-achtergrond').classList.add('hidden');
    markeerActieveKnop();
  }

  function markeerActieveKnop() {
    document.querySelectorAll('.bedrag-knop').forEach(k => {
      k.classList.toggle('bg-blue-100', k.dataset.detail === actieveDetailSleutel);
      k.classList.toggle('text-blue-700', k.dataset.detail === actieveDetailSleutel);
    });
  }

  /* ---------------------------------------------------------------- */
  /* Reglementtekst                                                   */
  /* ---------------------------------------------------------------- */

  function tekenReglement() {
    el('reglement').innerHTML = LUIKEN.filter(l => l.actief !== false).map(luik => `
      <div class="rounded-lg border border-slate-200 p-4">
        <div class="flex items-baseline justify-between gap-3">
          <h3 class="font-bold text-slate-900">Luik ${luik.nummer}: ${esc(luik.naam)}</h3>
          <span class="shrink-0 font-mono text-sm text-slate-500">${euro.format(luik.budget)}</span>
        </div>
        <p class="mt-1 text-sm leading-6 text-slate-600"><strong>Doel:</strong> ${esc(luik.doel)}</p>
        <p class="mt-1 text-sm leading-6 text-slate-600">${luik.centraal
          ? '<strong>Uitvoering:</strong> de stad koopt centraal aan en betaalt de factuur zelf.'
          : `<strong>Verdeelsleutel:</strong> ${esc(luik.grondslagLabel)}`}</p>
        <p class="mt-1 text-sm leading-6 text-slate-600">${esc(luik.toelichting)}</p>
        ${(luik.voorwaarden || []).length ? `<ul class="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600">${luik.voorwaarden.map(v => `<li>${esc(v)}</li>`).join('')}</ul>` : ''}
      </div>`).join('') + BUITEN_ENVELOPPE.map(item => `
      <div class="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
        <h3 class="font-bold text-slate-700">${esc(item.naam)} <span class="text-xs font-normal text-slate-500">(buiten de enveloppe)</span></h3>
        <p class="mt-1 text-sm leading-6 text-slate-600">${esc(item.bron)}. ${esc(item.toelichting)}</p>
      </div>`).join('');
  }

  /* ---------------------------------------------------------------- */
  /* Herberekenen                                                     */
  /* ---------------------------------------------------------------- */

  // Het herberekenen en hertekenen stellen we een tel uit: wie een bedrag
  // intypt, mag niet na elke toetsaanslag op de volledige tool wachten.
  let herberekenTimer = null;

  function herberekenStraks(naderhand) {
    clearTimeout(herberekenTimer);
    herberekenTimer = setTimeout(() => {
      herberekenTimer = null;
      if (naderhand) naderhand();
      herbereken();
    }, 150);
  }

  function herbereken() {
    if (!data) return;
    resultaat = Engine.bereken(data, instellingen);
    tekenResultaten();
    tekenProjecten();
    tekenDataStatus();
    el('scholen-teller').textContent = `${aantalScholen()} scholen · ${resultaat.vestigingen.length} vestigingen`;
    if (actieveDetailSleutel && details.has(actieveDetailSleutel)) toonDetail(actieveDetailSleutel);
    else if (actieveDetailSleutel) sluitPaneel();
  }

  function tekenAlles() {
    tekenLuiken();
    tekenInstellingen();
    tekenInfrastructuur();
    tekenBrongegevens();
    tekenReglement();
    herbereken();
  }

  /* ---------------------------------------------------------------- */
  /* Gebeurtenissen                                                   */
  /* ---------------------------------------------------------------- */

  function koppelGebeurtenissen() {
    document.addEventListener('input', event => {
      const doel = event.target;

      if (doel.classList.contains('luik-budget')) {
        const luik = LUIKEN.find(l => l.id === doel.dataset.luik);
        // Enkel de teller meteen bijwerken. Het luikenblok hertekenen zou het
        // veld vervangen waar je in typt: je verliest de cursor en het veld
        // springt terug naar het afgeronde getal.
        if (luik) { luik.budget = Number(doel.value) || 0; werkBudgetTotaalBij(); herberekenStraks(tekenReglement); }
        return;
      }
      if (doel.classList.contains('instelling')) {
        const key = doel.dataset.key;
        instellingen[key] = doel.dataset.type === 'schakelaar' ? doel.checked : (Number(doel.value) || 0);
        herberekenStraks(key === 'minimumAfstandKm' ? tekenBrongegevens : null);
        return;
      }
      if (doel.classList.contains('bron-invoer')) {
        const waarde = doel.value === '' ? null : Number(doel.value);
        const doelwit = doel.dataset.soort === 'projectbedragen'
          ? data.projectbedragen[doel.dataset.index]
          : data.vestigingen[Number(doel.dataset.index)][doel.dataset.soort];
        doelwit[doel.dataset.sleutel] = waarde;
        herberekenStraks(tekenInfrastructuur);
      }
    });

    document.addEventListener('change', event => {
      const doel = event.target;
      if (doel.classList.contains('luik-actief')) {
        const luik = LUIKEN.find(l => l.id === doel.dataset.luik);
        if (luik) { luik.actief = doel.checked; tekenLuiken(); tekenReglement(); herbereken(); }
      }
      if (doel.classList.contains('infra-actief')) {
        instellingen.infraActief[doel.dataset.infra] = doel.checked;
        tekenBrongegevens();
        herbereken();
      }
    });

    document.addEventListener('click', event => {
      const tab = event.target.closest('.bron-tab');
      if (tab) { actiefTabblad = tab.dataset.tab; tekenBrongegevens(); return; }

      const bedragKnop = event.target.closest('.bedrag-knop');
      if (bedragKnop) { toonDetail(bedragKnop.dataset.detail); return; }

      if (event.target.closest('#bewerk-knop')) { bewerkModus = !bewerkModus; tekenBrongegevens(); return; }
      if (event.target.closest('#sluit-paneel') || event.target.closest('#paneel-achtergrond')) sluitPaneel();
      if (event.target.closest('#herlaad-knop')) laadData('endpoint');
      if (event.target.closest('#snapshot-knop')) laadData('snapshot');
      if (event.target.closest('#export-knop')) exporteerSnapshot();
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') sluitPaneel();
    });
  }

  function exporteerSnapshot() {
    const inhoud = JSON.stringify(Data.exporteer(data), null, 2);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([inhoud], { type: 'application/json' }));
    link.download = `subsidiedata-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  /* ---------------------------------------------------------------- */
  /* Opstarten                                                        */
  /* ---------------------------------------------------------------- */

  function meldBron(tekst, soort = 'info') {
    const kleuren = { info: 'text-slate-500', ok: 'text-emerald-700', fout: 'text-red-700' };
    el('bron-status').className = `text-xs ${kleuren[soort]}`;
    el('bron-status').textContent = tekst;
  }

  async function laadData(voorkeur) {
    meldBron('Gegevens laden…');
    try {
      const uitkomst = await Data.laad(voorkeur);
      data = uitkomst.data;
      data.infrastructuur.forEach(i => {
        if (instellingen.infraActief[i.id] === undefined) instellingen.infraActief[i.id] = true;
      });
      // Wat in het tabblad META staat, stuurt het model bij zonder dat iemand
      // het in de tool moet overtypen.
      Object.keys(data.meta.instellingen || {}).forEach(key => {
        instellingen[key] = data.meta.instellingen[key];
      });
      const extra = uitkomst.fouten.length ? ` (${uitkomst.fouten.join('; ')})` : '';
      meldBron(`Geladen uit ${data.meta.bron}.${extra}`, uitkomst.fouten.length ? 'info' : 'ok');
      el('bron-opmerkingen').textContent = data.meta.opmerkingen || 'Geen opmerkingen bij de brongegevens.';
      tekenAlles();
    } catch (fout) {
      meldBron(String(fout.message), 'fout');
    }
  }

  function start() {
    koppelGebeurtenissen();
    laadData('endpoint');
  }

  return { start };
})();

document.addEventListener('DOMContentLoaded', UI.start);
