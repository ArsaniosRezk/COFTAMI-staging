import { PERCORSO_IMPOSTAZIONI } from "/js/ambiente.js";
import { db, ref, set, update, remove, getData, getPaths } from "/js/firebase.js";
import { edition, getSelectedDivision, nomeDivisione } from "/js/divisione.js";
import { nomeSquadra } from "/js/utils/torneo.js";
import { creaLogo } from "/js/utils/logo.js";
import { mostraToast, conferma } from "/js/utils/interfaccia.js";
import {
  FORMATI,
  creaTabellone,
  portaAvantiVincenti,
  perSalvare,
  segnaposto,
  nomePartita,
  tabelloneCompilato,
  dataPerCampo,
  dataDaCampo,
} from "/js/utils/tabellone.js";
import { disegnaTabellone } from "/js/components/tabellone.js";

/*
===================================
FASE FINALE (gestionale)
===================================
Si compila tutto a mano: squadre, risultati, rigori, date e campi di ogni
partita. L'anteprima si aggiorna mentre si scrive; sul sito il tabellone
cambia solo con "Salva e pubblica" (Calcio/{ed}/{div}/FaseFinale).

"Porta avanti le vincenti" è solo un aiuto: copia nel turno dopo chi ha vinto,
senza toccare i nomi scritti a mano per altri motivi.
*/

const $ = (id) => document.getElementById(id);

const NOMI_FORMATI = { 2: "Solo finale", 4: "Semifinali", 8: "Quarti", 16: "Ottavi" };

const stato = {
  bozza: null,
  salvato: null,
  squadre: {},
  modificato: false,
  timerAnteprima: null,
};

function crea(tag, classe = "", testo = null) {
  const elemento = document.createElement(tag);
  if (classe) elemento.className = classe;
  if (testo !== null) elemento.textContent = testo;
  return elemento;
}

const percorso = () => `${getPaths().divisionPath}/FaseFinale`;
const anno = () => parseInt(edition, 10) || new Date().getFullYear();

/*
-----------------------------------
SQUADRE: chiave <-> nome mostrato
-----------------------------------
Nel campo si scrive il nome ("S. Marco"); si salva la chiave ("S_ Marco") se
è una squadra della divisione, così il sito trova il logo. Altrimenti resta
il testo scritto.
*/

function chiaveDaNome(testo) {
  const cercato = testo.trim().toLowerCase();
  if (!cercato) return "";
  const chiave = Object.keys(stato.squadre).find((k) => nomeSquadra(k).toLowerCase() === cercato);
  return chiave ?? testo.trim();
}

/*
-----------------------------------
STATO DELLE MODIFICHE
-----------------------------------
*/

function segnaModificato(modificato = true) {
  stato.modificato = modificato;
  const testo = $("tabellone-stato");
  if (!testo) return;
  testo.textContent = modificato
    ? "Modifiche non salvate: il sito mostra ancora la versione precedente."
    : stato.salvato
      ? "Tutto salvato: il sito mostra questa versione."
      : "Tabellone vuoto: non ancora pubblicato.";
  testo.classList.toggle("da-salvare", modificato);
}

function aggiornaAnteprima() {
  clearTimeout(stato.timerAnteprima);
  stato.timerAnteprima = setTimeout(() => {
    $("tabellone-anteprima")?.replaceChildren(
      disegnaTabellone(stato.bozza, { squadre: stato.squadre, edizione: edition })
    );
  }, 120);
}

function cambiato() {
  segnaModificato(true);
  aggiornaAnteprima();
}

/*
-----------------------------------
EDITOR DI UNA PARTITA
-----------------------------------
*/

let contatoreCampi = 0;
const nuovoId = () => `te-campo-${++contatoreCampi}`;

function campoNumero(valore, etichetta, onCambio) {
  const input = crea("input", "input te-gol");
  input.type = "number";
  input.inputMode = "numeric";
  input.min = "0";
  input.max = "99";
  input.placeholder = "–";
  input.value = valore === null ? "" : String(valore);
  input.setAttribute("aria-label", etichetta);
  input.addEventListener("input", () => {
    const numero = parseInt(input.value, 10);
    onCambio(Number.isNaN(numero) ? null : Math.max(0, Math.min(99, numero)));
  });
  return input;
}

function editorPartita(partita, turno, indice, titolo) {
  const carta = crea("article", "te-partita");
  carta.appendChild(crea("h3", "te-titolo", titolo));

  // Rigori: compaiono solo con un pareggio
  const rigori = crea("div", "te-rigori");
  const aggiornaRigori = () => {
    rigori.hidden = !(partita.GolCasa !== null && partita.GolCasa === partita.GolOspite);
  };

  const rigaSquadra = (lato) => {
    const campo = lato === "casa" ? "Casa" : "Ospite";
    const campoGol = lato === "casa" ? "GolCasa" : "GolOspite";
    const riga = crea("div", "te-squadra");

    const logo = crea("span", "te-logo");
    const aggiornaLogo = () =>
      logo.replaceChildren(
        partita[campo].trim()
          ? creaLogo(stato.squadre, partita[campo], "te-logo-img")
          : crea("span", "te-logo-vuoto")
      );
    aggiornaLogo();

    const nome = crea("input", "input te-nome");
    nome.type = "text";
    nome.setAttribute("list", "tabellone-squadre");
    nome.autocomplete = "off";
    nome.value = partita[campo] ? nomeSquadra(partita[campo]) : "";
    nome.placeholder = segnaposto(stato.bozza, turno, indice, lato);
    nome.setAttribute("aria-label", `${lato === "casa" ? "Prima squadra" : "Seconda squadra"}, ${titolo}`);
    nome.addEventListener("input", () => {
      partita[campo] = chiaveDaNome(nome.value);
      aggiornaLogo();
      cambiato();
    });

    const gol = campoNumero(partita[campoGol], `Gol di ${nome.value || nome.placeholder}`, (valore) => {
      partita[campoGol] = valore;
      aggiornaRigori();
      cambiato();
    });

    riga.append(logo, nome, gol);
    return riga;
  };

  carta.append(rigaSquadra("casa"), rigaSquadra("ospite"));

  rigori.append(
    crea("span", "te-rigori-etichetta", "Rigori"),
    campoNumero(partita.RigoriCasa, `Rigori prima squadra, ${titolo}`, (valore) => {
      partita.RigoriCasa = valore;
      cambiato();
    }),
    crea("span", "te-trattino", "–"),
    campoNumero(partita.RigoriOspite, `Rigori seconda squadra, ${titolo}`, (valore) => {
      partita.RigoriOspite = valore;
      cambiato();
    })
  );
  aggiornaRigori();
  carta.appendChild(rigori);

  // Quando e dove
  const quando = crea("div", "te-quando");
  const campoQuando = (etichetta, input, classe) => {
    const id = nuovoId();
    input.id = id;
    const blocco = crea("div", `campo ${classe}`);
    const label = crea("label", "", etichetta);
    label.htmlFor = id;
    blocco.append(label, input);
    return blocco;
  };

  const data = crea("input", "input");
  data.type = "date";
  data.value = dataPerCampo(partita.Data, anno());
  data.addEventListener("change", () => {
    partita.Data = dataDaCampo(data.value);
    cambiato();
  });

  const orario = crea("input", "input");
  orario.type = "time";
  orario.value = partita.Orario;
  orario.addEventListener("change", () => {
    partita.Orario = orario.value;
    cambiato();
  });

  const luogo = crea("input", "input");
  luogo.type = "text";
  luogo.setAttribute("list", "tabellone-luoghi");
  luogo.placeholder = "Campo";
  luogo.value = partita.Luogo;
  luogo.addEventListener("input", () => {
    partita.Luogo = luogo.value;
    cambiato();
  });

  quando.append(
    campoQuando("Data", data, "te-data"),
    campoQuando("Ora", orario, "te-ora"),
    campoQuando("Campo", luogo, "te-luogo")
  );
  carta.appendChild(quando);
  return carta;
}

/*
-----------------------------------
TURNI
-----------------------------------
*/

function disegnaTurni() {
  const contenitore = $("tabellone-turni");
  const { bozza } = stato;

  const pannelli = bozza.Turni.map((turno, t) => {
    const finale = t === bozza.Turni.length - 1;
    const pannello = crea("section", `pannello te-turno${finale ? " te-turno-finale" : ""}`);

    const testa = crea("div", "te-turno-testa");
    const id = nuovoId();
    const etichetta = crea("label", "etichetta", "Nome del turno");
    etichetta.htmlFor = id;
    const nome = crea("input", "input te-turno-nome");
    nome.id = id;
    nome.value = turno.Nome;
    nome.addEventListener("input", () => {
      turno.Nome = nome.value;
      cambiato();
    });
    const campo = crea("div", "campo");
    campo.append(etichetta, nome);
    testa.append(campo, crea("span", "badge", `${turno.Partite.length * 2} squadre`));
    pannello.appendChild(testa);

    const griglia = crea("div", "te-partite");
    turno.Partite.forEach((partita, i) =>
      griglia.appendChild(editorPartita(partita, t, i, nomePartita(turno.Partite.length, i)))
    );
    pannello.appendChild(griglia);
    return pannello;
  });

  if (bozza.Finale3) {
    const pannello = crea("section", "pannello te-turno");
    pannello.appendChild(crea("h2", "pannello-titolo", "Finale 3° posto"));
    const griglia = crea("div", "te-partite");
    griglia.appendChild(editorPartita(bozza.Finale3, "terzo", 0, "Finale 3° posto"));
    pannello.appendChild(griglia);
    pannelli.push(pannello);
  }

  contenitore.replaceChildren(...pannelli);
}

function disegnaFormato() {
  const gruppo = $("tabellone-formato");
  gruppo.replaceChildren(
    ...FORMATI.map((numero) => {
      const pulsante = crea("button", "te-formato-scelta");
      pulsante.type = "button";
      pulsante.setAttribute("aria-pressed", String(stato.bozza.Squadre === numero));
      pulsante.append(crea("b", "", String(numero)), crea("span", "", NOMI_FORMATI[numero]));
      pulsante.addEventListener("click", () => cambiaFormato(numero, stato.bozza.TerzoPosto));
      return pulsante;
    })
  );
  const terzo = $("tabellone-terzo");
  terzo.checked = stato.bozza.TerzoPosto;
  terzo.disabled = stato.bozza.Squadre < 4;
}

// Turni che spariscono con il nuovo formato e hanno già dei dati
function siPerdonoDati(nuovo) {
  const compilata = (p) => p.Casa.trim() || p.Ospite.trim() || p.GolCasa !== null || p.Data;
  const vecchi = stato.bozza.Turni;
  const persi = vecchi.slice(0, Math.max(0, vecchi.length - nuovo.Turni.length));
  const terzoPerso = stato.bozza.Finale3 && !nuovo.Finale3 && compilata(stato.bozza.Finale3);
  return persi.some((turno) => turno.Partite.some(compilata)) || terzoPerso;
}

async function cambiaFormato(squadre, terzoPosto) {
  const nuovo = creaTabellone({ squadre, terzoPosto, precedente: stato.bozza });
  if (siPerdonoDati(nuovo)) {
    const ok = await conferma("Le partite dei turni che spariscono, già compilate, verranno tolte.", {
      titolo: "Cambiare formato?",
      ok: "Cambia",
      pericolosa: true,
    });
    if (!ok) {
      disegnaFormato();
      return;
    }
  }
  stato.bozza = nuovo;
  disegnaFormato();
  disegnaTurni();
  cambiato();
}

/*
-----------------------------------
AZIONI
-----------------------------------
*/

async function salva() {
  const pulsante = $("tabellone-salva");
  pulsante.disabled = true;
  try {
    const dati = perSalvare(stato.bozza);
    await set(ref(db, percorso()), dati);
    stato.salvato = dati;
    segnaModificato(false);
    mostraToast("Tabellone pubblicato");
    if (!$("tabellone-visibile").checked) {
      mostraToast('Salvato. Per mostrarlo sul sito accendi "Visibile sul sito".', { durata: 5000 });
    }
  } catch (errore) {
    console.error("Tabellone non salvato:", errore);
    mostraToast("Impossibile salvare. Riprova.", { errore: true });
  }
  pulsante.disabled = false;
}

function portaAvanti() {
  const { tabellone, cambiate } = portaAvantiVincenti(stato.bozza);
  if (!cambiate) {
    mostraToast("Nessuna squadra da portare avanti: inserisci prima i risultati.");
    return;
  }
  stato.bozza = tabellone;
  disegnaTurni();
  cambiato();
  mostraToast(cambiate === 1 ? "1 squadra portata avanti" : `${cambiate} squadre portate avanti`);
}

async function svuota() {
  const ok = await conferma(
    "Squadre, risultati e date della fase finale verranno cancellati anche dal sito.",
    {
      titolo: "Svuotare il tabellone?",
      ok: "Svuota",
      pericolosa: true,
    }
  );
  if (!ok) return;
  try {
    await remove(ref(db, percorso()));
    stato.salvato = null;
    stato.bozza = creaTabellone({ squadre: stato.bozza.Squadre, terzoPosto: stato.bozza.TerzoPosto });
    disegnaFormato();
    disegnaTurni();
    aggiornaAnteprima();
    segnaModificato(false);
    mostraToast("Tabellone svuotato");
  } catch (errore) {
    console.error(errore);
    mostraToast("Impossibile svuotare. Riprova.", { errore: true });
  }
}

function preparaVisibilita(visibile) {
  const casella = $("tabellone-visibile");
  casella.checked = visibile;
  casella.addEventListener("change", async () => {
    const acceso = casella.checked;
    try {
      await update(ref(db, PERCORSO_IMPOSTAZIONI), { faseFinale: acceso });
      mostraToast(acceso ? "Fase finale visibile sul sito" : "Fase finale nascosta");
    } catch (errore) {
      console.error(errore);
      casella.checked = !acceso;
      mostraToast("Impossibile salvare. Riprova.", { errore: true });
    }
  });
}

// Chiudendo la pagina con modifiche non salvate il browser chiede conferma
window.addEventListener("beforeunload", (evento) => {
  if (stato.modificato && document.getElementById("tabellone-gestione")) evento.preventDefault();
});

/*
-----------------------------------
AVVIO
-----------------------------------
*/

export async function initTabellone() {
  const divisione = getSelectedDivision();
  const { teamsPath, calendarPath } = getPaths();
  const [salvato, squadre, calendario, visibile] = await Promise.all([
    getData(percorso()),
    getData(teamsPath),
    getData(calendarPath),
    getData(`${PERCORSO_IMPOSTAZIONI}/faseFinale`),
  ]);

  stato.salvato = tabelloneCompilato(salvato) ? salvato : null;
  stato.squadre = squadre || {};
  stato.bozza = creaTabellone({ precedente: salvato });

  $("tabellone-divisione").textContent = nomeDivisione(divisione) ? `· ${nomeDivisione(divisione)}` : "";

  // Suggerimenti: squadre della divisione e campi già usati in calendario
  $("tabellone-squadre").replaceChildren(
    ...Object.keys(stato.squadre)
      .map(nomeSquadra)
      .sort((a, b) => a.localeCompare(b, "it"))
      .map((nome) => new Option(nome))
  );
  const luoghi = new Set();
  Object.values(calendario || {}).forEach((giornata) =>
    Object.values(giornata || {}).forEach((partita) => partita?.Luogo && luoghi.add(partita.Luogo))
  );
  $("tabellone-luoghi").replaceChildren(...[...luoghi].sort().map((luogo) => new Option(luogo)));

  preparaVisibilita(Boolean(visibile));
  $("tabellone-terzo").addEventListener("change", (evento) =>
    cambiaFormato(stato.bozza.Squadre, evento.target.checked)
  );
  $("tabellone-salva").addEventListener("click", salva);
  $("tabellone-avanti").addEventListener("click", portaAvanti);
  $("tabellone-svuota").addEventListener("click", svuota);

  disegnaFormato();
  disegnaTurni();
  aggiornaAnteprima();
  segnaModificato(false);
}
