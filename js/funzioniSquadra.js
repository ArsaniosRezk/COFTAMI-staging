import { impostazioniPronte, osservaImpostazioni } from "./impostazioni.js";
import { paginaAttiva } from "./pagine-attive.js";
import { DIVISIONI, getSelectedDivision, loadSavedOption, nomeDivisione } from "./divisione.js";
import { osservaDivisione, mostraErroreCaricamento } from "./dati-torneo.js";
import { posizioneSquadra, calcolaMarcatori, squadraDeiGiocatori } from "./components/classifiche.js";
import { rappresentaPartita, nomeGiornata } from "./components/calendario.js";
import {
  nomeSquadra,
  partiteDellaSquadra,
  haRisultato,
  eSquadraPreferita,
  impostaSquadraPreferita,
} from "./utils/torneo.js";
import { condividi, mostraToast } from "./utils/interfaccia.js";

/*
===================================
PAGINA SQUADRA
===================================
squadra.html?divisione=Giovani&nome=S_ Giorgio

Posizione e numeri in classifica, prossime partite, risultati, marcatori e
rosa di una squadra. I dati si aggiornano in tempo reale.
*/

const parametri = new URLSearchParams(location.search);
const chiave = parametri.get("nome") || "";

// Le divisioni dell'edizione si conoscono dopo le impostazioni (vedi avvia)
let divisione = null;

function scegliDivisione() {
  loadSavedOption();
  divisione = DIVISIONI.includes(parametri.get("divisione"))
    ? parametri.get("divisione")
    : getSelectedDivision();
}

const $ = (id) => document.getElementById(id);

function crea(tag, classe = "", testo = null) {
  const elemento = document.createElement(tag);
  if (classe) elemento.className = classe;
  if (testo !== null) elemento.textContent = testo;
  return elemento;
}

function squadraNonTrovata(
  titolo = "Squadra non trovata",
  testo = "La squadra cercata non partecipa all'edizione in corso."
) {
  document.title = `${titolo} - Cofta`;
  $("nome-squadra").textContent = titolo;
  $("dettagli-squadra").textContent = testo;
  $("logo-squadra").hidden = true;
  $("azioni-squadra").replaceChildren();
  $("statistiche-squadra").replaceChildren();
  document.querySelectorAll(".sezione-dati-squadra").forEach((sezione) => (sezione.hidden = true));
}

/*
-----------------------------------
INTESTAZIONE E AZIONI
-----------------------------------
*/

function disegnaIntestazione(squadra, posizione) {
  const nome = nomeSquadra(chiave);
  document.title = `${nome} - Cofta`;
  $("nome-squadra").textContent = nome;

  const logo = $("logo-squadra");
  const url = squadra.LogoLR || squadra.Logo;
  if (url && logo.getAttribute("src") !== url) logo.src = url;
  logo.hidden = !url;

  const dettagli = [nomeDivisione(divisione)].filter(Boolean);
  if (posizione?.girone) dettagli.push(`Girone ${posizione.girone}`);
  $("dettagli-squadra").textContent = dettagli.join(" · ");
}

function disegnaStatistiche(posizione) {
  const contenitore = $("statistiche-squadra");
  contenitore.replaceChildren();
  if (!posizione) return;

  const s = posizione.statistiche;
  const voci = [
    ["Posizione", `${posizione.posizione}ª`],
    ["Punti", posizione.punti],
    ["Giocate", s.playedMatches],
    ["Vinte", s.wonMatches],
    ["Pari", s.drawnMatches],
    ["Perse", s.lostMatches],
    ["Gol fatti", s.scoredGoals],
    ["Gol subiti", s.concededGoals],
  ];
  for (const [etichetta, valore] of voci) {
    const voce = crea("div", "statistica");
    voce.append(
      crea("span", "statistica-valore", String(valore)),
      crea("span", "statistica-etichetta", etichetta)
    );
    contenitore.appendChild(voce);
  }
}

function aggiornaPulsantePreferita() {
  const pulsante = $("pulsante-preferita");
  const preferita = eSquadraPreferita(divisione, chiave);
  pulsante.setAttribute("aria-pressed", String(preferita));
  pulsante.querySelector("i").className = `icona ${preferita ? "icona-star" : "icona-star-vuota"}`;
  pulsante.querySelector("span").textContent = preferita ? "La tua squadra" : "Segui questa squadra";
}

function preparaAzioni(datiCorrenti) {
  $("pulsante-preferita").addEventListener("click", () => {
    const giaPreferita = eSquadraPreferita(divisione, chiave);
    impostaSquadraPreferita(divisione, giaPreferita ? null : chiave);
    aggiornaPulsantePreferita();
    mostraToast(
      giaPreferita
        ? "Non segui più questa squadra"
        : "Fatto! La trovi in cima alla home e nel filtro del calendario"
    );
  });

  $("pulsante-condividi").addEventListener("click", () =>
    condividi({
      titolo: `${nomeSquadra(chiave)} - Cofta`,
      testo: `${nomeSquadra(chiave)}: partite, risultati e marcatori del torneo Cofta`,
    })
  );

  aggiornaPulsantePreferita();
}

/*
-----------------------------------
PARTITE
-----------------------------------
*/

function disegnaPartite(dati) {
  const contesto = {
    squadre: dati.squadre,
    partite: dati.partite,
    calendario: dati.calendario,
    divisione,
  };
  const partite = partiteDellaSquadra(dati.calendario, chiave);
  const prossime = partite.filter(({ dati: partita }) => !haRisultato(partita));
  const giocate = partite.filter(({ dati: partita }) => haRisultato(partita)).reverse();

  const elenco = (idContenitore, voci, vuoto) => {
    const contenitore = $(idContenitore);
    contenitore.replaceChildren();
    if (voci.length === 0) {
      contenitore.appendChild(crea("p", "avviso-vuoto", vuoto));
      return;
    }
    for (const voce of voci) {
      const blocco = crea("div", "partita-squadra");
      blocco.appendChild(crea("p", "partita-squadra-giornata", nomeGiornata(voce.giornata)));
      blocco.appendChild(rappresentaPartita(voce.chiave, voce.dati, contesto, voce.giornata));
      contenitore.appendChild(blocco);
    }
  };

  elenco("prossime-partite", prossime, "Nessuna partita in programma.");
  elenco("risultati-squadra", giocate, "Nessuna partita giocata finora.");
}

function disegnaMarcatori(dati) {
  const contenitore = $("marcatori-squadra");
  contenitore.replaceChildren();

  const squadraDi = squadraDeiGiocatori(dati.squadre);
  const marcatori = calcolaMarcatori(dati.partite).filter(([giocatore]) => squadraDi[giocatore] === chiave);

  if (marcatori.length === 0) {
    contenitore.appendChild(crea("p", "avviso-vuoto", "Ancora nessun gol segnato."));
    return;
  }

  const tabella = crea("table", "scorers-table marcatori-squadra-tabella");
  const intestazione = crea("thead");
  const riga = crea("tr");
  for (const [sigla, significato] of [
    ["Giocatore", null],
    ["G", "Gol"],
  ]) {
    const th = crea("th", "", sigla);
    th.scope = "col";
    if (significato) th.title = significato;
    riga.appendChild(th);
  }
  intestazione.appendChild(riga);
  tabella.appendChild(intestazione);

  const corpo = crea("tbody");
  for (const [giocatore, gol] of marcatori) {
    const tr = crea("tr");
    tr.append(crea("td", "", giocatore), crea("td", "", String(gol)));
    corpo.appendChild(tr);
  }
  tabella.appendChild(corpo);
  contenitore.appendChild(tabella);
}

function disegnaRosa(squadra) {
  const contenitore = $("rosa-squadra");
  contenitore.replaceChildren();

  for (const [titolo, membri] of [
    ["Allenatori", squadra.Allenatori],
    ["Giocatori", squadra.Giocatori],
  ]) {
    const nomi = Object.keys(membri || {}).sort((a, b) => a.localeCompare(b));
    const blocco = crea("div", "rosa-gruppo");
    blocco.appendChild(crea("h3", "", `${titolo} (${nomi.length})`));
    const lista = crea("ul");
    nomi.forEach((nome) => lista.appendChild(crea("li", "", nome)));
    if (nomi.length === 0) lista.appendChild(crea("li", "", "-"));
    blocco.appendChild(lista);
    contenitore.appendChild(blocco);
  }
}

/*
-----------------------------------
AVVIO
-----------------------------------
*/

async function avvia() {
  if (!chiave) {
    squadraNonTrovata();
    return;
  }

  await impostazioniPronte;
  scegliDivisione();

  let ultimi = { calendario: null };
  let paginaSpenta = false;
  preparaAzioni(() => ultimi);

  // Con la pagina Squadre spenta dalla dashboard anche le singole squadre
  // restano nascoste (la pagina si ricarica quando viene riaccesa)
  osservaImpostazioni((impostazioni) => {
    const spenta = !paginaAttiva(impostazioni, "squadre");
    if (paginaSpenta && !spenta) location.reload();
    paginaSpenta = spenta;
    if (spenta) {
      squadraNonTrovata("Disponibile a breve", "Le squadre del torneo saranno pubblicate qui a breve.");
    }
  });

  osservaDivisione(
    (dati) => {
      ultimi = dati;
      if (paginaSpenta) return;
      const squadra = dati.squadre?.[chiave];
      if (!squadra) {
        squadraNonTrovata();
        return;
      }
      document.querySelectorAll(".sezione-dati-squadra").forEach((sezione) => (sezione.hidden = false));

      const posizione = posizioneSquadra(dati.squadre, dati.partite, chiave);
      disegnaIntestazione(squadra, posizione);
      disegnaStatistiche(posizione);
      disegnaPartite(dati);
      disegnaMarcatori(dati);
      disegnaRosa(squadra);
    },
    {
      divisione,
      onLento: () => mostraErroreCaricamento(["prossime-partite", "risultati-squadra", "marcatori-squadra"]),
    }
  );
}

avvia();
