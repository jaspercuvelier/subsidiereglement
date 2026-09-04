/**
 * BELEIDSCONFIGURATIE — Subsidiereglement flankerend onderwijs Stad Tielt
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
/* 1. VELDEN — de gegevens die per vestiging bekend (moeten) zijn      */
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
    key: 'schooleters', label: 'Schooleters', kort: 'Eters',
    type: 'aantal', standaard: null, optelbaar: true,
    toelichting: 'Leerlingen die \'s middags op school eten. Wordt niet gebruikt als verdeelsleutel, wel om de tegemoetkoming per etende leerling te tonen.'
  },
  {
    key: 'lln_l1', label: 'Leerlingen 1e leerjaar', kort: 'L1',
    type: 'aantal', standaard: null, optelbaar: true,
    toelichting: 'Nodig voor luik 1 (fluojasjes).'
  },
  {
    key: 'lln_l4', label: 'Leerlingen 4e leerjaar', kort: 'L4',
    type: 'aantal', standaard: null, optelbaar: true,
    toelichting: 'Nodig voor luik 1 (fluojasjes).'
  },
  {
    key: 'oki', label: 'OKI-factor', kort: 'OKI',
    type: 'decimaal', standaard: 1, optelbaar: false,
    toelichting: 'Onderwijskansarmoede-indicator. Telkens het cijfer van twee schooljaren geleden. Zolang het echte cijfer ontbreekt rekent de tool met 1,00 voor elke school — dan verdeelt luik 3 dus zuiver op leerlingenaantal.'
  },
  {
    key: 'projectbedrag', label: 'Ingediend projectbedrag', kort: 'Facturen',
    type: 'euro', standaard: null, optelbaar: true,
    toelichting: 'Totaal van de doorgestuurde facturen voor luik 2. Enkel nodig wanneer de herverdeling van onbenut projectbudget aanstaat.'
  }
];

/* ------------------------------------------------------------------ */
/* 2. INSTELLINGEN — knoppen die het model bijsturen                   */
/* ------------------------------------------------------------------ */
const INSTELLINGEN = [
  {
    key: 'minimumAfstandKm', label: 'Minimumafstand vervoer',
    type: 'getal', standaard: 1, stap: 0.5, eenheid: 'km',
    toelichting: 'Verplaatsingen korter dan deze afstand tellen niet mee in luik 4.'
  },
  {
    key: 'herverdeelProjecten', label: 'Herverdeel onbenut projectbudget',
    type: 'schakelaar', standaard: false,
    toelichting: 'Plafonneert luik 2 op het ingediende factuurbedrag en verdeelt het overschot in extra rondes over de scholen die wél projecten deden. Vereist ingevulde projectbedragen.'
  },
  {
    key: 'maxDoorrekeningVervoer', label: 'Max. doorrekening vervoer aan gezinnen',
    type: 'getal', standaard: 3, stap: 0.5, eenheid: '€/lln',
    toelichting: 'Voorwaarde uit de notities. Wordt niet in de verdeling verrekend, wel getoond als voorwaarde bij luik 4.'
  }
];

/* ------------------------------------------------------------------ */
/* 3. LUIKEN — de vijf potten van het reglement                        */
/* ------------------------------------------------------------------ */
/**
 * Elk luik is één object. De rekenkern verdeelt het budget proportioneel op
 * `grondslag`, eventueel geplafonneerd door `plafond` met herverdeling van het
 * overschot.
 *
 * grondslag(vestiging, ctx) -> getal
 *      De verdeelsleutel, berekend per vestiging en opgeteld per school.
 * vereist: [veldkey]
 *      Velden zonder standaardwaarde die ontbreken -> het luik meldt dat.
 * vereistInfrastructuur: true
 *      Het luik heeft de afstanden- en bezoekenmatrix nodig.
 * plafond(school, ctx) -> getal | null
 * herverdeel(ctx) -> boolean
 * afgeleiden: [{ label, formaat, bereken(resultaat, school, ctx) }]
 *      Extra kengetallen in het detailpaneel, bv. bedrag per leerling.
 */
const LUIKEN = [
  {
    id: 'fluo',
    nummer: 1,
    naam: 'Fluojasjes',
    budget: 5000,
    kleur: 'amber',
    doel: 'Een visuele, zichtbare uiting van de stad in het kader van verkeersveiligheid.',
    grondslagLabel: 'leerlingen 1e + 4e leerjaar',
    grondslagEenheid: 'lln',
    vereist: ['lln_l1', 'lln_l4'],
    grondslag: (v) => getalOfNul(v.gegevens.lln_l1) + getalOfNul(v.gegevens.lln_l4),
    afgeleiden: [
      {
        label: 'Bedrag per fluojasje', formaat: 'euro',
        bereken: (r) => (r.grondslag > 0 ? r.bedrag / r.grondslag : 0)
      }
    ],
    voorwaarden: [
      'Enkel voor het 1e en het 4e leerjaar.',
      'Fluostrips voor kleuters komen uit het budget van Huis van het Kind en vallen buiten deze €110.000.'
    ],
    toelichting: 'De €5.000 wordt verdeeld naar rato van het aantal leerlingen in het 1e en 4e leerjaar. Het afgeleide bedrag per jasje toont of het budget realistisch is voor de aankoopprijs.'
  },

  {
    id: 'projecten',
    nummer: 2,
    naam: 'Projecten',
    budget: 15000,
    kleur: 'sky',
    doel: 'Scholen kiezen zelf projecten rond welzijn en veiligheid — reanimatielessen, verkeersveiligheid, gezonde voeding, …',
    grondslagLabel: 'leerlingen',
    grondslagEenheid: 'lln',
    vereist: ['lln'],
    grondslag: (v) => getalOfNul(v.gegevens.lln),
    plafond: (school, ctx) => (ctx.instellingen.herverdeelProjecten ? school.gegevens.projectbedrag : null),
    herverdeel: (ctx) => ctx.instellingen.herverdeelProjecten === true,
    afgeleiden: [
      {
        label: 'Bedrag per leerling', formaat: 'euro',
        bereken: (r) => (r.grondslag > 0 ? r.bedrag / r.grondslag : 0)
      }
    ],
    voorwaarden: [
      'De school stuurt de factuur door als bewijsstuk.',
      'Projecten hoeven niet vooraf ter bespreking voorgelegd te worden.',
      'Niet-benut budget kan herverdeeld worden over de scholen die wél projecten deden.'
    ],
    toelichting: 'Elke school krijgt een aandeel van de €15.000 naar rato van haar leerlingenaantal. Staat de herverdeling aan, dan wordt het bedrag geplafonneerd op de ingediende facturen en gaat het overschot in extra rondes naar de scholen die hun plafond nog niet bereikten.'
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
      'Enkel verplaatsingen vanaf de ingestelde minimumafstand tellen mee.',
      'De school rekent maximaal het ingestelde bedrag per leerling door aan de gezinnen.'
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
      },
      {
        label: 'Bedrag per schooleter', formaat: 'euro',
        bereken: (r, school) => (school.gegevens.schooleters > 0 ? r.bedrag / school.gegevens.schooleters : 0)
      }
    ],
    voorwaarden: [
      'Maximaal €1,20 per begonnen half uur (vergelijkbaar met het toezicht van de BKO).',
      'Het middagtoezicht mag niet duurder zijn dan het ochtend- en avondtoezicht.'
    ],
    toelichting: 'De €35.000 wordt verdeeld op leerlingenaantal, zoals afgesproken. Het aantal schooleters bepaalt de verdeling niet, maar toont wel hoeveel de school per etende leerling krijgt.'
  }
];

/* ------------------------------------------------------------------ */
/* 4. Buiten de enveloppe — ter info in de tool                        */
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
