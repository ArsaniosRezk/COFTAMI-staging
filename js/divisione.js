import { STAGING } from "./ambiente.js";
import { paginaCorrente } from "./utils/percorso.js";

/*
===================================
EDIZIONE
===================================

L'edizione da mostrare è Impostazioni/edizioneCorrente. impostazioni.js la
legge all'avvio e la imposta qui con impostaEdizione(): `edition` è un export
"vivo", quindi chi lo importa vede sempre il valore aggiornato.
Le pagine aspettano impostazioniPronte prima di leggere dati del torneo, così
non serve più ricaricare la pagina quando l'edizione salvata è vecchia.

Edizione forzata:
- Sullo staging (vedi ambiente.js) è sempre Calcio/Test, su ogni pagina:
  l'indirizzo e le impostazioni non contano.
- In produzione ?edizione=2025 (o un altro anno) mostra un'edizione
  passata. Resta valida per la scheda aperta (sessionStorage), così si può
  navigare tra classifica, calendario e squadre di quell'anno.
  L'edizione Test in produzione non è raggiungibile.
*/

const EDIZIONE_TEST = "Test";
const CHIAVE_EDIZIONE = "site_edition";
const CHIAVE_ARCHIVIO = "cofta_edizione_archivio";
const FORMATO_EDIZIONE = /^\d{4}$/;

const paginaGestionale = ["gestionale", "contenuti-social"].includes(paginaCorrente());

function leggiStorage(storage, chiave) {
  try {
    return storage.getItem(chiave);
  } catch (errore) {
    return null;
  }
}

function scriviStorage(storage, chiave, valore) {
  try {
    if (valore === null) storage.removeItem(chiave);
    else storage.setItem(chiave, valore);
  } catch (errore) {
    // Storage non disponibile (es. navigazione privata): si prosegue senza
  }
}

// Pagine che scrivono dati: lavorano sempre sull'edizione corrente
const paginaDiInvio = ["iscrizione", "invia-report"].includes(paginaCorrente());

function edizioneDaIndirizzo() {
  if (STAGING) return EDIZIONE_TEST;
  if (paginaDiInvio) return null;
  const richiesta = new URLSearchParams(location.search).get("edizione");
  if (richiesta && FORMATO_EDIZIONE.test(richiesta)) {
    if (!paginaGestionale) scriviStorage(sessionStorage, CHIAVE_ARCHIVIO, richiesta);
    return richiesta;
  }
  return paginaGestionale ? null : leggiStorage(sessionStorage, CHIAVE_ARCHIVIO);
}

// Test sullo staging, un anno passato scelto dall'indirizzo, altrimenti null
const edizioneForzata = edizioneDaIndirizzo();
const edizioneTest = edizioneForzata === EDIZIONE_TEST;

// Valore iniziale: serve solo finché non arriva Impostazioni/edizioneCorrente
let edition =
  edizioneForzata || leggiStorage(localStorage, CHIAVE_EDIZIONE) || String(new Date().getFullYear());

// Chiamata da impostazioni.js con il valore del server.
// Con un'edizione forzata dall'indirizzo il server non la sovrascrive.
function impostaEdizione(edizioneServer) {
  if (!edizioneServer) return;
  scriviStorage(localStorage, CHIAVE_EDIZIONE, String(edizioneServer));
  if (!edizioneForzata) edition = String(edizioneServer);
}

// Esce dalla vista di un'edizione passata e torna a quella corrente
function tornaEdizioneCorrente() {
  scriviStorage(sessionStorage, CHIAVE_ARCHIVIO, null);
  const indirizzo = new URL(location.href);
  indirizzo.searchParams.delete("edizione");
  location.href = indirizzo.href;
}

/*
===================================
DIVISIONI
===================================

Di solito Superiori e Giovani. Un'edizione con
Impostazioni/divisioneUnica/{edizione} = true (interruttore nella dashboard)
ha invece una divisione sola e senza nome: tutte le squadre stanno insieme
in Calcio/{edizione}/Unica e il selettore Superiori/Giovani sparisce.
Le edizioni passate restano come erano.

`DIVISIONI` è un export "vivo" come `edition`: impostazioni.js lo imposta
con impostaDivisioni() prima che le pagine leggano i dati. Fino ad allora
vale la scelta vista all'ultima visita, così il selettore non compare per
poi sparire.
*/

const DIVISIONI_SEPARATE = ["Superiori", "Giovani"];
const DIVISIONE_UNICA = "Unica";
const CHIAVE_DIVISIONE_UNICA = "cofta_divisione_unica";

function divisioniDi(edizione, divisioneUnica) {
  return divisioneUnica?.[edizione] === true ? [DIVISIONE_UNICA] : DIVISIONI_SEPARATE;
}

function divisioneUnicaSalvata() {
  try {
    return JSON.parse(leggiStorage(localStorage, CHIAVE_DIVISIONE_UNICA));
  } catch (errore) {
    return null;
  }
}

let DIVISIONI = divisioniDi(edition, divisioneUnicaSalvata());
let selectedDivision;

function divisioneUnica() {
  return DIVISIONI.length === 1;
}

// Nome da mostrare: la divisione unica non ne ha
function nomeDivisione(divisione) {
  return divisione === DIVISIONE_UNICA ? "" : divisione || "";
}

// Divisione in cui finisce la squadra di un'iscrizione: con la divisione
// unica anche le iscrizioni arrivate come Superiori o Giovani vanno lì
function divisioneDiIscrizione(divisioneIscritta) {
  return divisioneUnica() ? DIVISIONE_UNICA : divisioneIscritta;
}

// Chiamata da impostazioni.js con Impostazioni/divisioneUnica
function impostaDivisioni(divisioneUnicaServer) {
  scriviStorage(localStorage, CHIAVE_DIVISIONE_UNICA, JSON.stringify(divisioneUnicaServer || {}));
  DIVISIONI = divisioniDi(edition, divisioneUnicaServer);
  mostraDivisioni();
}

function getSelectedDivision() {
  return selectedDivision;
}

function setSelectedDivision(value) {
  selectedDivision = value;
  scriviStorage(localStorage, "selectedDivision", selectedDivision);
}

// La scelta salvata non si sovrascrive: tornando a un'edizione con due
// divisioni (o all'archivio) si ritrova quella di prima
function loadSavedOption() {
  const savedOption = leggiStorage(localStorage, "selectedDivision");
  selectedDivision = DIVISIONI.includes(savedOption) ? savedOption : DIVISIONI[0];
}

// Con la divisione unica la classe "divisione-unica" su <html> nasconde i
// selettori (vedi base.css e gestionale.css). Il select #division dell'header
// e del gestionale ha come opzioni le divisioni dell'edizione; quello del
// modulo del referto lo gestisce invia-referto.js
function mostraDivisioni() {
  document.documentElement.classList.toggle("divisione-unica", divisioneUnica());
  const select = document.getElementById("division");
  if (!select || paginaCorrente() === "invia-report") return;

  const attuali = [...select.options].map((opzione) => opzione.value);
  if (attuali.join() !== DIVISIONI.join()) {
    select.replaceChildren(...DIVISIONI.map((divisione) => new Option(divisione, divisione)));
  }
  loadSavedOption();
  updateSelectElement("division", selectedDivision);
}

// Allinea il select #division e i pulsanti del selettore nell'header
function updateSelectElement(selectId, value) {
  const selectElement = document.getElementById(selectId);
  if (selectElement) {
    selectElement.value = value;
  }
  document.querySelectorAll(".division-switch button[data-division]").forEach((pulsante) => {
    const scelto = pulsante.dataset.division === value;
    pulsante.classList.toggle("selected", scelto);
    pulsante.setAttribute("aria-pressed", String(scelto));
  });
}

export {
  getSelectedDivision,
  setSelectedDivision,
  loadSavedOption,
  updateSelectElement,
  impostaEdizione,
  tornaEdizioneCorrente,
  edition,
  edizioneTest,
  edizioneForzata,
  DIVISIONI,
  DIVISIONE_UNICA,
  divisioneUnica,
  nomeDivisione,
  divisioneDiIscrizione,
  impostaDivisioni,
};

// Logica per il caricamento delle funzioni
// I nomi sono normalizzati da paginaCorrente(), quindi valgono sia per
// /campionato.html sia per /campionato.
const moduliPerPagina = {
  "": "./funzioniHome.js", // vale sia per / sia per /index.html
  campionato: "./funzioniCampionato.js",
  squadre: "./funzioniSquadre.js",
  calendario: "./funzioniCalendario.js",
  "albo-doro": "./funzioniAlboOro.js",
};

const pagina = paginaCorrente();
const sequenzaEsecuzioneModule = moduliPerPagina[pagina] ? import(moduliPerPagina[pagina]) : null;

// Pagine con il selettore della divisione nell'header
const pagineConDivisione = ["", "campionato", "squadre", "calendario"];

async function eseguiSequenza() {
  if (!sequenzaEsecuzioneModule) return;
  const module = await sequenzaEsecuzioneModule;
  if (module && module.sequenzaEsecuzione) {
    module.sequenzaEsecuzione();
  } else {
    console.error("Il modulo della pagina corrente non contiene una funzione sequenzaEsecuzione.");
  }
}

// La classe su <html> va messa subito, prima che la pagina compaia
document.documentElement.classList.toggle("divisione-unica", divisioneUnica());

document.addEventListener("DOMContentLoaded", async () => {
  mostraDivisioni();

  // Il cambio di divisione si ascolta solo dove c'è il selettore
  // (il modulo del referto ha un suo select "division")
  const divisionSelect = document.getElementById("division");
  const conSelettore = pagineConDivisione.includes(pagina) || pagina === "gestionale";

  if (divisionSelect && conSelettore) {
    divisionSelect.addEventListener("change", function () {
      setSelectedDivision(this.value);
      updateSelectElement("division", this.value);
      eseguiSequenza();
    });

    // I pulsanti dell'header comandano il select, che resta l'unica fonte del valore
    // (il gestionale ha i suoi, gestiti da gestionale.js)
    document.querySelectorAll(".sito-header .division-switch").forEach((selettore) => {
      selettore.addEventListener("click", (evento) => {
        const pulsante = evento.target.closest("button[data-division]");
        if (!pulsante || pulsante.dataset.division === divisionSelect.value) return;
        divisionSelect.value = pulsante.dataset.division;
        divisionSelect.dispatchEvent(new Event("change"));
      });
    });
  }

  if (!sequenzaEsecuzioneModule) return;

  // Prima di leggere i dati serve l'edizione corrente
  const { impostazioniPronte, osservaImpostazioni } = await import("./impostazioni.js");
  await impostazioniPronte;
  eseguiSequenza();

  // Una pagina accesa o spenta dalla dashboard si aggiorna senza ricaricare
  let pagineAttive = null;
  osservaImpostazioni((impostazioni) => {
    const attuali = JSON.stringify(impostazioni.pagineAttive || {});
    if (pagineAttive !== null && attuali !== pagineAttive) eseguiSequenza();
    pagineAttive = attuali;
  });
});
