/**
 * BELEIDSCONFIGURATIE: subsidiereglement flankerend onderwijs Stad Tielt
 * =======================================================================
 *
 * Dit is het enige bestand dat je moet aanpassen om het reglement te wijzigen.
 * De rekenkern (engine.js) en de weergave (ui.js) kennen geen enkel luik of veld
 * bij naam; ze lezen alles uit de registers hieronder.
 *
 *   Een gegeven toevoegen        -> voeg een object toe aan VELDEN
 *   Een instelbare knop toevoegen -> voeg een object toe aan INSTELLINGEN
 *   Een luik toevoegen/wijzigen   -> voeg een object toe aan LUIKEN
 *
 * Bron van de bedragen: notities overleg werkgroep subsidies flankerend
 * onderwijs, Frederick Desmet (Stad Tielt), 1 juli 2026.
 */

/* ------------------------------------------------------------------ */
/* 0. VERDEELEENHEID: wie krijgt een eigen bedrag                      */
/* ------------------------------------------------------------------ */
/**
 * 'vestiging'  elke vestiging is een eigen deelnemer: een eigen bedrag per
 *              luik en een eigen projectenpot (afspraak werkgroep).
 * 'school'     vestigingen met hetzelfde instellingsnummer worden samengeteld
 *              tot één bedrag.
 */
const VERDEELEENHEID = 'vestiging';

/* ------------------------------------------------------------------ */
/* 1. VELDEN: de gegevens die per vestiging bekend (moeten) zijn       */
/* ------------------------------------------------------------------ */
/**
 * key         sleutel in vestiging.gegevens, en tegelijk de kolomnaam in de
 *             GEGEVENS-tab van de sheet
 * kort        kolomkop in de invoertabel
 * type        'aantal' | 'decimaal' | 'euro'
 * standaard   waarde die gebruikt wordt zolang het echte cijfer ontbreekt.
 *             null = geen aanname, het luik dat dit veld nodig heeft meldt
 *             dan dat de data ontbreekt.
 * optelbaar   true  -> vestigingen van dezelfde school worden opgeteld
 *             false -> gewogen gemiddelde op leerlingenaantal (bv. OKI)
 */
const VELDEN = [
  {
    key: 'lln', label: 'Aantal leerlingen', kort: 'Lln',
    type: 'aantal', standaard: null, optelbaar: true,
    toelichting: 'Leerlingenaantal op de teldatum.'
  },
  {
    key: 'oki', label: 'OKI-factor', kort: 'OKI',
    type: 'decimaal', standaard: 1, optelbaar: false,
    toelichting: 'Onderwijskansarmoede-indicator. Telkens het cijfer van twee schooljaren geleden. Zolang het echte cijfer ontbreekt rekent de tool met 1,00 voor elke school, en verdeelt luik 3 dus zuiver op leerlingenaantal.'
  }
];

/* ------------------------------------------------------------------ */
/* 2. INSTELLINGEN: knoppen die het model bijsturen                    */
/* ------------------------------------------------------------------ */
/**
 * Een instelling kan ook uit de sheet komen: zet in het tabblad META een rij
 * met de key als sleutel, dan overschrijft die waarde de standaard hieronder.
 */
const INSTELLINGEN = [
  {
    key: 'fluofactuur', label: 'Factuur fluojasjes',
    type: 'getal', standaard: 0, stap: 100, eenheid: '€',
    toelichting: 'Het totaalbedrag dat de stad betaalde voor de fluojasjes. De stad koopt centraal aan en vult hier één bedrag in, niet per school. Blijft er van de €5.000 iets over, dan gaat dat naar de pot van luik 2; kost het meer, dan wordt het tekort van die pot afgetrokken.'
  },
  {
    key: 'minimumAfstandKm', label: 'Minimumafstand vervoer',
    type: 'getal', standaard: 1, stap: 0.5, eenheid: 'km',
    toelichting: 'Verplaatsingen korter dan deze afstand tellen niet mee in luik 4.'
  },
  {
    key: 'herverdeelProjecten', label: 'Herverdeel onbenut projectbudget',
    type: 'schakelaar', standaard: false,
    toelichting: 'Eindafrekening van luik 2: plafonneert elke school op wat ze effectief besteedde en verdeelt wat de andere scholen niet opgebruikten in extra rondes. Staat dit uit, dan toont de tool voor elke school gewoon haar aandeel in de pot.'
  }
];

/* ------------------------------------------------------------------ */
/* 3. LUIKEN: de vijf potten van het reglement                         */
/* ------------------------------------------------------------------ */
/**
 * Elk luik is één object. De rekenkern verdeelt het budget proportioneel op
 * `grondslag`, eventueel geplafonneerd door `plafond` met herverdeling van het
 * overschot.
 *
 * grondslag(vestiging, ctx) -> getal
 *      De verdeelsleutel, berekend per vestiging en opgeteld per VERDEELEENHEID.
 * vereist: [veldkey]
 *      Velden zonder standaardwaarde die ontbreken -> het luik meldt dat.
 * vereistInfrastructuur: true
 *      Het luik heeft de afstanden- en bezoekenmatrix nodig.
 * plafond(school, ctx) -> getal | null
 * herverdeel(ctx) -> boolean
 * afgeleiden: [{ label, formaat, bereken(resultaat, school, ctx) }]
 *      Extra kengetallen in het detailpaneel, bv. bedrag per leerling.
 *
 * Een luik dat de stad centraal betaalt in plaats van te verdelen:
 *
 * centraal: true
 *      Er wordt niets over de scholen verdeeld.
 * besteed(ctx) -> getal
 *      Wat de stad effectief uitgaf.
 * overdrachtNaar: 'luikId'
 *      Het saldo (budget - besteed) verschuift naar dat luik. Positief saldo
 *      vergroot die pot, een tekort verkleint ze.
 *
 * metFacturen: true
 *      De bestedingen van dit luik worden per school en per project met
 *      facturen bijgehouden (de projectenmatrix). De tool toont dan per school
 *      wat de pot is, wat besteed werd en wat nog beschikbaar is.
 */
const LUIKEN = [
  {
    id: 'fluo',
    nummer: 1,
    naam: 'Fluojasjes',
    budget: 5000,
    kleur: 'amber',
    doel: 'Een visuele, zichtbare uiting van de stad in het kader van verkeersveiligheid.',
    centraal: true,
    besteed: (ctx) => getalOfNul(ctx.instellingen.fluofactuur),
    overdrachtNaar: 'projecten',
    grondslagLabel: 'centrale aankoop door de stad',
    grondslagEenheid: '',
    voorwaarden: [
      'Enkel voor het 1e en het 4e leerjaar.',
      'De stad koopt de jasjes centraal aan en betaalt de factuur zelf; de scholen krijgen geen bedrag uitbetaald.',
      'Wat van de €5.000 overblijft gaat naar de pot van luik 2; kost het meer, dan wordt het tekort daar afgetrokken.',
      'Fluostrips voor kleuters komen uit het budget van Huis van het Kind en vallen buiten deze €110.000.'
    ],
    toelichting: 'De stad bestelt de jasjes voor alle leerlingen van het 1e en 4e leerjaar samen en vult in de tool het totaalbedrag van de factuur in. Er wordt dus niets per school verdeeld. Het verschil met de gereserveerde €5.000 schuift door naar luik 2.'
  },

  {
    id: 'projecten',
    nummer: 2,
    naam: 'Projecten',
    budget: 15000,
    kleur: 'sky',
    doel: 'Scholen kiezen zelf projecten rond welzijn en veiligheid, zoals reanimatielessen, verkeersveiligheid of gezonde voeding.',
    grondslagLabel: 'leerlingen',
    grondslagEenheid: 'lln',
    vereist: ['lln'],
    grondslag: (v) => getalOfNul(v.gegevens.lln),
    metFacturen: true,
    plafond: (school, ctx) => (ctx.instellingen.herverdeelProjecten ? school.projectenTotaal : null),
    herverdeel: (ctx) => ctx.instellingen.herverdeelProjecten === true,
    afgeleiden: [
      {
        label: 'Bedrag per leerling', formaat: 'euro',
        bereken: (r) => (r.grondslag > 0 ? r.bedrag / r.grondslag : 0)
      }
    ],
    voorwaarden: [
      'Elke vestiging heeft een eigen pot naar rato van haar leerlingenaantal.',
      'De facturen worden per vestiging en per project bijgehouden in het tabblad PROJECTEN, zodat elke vestiging ziet waaraan haar pot opging en hoeveel er nog over is.',
      'Projecten hoeven niet vooraf ter bespreking voorgelegd te worden.',
      'Wat een vestiging niet gebruikt, kan herverdeeld worden over de vestigingen die hun eigen pot wél opgebruikten.'
    ],
    toelichting: 'Elke vestiging krijgt een aandeel van de pot naar rato van haar leerlingenaantal. De pot is de €15.000 plus of min het saldo van luik 1. De stad noteert per vestiging de afzonderlijke projectfacturen; het verschil tussen de pot en het bestede bedrag is wat de vestiging nog beschikbaar heeft. Bij de eindafrekening kan wat onbenut bleef herverdeeld worden.'
  },

  {
    id: 'sociaal',
    nummer: 3,
    naam: 'Sociaal engagement',
    budget: 20000,
    kleur: 'violet',
    doel: 'Meer ondersteuning voor scholen met een hogere onderwijskansarmoede-indicator.',
    grondslagLabel: 'leerlingen × OKI-factor',
    grondslagEenheid: '',
    vereist: ['lln', 'oki'],
    grondslag: (v) => getalOfNul(v.gegevens.lln) * getalOfNul(v.gegevens.oki),
    afgeleiden: [
      {
        label: 'Bedrag per leerling', formaat: 'euro',
        bereken: (r, school) => (school.gegevens.lln > 0 ? r.bedrag / school.gegevens.lln : 0)
      }
    ],
    voorwaarden: [
      'Het OKI-cijfer is telkens dat van twee schooljaren geleden.'
    ],
    toelichting: 'Het leerlingenaantal wordt vermenigvuldigd met de OKI-factor. Een school met evenveel leerlingen maar een hogere OKI-factor krijgt daardoor een groter aandeel.'
  },

  {
    id: 'vervoer',
    nummer: 4,
    naam: 'Vervoer stedelijke infrastructuur',
    budget: 35000,
    kleur: 'emerald',
    doel: 'Tegemoetkoming in de vervoerskosten naar de stedelijke infrastructuur: zwembad, cultuurcentrum, sporthal, bibliotheek, …',
    grondslagLabel: 'bezoekers × afstand',
    grondslagEenheid: 'bezoeker·km',
    vereist: ['lln'],
    vereistInfrastructuur: true,
    grondslag: (v, ctx) => ctx.infrastructuur.reduce((totaal, infra) => {
      if (ctx.instellingen.infraActief && ctx.instellingen.infraActief[infra.id] === false) return totaal;
      const km = v.afstanden[infra.id];
      const bezoekers = v.bezoeken[infra.id];
      if (km === null || km === undefined || bezoekers === null || bezoekers === undefined) return totaal;
      if (km < ctx.instellingen.minimumAfstandKm) return totaal;
      return totaal + bezoekers * km;
    }, 0),
    afgeleiden: [
      {
        label: 'Bedrag per leerling', formaat: 'euro',
        bereken: (r, school) => (school.gegevens.lln > 0 ? r.bedrag / school.gegevens.lln : 0)
      },
      {
        label: 'Bedrag per bezoeker-kilometer', formaat: 'euroFijn',
        bereken: (r) => (r.grondslag > 0 ? r.bedrag / r.grondslag : 0)
      }
    ],
    voorwaarden: [
      'Enkel verplaatsingen vanaf de ingestelde minimumafstand tellen mee.'
    ],
    toelichting: 'Per infrastructuur wordt het cumulatieve aantal kinderen dat er binnenkomt vermenigvuldigd met de afstand van de vestiging tot die infrastructuur. De som van al die producten is de verdeelsleutel: veel kinderen die ver moeten rijden geeft een groter aandeel.'
  },

  {
    id: 'middag',
    nummer: 5,
    naam: 'Middagtoezicht',
    budget: 35000,
    kleur: 'rose',
    doel: 'Het middagtoezicht betaalbaar houden voor de gezinnen.',
    grondslagLabel: 'leerlingen',
    grondslagEenheid: 'lln',
    vereist: ['lln'],
    grondslag: (v) => getalOfNul(v.gegevens.lln),
    afgeleiden: [
      {
        label: 'Bedrag per leerling', formaat: 'euro',
        bereken: (r, school) => (school.gegevens.lln > 0 ? r.bedrag / school.gegevens.lln : 0)
      }
    ],
    voorwaarden: [
      'Maximaal €1,20 per begonnen half uur (vergelijkbaar met het toezicht van de BKO).',
      'Het middagtoezicht mag niet duurder zijn dan het ochtend- en avondtoezicht.'
    ],
    toelichting: 'De €35.000 wordt verdeeld op leerlingenaantal, zoals afgesproken.'
  }
];

/* ------------------------------------------------------------------ */
/* 4. Buiten de enveloppe: ter info in de tool                         */
/* ------------------------------------------------------------------ */
const BUITEN_ENVELOPPE = [
  {
    naam: 'Fluostrips kleuters',
    bron: 'Budget Huis van het Kind',
    toelichting: 'Valt buiten de €110.000 van dit reglement.'
  }
];

/* Hulpfunctie die de grondslagformules hierboven gebruiken. */
function getalOfNul(waarde) {
  const n = Number(waarde);
  return Number.isFinite(n) ? n : 0;
}
