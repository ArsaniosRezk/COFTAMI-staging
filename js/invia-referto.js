import { getData, setData, getPaths } from "./firebase.js";
import { impostazioniPronte } from "./impostazioni.js";
import { DIVISIONE_UNICA, divisioneUnica } from "./divisione.js";
import { nomeSquadra } from "./utils/torneo.js";

/*
===================================
REFERTO PARTITA (modulo degli arbitri)
===================================
Salva su: Calcio/{edizione}/{divisione}/Referti/{giornata}/{Casa:Ospite}

Le regole del database accettano un solo referto per partita, solo per le
partite in calendario. Un rifiuto arriva come "permission denied".
*/

const $ = (id) => document.getElementById(id);

const form = $("match-report-form");
const divisionSelect = $("division");
const matchdaySelect = $("matchday");
const matchSelect = $("match");
const homeGoals = $("home-gol-score");
const awayGoals = $("away-gol-score");
const mvpSelect = $("mvp");
const errore = $("referto-errore");

const percorsi = () => getPaths(divisionSelect.value);

function svuotaSelect(select, testo) {
  select.replaceChildren(new Option(testo, "", true, true));
  select.options[0].disabled = true;
  select.options[0].hidden = true;
}

function mostraErrore(testo, campo = null) {
  errore.textContent = testo;
  if (campo) {
    campo.classList.add("invalid");
    campo.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function pulisciErrori() {
  errore.textContent = "";
  form.querySelectorAll(".invalid").forEach((el) => el.classList.remove("invalid"));
}

function nascondiPartita() {
  $("gruppo-risultato").hidden = true;
  $("scorers-mvp").hidden = true;
  homeGoals.value = "";
  awayGoals.value = "";
}

// Campo numerico con i pulsanti − e + (più comodi del tastierino a bordo campo)
function contatore(input) {
  const crea = (testo, etichetta, delta) => {
    const pulsante = document.createElement("button");
    pulsante.type = "button";
    pulsante.textContent = testo;
    pulsante.setAttribute("aria-label", etichetta);
    pulsante.addEventListener("click", () => {
      const valore = Math.max(0, (parseInt(input.value, 10) || 0) + delta);
      input.value = valore === 0 ? "" : valore;
    });
    return pulsante;
  };

  const gruppo = document.createElement("div");
  gruppo.className = "contatore";
  gruppo.append(crea("−", "Togli un gol", -1), input, crea("+", "Aggiungi un gol", 1));
  return gruppo;
}

function rigaGiocatore(nome, { autogol = false } = {}) {
  const riga = document.createElement("div");
  riga.className = "player-div";
  riga.classList.toggle("autogol", autogol);
  riga.dataset.giocatore = autogol ? "" : nome;

  const etichetta = document.createElement("span");
  etichetta.className = "player-name";
  etichetta.textContent = nome;

  const input = document.createElement("input");
  input.type = "number";
  input.inputMode = "numeric";
  input.min = "0";
  input.max = "99";
  input.placeholder = "0";
  input.setAttribute("aria-label", `Gol: ${nome}`);

  riga.append(etichetta, contatore(input));
  return riga;
}

function popolaGiocatori(contenitore, giocatori, avversaria) {
  contenitore.replaceChildren(
    ...giocatori.map((nome) => rigaGiocatore(nome)),
    rigaGiocatore(`Autogol di ${nomeSquadra(avversaria)}`, { autogol: true })
  );
}

function popolaMvp(giocatori) {
  svuotaSelect(mvpSelect, "Scegli un giocatore");
  [...giocatori]
    .sort((a, b) => a.localeCompare(b, "it"))
    .forEach((nome) => {
      mvpSelect.appendChild(new Option(nome, nome));
    });
}

// Gol per giocatore: { nome: gol }, gli autogol in una chiave a parte
function leggiMarcatori(contenitore, chiaveAutogol) {
  const marcatori = {};
  let totale = 0;
  contenitore.querySelectorAll(".player-div").forEach((riga) => {
    const gol = parseInt(riga.querySelector("input").value, 10) || 0;
    if (gol <= 0) return;
    totale += gol;
    const chiave = riga.dataset.giocatore || chiaveAutogol;
    marcatori[chiave] = (marcatori[chiave] || 0) + gol;
  });
  return { marcatori, totale };
}

divisionSelect.addEventListener("change", async () => {
  pulisciErrori();
  nascondiPartita();
  svuotaSelect(matchdaySelect, "Caricamento…");
  svuotaSelect(matchSelect, "Scegli prima la giornata");
  matchSelect.disabled = true;
  matchdaySelect.disabled = true;

  const calendario = await getData(percorsi().calendarPath);
  svuotaSelect(matchdaySelect, "Scegli");

  if (!calendario) {
    mostraErrore("Il calendario di questa divisione non è ancora disponibile.");
    return;
  }

  Object.keys(calendario).forEach((giornata) => {
    const testo = /^\d+$/.test(giornata) ? `Giornata ${giornata}` : giornata;
    matchdaySelect.appendChild(new Option(testo, giornata));
  });
  matchdaySelect.disabled = false;
});

matchdaySelect.addEventListener("change", async () => {
  pulisciErrori();
  nascondiPartita();
  svuotaSelect(matchSelect, "Caricamento…");

  const partite = await getData(`${percorsi().calendarPath}/${matchdaySelect.value}`);
  svuotaSelect(matchSelect, "Scegli la partita");

  Object.keys(partite || {}).forEach((chiave) => {
    const [casa, ospite] = chiave.split(":");
    matchSelect.appendChild(new Option(`${nomeSquadra(casa)} – ${nomeSquadra(ospite)}`, chiave));
  });
  matchSelect.disabled = false;
});

matchSelect.addEventListener("change", async () => {
  pulisciErrori();
  const [casa, ospite] = matchSelect.value.split(":");

  $("home-team-name").textContent = nomeSquadra(casa);
  $("away-team-name").textContent = nomeSquadra(ospite);
  $("home-team-title").textContent = nomeSquadra(casa);
  $("away-team-title").textContent = nomeSquadra(ospite);
  homeGoals.value = "";
  awayGoals.value = "";

  const { teamsPath } = percorsi();
  const [datiCasa, datiOspite] = await Promise.all([
    getData(`${teamsPath}/${casa}`),
    getData(`${teamsPath}/${ospite}`),
  ]);
  const giocatoriCasa = Object.keys(datiCasa?.Giocatori || {});
  const giocatoriOspite = Object.keys(datiOspite?.Giocatori || {});

  popolaGiocatori($("home-players"), giocatoriCasa, ospite);
  popolaGiocatori($("away-players"), giocatoriOspite, casa);
  popolaMvp([...giocatoriCasa, ...giocatoriOspite]);

  $("gruppo-risultato").hidden = false;
  $("scorers-mvp").hidden = false;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  pulisciErrori();

  const nomeArbitro = $("referee-name").value.replace(/\s+/g, " ").trim();
  const giornata = matchdaySelect.value;
  const partita = matchSelect.value;

  if (!nomeArbitro) return mostraErrore("Scrivi il tuo nome e cognome.", $("referee-name"));
  if (!divisionSelect.value) return mostraErrore("Scegli la divisione.", divisionSelect);
  if (!giornata) return mostraErrore("Scegli la giornata.", matchdaySelect);
  if (!partita) return mostraErrore("Scegli la partita.", matchSelect);
  if (homeGoals.value === "" || awayGoals.value === "") {
    return mostraErrore("Inserisci il risultato.", homeGoals.value === "" ? homeGoals : awayGoals);
  }

  const golCasa = parseInt(homeGoals.value, 10) || 0;
  const golOspite = parseInt(awayGoals.value, 10) || 0;
  const [casa, ospite] = partita.split(":");

  const marcatoriCasa = leggiMarcatori($("home-players"), "AutogolOspite");
  const marcatoriOspite = leggiMarcatori($("away-players"), "AutogolCasa");

  if (marcatoriCasa.totale !== golCasa) {
    return mostraErrore(
      `${nomeSquadra(casa)}: i gol dei marcatori (${marcatoriCasa.totale}) non corrispondono al risultato (${golCasa}).`,
      $("home-players")
    );
  }
  if (marcatoriOspite.totale !== golOspite) {
    return mostraErrore(
      `${nomeSquadra(ospite)}: i gol dei marcatori (${marcatoriOspite.totale}) non corrispondono al risultato (${golOspite}).`,
      $("away-players")
    );
  }
  if (!mvpSelect.value) return mostraErrore("Scegli il migliore in campo.", mvpSelect);

  const referto = {
    NomeArbitro: nomeArbitro,
    SquadraCasa: casa,
    SquadraOspite: ospite,
    GolSquadraCasa: golCasa,
    GolSquadraOspite: golOspite,
    Marcatori: {
      // true: la squadra non ha segnato (un oggetto vuoto sparirebbe dal database)
      MarcatoriCasa: Object.keys(marcatoriCasa.marcatori).length ? marcatoriCasa.marcatori : true,
      MarcatoriOspite: Object.keys(marcatoriOspite.marcatori).length ? marcatoriOspite.marcatori : true,
    },
    MVP: mvpSelect.value,
    Commenti: $("comments").value.trim(),
    Divisione: divisionSelect.value,
    OraInvio: new Date().toISOString(),
  };

  // Un secondo tocco durante l'invio non deve spedire due volte
  const invia = form.querySelector("[type=submit]");
  invia.disabled = true;
  invia.textContent = "Invio in corso…";

  try {
    await setData(`${percorsi().reportsPath}/${giornata}/${partita}`, referto);
    $("referto-inviato-testo").textContent =
      `${nomeSquadra(casa)} ${golCasa} – ${golOspite} ${nomeSquadra(ospite)}. ` +
      "Grazie! L'organizzazione controllerà il referto e pubblicherà il risultato.";
    form.hidden = true;
    $("referto-inviato").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    console.error("Errore durante l'invio del referto:", error);
    const rifiutato = String(error?.code || error?.message)
      .toUpperCase()
      .includes("PERMISSION");
    mostraErrore(
      rifiutato
        ? "Il referto di questa partita è già stato inviato. Per correggerlo scrivi a info@coftamilano.com."
        : "Invio non riuscito. Controlla la connessione e riprova."
    );
  } finally {
    invia.disabled = false;
    invia.textContent = "Invia referto";
  }
});

$("nuovo-referto").addEventListener("click", () => {
  const nome = $("referee-name").value;
  form.reset();
  $("referee-name").value = nome;
  nascondiPartita();
  svuotaSelect(matchdaySelect, "Scegli");
  svuotaSelect(matchSelect, "Scegli prima divisione e giornata");
  matchdaySelect.disabled = true;
  matchSelect.disabled = true;
  form.hidden = false;
  $("referto-inviato").hidden = true;
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (divisioneUnica()) scegliDivisioneUnica();
});

// Con la divisione unica (vedi divisione.js) il campo sparisce: è già scelta
// e le giornate si caricano subito
function scegliDivisioneUnica() {
  const campo = divisionSelect.closest(".campo");
  campo.hidden = true;
  campo.parentElement.classList.remove("due-colonne");
  divisionSelect.replaceChildren(new Option(DIVISIONE_UNICA, DIVISIONE_UNICA, true, true));
  divisionSelect.dispatchEvent(new Event("change"));
}

// I percorsi dipendono dall'edizione corrente, letta dalle impostazioni:
// la divisione si sceglie solo quando è nota
await impostazioniPronte;
divisionSelect.disabled = false;
if (divisioneUnica()) scegliDivisioneUnica();
