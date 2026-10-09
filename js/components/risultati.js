import { db, ref, update, getData, getPaths } from "../firebase.js";
import { getSelectedDivision, nomeDivisione } from "../divisione.js";
import { giornateNumerate, giornataCorrente, haRisultato, nomeSquadra } from "../utils/torneo.js";
import { mostraToast, conferma } from "../utils/interfaccia.js";
import { aggiornaConteggi } from "../utils/gestionale-eventi.js";
import { creaLogo } from "../utils/logo.js";

/*
===================================
RISULTATI (gestionale)
===================================
Tutte le partite del calendario della divisione, giornata per giornata, con
risultato e marcatori. Si può inserire un risultato anche senza referto
(es. arbitro senza telefono) o correggerne uno già pubblicato.

Salvataggio in un'unica scrittura:
  Calcio/{ed}/{div}/Partite/{giornata}/{Casa:Ospite}       risultato e marcatori
  Calcio/{ed}/{div}/Calendario/{giornata}/{Casa:Ospite}/Risultato   "2:1"
*/

const stato = { divisione: null, giornata: null, aperta: null };

function crea(tag, classe = "", testo = null) {
  const elemento = document.createElement(tag);
  if (classe) elemento.className = classe;
  if (testo !== null) elemento.textContent = testo;
  return elemento;
}

function icona(nome) {
  const i = crea("i", `icona icona-${nome}`);
  i.setAttribute("aria-hidden", "true");
  return i;
}

const nomeGiornata = (giornata) => (/^\d+$/.test(giornata) ? `Giornata ${giornata}` : giornata);

// Giornate di campionato in ordine, poi quelle della fase finale
function ordinaGiornate(calendario) {
  const numerate = giornateNumerate(calendario);
  const speciali = Object.keys(calendario || {})
    .filter((g) => !numerate.includes(g))
    .sort();
  return [...numerate, ...speciali];
}

async function leggiDati() {
  const { calendarPath, matchesPath, teamsPath } = getPaths();
  const [calendario, partite, squadre] = await Promise.all([
    getData(calendarPath),
    getData(matchesPath),
    getData(teamsPath),
  ]);
  return { calendario: calendario || {}, partite: partite || {}, squadre: squadre || {} };
}

/*
-----------------------------------
ELENCO
-----------------------------------
*/

export async function showMatchesOptions() {
  const contenitore = document.getElementById("matches-content");
  const divisione = getSelectedDivision();
  if (stato.divisione !== divisione) Object.assign(stato, { divisione, giornata: null, aperta: null });

  const disegna = async () => {
    const dati = await leggiDati();
    const giornate = ordinaGiornate(dati.calendario);

    if (!giornate.length) {
      const calendario = ["Il calendario", nomeDivisione(divisione)].filter(Boolean).join(" ");
      contenitore.replaceChildren(
        crea("p", "vuoto", `${calendario} non è ancora pubblicato: preparalo dalla sezione Calendario.`)
      );
      return;
    }

    if (!giornate.includes(stato.giornata)) {
      stato.giornata = giornataCorrente(dati.calendario, null) || giornate[0];
    }

    contenitore.replaceChildren(
      barraGiornate(giornate, dati.calendario, disegna),
      elencoPartite(stato.giornata, dati, disegna)
    );
    contenitore
      .querySelector(".giornata-chip[aria-pressed='true']")
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  };

  return disegna();
}

function barraGiornate(giornate, calendario, ridisegna) {
  const barra = crea("div", "giornate-barra");
  barra.setAttribute("role", "group");
  barra.setAttribute("aria-label", "Giornata");

  for (const giornata of giornate) {
    const partite = Object.values(calendario[giornata] || {});
    const giocate = partite.filter(haRisultato).length;
    const completa = partite.length > 0 && giocate === partite.length;

    const chip = crea("button", "giornata-chip");
    chip.type = "button";
    chip.setAttribute("aria-pressed", String(giornata === stato.giornata));
    chip.classList.toggle("completa", completa);
    chip.append(
      crea("span", "giornata-chip-nome", /^\d+$/.test(giornata) ? `G${giornata}` : giornata),
      crea("span", "giornata-chip-conto", `${giocate}/${partite.length}`)
    );
    chip.setAttribute("aria-label", `${nomeGiornata(giornata)}: ${giocate} risultati su ${partite.length}`);
    chip.addEventListener("click", () => {
      stato.giornata = giornata;
      stato.aperta = null;
      ridisegna();
    });
    barra.appendChild(chip);
  }
  return barra;
}

function elencoPartite(giornata, dati, ridisegna) {
  const blocco = crea("section", "risultati-giornata");
  blocco.appendChild(crea("h2", "risultati-titolo", nomeGiornata(giornata)));

  const elenco = crea("ul", "risultati-elenco");
  for (const [chiave, calendario] of Object.entries(dati.calendario[giornata] || {})) {
    elenco.appendChild(rigaPartita(giornata, chiave, calendario || {}, dati, ridisegna));
  }
  blocco.appendChild(elenco);
  return blocco;
}

function punteggioDi(partita, calendario) {
  if (partita) return `${partita.GolSquadraCasa ?? 0} – ${partita.GolSquadraOspite ?? 0}`;
  const [casa, ospite] = String(calendario.Risultato || "").split(":");
  return `${casa ?? "?"} – ${ospite ?? "?"}`;
}

function rigaPartita(giornata, chiave, calendario, dati, ridisegna) {
  const [casa, ospite] = chiave.split(":");
  const partita = dati.partite[giornata]?.[chiave];
  const giocata = haRisultato(calendario) || Boolean(partita);
  const aperta = stato.aperta === chiave;

  const voce = crea("li", "risultato");
  voce.classList.toggle("aperta", aperta);

  const riga = crea("div", "risultato-riga");

  // Casa · punteggio · ospite: i nomi stanno attaccati al punteggio, come su un tabellone
  const squadra = (chiaveSquadra, lato) => {
    const blocco = crea("div", `risultato-squadra ${lato}`);
    blocco.append(
      creaLogo(dati.squadre, chiaveSquadra, "risultato-logo"),
      crea("span", "risultato-nome", nomeSquadra(chiaveSquadra))
    );
    return blocco;
  };
  const squadre = crea("div", "risultato-squadre");
  squadre.append(
    squadra(casa, "casa"),
    crea(
      "span",
      `risultato-punteggio${giocata ? "" : " da-giocare"}`,
      giocata ? punteggioDi(partita, calendario) : "–"
    ),
    squadra(ospite, "ospite")
  );

  const info = crea("div", "risultato-info");
  const quando = [calendario.Data, calendario.Orario].filter(Boolean).join(" · ");
  info.append(
    crea("span", `badge ${giocata ? "badge-ok" : ""}`, giocata ? "Risultato pubblicato" : "Da giocare"),
    crea(
      "span",
      "suggerimento",
      [quando, calendario.Luogo].filter(Boolean).join(" · ") || "Data e campo da definire"
    )
  );

  const apri = crea("button", `btn risultato-azione${!aperta && !giocata ? " btn-principale" : ""}`);
  apri.type = "button";
  apri.setAttribute("aria-expanded", String(aperta));
  apri.append(
    icona(aperta ? "xmark" : "pen"),
    ` ${aperta ? "Chiudi" : giocata ? "Modifica" : "Inserisci risultato"}`
  );
  apri.addEventListener("click", () => {
    stato.aperta = aperta ? null : chiave;
    ridisegna();
  });

  riga.append(squadre, info, apri);
  voce.appendChild(riga);

  if (aperta) voce.appendChild(editorRisultato(giornata, chiave, partita, dati.squadre, ridisegna));
  return voce;
}

/*
-----------------------------------
INSERIMENTO DEL RISULTATO
-----------------------------------
*/

// Campo numerico con − e + (comodo da telefono)
function contatore(valore, etichetta, { grande = false } = {}) {
  const gruppo = crea("div", `contatore${grande ? " grande" : ""}`);
  const input = crea("input");
  input.type = "number";
  input.inputMode = "numeric";
  input.min = "0";
  input.max = "99";
  input.value = valore ? String(valore) : grande ? "0" : "";
  input.placeholder = "0";
  input.setAttribute("aria-label", etichetta);

  const passo = (testo, delta, descrizione) => {
    const pulsante = crea("button", "contatore-passo", testo);
    pulsante.type = "button";
    pulsante.setAttribute("aria-label", `${descrizione}: ${etichetta}`);
    pulsante.addEventListener("click", () => {
      const nuovo = Math.max(0, (parseInt(input.value, 10) || 0) + delta);
      input.value = nuovo === 0 && !grande ? "" : String(nuovo);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    return pulsante;
  };

  gruppo.append(passo("−", -1, "Togli"), input, passo("+", 1, "Aggiungi"));
  return { gruppo, input };
}

function colonnaMarcatori(squadra, giocatori, marcatori, chiaveAutogol, avversaria) {
  const colonna = crea("div", "editor-colonna");
  colonna.appendChild(crea("h3", "editor-squadra", nomeSquadra(squadra)));

  const elenco = crea("div", "editor-giocatori");
  const campi = [];
  const valori = typeof marcatori === "object" && marcatori ? marcatori : {};

  const riga = (nome, etichetta, classe = "") => {
    const contenitore = crea("div", `editor-giocatore ${classe}`.trim());
    const { gruppo, input } = contatore(valori[nome], `gol di ${etichetta}`);
    contenitore.append(crea("span", "editor-nome", etichetta), gruppo);
    elenco.appendChild(contenitore);
    campi.push({ nome, input });
  };

  giocatori.forEach((nome) => riga(nome, nome));

  // Giocatori nei marcatori ma non più in rosa (es. tolti dopo la partita)
  Object.keys(valori)
    .filter((nome) => !nome.startsWith("Autogol") && !giocatori.includes(nome))
    .forEach((nome) => riga(nome, `${nome} (non in rosa)`, "fuori-rosa"));

  riga(chiaveAutogol, `Autogol di ${nomeSquadra(avversaria)}`, "autogol");

  if (!giocatori.length) colonna.appendChild(crea("p", "suggerimento", "Nessun giocatore in rosa."));
  colonna.appendChild(elenco);
  return { colonna, campi };
}

function leggiCampi(campi) {
  const marcatori = {};
  let totale = 0;
  for (const { nome, input } of campi) {
    const gol = parseInt(input.value, 10) || 0;
    if (gol <= 0) continue;
    marcatori[nome] = gol;
    totale += gol;
  }
  return { marcatori, totale };
}

function editorRisultato(giornata, chiave, partita, squadre, ridisegna) {
  const [casa, ospite] = chiave.split(":");
  const editor = crea("form", "editor-risultato");
  editor.noValidate = true;

  // Risultato
  const tabellino = crea("div", "editor-tabellino");
  const golCasa = contatore(partita?.GolSquadraCasa, `gol ${nomeSquadra(casa)}`, { grande: true });
  const golOspite = contatore(partita?.GolSquadraOspite, `gol ${nomeSquadra(ospite)}`, { grande: true });
  const lato = (squadra, campo) => {
    const blocco = crea("div", "editor-lato");
    blocco.append(
      creaLogo(squadre, squadra, "editor-logo"),
      crea("span", "editor-squadra", nomeSquadra(squadra)),
      campo.gruppo
    );
    return blocco;
  };
  tabellino.append(lato(casa, golCasa), crea("span", "editor-trattino", "–"), lato(ospite, golOspite));
  editor.appendChild(tabellino);

  // Marcatori
  const giocatoriDi = (squadra) =>
    Object.keys(squadre[squadra]?.Giocatori || {}).sort((a, b) => a.localeCompare(b, "it"));
  const marcatoriCasa = colonnaMarcatori(
    casa,
    giocatoriDi(casa),
    partita?.Marcatori?.MarcatoriCasa,
    "AutogolOspite",
    ospite
  );
  const marcatoriOspite = colonnaMarcatori(
    ospite,
    giocatoriDi(ospite),
    partita?.Marcatori?.MarcatoriOspite,
    "AutogolCasa",
    casa
  );

  const colonne = crea("div", "editor-colonne");
  colonne.append(marcatoriCasa.colonna, marcatoriOspite.colonna);
  editor.append(crea("h3", "editor-sezione", "Marcatori"), colonne);

  // Controllo dal vivo: la somma dei marcatori deve tornare con il risultato
  const controllo = crea("p", "editor-controllo");
  controllo.setAttribute("aria-live", "polite");
  const verifica = () => {
    const gc = parseInt(golCasa.input.value, 10) || 0;
    const go = parseInt(golOspite.input.value, 10) || 0;
    const sc = leggiCampi(marcatoriCasa.campi).totale;
    const so = leggiCampi(marcatoriOspite.campi).totale;
    const problemi = [];
    if (sc !== gc) problemi.push(`${nomeSquadra(casa)}: marcatori ${sc}, risultato ${gc}`);
    if (so !== go) problemi.push(`${nomeSquadra(ospite)}: marcatori ${so}, risultato ${go}`);
    controllo.classList.toggle("ok", !problemi.length);
    controllo.textContent = problemi.length
      ? `I gol non tornano. ${problemi.join(" · ")}`
      : "Marcatori e risultato tornano.";
    return problemi.length === 0;
  };
  editor.addEventListener("input", verifica);
  editor.appendChild(controllo);
  verifica();

  // Azioni
  const azioni = crea("div", "editor-azioni");
  const salva = crea("button", "btn btn-principale");
  salva.type = "submit";
  salva.append(icona("floppy-disk"), " Salva e pubblica");
  azioni.appendChild(salva);

  if (partita) {
    const cancella = crea("button", "btn btn-testo btn-elimina", "Cancella risultato");
    cancella.type = "button";
    cancella.addEventListener("click", async () => {
      const ok = await conferma(
        'Risultato e marcatori spariranno dal sito: la partita tornerà "da giocare".',
        {
          titolo: "Cancellare il risultato?",
          ok: "Cancella",
          pericolosa: true,
        }
      );
      if (ok) await scrivi(giornata, chiave, null, "Risultato cancellato", ridisegna);
    });
    azioni.appendChild(cancella);
  }
  editor.appendChild(azioni);

  editor.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    if (!verifica()) {
      const ok = await conferma("La somma dei marcatori non corrisponde al risultato. Salvare comunque?", {
        titolo: "I gol non tornano",
        ok: "Salva comunque",
      });
      if (!ok) return;
    }
    const casaDati = leggiCampi(marcatoriCasa.campi).marcatori;
    const ospiteDati = leggiCampi(marcatoriOspite.campi).marcatori;
    const marcatori = {};
    if (Object.keys(casaDati).length) marcatori.MarcatoriCasa = casaDati;
    if (Object.keys(ospiteDati).length) marcatori.MarcatoriOspite = ospiteDati;

    salva.disabled = true;
    await scrivi(
      giornata,
      chiave,
      {
        SquadraCasa: casa,
        SquadraOspite: ospite,
        GolSquadraCasa: parseInt(golCasa.input.value, 10) || 0,
        GolSquadraOspite: parseInt(golOspite.input.value, 10) || 0,
        Marcatori: Object.keys(marcatori).length ? marcatori : null,
      },
      "Risultato pubblicato",
      ridisegna
    );
    salva.disabled = false;
  });

  return editor;
}

// Partita e risultato nel calendario insieme: il sito non li vede mai a metà
async function scrivi(giornata, chiave, partita, messaggio, ridisegna) {
  const { matchesPath, calendarPath } = getPaths();
  try {
    await update(ref(db), {
      [`${matchesPath}/${giornata}/${chiave}`]: partita,
      // Vuoto e non null: una partita senza altri dati sparirebbe dal calendario
      [`${calendarPath}/${giornata}/${chiave}/Risultato`]: partita
        ? `${partita.GolSquadraCasa}:${partita.GolSquadraOspite}`
        : "",
    });
    mostraToast(messaggio);
    stato.aperta = null;
    aggiornaConteggi();
    ridisegna();
  } catch (errore) {
    console.error("Errore nel salvataggio del risultato:", errore);
    mostraToast("Impossibile salvare. Riprova.", { errore: true });
  }
}
