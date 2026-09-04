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
    if (!Number.isFinite(n)) return '—';
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
    if (waarde === null || waarde === undefined || waarde === '') return '—';
    if (veld.type === 'euro') return euro.format(Number(waarde));
    if (veld.type === 'decimaal') return decimaal.format(Number(waarde));
    return aantal.format(Number(waarde));
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

  function tekenLuiken() {
    const totaal = LUIKEN.filter(l => l.actief !== false).reduce((t, l) => t + Number(l.budget || 0), 0);
    el('budget-totaal').textContent = euro.format(totaal);

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
        <p class="mt-2 text-xs text-slate-500">Verdeeld op <span class="font-medium text-slate-700">${esc(luik.grondslagLabel)}</span></p>
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

  function invoerCel(vestigingIndex, soort, sleutel, waarde, stap) {
    if (!bewerkModus) return null;
    return `<input type="number" step="${stap}" value="${waarde === null ? '' : waarde}"
              class="bron-invoer w-24 rounded border border-slate-300 px-1 py-0.5 text-right"
              data-index="${vestigingIndex}" data-soort="${soort}" data-sleutel="${esc(sleutel)}">`;
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
          <td class="px-3 py-2 text-xs text-slate-600">${esc(v.deelgemeente || '—')}</td>
          ${cellen}
        </tr>`;
    }).join('');

    const totalen = VELDEN.map(veld => {
      if (!veld.optelbaar) return '<td class="px-3 py-2 text-right text-slate-400">—</td>';
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

  function tekenMatrixTabel(soort) {
    const isAfstand = soort === 'afstanden';
    const rijen = data.vestigingen.map((v, index) => {
      const cellen = data.infrastructuur.map(infra => {
        const waarde = v[soort][infra.id];
        const invoer = invoerCel(index, soort, infra.id, waarde, isAfstand ? 0.1 : 1);
        if (invoer) return `<td class="px-3 py-2 text-right">${invoer}</td>`;
        if (waarde === null) return '<td class="px-3 py-2 text-right text-slate-300">—</td>';
        const teKort = isAfstand && waarde < instellingen.minimumAfstandKm;
        return `<td class="px-3 py-2 text-right whitespace-nowrap ${teKort ? 'text-slate-400 line-through' : ''}"
                    ${teKort ? `title="Onder de minimumafstand van ${instellingen.minimumAfstandKm} km — telt niet mee"` : ''}>
                  ${isAfstand ? formatteer(waarde, 'km') : aantal.format(waarde)}</td>`;
      }).join('');
      return `<tr>
          <td class="px-3 py-2"><div class="max-w-48 truncate font-medium text-slate-900" title="${esc(v.schoolNaam)}">${esc(v.schoolNaam)}</div>
            <div class="max-w-48 truncate text-xs text-slate-400" title="${esc(v.vestigingNaam)}">${esc(v.vestigingNaam)}</div></td>
          ${cellen}
        </tr>`;
    }).join('');

    return `
      <table class="min-w-full text-sm">
        <thead class="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th class="px-3 py-3 text-left font-medium">Vestiging</th>
            ${data.infrastructuur.map(i => `<th class="px-3 py-3 text-right font-medium ${instellingen.infraActief[i.id] === false ? 'opacity-40' : ''}">${esc(i.naam)}</th>`).join('')}
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 bg-white">${rijen}</tbody>
      </table>`;
  }

  function tekenBrongegevens() {
    const tabbladen = [
      { id: 'gegevens', label: 'Gegevens per vestiging' },
      { id: 'afstanden', label: 'Afstanden (km)' },
      { id: 'bezoeken', label: 'Bezoekersaantallen' }
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

    const rijen = gesorteerd.map(school => {
      const cellen = resultaat.luiken.map(r => {
        const eigen = r.perSchool[school.sleutel];
        const sleutel = `${school.sleutel}::${r.luik.id}`;
        details.set(sleutel, maakLuikDetail(r, school, eigen));
        return `<td class="px-2 py-3 text-right">${knop(sleutel, eigen.bedrag)}</td>`;
      }).join('');

      const totaalSleutel = `${school.sleutel}::totaal`;
      details.set(totaalSleutel, maakTotaalDetail(school));

      return `
        <tr>
          <td class="px-3 py-3">
            <div class="font-medium text-slate-900">${esc(school.schoolNaam)}</div>
            <div class="text-xs text-slate-400">${esc(school.instellingsnummer || 'geen nummer')}${school.vestigingen.length > 1 ? ` · ${school.vestigingen.length} vestigingen` : ''}</div>
          </td>
          <td class="px-3 py-3 text-right text-slate-600">${aantal.format(school.gegevens.lln)}</td>
          ${cellen}
          <td class="px-2 py-3 text-right font-bold text-emerald-700">${knop(totaalSleutel, resultaat.totaalPerSchool[school.sleutel], 'text-emerald-700')}</td>
        </tr>`;
    }).join('');

    const kolomTotalen = resultaat.luiken.map(r => {
      const sleutel = `kolom::${r.luik.id}`;
      details.set(sleutel, maakKolomDetail(r));
      const verdeeld = r.budget - r.nietVerdeeld;
      return `<td class="px-2 py-3 text-right">${knop(sleutel, verdeeld)}</td>`;
    }).join('');

    el('resultaten').innerHTML = `
      <table class="min-w-full text-sm">
        <thead class="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th class="px-3 py-3 text-left font-medium">School</th>
            <th class="px-3 py-3 text-right font-medium">Lln</th>
            ${resultaat.luiken.map(r => `<th class="px-2 py-3 text-right font-medium">Luik ${r.luik.nummer}<div class="font-normal normal-case text-slate-400">${esc(r.luik.naam)}</div></th>`).join('')}
            <th class="px-2 py-3 text-right font-medium">Totaal</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 bg-white">${rijen}</tbody>
        <tfoot class="bg-slate-100 font-semibold text-slate-800">
          <tr>
            <td class="px-3 py-3">Totaal (${resultaat.scholen.length} scholen)</td>
            <td class="px-3 py-3 text-right">${aantal.format(resultaat.scholen.reduce((t, s) => t + s.gegevens.lln, 0))}</td>
            ${kolomTotalen}
            <td class="px-2 py-3 text-right text-lg text-emerald-700">${euro.format(resultaat.totaalVerdeeld)}</td>
          </tr>
        </tfoot>
      </table>`;

    const restant = resultaat.nietVerdeeld;
    el('resultaat-melding').innerHTML = restant > 0.005
      ? `<div class="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
           ${euro.format(restant)} van de ${euro.format(resultaat.totaalBudget)} kon niet verdeeld worden.
           Dat gebeurt wanneer geen enkele school een grondslag heeft voor een luik (bv. een ontbrekend gegeven),
           of wanneer alle scholen hun plafond bereikt hebben.
         </div>`
      : '';
  }

  /* ---------------------------------------------------------------- */
  /* Detailpaneel                                                     */
  /* ---------------------------------------------------------------- */

  function maakLuikDetail(r, school, eigen) {
    const luik = r.luik;
    const stappen = [
      { label: `Budget luik ${luik.nummer}`, waarde: euro.format(r.budget) },
      { label: `Grondslag deze school (${luik.grondslagLabel})`, waarde: `${decimaal.format(eigen.grondslag)} ${luik.grondslagEenheid || ''}`.trim() },
      { label: 'Grondslag alle scholen', waarde: `${decimaal.format(r.totaleGrondslag)} ${luik.grondslagEenheid || ''}`.trim() },
      { label: 'Aandeel', waarde: formatteer(eigen.aandeel, 'procent') }
    ];

    if (eigen.plafond !== null) {
      stappen.push({ label: 'Plafond (ingediende facturen)', waarde: euro.format(eigen.plafond) });
    }
    if (r.herverdeel && r.rondes.length > 1) {
      stappen.push({ label: 'Verdeelrondes', waarde: `${r.rondes.length} (herverdeling van onbenut budget)` });
    }
    eigen.afgeleiden.forEach(a => stappen.push({ label: a.label, waarde: formatteer(a.waarde, a.formaat) }));

    return {
      titel: `Luik ${luik.nummer} — ${luik.naam}`,
      school: `${school.schoolNaam} · ${school.instellingsnummer || 'geen nummer'}`,
      bedrag: eigen.bedrag,
      uitleg: luik.toelichting,
      formule: `${euro.format(r.budget)} × ${decimaal.format(eigen.grondslag)} / ${decimaal.format(r.totaleGrondslag)} = ${euro.format(eigen.bedrag)}`,
      stappen,
      voorwaarden: luik.voorwaarden || [],
      opmerking: eigen.geplafonneerd ? 'Deze school zit op haar plafond: het bedrag is begrensd door de ingediende facturen.' : ''
    };
  }

  function maakTotaalDetail(school) {
    return {
      titel: 'Totale subsidie',
      school: `${school.schoolNaam} · ${school.instellingsnummer || 'geen nummer'}`,
      bedrag: resultaat.totaalPerSchool[school.sleutel],
      uitleg: 'De som van alle luiken. Elk luik heeft een eigen budget en een eigen verdeelsleutel; er is geen sokkelbedrag.',
      formule: resultaat.luiken.map(r => euro.format(r.perSchool[school.sleutel].bedrag)).join(' + '),
      stappen: resultaat.luiken.map(r => ({
        label: `Luik ${r.luik.nummer} — ${r.luik.naam}`,
        waarde: euro.format(r.perSchool[school.sleutel].bedrag)
      })).concat([
        { label: 'Leerlingen', waarde: aantal.format(school.gegevens.lln) },
        { label: 'Bedrag per leerling', waarde: school.gegevens.lln > 0 ? euro.format(resultaat.totaalPerSchool[school.sleutel] / school.gegevens.lln) : '—' }
      ]),
      voorwaarden: [],
      opmerking: ''
    };
  }

  function maakKolomDetail(r) {
    const stappen = [
      { label: 'Budget', waarde: euro.format(r.budget) },
      { label: 'Verdeeld', waarde: euro.format(r.budget - r.nietVerdeeld) },
      { label: 'Niet verdeeld', waarde: euro.format(r.nietVerdeeld) },
      { label: 'Totale grondslag', waarde: `${decimaal.format(r.totaleGrondslag)} ${r.luik.grondslagEenheid || ''}`.trim() },
      { label: 'Aantal scholen', waarde: aantal.format(resultaat.scholen.length) }
    ];
    r.rondes.forEach(ronde => stappen.push({
      label: `Ronde ${ronde.ronde} (${ronde.aantalDeelnemers} scholen)`,
      waarde: `${euro.format(ronde.uitgedeeld)} uitgedeeld`
    }));

    return {
      titel: `Luik ${r.luik.nummer} — ${r.luik.naam}`,
      school: 'Alle scholen samen',
      bedrag: r.budget - r.nietVerdeeld,
      uitleg: r.luik.toelichting,
      formule: `${euro.format(r.budget)} verdeeld op ${r.luik.grondslagLabel}`,
      stappen,
      voorwaarden: r.luik.voorwaarden || [],
      opmerking: r.nietVerdeeld > 0.005 ? `${euro.format(r.nietVerdeeld)} blijft onverdeeld.` : ''
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
          <h3 class="font-bold text-slate-900">Luik ${luik.nummer} — ${esc(luik.naam)}</h3>
          <span class="shrink-0 font-mono text-sm text-slate-500">${euro.format(luik.budget)}</span>
        </div>
        <p class="mt-1 text-sm leading-6 text-slate-600"><strong>Doel:</strong> ${esc(luik.doel)}</p>
        <p class="mt-1 text-sm leading-6 text-slate-600"><strong>Verdeelsleutel:</strong> ${esc(luik.grondslagLabel)}</p>
        <p class="mt-1 text-sm leading-6 text-slate-600">${esc(luik.toelichting)}</p>
        ${(luik.voorwaarden || []).length ? `<ul class="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600">${luik.voorwaarden.map(v => `<li>${esc(v)}</li>`).join('')}</ul>` : ''}
      </div>`).join('') + BUITEN_ENVELOPPE.map(item => `
      <div class="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
        <h3 class="font-bold text-slate-700">${esc(item.naam)} <span class="text-xs font-normal text-slate-500">— buiten de enveloppe</span></h3>
        <p class="mt-1 text-sm leading-6 text-slate-600">${esc(item.bron)}. ${esc(item.toelichting)}</p>
      </div>`).join('');
  }

  /* ---------------------------------------------------------------- */
  /* Herberekenen                                                     */
  /* ---------------------------------------------------------------- */

  function herbereken() {
    if (!data) return;
    resultaat = Engine.bereken(data, instellingen);
    tekenResultaten();
    tekenDataStatus();
    el('scholen-teller').textContent = `${resultaat.scholen.length} scholen · ${resultaat.vestigingen.length} vestigingen`;
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
        if (luik) { luik.budget = Number(doel.value) || 0; tekenLuiken(); tekenReglement(); herbereken(); }
        return;
      }
      if (doel.classList.contains('instelling')) {
        const key = doel.dataset.key;
        instellingen[key] = doel.dataset.type === 'schakelaar' ? doel.checked : (Number(doel.value) || 0);
        if (key === 'minimumAfstandKm') tekenBrongegevens();
        herbereken();
        return;
      }
      if (doel.classList.contains('bron-invoer')) {
        const vestiging = data.vestigingen[Number(doel.dataset.index)];
        const waarde = doel.value === '' ? null : Number(doel.value);
        vestiging[doel.dataset.soort][doel.dataset.sleutel] = waarde;
        herbereken();
        tekenInfrastructuur();
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
