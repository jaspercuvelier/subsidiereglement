/**
 * REKENKERN
 * =========
 *
 * Puur rekenwerk: geen DOM, geen kennis van individuele luiken of velden.
 * Alles wordt gestuurd door de registers in config.js.
 *
 * Publieke ingang:  Engine.bereken(data, instellingen)
 */
const Engine = (function () {

  /* ---------------------------------------------------------------- */
  /* Hulpfuncties                                                     */
  /* ---------------------------------------------------------------- */

  function getal(waarde) {
    const n = Number(waarde);
    return Number.isFinite(n) ? n : 0;
  }

  function isLeeg(waarde) {
    return waarde === null || waarde === undefined || waarde === '';
  }

  /**
   * Verdeelt `doel` euro over de bedragen zodat de som exact klopt.
   * Grootste-restmethode op centniveau: het afrondingsverschil gaat naar de
   * scholen met de grootste rest, niet naar één willekeurige school.
   */
  function rondAfNaarCent(bedragen, doel) {
    const centen = bedragen.map(b => Math.floor(getal(b) * 100));
    const resten = bedragen.map((b, i) => getal(b) * 100 - centen[i]);
    let tekort = Math.round(getal(doel) * 100) - centen.reduce((t, c) => t + c, 0);

    const volgorde = resten
      .map((rest, i) => ({ rest, i }))
      .sort((a, b) => b.rest - a.rest);

    let positie = 0;
    while (tekort > 0 && volgorde.length > 0) {
      centen[volgorde[positie % volgorde.length].i] += 1;
      tekort -= 1;
      positie += 1;
    }
    while (tekort < 0 && volgorde.length > 0) {
      const index = volgorde[volgorde.length - 1 - (positie % volgorde.length)].i;
      if (centen[index] > 0) { centen[index] -= 1; tekort += 1; }
      positie += 1;
      if (positie > centen.length * 4) break;
    }

    return centen.map(c => c / 100);
  }

  /* ---------------------------------------------------------------- */
  /* Vestigingen groeperen tot scholen                                */
  /* ---------------------------------------------------------------- */

  /**
   * Vult per vestiging de standaardwaarden in voor gegevens die nog ontbreken,
   * zodat elke grondslagformule met echte getallen kan rekenen. De ruwe waarden
   * blijven bewaard, want de databeschikbaarheid moet blijven zien wat er
   * eigenlijk ontbreekt.
   */
  function verrijkVestiging(vestiging, ctx) {
    const gegevens = {};
    const geschat = {};
    const ontbrekend = {};

    VELDEN.forEach(veld => {
      const ruw = vestiging.gegevens ? vestiging.gegevens[veld.key] : null;
      if (isLeeg(ruw)) {
        ontbrekend[veld.key] = true;
        geschat[veld.key] = veld.standaard !== null;
        gegevens[veld.key] = veld.standaard === null ? 0 : getal(veld.standaard);
      } else {
        ontbrekend[veld.key] = false;
        geschat[veld.key] = false;
        gegevens[veld.key] = getal(ruw);
      }
    });

    // De projectfacturen staan niet in VELDEN maar in een eigen matrix, met
    // een kolom per project. Ontbrekende cellen tellen als nul euro.
    const projecten = {};
    (ctx && ctx.projecten ? ctx.projecten : []).forEach(project => {
      const ruw = vestiging.projecten ? vestiging.projecten[project.id] : null;
      projecten[project.id] = isLeeg(ruw) ? 0 : getal(ruw);
    });

    return Object.assign({}, vestiging, {
      gegevens,
      ruweGegevens: vestiging.gegevens || {},
      geschat,
      ontbrekend,
      projecten,
      projectenTotaal: Object.keys(projecten).reduce((t, id) => t + projecten[id], 0)
    });
  }

  /**
   * Eén subsidie per instellingsnummer: vestigingen van dezelfde school worden
   * samengeteld. Velden met optelbaar:false (zoals de OKI-factor) krijgen een
   * gewogen gemiddelde op leerlingenaantal in plaats van een som.
   */
  function groepeerScholen(vestigingen) {
    const groepen = new Map();

    vestigingen.forEach(vestiging => {
      const sleutel = (vestiging.instellingsnummer || '').trim() || `los-${vestiging.id}`;

      if (!groepen.has(sleutel)) {
        groepen.set(sleutel, {
          sleutel,
          instellingsnummer: vestiging.instellingsnummer || '',
          schoolNaam: vestiging.schoolNaam,
          gemeente: vestiging.gemeente || '',
          vestigingen: [],
          gegevens: {},
          geschat: {},
          ontbrekend: {},
          projecten: {},
          projectenTotaal: 0
        });
      }
      groepen.get(sleutel).vestigingen.push(vestiging);
    });

    groepen.forEach(school => {
      VELDEN.forEach(veld => {
        let som = 0;
        let gewogenSom = 0;
        let gewicht = 0;
        let ergensGeschat = false;
        let ergensOntbrekend = false;

        school.vestigingen.forEach(vestiging => {
          const waarde = getal(vestiging.gegevens[veld.key]);
          if (vestiging.ontbrekend[veld.key]) ergensOntbrekend = true;
          if (vestiging.geschat[veld.key]) ergensGeschat = true;

          som += waarde;
          const lln = getal(vestiging.gegevens.lln);
          gewogenSom += waarde * lln;
          gewicht += lln;
        });

        school.gegevens[veld.key] = veld.optelbaar
          ? som
          : (gewicht > 0 ? gewogenSom / gewicht : (som / (school.vestigingen.length || 1)));
        school.geschat[veld.key] = ergensGeschat;
        school.ontbrekend[veld.key] = ergensOntbrekend;
      });

      // De projectfacturen van alle vestigingen samen: de school is de
      // tegenpartij van de stad, niet de losse vestiging.
      school.vestigingen.forEach(vestiging => {
        Object.keys(vestiging.projecten || {}).forEach(id => {
          school.projecten[id] = getal(school.projecten[id]) + getal(vestiging.projecten[id]);
        });
      });
      school.projectenTotaal = Object.keys(school.projecten)
        .reduce((t, id) => t + school.projecten[id], 0);
    });

    return Array.from(groepen.values());
  }

  /* ---------------------------------------------------------------- */
  /* Databeschikbaarheid                                              */
  /* ---------------------------------------------------------------- */

  /**
   * Zegt per luik of de nodige gegevens er zijn. Een luik rekent altijd door,
   * maar meldt expliciet waarop het resultaat nog niet betrouwbaar is.
   */
  function bepaalDataStatus(luik, vestigingen, ctx) {
    const ontbrekendeVelden = [];
    const geschatteVelden = [];

    (luik.vereist || []).forEach(veldKey => {
      const veld = VELDEN.find(v => v.key === veldKey);
      if (!veld) return;
      const zonder = vestigingen.filter(v => isLeeg(v.ruweGegevens ? v.ruweGegevens[veldKey] : null));
      if (zonder.length === 0) return;

      const melding = {
        key: veld.key,
        label: veld.label,
        aantal: zonder.length,
        totaal: vestigingen.length,
        vestigingen: zonder.map(v => v.schoolNaam)
      };
      if (veld.standaard === null) ontbrekendeVelden.push(melding);
      else geschatteVelden.push(Object.assign({ standaard: veld.standaard }, melding));
    });

    const infrastructuurGaten = [];
    if (luik.vereistInfrastructuur) {
      ctx.infrastructuur.forEach(infra => {
        if (ctx.instellingen.infraActief && ctx.instellingen.infraActief[infra.id] === false) return;
        const zonderAfstand = vestigingen.filter(v => isLeeg(v.afstanden[infra.id])).length;
        const zonderBezoek = vestigingen.filter(v => isLeeg(v.bezoeken[infra.id])).length;
        if (zonderAfstand > 0 || zonderBezoek > 0) {
          infrastructuurGaten.push({
            id: infra.id,
            naam: infra.naam,
            zonderAfstand,
            zonderBezoek,
            totaal: vestigingen.length
          });
        }
      });
    }

    return {
      volledig: ontbrekendeVelden.length === 0 && geschatteVelden.length === 0 && infrastructuurGaten.length === 0,
      bruikbaar: ontbrekendeVelden.length === 0,
      ontbrekendeVelden,
      geschatteVelden,
      infrastructuurGaten
    };
  }

  /* ---------------------------------------------------------------- */
  /* Verdeling van één budget                                         */
  /* ---------------------------------------------------------------- */

  /**
   * Verdeelt een budget proportioneel over de deelnemers.
   *
   * Zonder plafonds is dit één ronde: aandeel = budget × grondslag / totaal.
   * Met plafonds én herverdeling wordt het overschot van de geplafonneerde
   * scholen in extra rondes verdeeld over wie nog ruimte heeft, tot het budget
   * op is of niemand nog ruimte heeft.
   */
  function verdeelBudget(deelnemers, budget, herverdeel) {
    const bedragen = new Map(deelnemers.map(d => [d.sleutel, 0]));
    const vastgezet = new Set();
    const rondes = [];
    let resterend = getal(budget);

    const metGrondslag = deelnemers.filter(d => d.grondslag > 0);

    for (let ronde = 1; ronde <= 25; ronde += 1) {
      const actief = metGrondslag.filter(d => !vastgezet.has(d.sleutel));
      const totaleGrondslag = actief.reduce((t, d) => t + d.grondslag, 0);
      if (totaleGrondslag <= 0 || resterend <= 0.005) break;

      let uitgedeeld = 0;
      let nieuwGeplafonneerd = false;

      actief.forEach(deelnemer => {
        const aandeel = resterend * (deelnemer.grondslag / totaleGrondslag);
        const huidig = bedragen.get(deelnemer.sleutel);
        let nieuw = huidig + aandeel;

        if (deelnemer.plafond !== null && deelnemer.plafond !== undefined && nieuw > deelnemer.plafond) {
          nieuw = Math.max(0, deelnemer.plafond);
          vastgezet.add(deelnemer.sleutel);
          nieuwGeplafonneerd = true;
        }
        uitgedeeld += nieuw - huidig;
        bedragen.set(deelnemer.sleutel, nieuw);
      });

      resterend -= uitgedeeld;
      rondes.push({ ronde, uitgedeeld, resterend, aantalDeelnemers: actief.length });

      if (!nieuwGeplafonneerd || !herverdeel) break;
    }

    return {
      bedragen,
      nietVerdeeld: Math.max(0, resterend),
      rondes,
      geplafonneerd: vastgezet
    };
  }

  /* ---------------------------------------------------------------- */
  /* Eén luik doorrekenen                                             */
  /* ---------------------------------------------------------------- */

  function berekenLuik(luik, scholen, vestigingen, ctx, budget) {
    const herverdeel = typeof luik.herverdeel === 'function' ? luik.herverdeel(ctx) : false;

    const deelnemers = scholen.map(school => {
      const grondslag = school.vestigingen.reduce(
        (totaal, vestiging) => totaal + getal(luik.grondslag(vestiging, ctx)), 0
      );
      const plafond = typeof luik.plafond === 'function' ? luik.plafond(school, ctx) : null;
      return {
        sleutel: school.sleutel,
        grondslag,
        plafond: isLeeg(plafond) ? null : getal(plafond)
      };
    });

    const totaleGrondslag = deelnemers.reduce((t, d) => t + d.grondslag, 0);
    const verdeling = verdeelBudget(deelnemers, budget, herverdeel);

    const ruweBedragen = deelnemers.map(d => verdeling.bedragen.get(d.sleutel));
    const afgerond = rondAfNaarCent(ruweBedragen, getal(budget) - verdeling.nietVerdeeld);

    // Het aandeel in de pot zonder plafonds of herverdeling: dat is wat een
    // school "heeft staan", ook als de eindafrekening er later van afwijkt.
    const basisBedragen = deelnemers.map(
      d => (totaleGrondslag > 0 ? getal(budget) * (d.grondslag / totaleGrondslag) : 0)
    );
    const basis = rondAfNaarCent(basisBedragen, totaleGrondslag > 0 ? getal(budget) : 0);

    const perSchool = {};
    scholen.forEach((school, index) => {
      const deelnemer = deelnemers[index];
      const resultaat = {
        sleutel: school.sleutel,
        grondslag: deelnemer.grondslag,
        aandeel: totaleGrondslag > 0 ? deelnemer.grondslag / totaleGrondslag : 0,
        bedrag: afgerond[index],
        basisaandeel: basis[index],
        plafond: deelnemer.plafond,
        geplafonneerd: verdeling.geplafonneerd.has(school.sleutel)
      };
      resultaat.afgeleiden = (luik.afgeleiden || []).map(afgeleide => ({
        label: afgeleide.label,
        formaat: afgeleide.formaat,
        waarde: afgeleide.bereken(resultaat, school, ctx)
      }));
      perSchool[school.sleutel] = resultaat;
    });

    return {
      luik,
      centraal: false,
      budget: getal(budget),
      basisbudget: getal(luik.budget),
      totaleGrondslag,
      herverdeel,
      rondes: verdeling.rondes,
      nietVerdeeld: verdeling.nietVerdeeld,
      perSchool,
      dataStatus: bepaalDataStatus(luik, vestigingen, ctx)
    };
  }

  /* ---------------------------------------------------------------- */
  /* Volledige berekening                                             */
  /* ---------------------------------------------------------------- */

  /**
   * Een luik dat de stad centraal betaalt: er wordt niets verdeeld, enkel
   * vergeleken wat gereserveerd was met wat de factuur kostte. Het saldo
   * verschuift naar het luik in `overdrachtNaar`.
   */
  function berekenCentraalLuik(luik, scholen, ctx) {
    const budget = getal(luik.budget);
    const besteed = typeof luik.besteed === 'function' ? getal(luik.besteed(ctx)) : 0;

    const perSchool = {};
    scholen.forEach(school => {
      perSchool[school.sleutel] = {
        sleutel: school.sleutel,
        grondslag: 0, aandeel: 0, bedrag: 0, basisaandeel: 0,
        plafond: null, geplafonneerd: false, afgeleiden: []
      };
    });

    return {
      luik,
      centraal: true,
      budget,
      basisbudget: budget,
      besteed,
      saldo: budget - besteed,
      overdrachtNaar: luik.overdrachtNaar || null,
      totaleGrondslag: 0,
      herverdeel: false,
      rondes: [],
      // Wat hier niet aan facturen opging, wordt elders verdeeld. Zo blijft
      // "budget - nietVerdeeld" ook voor dit luik gelijk aan wat het kostte.
      nietVerdeeld: budget - besteed,
      overdracht: 0,
      perSchool,
      dataStatus: { volledig: true, bruikbaar: true, ontbrekendeVelden: [], geschatteVelden: [], infrastructuurGaten: [] }
    };
  }

  function bereken(data, instellingen) {
    const vestigingen = data.vestigingen || [];

    const ctx = {
      infrastructuur: data.infrastructuur || [],
      projecten: data.projecten || [],
      instellingen,
      velden: VELDEN
    };

    const verrijkt = vestigingen.map(v => verrijkVestiging(v, ctx));
    const scholen = groepeerScholen(verrijkt);
    const actieveLuiken = LUIKEN.filter(l => l.actief !== false);

    // Eerst de centrale luiken: hun saldo bepaalt mee de pot van de luiken
    // die daarna verdeeld worden.
    const centraalPerId = {};
    const overdrachten = {};
    actieveLuiken.filter(l => l.centraal === true).forEach(luik => {
      const resultaat = berekenCentraalLuik(luik, scholen, ctx);
      centraalPerId[luik.id] = resultaat;
      if (resultaat.overdrachtNaar) {
        overdrachten[resultaat.overdrachtNaar] = getal(overdrachten[resultaat.overdrachtNaar]) + resultaat.saldo;
      }
    });

    const luikResultaten = actieveLuiken.map(luik => {
      if (centraalPerId[luik.id]) return centraalPerId[luik.id];
      const overdracht = getal(overdrachten[luik.id]);
      // Een tekort dat groter is dan de pot zelf kan niet verder verrekend
      // worden; de pot gaat op nul en het verschil wordt gemeld.
      const budget = Math.max(0, getal(luik.budget) + overdracht);
      const resultaat = berekenLuik(luik, scholen, verrijkt, ctx, budget);
      resultaat.overdracht = overdracht;
      resultaat.onverrekendTekort = Math.max(0, -(getal(luik.budget) + overdracht));
      return resultaat;
    });

    const verdelend = luikResultaten.filter(r => !r.centraal);

    const totaalPerSchool = {};
    scholen.forEach(school => {
      totaalPerSchool[school.sleutel] = verdelend.reduce(
        (totaal, resultaat) => totaal + resultaat.perSchool[school.sleutel].bedrag, 0
      );
    });

    const totaalBudget = actieveLuiken.reduce((t, l) => t + getal(l.budget), 0);
    const totaalVerdeeld = verdelend.reduce((t, r) => t + (r.budget - r.nietVerdeeld), 0);
    const totaalCentraal = luikResultaten.filter(r => r.centraal).reduce((t, r) => t + r.besteed, 0);

    return {
      ctx,
      scholen,
      vestigingen: verrijkt,
      luiken: luikResultaten,
      totaalPerSchool,
      totaalBudget,
      totaalVerdeeld,
      totaalCentraal,
      nietVerdeeld: totaalBudget - totaalVerdeeld - totaalCentraal
    };
  }

  return { bereken, groepeerScholen, verrijkVestiging, verdeelBudget, rondAfNaarCent };
})();
