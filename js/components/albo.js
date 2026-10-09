import { getDataCached } from "../firebase.js";
import { nomeSquadra } from "../utils/torneo.js";
import { DIVISIONE_UNICA } from "../divisione.js";

/*
===================================
ALBO D'ORO
===================================
Calcio/AlboOro/{Divisione}/{anno} = { PrimoClassificato, SecondoClassificato }
Una tabella per anno, dal più recente, con il link alle classifiche di quell'edizione.
Un anno con la divisione unica (Calcio/AlboOro/Unica/{anno}) ha una colonna
sola, senza titolo.
*/

const DIVISIONI = ["Superiori", "Giovani"];

function divisioniAnno(anno, albo) {
  return albo[DIVISIONE_UNICA]?.[anno] ? [DIVISIONE_UNICA] : DIVISIONI;
}

function crea(tag, classe, testo = null) {
  const elemento = document.createElement(tag);
  if (classe) elemento.className = classe;
  if (testo !== null) elemento.textContent = testo;
  return elemento;
}

function scheletro(container) {
  container.replaceChildren(
    ...[1, 2].map(() => {
      const blocco = crea("div", "albo-table-container");
      blocco.append(crea("div", "skeleton skeleton-title"), crea("div", "skeleton skeleton-albo-table"));
      return blocco;
    })
  );
}

function piazzamento(medaglia, squadra) {
  return squadra ? `${medaglia} ${nomeSquadra(squadra)}` : "-";
}

function tabellaAnno(anno, albo) {
  const blocco = crea("div", "albo-table-container");
  blocco.appendChild(crea("h2", "albo-table-title", anno));

  const tabella = crea("table", "albo-table");
  const divisioni = divisioniAnno(anno, albo);
  if (divisioni.length > 1) {
    const intestazione = tabella.createTHead().insertRow();
    divisioni.forEach((divisione) => {
      const th = crea("th", "albo-table-header", divisione);
      th.scope = "col";
      intestazione.appendChild(th);
    });
  }

  const corpo = tabella.createTBody();
  [
    ["🥇", "PrimoClassificato"],
    ["🥈", "SecondoClassificato"],
  ].forEach(([medaglia, campo]) => {
    const riga = corpo.insertRow();
    divisioni.forEach((divisione) => {
      riga.appendChild(
        crea("td", "albo-table-cell", piazzamento(medaglia, albo[divisione]?.[anno]?.[campo]))
      );
    });
  });
  blocco.appendChild(tabella);

  const link = crea("a", "link-edizione", `Rivedi classifiche e risultati del ${anno} `);
  link.href = `/campionato.html?edizione=${encodeURIComponent(anno)}`;
  link.appendChild(crea("i", "icona icona-chevron-right"));
  link.lastChild.setAttribute("aria-hidden", "true");
  blocco.appendChild(link);

  return blocco;
}

export async function getAlboOro() {
  const container = document.getElementById("albo-doro");
  if (!container) return;
  scheletro(container);

  try {
    // Cache di un'ora: cambia una volta l'anno, ma il giorno della finale
    // il vincitore deve comparire presto
    const albo = (await getDataCached("Calcio/AlboOro", 60)) || {};

    const anni = new Set();
    Object.values(albo).forEach((perAnno) => Object.keys(perAnno || {}).forEach((anno) => anni.add(anno)));

    if (!anni.size) {
      container.replaceChildren(
        crea("p", "avviso-vuoto", "L'albo d'oro sarà pubblicato dopo la prima finale.")
      );
      return;
    }

    container.replaceChildren(
      ...[...anni].sort((a, b) => b.localeCompare(a)).map((anno) => tabellaAnno(anno, albo))
    );
  } catch (error) {
    console.error("Errore nel recupero dell'Albo d'Oro:", error);
    container.replaceChildren(
      crea("p", "avviso-vuoto", "Impossibile caricare l'albo d'oro. Riprova più tardi.")
    );
  }
}
