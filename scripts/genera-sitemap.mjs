/*
===================================
GENERA SITEMAP
===================================

npm run sitemap

Scrive sitemap.xml con le pagine del sito e una pagina per ogni squadra
dell'edizione corrente, così i motori di ricerca trovano anche quelle.
Le squadre si leggono dal database (dati pubblici, senza accesso).
Va rilanciato quando cambiano le squadre (di solito una volta l'anno).
*/

import { writeFileSync } from "node:fs";

const SITO = "https://coftamilano.com";
const DATABASE = "https://cofta-mi-default-rtdb.europe-west1.firebasedatabase.app";
// Come js/divisione.js: un'edizione con Impostazioni/divisioneUnica/{edizione}
// ha la sola divisione "Unica"
const DIVISIONI = ["Superiori", "Giovani"];
const DIVISIONE_UNICA = "Unica";

const PAGINE = [
  { percorso: "/", frequenza: "weekly", priorita: "1.0" },
  { percorso: "/campionato.html", frequenza: "weekly", priorita: "0.8" },
  { percorso: "/squadre.html", frequenza: "weekly", priorita: "0.8" },
  { percorso: "/calendario.html", frequenza: "weekly", priorita: "0.8" },
  { percorso: "/iscrizione.html", frequenza: "monthly", priorita: "0.7" },
  { percorso: "/albo-doro.html", frequenza: "yearly", priorita: "0.6" },
  { percorso: "/galleria.html", frequenza: "yearly", priorita: "0.5" },
  { percorso: "/regolamento.html", frequenza: "yearly", priorita: "0.5" },
  { percorso: "/privacy.html", frequenza: "yearly", priorita: "0.2" },
];

async function leggi(percorso, parametri = "") {
  const risposta = await fetch(`${DATABASE}/${percorso}.json${parametri}`);
  if (!risposta.ok) throw new Error(`${percorso}: HTTP ${risposta.status}`);
  return risposta.json();
}

const escapeXml = (testo) =>
  testo
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&apos;")
    .replace(/"/g, "&quot;");

const edizione = await leggi("Impostazioni/edizioneCorrente");
const divisioneUnica = (await leggi(`Impostazioni/divisioneUnica/${edizione}`)) === true;
const squadre = [];
for (const divisione of divisioneUnica ? [DIVISIONE_UNICA] : DIVISIONI) {
  const chiavi = Object.keys((await leggi(`Calcio/${edizione}/${divisione}/Squadre`, "?shallow=true")) || {});
  chiavi.sort().forEach((nome) => {
    const parametri = new URLSearchParams({ divisione, nome });
    squadre.push({ percorso: `/squadra.html?${parametri}`, frequenza: "weekly", priorita: "0.6" });
  });
}

const voci = [...PAGINE, ...squadre].map(
  ({ percorso, frequenza, priorita }) =>
    `  <url><loc>${escapeXml(SITO + percorso)}</loc><changefreq>${frequenza}</changefreq><priority>${priorita}</priority></url>`
);

writeFileSync(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generato da scripts/genera-sitemap.mjs (edizione ${edizione}) -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${voci.join("\n")}
</urlset>
`
);
console.log(`sitemap.xml: ${PAGINE.length} pagine e ${squadre.length} squadre (edizione ${edizione})`);
