import { classificaGirone, classificaMarcatori } from "/js/components/classifiche.js";
import { PERCORSO_IMPOSTAZIONI, PERCORSO_AMMINISTRATORI } from "/js/ambiente.js";
import { db, ref, get, set, update, remove, getData } from "/js/firebase.js";
import { edition, getSelectedDivision, nomeDivisione } from "/js/divisione.js";
import { impostaEdizioneLocale } from "/js/edizione-locale.js";
import { PAGINE_CONTROLLABILI, paginaAttiva } from "/js/pagine-attive.js";
import { utente, esci, chiaveEmail } from "/js/accesso.js";
import { leggiRegistro, annullaVoce, annullabile, descriviPercorso } from "/js/registro.js";
import { contaDaFare } from "/js/components/da-fare.js";
import { giornateNumerate, giornataCorrente, GIORNATA_AUTOMATICA } from "/js/utils/torneo.js";
import { mostraToast, conferma } from "/js/utils/interfaccia.js";
import { vaiASezione, aggiornaConteggi } from "/js/utils/gestionale-eventi.js";

/*
===================================
DASHBOARD
===================================
Cose da fare (solo se ce ne sono), classifiche della divisione scelta,
impostazioni del sito pubblico, registro delle modifiche, link per gli
arbitri e accessi.
*/

const $ = (id) => document.getElementById(id);
const settingsRef = () => ref(db, PERCORSO_IMPOSTAZIONI);

function crea(tag, classe = "", testo = null) {
  const elemento = document.createElement(tag);
  if (classe) elemento.className = classe;
  if (testo !== null) elemento.textContent = testo;
  return elemento;
}

// Salva un'impostazione e lo dice; se non riesce rimette com'era
async function salvaImpostazione(valori, messaggio, ripristina) {
  try {
    await update(settingsRef(), valori);
    mostraToast(messaggio);
  } catch (errore) {
    console.error("Impostazione non salvata:", errore);
    ripristina?.();
    mostraToast("Impossibile salvare. Riprova.", { errore: true });
  }
}

/*
-----------------------------------
DA FARE
-----------------------------------
*/

async function mostraDaFare() {
  const elenco = $("da-fare");
  const { refertiDaConfermare, iscrizioniNuove } = await contaDaFare();

  const voci = [];
  if (refertiDaConfermare) {
    voci.push({
      testo: `${refertiDaConfermare} ${refertiDaConfermare === 1 ? "referto da confermare" : "referti da confermare"}`,
      dettaglio: "Il risultato sul sito non è ancora quello del referto.",
      azione: "Apri i referti",
      sezione: "report",
    });
  }
  if (iscrizioniNuove) {
    voci.push({
      testo: `${iscrizioniNuove} ${iscrizioniNuove === 1 ? "iscrizione da convertire" : "iscrizioni da convertire"}`,
      dettaglio: "Arrivate dal modulo, non ancora diventate squadre.",
      azione: "Apri le iscrizioni",
      sezione: "iscrizioni",
    });
  }

  // Senza niente in attesa il pannello non occupa spazio
  $("pannello-da-fare").hidden = !voci.length;
  elenco.replaceChildren(
    ...voci.map(({ testo, dettaglio, azione, sezione }) => {
      const voce = crea("li", "da-fare-voce");
      const descrizione = crea("div");
      descrizione.append(crea("strong", "", testo), crea("p", "suggerimento", dettaglio));
      const pulsante = crea("button", "btn btn-principale", azione);
      pulsante.type = "button";
      pulsante.addEventListener("click", () => vaiASezione(sezione));
      voce.append(descrizione, pulsante);
      return voce;
    })
  );
}

/*
-----------------------------------
SITO PUBBLICO
-----------------------------------
*/

// Giornata in evidenza in home, per la divisione scelta
async function preparaGiornata() {
  const divisione = getSelectedDivision();
  const nome = nomeDivisione(divisione);
  $("divisione-giornata").textContent = nome ? `(${nome})` : "";
  const percorso = `Calcio/${edition}/${divisione}/GiornataDaMostrare`;

  const [perDivisione, globale, calendario] = await Promise.all([
    getData(percorso),
    getData(`Calcio/${edition}/GiornataDaMostrare`),
    getData(`Calcio/${edition}/${divisione}/Calendario`),
  ]);
  const impostata = perDivisione ?? globale;
  const automatica = giornataCorrente(calendario, null);

  const select = crea("select", "input");
  select.id = "matchday-to-show-input";
  const opzione = (valore, testo) => select.appendChild(new Option(testo, valore));
  opzione(GIORNATA_AUTOMATICA, automatica ? `Auto (${automatica})` : "Automatica");

  const numerate = giornateNumerate(calendario);
  const speciali = Object.keys(calendario || {})
    .filter((g) => !numerate.includes(g))
    .sort();
  [...numerate, ...speciali].forEach((giornata) =>
    opzione(giornata, /^\d+$/.test(giornata) ? `Giornata ${giornata}` : giornata)
  );

  // Un valore salvato che non è più nel calendario resta visibile
  const attuale =
    impostata === null || impostata === undefined || impostata === ""
      ? GIORNATA_AUTOMATICA
      : String(impostata);
  if (![...select.options].some((o) => o.value === attuale)) opzione(attuale, attuale);
  select.value = attuale;

  select.addEventListener("change", async () => {
    try {
      await set(ref(db, percorso), select.value);
      mostraToast(nome ? `Giornata in evidenza (${nome}) salvata` : "Giornata in evidenza salvata");
    } catch (errore) {
      console.error("Giornata non salvata:", errore);
      mostraToast("Impossibile salvare. Riprova.", { errore: true });
    }
  });

  $("matchday-selection").replaceChildren(select);
}

// Anni dal 2024 fino al prossimo, più quello salvato se fosse fuori da questo intervallo
function anniEdizione(corrente) {
  const ultimo = Math.max(new Date().getFullYear() + 1, Number(corrente) || 0);
  const anni = [];
  for (let anno = ultimo; anno >= 2024; anno--) anni.push(String(anno));
  if (corrente && !anni.includes(String(corrente))) anni.unshift(String(corrente));
  return anni;
}

function preparaImpostazioni(impostazioni) {
  const edizione = $("edition-select");
  const corrente = String(impostazioni.edizioneCorrente || edition);
  anniEdizione(corrente).forEach((anno) => edizione.appendChild(new Option(anno, anno)));
  edizione.value = corrente;

  edizione.addEventListener("change", async () => {
    const scelta = edizione.value;
    const ok = await conferma(
      `Il sito pubblico mostrerà l'edizione ${scelta} e il gestionale lavorerà su quella. Continuare?`,
      { titolo: "Cambiare edizione?", ok: `Passa al ${scelta}` }
    );
    if (!ok) {
      edizione.value = corrente;
      return;
    }
    await salvaImpostazione({ edizioneCorrente: scelta }, `Edizione ${scelta} impostata`);
    // I moduli già caricati hanno letto l'edizione vecchia: senza ricarica
    // il gestionale continuerebbe a scrivere sull'annata precedente
    impostaEdizioneLocale(scelta);
    location.reload();
  });

  // Divisione unica dell'edizione su cui lavora il gestionale (vedi divisione.js).
  // Dopo il salvataggio le pagine aperte, questa compresa, si ricaricano da sole
  const unica = $("toggle-divisione-unica");
  $("anno-divisione-unica").textContent = `(${edition})`;
  unica.checked = impostazioni.divisioneUnica?.[edition] === true;
  unica.addEventListener("change", async () => {
    const acceso = unica.checked;
    const ok = await conferma(
      acceso
        ? `Nel ${edition} tutte le squadre staranno insieme, senza Superiori e Giovani. ` +
            "Squadre e calendari già creati in Superiori o Giovani restano salvati ma non si vedono più: " +
            "le iscrizioni andranno convertite nella divisione unica."
        : `Nel ${edition} tornano le divisioni Superiori e Giovani. ` +
            "Squadre e calendario della divisione unica restano salvati ma non si vedono più.",
      {
        titolo: acceso ? "Usare una divisione unica?" : "Tornare a Superiori e Giovani?",
        ok: acceso ? "Usa la divisione unica" : "Torna a due divisioni",
      }
    );
    if (!ok) {
      unica.checked = !acceso;
      return;
    }
    await salvaImpostazione(
      { [`divisioneUnica/${edition}`]: acceso || null },
      acceso ? "Divisione unica attiva" : "Divisioni Superiori e Giovani attive",
      () => {
        unica.checked = !acceso;
      }
    );
  });

  const interruttori = [
    [
      "toggle-iscrizioni",
      "iscrizioniAperte",
      impostazioni.iscrizioniAperte !== false,
      "Iscrizioni aperte",
      "Iscrizioni chiuse",
    ],
    [
      "toggle-fase-finale",
      "faseFinale",
      Boolean(impostazioni.faseFinale),
      "Fase finale visibile",
      "Fase finale nascosta",
    ],
    [
      "toggle-manutenzione",
      "manutenzione",
      Boolean(impostazioni.manutenzione),
      "Manutenzione attiva: il sito è coperto",
      "Manutenzione disattivata",
    ],
  ];

  for (const [id, chiave, valore, testoAcceso, testoSpento] of interruttori) {
    const casella = $(id);
    casella.checked = valore;
    casella.addEventListener("change", async () => {
      const acceso = casella.checked;
      if (chiave === "manutenzione" && acceso) {
        const ok = await conferma(
          "Tutto il sito pubblico verrà coperto da un avviso finché non la disattivi.",
          {
            titolo: "Attivare la manutenzione?",
            ok: "Attiva",
            pericolosa: true,
          }
        );
        if (!ok) {
          casella.checked = false;
          return;
        }
      }
      await salvaImpostazione({ [chiave]: acceso }, acceso ? testoAcceso : testoSpento, () => {
        casella.checked = !acceso;
      });
    });
  }

  // Un interruttore per ogni pagina pubblica (Impostazioni/pagineAttive/<pagina>)
  $("pagine-attive").replaceChildren(
    ...PAGINE_CONTROLLABILI.map(({ chiave, nome }) => {
      const voce = crea("div", "impostazione");
      const etichetta = crea("span", "etichetta", nome);
      etichetta.id = `etichetta-pagina-${chiave}`;
      const testo = crea("div", "impostazione-testo");
      testo.appendChild(etichetta);

      const interruttore = crea("label", "modern-switch");
      const casella = crea("input");
      casella.type = "checkbox";
      casella.checked = paginaAttiva(impostazioni, chiave);
      casella.setAttribute("aria-labelledby", etichetta.id);
      casella.addEventListener("change", () => {
        const attiva = casella.checked;
        salvaImpostazione(
          { [`pagineAttive/${chiave}`]: attiva },
          `${nome}: ${attiva ? "visibile" : "nascosta"} sul sito`,
          () => {
            casella.checked = !attiva;
          }
        );
      });
      interruttore.append(casella, crea("span", "slider"));
      voce.append(testo, interruttore);
      return voce;
    })
  );
}

/*
-----------------------------------
ARBITRI
-----------------------------------
*/

function preparaArbitri() {
  $("copia-link-referto").addEventListener("click", async () => {
    const link = `${location.origin}/invia-report.html`;
    try {
      await navigator.clipboard.writeText(link);
      mostraToast("Link copiato: incollalo nel gruppo degli arbitri");
    } catch (errore) {
      mostraToast(link);
    }
  });
}

/*
-----------------------------------
ACCESSI
-----------------------------------
*/

const emailDaChiave = (chiave) => chiave.replace(/,/g, ".");

async function mostraAccessi() {
  const amministratori = await getData(PERCORSO_AMMINISTRATORI);
  const io = chiaveEmail(utente()?.email);

  $("elenco-accessi").replaceChildren(
    ...Object.keys(amministratori || {}).map((chiave) => {
      const riga = crea("div", "accesso");
      riga.appendChild(crea("span", "accesso-email", emailDaChiave(chiave)));

      if (chiave === io) {
        riga.appendChild(crea("span", "suggerimento", "Sei tu"));
      } else {
        const togli = crea("button", "btn btn-testo", "Togli");
        togli.type = "button";
        togli.setAttribute("aria-label", `Togli l'accesso a ${emailDaChiave(chiave)}`);
        togli.addEventListener("click", async () => {
          const ok = await conferma(`${emailDaChiave(chiave)} non potrà più entrare nel gestionale.`, {
            titolo: "Togliere l'accesso?",
            ok: "Togli",
            pericolosa: true,
          });
          if (!ok) return;
          try {
            await remove(ref(db, `${PERCORSO_AMMINISTRATORI}/${chiave}`));
            mostraToast("Accesso tolto");
            mostraAccessi();
          } catch (errore) {
            console.error(errore);
            mostraToast("Impossibile togliere l'accesso. Riprova.", { errore: true });
          }
        });
        riga.appendChild(togli);
      }
      return riga;
    })
  );
}

function preparaAccessi() {
  $("email-dashboard").textContent = utente()?.email || "";
  $("esci-dashboard").addEventListener("click", esci);

  $("aggiungi-accesso").addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const email = $("nuovo-accesso-email").value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      mostraToast("Scrivi un indirizzo email valido", { errore: true });
      return;
    }
    try {
      await set(ref(db, `${PERCORSO_AMMINISTRATORI}/${chiaveEmail(email)}`), true);
      mostraToast(`${email} può entrare nel gestionale`);
      $("nuovo-accesso-email").value = "";
      mostraAccessi();
    } catch (errore) {
      console.error(errore);
      mostraToast("Impossibile aggiungere l'accesso. Riprova.", { errore: true });
    }
  });

  return mostraAccessi();
}

/*
-----------------------------------
REGISTRO DELLE MODIFICHE
-----------------------------------
*/

const QUANTE_MODIFICHE = 15;
const formatoData = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
let ultimaVoceMostrata = null;

function rigaRegistro(voce) {
  const riga = crea("li", "registro-voce");

  const testo = crea("div", "registro-testo");
  const cosa = [...new Set((voce.modifiche || []).map((m) => descriviPercorso(m.percorso)))];
  const titolo =
    cosa.length > 2 ? `${cosa.slice(0, 2).join(", ")} e altre ${cosa.length - 2}` : cosa.join(", ");
  testo.appendChild(
    crea("strong", "", voce.tipo === "remove" ? `Eliminato: ${titolo}` : titolo || "Modifica")
  );
  const chi = `${voce.quando ? formatoData.format(new Date(voce.quando)) : ""} · ${voce.chi || "?"}`;
  testo.appendChild(crea("span", "suggerimento", chi));
  riga.appendChild(testo);

  if (annullabile(voce)) {
    const annulla = crea("button", "btn btn-testo", "Annulla");
    annulla.type = "button";
    annulla.addEventListener("click", async () => {
      const ok = await conferma(`I dati torneranno come prima di questa modifica:\n${titolo}`, {
        titolo: "Annullare la modifica?",
        ok: "Annulla la modifica",
        annulla: "Lascia così",
      });
      if (!ok) return;
      try {
        let esito = await annullaVoce(voce);
        if (esito.modificatoDopo) {
          const forza = await conferma(
            "Questi dati sono stati cambiati di nuovo dopo questa modifica. Annullandola si perdono anche le modifiche successive.",
            {
              titolo: "Modificati di nuovo",
              ok: "Annulla comunque",
              annulla: "Lascia così",
              pericolosa: true,
            }
          );
          if (!forza) return;
          esito = await annullaVoce(voce, { forza: true });
        }
        mostraToast("Modifica annullata");
        mostraRegistro();
      } catch (errore) {
        console.error(errore);
        mostraToast("Impossibile annullare. Riprova.", { errore: true });
      }
    });
    riga.appendChild(annulla);
  }
  return riga;
}

async function mostraRegistro({ continua = false } = {}) {
  const elenco = $("registro");
  if (!elenco) return;
  const voci = await leggiRegistro(QUANTE_MODIFICHE, continua ? ultimaVoceMostrata : null);
  if (!continua) elenco.replaceChildren();

  if (!voci.length && !continua) {
    elenco.appendChild(crea("li", "vuoto", "Nessuna modifica registrata."));
  }
  voci.forEach((voce) => elenco.appendChild(rigaRegistro(voce)));
  ultimaVoceMostrata = voci.at(-1)?.id ?? ultimaVoceMostrata;
  $("altre-modifiche").hidden = voci.length < QUANTE_MODIFICHE;
}

/*
-----------------------------------
AVVIO
-----------------------------------
*/

export const initDashboard = async () => {
  const impostazioni = (await get(settingsRef())).val() || {};

  // Il vecchio PIN era leggibile da chiunque: con l'accesso Google non serve più
  if (impostazioni.adminPin !== undefined) {
    update(settingsRef(), { adminPin: null }).catch(() => {});
  }

  preparaImpostazioni(impostazioni);
  const nome = nomeDivisione(getSelectedDivision());
  $("divisione-classifiche").textContent = nome ? `· ${nome}` : "";
  $("aggiorna-registro").addEventListener("click", () => mostraRegistro());
  $("altre-modifiche").addEventListener("click", () => mostraRegistro({ continua: true }));

  // La sezione compare quando tutto è disegnato
  await Promise.all([
    mostraDaFare(),
    preparaGiornata(),
    preparaArbitri(),
    preparaAccessi(),
    mostraRegistro(),
    classificaGirone("classifica-squadre", true),
    classificaMarcatori("classifica-gol"),
  ]).catch((errore) => console.error("Dashboard incompleta:", errore));

  aggiornaConteggi();
};
