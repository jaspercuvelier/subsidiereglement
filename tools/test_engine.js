/**
 * Controleert de rekenkern zonder browser.
 *   node tools/test_engine.js
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const wortel = path.join(__dirname, '..');
const context = vm.createContext({ console, Intl });
['js/config.js', 'js/engine.js'].forEach(bestand => {
  vm.runInContext(fs.readFileSync(path.join(wortel, bestand), 'utf8'), context, { filename: bestand });
});
// const-declaraties op scriptniveau komen niet op het global object terecht;
// we hangen ze er expliciet aan zodat de test ze kan uitlezen.
vm.runInContext('globalThis.VELDEN = VELDEN; globalThis.INSTELLINGEN = INSTELLINGEN; globalThis.LUIKEN = LUIKEN; globalThis.Engine = Engine;', context);

const ruw = JSON.parse(fs.readFileSync(path.join(wortel, 'data/2026.json'), 'utf8'));
const data = {
  meta: ruw.meta,
  infrastructuur: ruw.infrastructuur,
  vestigingen: ruw.vestigingen.map((v, i) => Object.assign({ id: i + 1 }, v))
};

const instellingen = {};
context.INSTELLINGEN.forEach(i => { instellingen[i.key] = i.standaard; });
instellingen.infraActief = {};
data.infrastructuur.forEach(i => { instellingen.infraActief[i.id] = true; });

let mislukt = 0;
function check(omschrijving, voorwaarde, extra = '') {
  const status = voorwaarde ? '  ok  ' : ' FOUT ';
  if (!voorwaarde) mislukt += 1;
  console.log(`[${status}] ${omschrijving}${extra ? '  ' + extra : ''}`);
}

const euro = n => new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(n);

/* ---- Basisscenario ------------------------------------------------ */
console.log('\n=== Basisscenario (alle vestigingen, standaardinstellingen) ===\n');
const r = context.Engine.bereken(data, instellingen);

console.log(`Scholen: ${r.scholen.length}, vestigingen: ${r.vestigingen.length}\n`);
r.luiken.forEach(luik => {
  const verdeeld = luik.budget - luik.nietVerdeeld;
  console.log(`Luik ${luik.luik.nummer} ${luik.luik.naam.padEnd(34)} budget ${euro(luik.budget).padStart(12)}  verdeeld ${euro(verdeeld).padStart(12)}  grondslag ${luik.totaleGrondslag.toFixed(2)}`);
});
console.log(`\nTotaal budget   ${euro(r.totaalBudget)}`);
console.log(`Totaal verdeeld ${euro(r.totaalVerdeeld)}`);
console.log(`Niet verdeeld   ${euro(r.nietVerdeeld)}\n`);

check('Totaalbudget is € 110.000', Math.abs(r.totaalBudget - 110000) < 0.005);

r.luiken.forEach(luik => {
  const som = r.scholen.reduce((t, s) => t + luik.perSchool[s.sleutel].bedrag, 0);
  const doel = luik.budget - luik.nietVerdeeld;
  check(`Luik ${luik.luik.nummer}: som per school = verdeeld budget`, Math.abs(som - doel) < 0.005,
        `(${euro(som)} vs ${euro(doel)})`);
});

const somTotalen = r.scholen.reduce((t, s) => t + r.totaalPerSchool[s.sleutel], 0);
check('Som van alle schooltotalen = totaal verdeeld', Math.abs(somTotalen - r.totaalVerdeeld) < 0.005);

check('Luik 1 verdeelt niets zolang L1/L4 ontbreken',
      Math.abs(r.luiken.find(l => l.luik.id === 'fluo').nietVerdeeld - 5000) < 0.005);
check('Luik 3 valt terug op leerlingenaantal zolang OKI ontbreekt',
      Math.abs(r.luiken.find(l => l.luik.id === 'sociaal').nietVerdeeld) < 0.005);
check('Luik 2 en 5 hebben dezelfde verdeelsleutel (leerlingen)',
      r.scholen.every(s => {
        const p = r.luiken.find(l => l.luik.id === 'projecten').perSchool[s.sleutel].aandeel;
        const m = r.luiken.find(l => l.luik.id === 'middag').perSchool[s.sleutel].aandeel;
        return Math.abs(p - m) < 1e-9;
      }));

/* ---- Minimumafstand ----------------------------------------------- */
console.log('\n=== Controle minimumafstand luik 4 ===\n');
const grondslagBij = km => context.Engine
  .bereken(data, Object.assign({}, instellingen, { minimumAfstandKm: km }))
  .luiken.find(l => l.luik.id === 'vervoer').totaleGrondslag;

[0, 1, 2, 5, 20].forEach(km => console.log(`  drempel ${String(km).padStart(2)} km -> grondslag ${grondslagBij(km).toFixed(2)}`));
check('Een hogere drempel verlaagt de grondslag van luik 4', grondslagBij(2) < grondslagBij(0));
check('Alle huidige afstanden liggen al boven 1 km', Math.abs(grondslagBij(1) - grondslagBij(0)) < 1e-9);
check('Een onhaalbare drempel laat luik 4 leeg', grondslagBij(20) === 0);

// Welke infrastructuur draagt vandaag effectief bij?
console.log('\nBijdrage per infrastructuur (bezoekers x afstand, drempel 1 km):');
data.infrastructuur.forEach(infra => {
  const bijdrage = data.vestigingen.reduce((totaal, v) => {
    const km = v.afstanden[infra.id];
    const bezoekers = v.bezoeken[infra.id];
    if (km === null || bezoekers === null || km < 1) return totaal;
    return totaal + km * bezoekers;
  }, 0);
  const metAfstand = data.vestigingen.filter(v => v.afstanden[infra.id] !== null).length;
  const metBezoek = data.vestigingen.filter(v => v.bezoeken[infra.id] !== null).length;
  console.log(`  ${infra.naam.padEnd(30)} ${bijdrage.toFixed(0).padStart(9)}   afstand ${metAfstand}/${data.vestigingen.length}, bezoekers ${metBezoek}/${data.vestigingen.length}`);
});

/* ---- Herverdeling luik 2 ------------------------------------------ */
console.log('\n=== Controle herverdeling luik 2 ===\n');
const metFacturen = JSON.parse(JSON.stringify(data));
metFacturen.vestigingen.forEach((v, i) => { v.gegevens.projectbedrag = i < 3 ? 0 : 4000; });
const hv = context.Engine.bereken(metFacturen, Object.assign({}, instellingen, { herverdeelProjecten: true }));
const luik2 = hv.luiken.find(l => l.luik.id === 'projecten');
console.log(`Rondes: ${luik2.rondes.length}, niet verdeeld: ${euro(luik2.nietVerdeeld)}`);
hv.scholen.forEach(s => {
  const p = luik2.perSchool[s.sleutel];
  console.log(`  ${s.schoolNaam.slice(0, 38).padEnd(40)} plafond ${String(p.plafond).padStart(6)}  -> ${euro(p.bedrag).padStart(11)}${p.geplafonneerd ? '  (op plafond)' : ''}`);
});
check('Scholen zonder facturen krijgen niets uit luik 2',
      hv.scholen.every(s => luik2.perSchool[s.sleutel].plafond !== 0 || luik2.perSchool[s.sleutel].bedrag === 0));
check('Geen enkele school krijgt meer dan haar plafond',
      hv.scholen.every(s => {
        const p = luik2.perSchool[s.sleutel];
        return p.plafond === null || p.bedrag <= p.plafond + 0.005;
      }));
check('Herverdeling gebruikte meer dan één ronde', luik2.rondes.length > 1);

/* ---- Deelgemeenten -------------------------------------------------- */
console.log('\n=== Deelgemeenten ===\n');
const perDeelgemeente = {};
data.vestigingen.forEach(v => {
  const naam = v.deelgemeente || 'onbekend';
  perDeelgemeente[naam] = (perDeelgemeente[naam] || 0) + 1;
});
Object.keys(perDeelgemeente).forEach(naam => console.log(`  ${naam.padEnd(12)} ${perDeelgemeente[naam]} vestigingen`));
check('Alle vestigingen horen bij de gefusioneerde stad Tielt',
      data.vestigingen.every(v => v.gemeente === 'Tielt'));
check('Elke vestiging heeft een deelgemeente',
      data.vestigingen.every(v => v.deelgemeente === 'Tielt' || v.deelgemeente === 'Meulebeke'));
check('Alle scholen delen mee in de verdeling',
      r.scholen.every(s => r.totaalPerSchool[s.sleutel] > 0));

console.log(mislukt === 0 ? '\nAlle controles geslaagd.\n' : `\n${mislukt} controle(s) mislukt.\n`);
process.exit(mislukt === 0 ? 0 : 1);
