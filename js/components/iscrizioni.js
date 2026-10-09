import { db, ref, remove, update, getData, setData, updateData, urlFile } from "../firebase.js";
import { TELEFONO_REGEX, pulisciTelefono } from "../utils/contatti.js";
import { edition, divisioneUnica, divisioneDiIscrizione, nomeDivisione } from "../divisione.js";
import { iscrizioneConvertita } from "./da-fare.js";
import { capitalize, formatDateTime } from "../utils/formattazione.js";
import { conferma as chiediConferma, avviso as finestraAvviso, mostraToast } from "../utils/interfaccia.js";

// Messaggi al posto di alert(): brevi in basso, quelli lunghi in una finestra
const segnalaErrore = (testo) => mostraToast(testo, { errore: true });

/*
===================================
ISCRIZIONI (gestionale)
===================================
Legge da:    Calcio/{edizione}/Iscrizioni
Converte in: Calcio/{edizione}/{Divisione}/Squadre

Con la divisione unica (vedi divisione.js) le iscrizioni arrivate come
Superiori o Giovani tengono la loro divisione, ma diventano tutte squadre di
Calcio/{edizione}/Unica e l'elenco non è più diviso in gruppi.
*/

// Divisioni che si possono scegliere iscrivendosi a un'edizione con due divisioni
const DIVISIONI = ["Superiori", "Giovani"];

const LOGO_DEFAULT =
  "https://firebasestorage.googleapis.com/v0/b/cofta-mi.appspot.com/o/Loghi%2FTavola%20disegno%201.png?alt=media&token=fd010a97-1ff0-4d54-9830-856d3f93da74";

const iscrizioniPath = () => `Calcio/${edition}/Iscrizioni`;

// [etichetta singolare, campo su Firebase]
const RUOLI = [
  ["Responsabile", "Responsabili"],
  ["Allenatore", "Allenatori"],
  ["Giocatore", "Giocatori"],
  ["Arbitro", "Arbitri"],
];

// Caratteri che Firebase non accetta nelle chiavi delle squadre, più ":"
// che separa le due squadre nelle chiavi delle partite (vedi components/squadre.js)
const CARATTERI_VIETATI = /[/#$[\]:]/;

// Stato della vista (filtri)
let filtroDivisione = "Tutte";
let filtroTesto = "";
let iscrizioniCache = [];
// Card aperte: restano aperte quando l'elenco viene ridisegnato
const carteAperte = new Set();

/*
-----------------------------------
HELPER
-----------------------------------
*/

// Firebase restituisce gli array come array, ma un array vuoto non viene salvato
function comeLista(valore) {
  if (!valore) return [];
  return Array.isArray(valore) ? valore.filter(Boolean) : Object.values(valore);
}

function normalizzaSpazi(valore) {
  return valore.replace(/\s+/g, " ").trim();
}

// Stessa chiave generata dal modulo pubblico: {Divisione}-{NomeSquadra}
function chiaveIscrizione(divisione, nomeSquadra) {
  const nome = normalizzaSpazi(nomeSquadra)
    .replace(/[.#$/[\]]/g, "_")
    .replace(/\s/g, "_");
  return `${divisione}-${nome}`;
}

// Le squadre usano "_" al posto dei punti (vedi components/squadre.js)
function chiaveSquadra(nomeSquadra) {
  return nomeSquadra.trim().replace(/\./g, "_");
}

function mappaNomi(persone) {
  return persone.reduce((acc, persona) => {
    acc[persona.Nome] = true;
    return acc;
  }, {});
}

// L'URL arriva da un modulo pubblico: accettiamo solo veri link http(s)
// Il modulo firmato è privato: dalle iscrizioni nuove arriva solo il percorso su Storage
function haModulo(modulo) {
  return Boolean(linkSicuro(modulo?.Url) || String(modulo?.Percorso || "").startsWith("Moduli/"));
}

function linkSicuro(url) {
  if (typeof url !== "string") return null;
  try {
    const analizzato = new URL(url);
    return analizzato.protocol === "https:" || analizzato.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

// Con la divisione unica si converte qualunque iscrizione, con due divisioni
// solo quelle di Superiori o Giovani
function divisioneValida(iscrizione) {
  return divisioneUnica() || DIVISIONI.includes(iscrizione.Divisione);
}

// " in Superiori", oppure niente con la divisione unica
function inDivisione(iscrizione) {
  const nome = nomeDivisione(divisioneDiIscrizione(iscrizione.Divisione));
  return nome ? ` in ${nome}` : "";
}

/*
 Con la divisione unica "San Giorgio" iscritta sia in Superiori sia in Giovani
 diventerebbe una squadra sola: finché una delle due non viene rinominata
 (es. San Giorgio A e San Giorgio B) nessuna delle due si può convertire.
 Restituisce i nomi di squadra usati da più di un'iscrizione.
*/
function nomiDoppi() {
  if (!divisioneUnica()) return new Set();
  const visti = new Set();
  const doppi = new Set();
  iscrizioniCache.forEach((iscrizione) => {
    const nome = chiaveSquadra(iscrizione.NomeSquadra || "");
    if (visti.has(nome)) doppi.add(nome);
    visti.add(nome);
  });
  return doppi;
}

function nomeDoppio(iscrizione) {
  return nomiDoppi().has(chiaveSquadra(iscrizione.NomeSquadra || ""));
}

function conteggioPersone(iscrizione) {
  return {
    responsabili: comeLista(iscrizione.Responsabili).length,
    allenatori: comeLista(iscrizione.Allenatori).length,
    giocatori: comeLista(iscrizione.Giocatori).length,
    arbitri: comeLista(iscrizione.Arbitri).length,
  };
}

/*
-----------------------------------
CARICAMENTO
-----------------------------------
*/

async function caricaIscrizioni() {
  const snapshot = await getData(iscrizioniPath());
  if (!snapshot) return [];

  return Object.entries(snapshot)
    .map(([chiave, dati]) => ({ chiave, ...dati }))
    .sort((a, b) => {
      // Prima per divisione (Superiori, Giovani), poi per nome squadra
      const ordineDivisione = divisioneUnica()
        ? 0
        : DIVISIONI.indexOf(a.Divisione) - DIVISIONI.indexOf(b.Divisione);
      if (ordineDivisione !== 0) return ordineDivisione;
      return (a.NomeSquadra || "").localeCompare(b.NomeSquadra || "", "it");
    });
}

function iscrizioniFiltrate() {
  const testo = filtroTesto.trim().toLowerCase();

  return iscrizioniCache.filter((iscrizione) => {
    if (!divisioneUnica() && filtroDivisione !== "Tutte" && iscrizione.Divisione !== filtroDivisione) {
      return false;
    }
    if (!testo) return true;

    const nomiPersone = [
      ...comeLista(iscrizione.Responsabili),
      ...comeLista(iscrizione.Allenatori),
      ...comeLista(iscrizione.Giocatori),
      ...comeLista(iscrizione.Arbitri),
    ]
      .map((persona) => persona.Nome)
      .join(" ");

    return `${iscrizione.NomeSquadra} ${nomiPersone}`.toLowerCase().includes(testo);
  });
}

/*
-----------------------------------
RENDER
-----------------------------------
*/

export async function showIscrizioni() {
  const contenitore = document.getElementById("iscrizioni-content");
  contenitore.innerHTML = '<p class="iscrizioni-vuoto">Caricamento...</p>';

  try {
    iscrizioniCache = await caricaIscrizioni();
  } catch (error) {
    console.error("Errore nel caricamento delle iscrizioni:", error);
    contenitore.innerHTML = '<p class="iscrizioni-vuoto">Errore nel caricamento delle iscrizioni.</p>';
    return;
  }

  disegnaVista();
}

function disegnaVista() {
  const contenitore = document.getElementById("iscrizioni-content");
  contenitore.innerHTML = "";

  contenitore.appendChild(creaBarraStrumenti());

  const elenco = document.createElement("div");
  elenco.id = "iscrizioni-elenco";
  contenitore.appendChild(elenco);

  disegnaElenco();
}

// Ridisegna solo l'elenco: la barra degli strumenti resta intatta
// (altrimenti la ricerca perderebbe il focus a ogni carattere)
function disegnaElenco() {
  const elenco = document.getElementById("iscrizioni-elenco");
  elenco.innerHTML = "";

  const visibili = iscrizioniFiltrate();

  if (visibili.length === 0) {
    elenco.innerHTML = '<p class="iscrizioni-vuoto">Nessuna iscrizione da mostrare.</p>';
    return;
  }

  // Divisione unica: tutte insieme, senza gruppi
  if (divisioneUnica()) {
    visibili.forEach((iscrizione) => elenco.appendChild(creaCard(iscrizione)));
    return;
  }

  DIVISIONI.forEach((divisione) => {
    const gruppo = visibili.filter((i) => i.Divisione === divisione);
    if (gruppo.length === 0) return;

    const titolo = document.createElement("h3");
    titolo.className = "iscrizioni-gruppo-titolo";
    titolo.textContent = `${divisione} (${gruppo.length})`;
    elenco.appendChild(titolo);

    gruppo.forEach((iscrizione) => elenco.appendChild(creaCard(iscrizione)));
  });

  // Iscrizioni con una divisione non riconosciuta (non dovrebbe accadere)
  const orfane = visibili.filter((i) => !DIVISIONI.includes(i.Divisione));
  if (orfane.length > 0) {
    const titolo = document.createElement("h3");
    titolo.className = "iscrizioni-gruppo-titolo";
    titolo.textContent = `Altre (${orfane.length})`;
    elenco.appendChild(titolo);
    orfane.forEach((iscrizione) => elenco.appendChild(creaCard(iscrizione)));
  }
}

function creaBarraStrumenti() {
  const barra = document.createElement("div");
  barra.id = "iscrizioni-toolbar";

  const totali = iscrizioniCache.length;
  const daConvertire = iscrizioniCache.filter((i) => !iscrizioneConvertita(i)).length;

  const riepilogo = document.createElement("div");
  riepilogo.className = "iscrizioni-riepilogo";
  riepilogo.innerHTML =
    `<span><b>${totali}</b> iscrizioni</span>` +
    `<span><b>${daConvertire}</b> da convertire</span>` +
    `<span>Edizione <b>${edition}</b></span>`;
  barra.appendChild(riepilogo);

  const controlli = document.createElement("div");
  controlli.className = "iscrizioni-controlli";

  const selectDivisione = document.createElement("select");
  selectDivisione.className = "iscrizioni-select";
  ["Tutte", ...DIVISIONI].forEach((valore) => {
    const opzione = document.createElement("option");
    opzione.value = valore;
    opzione.textContent = valore;
    selectDivisione.appendChild(opzione);
  });
  selectDivisione.value = filtroDivisione;
  selectDivisione.addEventListener("change", () => {
    filtroDivisione = selectDivisione.value;
    disegnaElenco();
  });
  if (!divisioneUnica()) controlli.appendChild(selectDivisione);

  const ricerca = document.createElement("input");
  ricerca.type = "search";
  ricerca.className = "iscrizioni-ricerca";
  ricerca.placeholder = "Cerca squadra o persona...";
  ricerca.value = filtroTesto;
  ricerca.addEventListener("input", () => {
    filtroTesto = ricerca.value;
    disegnaElenco();
  });
  controlli.appendChild(ricerca);

  const esporta = document.createElement("button");
  esporta.className = "custom-button iscrizioni-azione";
  esporta.innerHTML = '<i class="icona icona-file-csv" aria-hidden="true"></i> Esporta CSV';
  esporta.addEventListener("click", esportaCsv);
  controlli.appendChild(esporta);

  const convertiTutte = document.createElement("button");
  convertiTutte.className = "custom-button iscrizioni-azione";
  convertiTutte.innerHTML = '<i class="icona icona-people-group" aria-hidden="true"></i> Converti tutte';
  convertiTutte.addEventListener("click", convertiTutteLeIscrizioni);
  controlli.appendChild(convertiTutte);

  const aggiorna = document.createElement("button");
  aggiorna.className = "custom-button iscrizioni-azione";
  aggiorna.innerHTML = '<i class="icona icona-rotate" aria-hidden="true"></i>';
  aggiorna.title = "Ricarica";
  aggiorna.setAttribute("aria-label", "Ricarica le iscrizioni");
  aggiorna.addEventListener("click", showIscrizioni);
  controlli.appendChild(aggiorna);

  barra.appendChild(controlli);
  return barra;
}

function creaCard(iscrizione) {
  const conteggi = conteggioPersone(iscrizione);
  const convertita = iscrizioneConvertita(iscrizione);
  const aperta = carteAperte.has(iscrizione.chiave);

  const card = document.createElement("div");
  card.className = "iscrizione-card";
  card.classList.toggle("aperta", aperta);

  // ---- INTESTAZIONE ----
  const intestazione = document.createElement("div");
  intestazione.className = "iscrizione-header";

  const titolo = document.createElement("div");
  titolo.className = "iscrizione-titolo";
  // I nomi arrivano da un modulo pubblico: sempre via textContent, mai innerHTML
  titolo.innerHTML = '<i class="icona icona-chevron-right freccia" aria-hidden="true"></i>';

  const nomeSquadraEl = document.createElement("span");
  nomeSquadraEl.className = "nome-squadra";
  nomeSquadraEl.textContent = iscrizione.NomeSquadra || iscrizione.chiave;
  titolo.appendChild(nomeSquadraEl);

  if (!divisioneUnica()) {
    const badgeDivisione = document.createElement("span");
    badgeDivisione.className = "badge badge-divisione";
    badgeDivisione.textContent = iscrizione.Divisione || "?";
    titolo.appendChild(badgeDivisione);
  }

  const badgeStato = document.createElement("span");
  badgeStato.className = convertita ? "badge badge-convertita" : "badge badge-nuova";
  badgeStato.textContent = convertita ? "Convertita" : "Da convertire";
  titolo.appendChild(badgeStato);

  if (!convertita && nomeDoppio(iscrizione)) {
    const badgeDoppio = document.createElement("span");
    badgeDoppio.className = "badge badge-nuova";
    badgeDoppio.textContent = "Nome doppio";
    badgeDoppio.title = "Un'altra iscrizione ha lo stesso nome: rinominane una prima di convertirla";
    titolo.appendChild(badgeDoppio);
  }

  const meta = document.createElement("div");
  meta.className = "iscrizione-meta";
  meta.innerHTML =
    `<span title="Responsabili"><i class="icona icona-user-tie" aria-hidden="true"></i> ${conteggi.responsabili} resp.</span>` +
    `<span title="Allenatori"><i class="icona icona-clipboard-user" aria-hidden="true"></i> ${conteggi.allenatori} all.</span>` +
    `<span title="Giocatori"><i class="icona icona-futbol" aria-hidden="true"></i> ${conteggi.giocatori} giocatori</span>` +
    `<span title="Arbitri"><i class="icona icona-flag" aria-hidden="true"></i> ${conteggi.arbitri} arbitri</span>` +
    (haModulo(iscrizione.ModuloFirmato)
      ? '<span title="MODULO DI PARTECIPAZIONE allegato"><i class="icona icona-paperclip" aria-hidden="true"></i> modulo</span>'
      : '<span class="modulo-mancante" title="MODULO DI PARTECIPAZIONE mancante"><i class="icona icona-triangle-exclamation" aria-hidden="true"></i> modulo mancante</span>') +
    `<span class="data-invio">${iscrizione.OraInvio ? formatDateTime(iscrizione.OraInvio) : ""}</span>`;

  intestazione.appendChild(titolo);
  intestazione.appendChild(meta);
  card.appendChild(intestazione);

  // ---- DETTAGLIO ----
  const dettaglio = document.createElement("div");
  dettaglio.className = "iscrizione-dettaglio";
  dettaglio.classList.toggle("hidden", !aperta);
  mostraDettaglio(dettaglio, iscrizione);
  card.appendChild(dettaglio);

  intestazione.addEventListener("click", () => {
    const chiusa = dettaglio.classList.toggle("hidden");
    card.classList.toggle("aperta", !chiusa);
    if (chiusa) carteAperte.delete(iscrizione.chiave);
    else carteAperte.add(iscrizione.chiave);
  });

  return card;
}

function mostraDettaglio(dettaglio, iscrizione) {
  const convertita = iscrizioneConvertita(iscrizione);

  dettaglio.replaceChildren();
  dettaglio.classList.remove("in-modifica");

  RUOLI.forEach(([, campo]) => {
    dettaglio.appendChild(creaTabellaPersone(campo, comeLista(iscrizione[campo])));
  });
  dettaglio.appendChild(creaSezioneModulo(iscrizione.ModuloFirmato));

  const azioni = document.createElement("div");
  azioni.className = "iscrizione-azioni";

  const modifica = document.createElement("button");
  modifica.className = "custom-button";
  modifica.innerHTML = '<i class="icona icona-pen" aria-hidden="true"></i> Modifica';
  modifica.addEventListener("click", () => mostraModifica(dettaglio, iscrizione));
  azioni.appendChild(modifica);

  const converti = document.createElement("button");
  converti.className = "custom-button";
  converti.innerHTML = convertita
    ? '<i class="icona icona-rotate" aria-hidden="true"></i> Riconverti in squadra'
    : '<i class="icona icona-shield-halved" aria-hidden="true"></i> Converti in squadra';
  converti.addEventListener("click", () => convertiSingola(iscrizione));
  azioni.appendChild(converti);

  if (convertita && iscrizione.ConvertitaIl) {
    const info = document.createElement("span");
    info.className = "iscrizione-info-conversione";
    info.textContent = `Convertita il ${formatDateTime(iscrizione.ConvertitaIl)}`;
    azioni.appendChild(info);
  }

  const elimina = document.createElement("button");
  elimina.className = "custom-button button-elimina";
  elimina.innerHTML = '<i class="icona icona-trash" aria-hidden="true"></i> Elimina';
  elimina.addEventListener("click", () => eliminaIscrizione(iscrizione));
  azioni.appendChild(elimina);

  dettaglio.appendChild(azioni);
}

function creaSezioneModulo(modulo) {
  const sezione = document.createElement("div");
  sezione.className = "dettaglio-sezione";

  const intestazione = document.createElement("h4");
  intestazione.textContent = "MODULO DI PARTECIPAZIONE";
  sezione.appendChild(intestazione);

  const url = linkSicuro(modulo?.Url);

  if (!haModulo(modulo)) {
    const vuoto = document.createElement("p");
    vuoto.className = "dettaglio-vuoto";
    vuoto.textContent = "Nessun modulo firmato allegato.";
    sezione.appendChild(vuoto);
    return sezione;
  }

  const link = document.createElement(url ? "a" : "button");
  link.className = "modulo-link";
  if (url) {
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  } else {
    // L'indirizzo si chiede solo quando serve (accesso da amministratore).
    // La finestra si apre subito, altrimenti il browser la bloccherebbe
    link.type = "button";
    link.addEventListener("click", async () => {
      const finestra = window.open("", "_blank");
      try {
        const indirizzo = await urlFile(modulo.Percorso);
        if (finestra) finestra.location = indirizzo;
        else location.href = indirizzo;
      } catch (errore) {
        finestra?.close();
        console.error("Modulo non disponibile:", errore);
        segnalaErrore("Impossibile aprire il modulo: serve un account abilitato in storage.rules.");
      }
    });
  }
  link.innerHTML = '<i class="icona icona-file-arrow-down" aria-hidden="true"></i>';

  const nome = document.createElement("span");
  nome.textContent = modulo.NomeFile || "Scarica il modulo firmato";
  link.appendChild(nome);

  sezione.appendChild(link);
  return sezione;
}

function creaTabellaPersone(titolo, persone) {
  const sezione = document.createElement("div");
  sezione.className = "dettaglio-sezione";

  const intestazione = document.createElement("h4");
  intestazione.textContent = `${titolo} (${persone.length})`;
  sezione.appendChild(intestazione);

  if (persone.length === 0) {
    const vuoto = document.createElement("p");
    vuoto.className = "dettaglio-vuoto";
    vuoto.textContent = titolo === "Arbitri" ? "Nessun arbitro indicato." : "Nessuno indicato.";
    sezione.appendChild(vuoto);
    return sezione;
  }

  const lista = document.createElement("ol");
  lista.className = "dettaglio-lista";

  persone.forEach((persona) => {
    const voce = document.createElement("li");

    const nome = document.createElement("span");
    nome.className = "persona-nome";
    nome.textContent = persona.Nome || "";

    const telefono = document.createElement("a");
    telefono.className = "persona-tel";
    telefono.href = `tel:${persona.Telefono || ""}`;
    telefono.textContent = persona.Telefono || "-";

    voce.appendChild(nome);
    voce.appendChild(telefono);
    lista.appendChild(voce);
  });

  sezione.appendChild(lista);
  return sezione;
}

/*
-----------------------------------
MODIFICA
-----------------------------------
*/

function creaInput(classe, valore, placeholder) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = `modifica-input ${classe}`;
  input.value = valore || "";
  input.placeholder = placeholder;
  input.addEventListener("input", () => input.classList.remove("invalid"));
  return input;
}

// Sostituisce il dettaglio della card con il modulo di modifica
function mostraModifica(dettaglio, iscrizione) {
  dettaglio.replaceChildren();
  dettaglio.classList.add("in-modifica");

  // ---- SQUADRA ----
  const sezioneSquadra = document.createElement("div");
  sezioneSquadra.className = "dettaglio-sezione modifica-squadra";

  const titoloSquadra = document.createElement("h4");
  titoloSquadra.textContent = "Squadra";
  sezioneSquadra.appendChild(titoloSquadra);

  const campiSquadra = document.createElement("div");
  campiSquadra.className = "modifica-campi-squadra";

  const nomeInput = creaInput("modifica-nome-squadra", iscrizione.NomeSquadra, "Nome squadra");
  campiSquadra.appendChild(nomeInput);

  const divisioneSelect = document.createElement("select");
  divisioneSelect.className = "iscrizioni-select modifica-divisione";
  DIVISIONI.forEach((divisione) => {
    const opzione = document.createElement("option");
    opzione.value = divisione;
    opzione.textContent = divisione;
    divisioneSelect.appendChild(opzione);
  });
  divisioneSelect.value = DIVISIONI.includes(iscrizione.Divisione) ? iscrizione.Divisione : DIVISIONI[0];
  // Con la divisione unica la divisione dell'iscrizione non conta più e resta com'era
  if (!divisioneUnica()) campiSquadra.appendChild(divisioneSelect);

  sezioneSquadra.appendChild(campiSquadra);
  dettaglio.appendChild(sezioneSquadra);

  // ---- PERSONE ----
  const editor = RUOLI.map(([singolare, campo]) => {
    const sezione = creaEditorPersone(campo, singolare, comeLista(iscrizione[campo]));
    dettaglio.appendChild(sezione.elemento);
    return { campo, leggi: sezione.leggi };
  });

  // ---- AZIONI ----
  const errore = document.createElement("p");
  errore.className = "modifica-errore";

  const azioni = document.createElement("div");
  azioni.className = "iscrizione-azioni";

  const testoSalva = '<i class="icona icona-floppy-disk" aria-hidden="true"></i> Salva modifiche';
  const salva = document.createElement("button");
  salva.className = "custom-button";
  salva.innerHTML = testoSalva;

  const annulla = document.createElement("button");
  annulla.className = "custom-button button-elimina";
  annulla.textContent = "Annulla";
  annulla.addEventListener("click", () => mostraDettaglio(dettaglio, iscrizione));

  salva.addEventListener("click", async () => {
    errore.textContent = "";
    const problemi = [];

    const nomeSquadra = normalizzaSpazi(nomeInput.value);
    if (nomeSquadra.length < 3) {
      problemi.push("Il nome della squadra deve avere almeno 3 caratteri.");
      nomeInput.classList.add("invalid");
    } else if (CARATTERI_VIETATI.test(nomeSquadra)) {
      problemi.push("Il nome della squadra non può contenere / # $ [ ] :");
      nomeInput.classList.add("invalid");
    }

    const dati = {
      NomeSquadra: nomeSquadra,
      Divisione: divisioneUnica() ? iscrizione.Divisione : divisioneSelect.value,
    };
    editor.forEach(({ campo, leggi }) => {
      const risultato = leggi();
      dati[campo] = risultato.persone;
      problemi.push(...risultato.problemi);
    });

    if (problemi.length > 0) {
      errore.textContent = problemi.join(" ");
      dettaglio.querySelector(".invalid")?.focus();
      return;
    }

    salva.disabled = true;
    salva.textContent = "Salvataggio...";
    const salvata = await salvaModifiche(iscrizione, dati);
    if (!salvata) {
      salva.disabled = false;
      salva.innerHTML = testoSalva;
    }
  });

  azioni.appendChild(salva);
  azioni.appendChild(annulla);
  dettaglio.appendChild(errore);
  dettaglio.appendChild(azioni);

  nomeInput.focus();
}

// Elenco modificabile di una sezione: nome + telefono, aggiungi/rimuovi
function creaEditorPersone(campo, singolare, persone) {
  const sezione = document.createElement("div");
  sezione.className = "dettaglio-sezione";

  const titolo = document.createElement("h4");
  sezione.appendChild(titolo);

  const lista = document.createElement("div");
  lista.className = "modifica-lista";
  sezione.appendChild(lista);

  const aggiornaTitolo = () => {
    titolo.textContent = `${campo} (${lista.children.length})`;
  };

  const aggiungiRiga = (persona = {}) => {
    const riga = document.createElement("div");
    riga.className = "modifica-riga";

    const nome = creaInput("modifica-nome", persona.Nome, "Nome e Cognome");
    const telefono = creaInput("modifica-tel", persona.Telefono, "Telefono");
    telefono.type = "tel";

    const rimuovi = document.createElement("button");
    rimuovi.type = "button";
    rimuovi.className = "modifica-rimuovi";
    rimuovi.title = `Rimuovi ${singolare.toLowerCase()}`;
    rimuovi.setAttribute("aria-label", rimuovi.title);
    rimuovi.innerHTML = '<i class="icona icona-xmark" aria-hidden="true"></i>';
    rimuovi.addEventListener("click", () => {
      riga.remove();
      aggiornaTitolo();
    });

    riga.append(nome, telefono, rimuovi);
    lista.appendChild(riga);
    aggiornaTitolo();
    return nome;
  };

  persone.forEach((persona) => aggiungiRiga(persona));
  aggiornaTitolo();

  const aggiungi = document.createElement("button");
  aggiungi.type = "button";
  aggiungi.className = "modifica-aggiungi";
  aggiungi.innerHTML = `<i class="icona icona-plus" aria-hidden="true"></i> Aggiungi ${singolare.toLowerCase()}`;
  aggiungi.addEventListener("click", () => aggiungiRiga().focus());
  sezione.appendChild(aggiungi);

  // Le righe lasciate completamente vuote vengono ignorate
  const leggi = () => {
    const risultato = { persone: [], problemi: [] };
    const nomiVisti = new Set();

    lista.querySelectorAll(".modifica-riga").forEach((riga) => {
      const nomeInput = riga.querySelector(".modifica-nome");
      const telInput = riga.querySelector(".modifica-tel");
      const nome = capitalize(normalizzaSpazi(nomeInput.value));
      const telefono = pulisciTelefono(telInput.value);

      if (!nome && !telefono) return;

      if (!nome) {
        nomeInput.classList.add("invalid");
        risultato.problemi.push(`${campo}: manca il nome accanto a ${telefono}.`);
        return;
      }
      // Il nome diventa una chiave della squadra su Firebase
      if (CARATTERI_VIETATI.test(nome) || nome.includes(".")) {
        nomeInput.classList.add("invalid");
        risultato.problemi.push(`${campo}: "${nome}" contiene caratteri non ammessi (. / # $ [ ] :).`);
        return;
      }
      if (telefono && !TELEFONO_REGEX.test(telefono)) {
        telInput.classList.add("invalid");
        risultato.problemi.push(`${campo}: telefono di ${nome} non valido (8-15 cifre).`);
        return;
      }
      if (nomiVisti.has(nome.toLowerCase())) {
        nomeInput.classList.add("invalid");
        risultato.problemi.push(`${campo}: ${nome} è inserito due volte.`);
        return;
      }
      nomiVisti.add(nome.toLowerCase());

      risultato.persone.push({ Nome: nome, Telefono: telefono });
    });

    return risultato;
  };

  return { elemento: sezione, leggi };
}

// Salva l'iscrizione modificata. Se cambiano nome o divisione cambia anche
// la chiave ({Divisione}-{NomeSquadra}), quindi il record viene spostato.
async function salvaModifiche(iscrizione, dati) {
  const { chiave: vecchiaChiave, ...datiAttuali } = iscrizione;
  const nuovaChiave = chiaveIscrizione(dati.Divisione, dati.NomeSquadra);
  const convertita = iscrizioneConvertita(iscrizione);
  const squadraCambiata =
    chiaveSquadra(dati.NomeSquadra) !== chiaveSquadra(iscrizione.NomeSquadra || "") ||
    dati.Divisione !== iscrizione.Divisione;

  if (convertita && squadraCambiata) {
    const conferma = await chiediConferma(
      `Questa iscrizione è già stata convertita: nel torneo la squadra resta "${iscrizione.NomeSquadra}"${inDivisione(iscrizione)}.\n\n` +
        "Per rinominarla usa la pagina Squadre, che aggiorna anche calendario e partite.\n" +
        'Attenzione: "Riconverti in squadra" con il nuovo nome creerebbe una seconda squadra.\n\n' +
        "Vuoi salvare comunque l'iscrizione?"
    );
    if (!conferma) return false;
  }

  const aggiornata = {
    ...datiAttuali,
    ...dati,
    ModificataIl: new Date().toISOString(),
  };

  try {
    if (nuovaChiave === vecchiaChiave) {
      await setData(`${iscrizioniPath()}/${vecchiaChiave}`, aggiornata);
    } else {
      if (await getData(`${iscrizioniPath()}/${nuovaChiave}`)) {
        segnalaErrore(`Esiste già un'iscrizione per "${dati.NomeSquadra}" (${dati.Divisione}).`);
        return false;
      }
      // Spostamento atomico: la nuova chiave viene scritta e la vecchia rimossa insieme
      await update(ref(db, iscrizioniPath()), {
        [vecchiaChiave]: null,
        [nuovaChiave]: aggiornata,
      });
      carteAperte.delete(vecchiaChiave);
    }
    carteAperte.add(nuovaChiave);
  } catch (error) {
    console.error("Errore nel salvataggio dell'iscrizione:", error);
    segnalaErrore("Errore nel salvataggio. Riprova.");
    return false;
  }

  // La squadra esiste già con lo stesso nome: si possono riportare subito le modifiche
  if (convertita && !squadraCambiata) {
    const allinea = await chiediConferma(
      "Iscrizione salvata.\n\n" +
        `Vuoi aggiornare anche responsabili, allenatori e giocatori della squadra "${dati.NomeSquadra}" nel torneo?\n` +
        "(girone, logo e penalità restano invariati)"
    );
    if (allinea) {
      try {
        await scriviSquadra({ ...aggiornata, chiave: nuovaChiave }, true);
      } catch (error) {
        console.error("Errore nell'aggiornamento della squadra:", error);
        finestraAvviso(
          'Iscrizione salvata, ma la squadra non è stata aggiornata. Usa "Riconverti in squadra".'
        );
      }
    }
  }

  showIscrizioni();
  return true;
}

/*
-----------------------------------
CONVERSIONE IN SQUADRA
-----------------------------------
*/

// Scrive la squadra nel nodo Squadre della divisione.
// Se la squadra esiste già aggiorna solo i membri, mantenendo girone, logo e penalità.
async function scriviSquadra(iscrizione, sovrascriviEsistente) {
  const divisione = divisioneDiIscrizione(iscrizione.Divisione);
  const chiave = chiaveSquadra(iscrizione.NomeSquadra);
  const percorsoSquadra = `Calcio/${edition}/${divisione}/Squadre/${chiave}`;
  const esistente = await getData(percorsoSquadra);

  if (esistente && !sovrascriviEsistente) {
    return { esito: "esistente", percorsoSquadra };
  }

  const membri = {
    Responsabili: mappaNomi(comeLista(iscrizione.Responsabili)),
    Allenatori: mappaNomi(comeLista(iscrizione.Allenatori)),
    Giocatori: mappaNomi(comeLista(iscrizione.Giocatori)),
  };

  if (esistente) {
    // Aggiorna i membri senza toccare Girone/Logo/Penalità già impostati
    await updateData(percorsoSquadra, membri);
  } else {
    // Passando alla divisione unica una squadra già creata in Superiori o
    // Giovani si porta dietro logo e penalità (il girone si rifà)
    const precedente =
      divisione !== iscrizione.Divisione && DIVISIONI.includes(iscrizione.Divisione)
        ? await getData(`Calcio/${edition}/${iscrizione.Divisione}/Squadre/${chiave}`)
        : null;
    await setData(percorsoSquadra, {
      ...membri,
      Girone: "",
      Logo: precedente?.Logo || LOGO_DEFAULT,
      LogoLR: precedente?.LogoLR || "",
      Penalità: precedente?.Penalità || 0,
    });
  }

  await updateData(`${iscrizioniPath()}/${iscrizione.chiave}`, {
    Stato: "Convertita",
    ConvertitaIl: new Date().toISOString(),
    ConvertitaIn: divisione,
  });

  return { esito: esistente ? "aggiornata" : "creata", percorsoSquadra };
}

async function convertiSingola(iscrizione) {
  if (!divisioneValida(iscrizione)) {
    segnalaErrore("Divisione non valida: impossibile convertire questa iscrizione.");
    return;
  }
  if (nomeDoppio(iscrizione)) {
    finestraAvviso(
      `Un'altra iscrizione si chiama "${iscrizione.NomeSquadra}": con la divisione unica sarebbero la stessa squadra.\n\n` +
        'Rinominane una con "Modifica" (es. aggiungendo A o B al nome) e poi convertila.'
    );
    return;
  }

  const nomeSquadra = chiaveSquadra(iscrizione.NomeSquadra).replace(/_/g, ".");

  try {
    let risultato = await scriviSquadra(iscrizione, false);

    if (risultato.esito === "esistente") {
      const conferma = await chiediConferma(
        `La squadra "${nomeSquadra}" esiste già${inDivisione(iscrizione)}.\n\n` +
          "Vuoi aggiornare responsabili, allenatori e giocatori con i dati dell'iscrizione?\n" +
          "(girone, logo e penalità restano invariati)"
      );
      if (!conferma) return;
      risultato = await scriviSquadra(iscrizione, true);
    }

    mostraToast(
      risultato.esito === "creata"
        ? `Squadra "${nomeSquadra}" creata${inDivisione(iscrizione)}.`
        : `Squadra "${nomeSquadra}" aggiornata${inDivisione(iscrizione)}.`
    );
    showIscrizioni();
  } catch (error) {
    console.error("Errore nella conversione dell'iscrizione:", error);
    segnalaErrore("Errore nella conversione. Riprova.");
  }
}

async function convertiTutteLeIscrizioni() {
  const nonConvertite = iscrizioniFiltrate().filter(
    (iscrizione) => !iscrizioneConvertita(iscrizione) && divisioneValida(iscrizione)
  );
  // Nomi doppi con la divisione unica: si sistemano a mano (vedi nomiDoppi)
  const doppie = nonConvertite.filter(nomeDoppio);
  const daConvertire = nonConvertite.filter((iscrizione) => !nomeDoppio(iscrizione));

  if (daConvertire.length === 0) {
    if (doppie.length > 0) {
      finestraAvviso(
        `Restano solo iscrizioni con lo stesso nome di un'altra: ${doppie.map((i) => i.NomeSquadra).join(", ")}.\n\n` +
          'Con la divisione unica sarebbero la stessa squadra: rinominane una con "Modifica" (es. aggiungendo A o B al nome).'
      );
    } else {
      mostraToast("Non ci sono iscrizioni da convertire con i filtri attuali.");
    }
    return;
  }

  const conferma = await chiediConferma(
    `Stai per creare ${daConvertire.length} squadre a partire dalle iscrizioni non ancora convertite.\n\n` +
      "Le squadre che esistono già verranno saltate (potrai convertirle una per una)."
  );
  if (!conferma) return;

  const create = [];
  const saltate = [];
  const errori = [];

  for (const iscrizione of daConvertire) {
    try {
      const risultato = await scriviSquadra(iscrizione, false);
      if (risultato.esito === "esistente") {
        saltate.push(iscrizione.NomeSquadra);
      } else {
        create.push(iscrizione.NomeSquadra);
      }
    } catch (error) {
      console.error(`Errore convertendo ${iscrizione.NomeSquadra}:`, error);
      errori.push(iscrizione.NomeSquadra);
    }
  }

  let messaggio = `Squadre create: ${create.length}`;
  if (saltate.length > 0) {
    messaggio += `\nGià esistenti (saltate): ${saltate.join(", ")}`;
  }
  if (doppie.length > 0) {
    messaggio += `\nNome uguale a un'altra iscrizione (da rinominare): ${doppie.map((i) => i.NomeSquadra).join(", ")}`;
  }
  if (errori.length > 0) {
    messaggio += `\nErrori: ${errori.join(", ")}`;
  }
  finestraAvviso(messaggio);

  showIscrizioni();
}

/*
-----------------------------------
ELIMINAZIONE
-----------------------------------
*/

async function eliminaIscrizione(iscrizione) {
  const conferma = await chiediConferma(
    `Vuoi eliminare definitivamente l'iscrizione di "${iscrizione.NomeSquadra}"${inDivisione(iscrizione)}?\n\n` +
      "L'eventuale squadra già creata nel torneo NON verrà eliminata."
  );
  if (!conferma) return;

  try {
    await remove(ref(db, `${iscrizioniPath()}/${iscrizione.chiave}`));
    showIscrizioni();
  } catch (error) {
    console.error("Errore nell'eliminazione dell'iscrizione:", error);
    segnalaErrore("Errore nell'eliminazione. Riprova.");
  }
}

/*
-----------------------------------
ESPORTAZIONE CSV
-----------------------------------
*/

function esportaCsv() {
  const visibili = iscrizioniFiltrate();

  if (visibili.length === 0) {
    mostraToast("Nessuna iscrizione da esportare.");
    return;
  }

  const righe = [["Divisione", "Squadra", "Ruolo", "Nome", "Telefono", "Data iscrizione", "Stato"]];

  visibili.forEach((iscrizione) => {
    const dataInvio = iscrizione.OraInvio ? formatDateTime(iscrizione.OraInvio) : "";

    RUOLI.forEach(([etichetta, campo]) => {
      comeLista(iscrizione[campo]).forEach((persona) => {
        righe.push([
          iscrizione.Divisione || "",
          iscrizione.NomeSquadra || "",
          etichetta,
          persona.Nome || "",
          persona.Telefono || "",
          dataInvio,
          iscrizione.Stato || "Nuova",
        ]);
      });
    });
  });

  // ";" come separatore e BOM per l'apertura diretta in Excel italiano
  const csv = righe
    .map((riga) => riga.map((cella) => `"${String(cella).replace(/"/g, '""')}"`).join(";"))
    .join("\r\n");

  const blob = new Blob([`\uFEFF${csv}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `iscrizioni-cofta-${edition}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
