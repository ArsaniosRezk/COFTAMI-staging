import { db, ref, update, remove, getData } from "../firebase.js";
import { edition, DIVISIONI, divisioneUnica, nomeDivisione } from "../divisione.js";
import { formatDateTime } from "../utils/formattazione.js";
import { nomeSquadra } from "../utils/torneo.js";
import { mostraToast, conferma } from "../utils/interfaccia.js";
import { aggiornaConteggi } from "../utils/gestionale-eventi.js";
import { creaLogo } from "../utils/logo.js";
import { leggiReferti, refertoConfermato } from "./da-fare.js";

/*
===================================
REFERTI
===================================
I referti inviati dagli arbitri (invia-report.html), di entrambe le divisioni,
dal più recente. Nel gestionale si conferma il risultato: partita e risultato
nel calendario vengono scritti insieme, così il sito non vede mai il risultato
senza i marcatori.

Le stesse schede, senza pulsanti, servono alle pagine referti.html (con le
segnalazioni) e referti-social.html (solo risultato e marcatori).

Tutti i testi arrivano da un modulo pubblico: sempre textContent, mai innerHTML.
*/

const filtri = { stato: null, divisione: "tutte" };

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

// { nome: gol } -> righe "Nome ×2", autogol a parte
function elencoMarcatori(marcatori, autogolDi, lato) {
  const elenco = crea("ul", `referto-marcatori ${lato}`);
  let autogol = 0;
  for (const [nome, gol] of Object.entries(typeof marcatori === "object" && marcatori ? marcatori : {})) {
    if (nome.startsWith("Autogol")) {
      autogol += Number(gol) || 0;
      continue;
    }
    const voce = crea("li", "", nome);
    if (Number(gol) > 1) voce.appendChild(crea("b", "referto-volte", `×${gol}`));
    elenco.appendChild(voce);
  }
  if (autogol)
    elenco.appendChild(
      crea("li", "autogol", `Autogol di ${nomeSquadra(autogolDi)}${autogol > 1 ? ` ×${autogol}` : ""}`)
    );
  if (!elenco.children.length) elenco.appendChild(crea("li", "nessuno", "Nessun gol"));
  return elenco;
}

function stato(referto, partita) {
  if (refertoConfermato(referto, partita)) return { classe: "badge-ok", testo: "Confermato" };
  if (partita) return { classe: "badge-errore", testo: "Diverso dal risultato sul sito" };
  return { classe: "badge-attesa", testo: "Da confermare" };
}

// Squadre di entrambe le divisioni, per i loghi: { Superiori: {...}, Giovani: {...} }
async function leggiSquadre() {
  const elenchi = await Promise.all(
    DIVISIONI.map((divisione) => getData(`Calcio/${edition}/${divisione}/Squadre`).catch(() => null))
  );
  return Object.fromEntries(DIVISIONI.map((divisione, i) => [divisione, elenchi[i] || {}]));
}

/*
 Scheda: in alto dove e stato, poi il tabellone (loghi, nomi, risultato) con i
 marcatori ognuno sotto la sua squadra, poi i dettagli e le segnalazioni.
*/
function schedaReferto(voce, { azioni = false, conCommenti = true, ridisegna = null, squadre = {} } = {}) {
  const { divisione, giornata, referto, partita } = voce;
  const casa = referto.SquadraCasa;
  const ospite = referto.SquadraOspite;
  const { classe, testo } = stato(referto, partita);
  const squadreDivisione = squadre[divisione];

  const scheda = crea("article", "referto");
  if (azioni && !refertoConfermato(referto, partita)) scheda.classList.add("da-confermare");

  const testa = crea("header", "referto-testa");
  const dove = [nomeDivisione(divisione), nomeGiornata(giornata)].filter(Boolean).join(" · ");
  testa.appendChild(crea("span", "referto-dove", dove));
  if (azioni) testa.appendChild(crea("span", `badge ${classe}`, testo));
  scheda.appendChild(testa);

  const tabellone = crea("div", "referto-tabellone");
  const lato = (squadra, posizione) => {
    const blocco = crea("div", `referto-lato ${posizione}`);
    blocco.append(
      creaLogo(squadreDivisione, squadra, "referto-logo"),
      crea("span", "referto-squadra", nomeSquadra(squadra))
    );
    return blocco;
  };
  const gol = crea("div", "referto-gol");
  gol.append(
    crea("span", "", String(referto.GolSquadraCasa ?? "-")),
    crea("span", "referto-trattino", "–"),
    crea("span", "", String(referto.GolSquadraOspite ?? "-"))
  );
  gol.setAttribute("aria-label", `${referto.GolSquadraCasa ?? "-"} a ${referto.GolSquadraOspite ?? "-"}`);
  tabellone.append(lato(casa, "casa"), gol, lato(ospite, "ospite"));

  const marcatori = crea("div", "referto-marcatori-righe");
  marcatori.setAttribute("aria-label", "Marcatori");
  marcatori.append(
    elencoMarcatori(referto.Marcatori?.MarcatoriCasa, ospite, "casa"),
    crea("i", "icona icona-futbol referto-pallone"),
    elencoMarcatori(referto.Marcatori?.MarcatoriOspite, casa, "ospite")
  );
  marcatori.children[1].setAttribute("aria-hidden", "true");
  tabellone.appendChild(marcatori);
  scheda.appendChild(tabellone);

  if (azioni && partita && !refertoConfermato(referto, partita)) {
    const differenza = crea("p", "referto-differenza");
    differenza.append(
      icona("triangle-exclamation"),
      ` Sul sito ora c'è ${partita.GolSquadraCasa} – ${partita.GolSquadraOspite}`
    );
    scheda.appendChild(differenza);
  }

  const dettagli = crea("dl", "referto-dettagli");
  const dettaglio = (nomeIcona, termine, valore) => {
    if (!valore) return;
    const riga = crea("div", "referto-dettaglio");
    const etichetta = crea("dt", "", termine);
    etichetta.prepend(icona(nomeIcona));
    riga.append(etichetta, crea("dd", "", valore));
    dettagli.appendChild(riga);
  };
  dettaglio("star", "Migliore in campo", referto.MVP);
  dettaglio("whistle", "Arbitro", referto.NomeArbitro);
  dettaglio("clock", "Ricevuto", referto.OraInvio ? formatDateTime(referto.OraInvio) : "");
  scheda.appendChild(dettagli);

  if (conCommenti && referto.Commenti?.trim()) {
    const note = crea("div", "referto-note");
    const titolo = crea("h3", "referto-note-titolo", "Segnalazioni dell'arbitro");
    titolo.prepend(icona("triangle-exclamation"));
    note.append(titolo, crea("p", "", referto.Commenti));
    scheda.appendChild(note);
  }

  if (azioni) scheda.appendChild(pulsantiAzione(voce, ridisegna));
  return scheda;
}

function pulsantiAzione(voce, ridisegna) {
  const { divisione, giornata, chiave, referto, partita } = voce;
  const riga = crea("div", "referto-azioni");
  const confermato = refertoConfermato(referto, partita);

  const principale = crea(
    "button",
    `btn ${confermato ? "" : "btn-principale"}`,
    confermato ? "Pubblica di nuovo" : partita ? "Sostituisci con il referto" : "Conferma e pubblica"
  );
  principale.type = "button";
  principale.prepend(icona(confermato ? "rotate" : "check-semplice"), " ");
  principale.addEventListener("click", async () => {
    if (partita) {
      const ok = await conferma(
        `Sul sito c'è già ${partita.GolSquadraCasa} – ${partita.GolSquadraOspite}. ` +
          `Verrà sostituito con il referto: ${referto.GolSquadraCasa} – ${referto.GolSquadraOspite}, con i suoi marcatori.`,
        { titolo: "Sostituire il risultato?", ok: "Sostituisci" }
      );
      if (!ok) return;
    }
    principale.disabled = true;
    if (await confermaReferto(divisione, giornata, chiave, referto)) {
      aggiornaConteggi();
      ridisegna?.();
    } else {
      principale.disabled = false;
    }
  });

  const elimina = crea("button", "btn btn-testo btn-elimina", "Elimina referto");
  elimina.type = "button";
  elimina.addEventListener("click", async () => {
    const ok = await conferma(
      "Il referto verrà eliminato e l'arbitro potrà inviarne uno nuovo. Il risultato già pubblicato non cambia.",
      { titolo: "Eliminare il referto?", ok: "Elimina", pericolosa: true }
    );
    if (!ok) return;
    try {
      await remove(ref(db, `Calcio/${edition}/${divisione}/Referti/${giornata}/${chiave}`));
      mostraToast("Referto eliminato");
      aggiornaConteggi();
      ridisegna?.();
    } catch (errore) {
      console.error(errore);
      mostraToast("Impossibile eliminare il referto. Riprova.", { errore: true });
    }
  });

  riga.append(principale, elimina);
  return riga;
}

// Partita e risultato nel calendario in un'unica scrittura
async function confermaReferto(divisione, giornata, chiave, referto) {
  const base = `Calcio/${edition}/${divisione}`;
  try {
    await update(ref(db), {
      [`${base}/Partite/${giornata}/${chiave}`]: {
        GolSquadraCasa: referto.GolSquadraCasa,
        GolSquadraOspite: referto.GolSquadraOspite,
        SquadraCasa: referto.SquadraCasa,
        SquadraOspite: referto.SquadraOspite,
        Marcatori: referto.Marcatori || null,
      },
      [`${base}/Calendario/${giornata}/${chiave}/Risultato`]: `${referto.GolSquadraCasa}:${referto.GolSquadraOspite}`,
    });
    mostraToast(
      `Pubblicato: ${nomeSquadra(referto.SquadraCasa)} ${referto.GolSquadraCasa} – ${referto.GolSquadraOspite} ${nomeSquadra(referto.SquadraOspite)}`
    );
    return true;
  } catch (errore) {
    console.error("Errore nella conferma del referto:", errore);
    mostraToast("Impossibile pubblicare il risultato. Riprova.", { errore: true });
    return false;
  }
}

/*
-----------------------------------
GESTIONALE
-----------------------------------
*/

function barraFiltri(contenitore, ridisegna, conteggi) {
  const barra = crea("div", "referti-filtri");

  const gruppo = (etichetta, chiave, opzioni) => {
    const insieme = crea("div", "filtro-gruppo");
    insieme.setAttribute("role", "group");
    insieme.setAttribute("aria-label", etichetta);
    for (const [valore, testo] of opzioni) {
      const pulsante = crea("button", "filtro", testo);
      pulsante.type = "button";
      pulsante.setAttribute("aria-pressed", String(filtri[chiave] === valore));
      pulsante.addEventListener("click", () => {
        filtri[chiave] = valore;
        ridisegna();
      });
      insieme.appendChild(pulsante);
    }
    return insieme;
  };

  barra.appendChild(
    gruppo("Stato", "stato", [
      ["da-confermare", `Da confermare (${conteggi.daConfermare})`],
      ["tutti", `Tutti (${conteggi.tutti})`],
    ])
  );
  // Con la divisione unica non c'è niente da filtrare
  if (!divisioneUnica()) {
    barra.appendChild(
      gruppo("Divisione", "divisione", [
        ["tutte", "Entrambe"],
        ...DIVISIONI.map((divisione) => [divisione, divisione]),
      ])
    );
  }
  contenitore.appendChild(barra);
}

export async function showReportOptions() {
  const contenitore = document.getElementById("report-content");

  const disegna = async () => {
    const [referti, squadre] = await Promise.all([leggiReferti(), leggiSquadre()]);
    const daConfermare = referti.filter(({ referto, partita }) => !refertoConfermato(referto, partita));
    // Alla prima apertura: quelli da confermare, se ce ne sono
    filtri.stato ??= daConfermare.length ? "da-confermare" : "tutti";

    const visibili = (filtri.stato === "da-confermare" ? daConfermare : referti).filter(
      ({ divisione }) => divisioneUnica() || filtri.divisione === "tutte" || divisione === filtri.divisione
    );

    contenitore.replaceChildren();
    barraFiltri(contenitore, disegna, { daConfermare: daConfermare.length, tutti: referti.length });

    if (!visibili.length) {
      contenitore.appendChild(
        crea(
          "p",
          "vuoto",
          filtri.stato === "da-confermare"
            ? "Nessun referto da confermare: i risultati sul sito sono aggiornati."
            : "Nessun referto ricevuto per questa edizione."
        )
      );
      return;
    }

    const griglia = crea("div", "referti-griglia");
    visibili.forEach((voce) =>
      griglia.appendChild(schedaReferto(voce, { azioni: true, ridisegna: disegna, squadre }))
    );
    contenitore.appendChild(griglia);
  };

  return disegna();
}

/*
-----------------------------------
PAGINE DEI REFERTI (referti.html, referti-social.html)
-----------------------------------
*/

export async function mostraRefertiPubblici(contenitore, { conCommenti = true } = {}) {
  const [referti, squadre] = await Promise.all([leggiReferti(), leggiSquadre()]);
  if (!referti.length) {
    contenitore.replaceChildren(crea("p", "vuoto", "Nessun referto ricevuto per questa edizione."));
    return;
  }
  const griglia = crea("div", "referti-griglia");
  referti.forEach((voce) => griglia.appendChild(schedaReferto(voce, { conCommenti, squadre })));
  contenitore.replaceChildren(griglia);
}
