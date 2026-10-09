import {
  push,
  set as setSdk,
  serverTimestamp,
  query,
  limitToLast,
  orderByKey,
  endBefore,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { PERCORSO_REGISTRO } from "./ambiente.js";
import { db, ref, get, update } from "./firebase.js";
import { nomeDivisione } from "./divisione.js";

/*
===================================
REGISTRO DELLE MODIFICHE
===================================

Ogni scrittura fatta dal gestionale finisce in Registro/<id>:

  { quando, chi, tipo, modifiche: [{ percorso, prima, dopo }] }

- prima/dopo: valore del percorso prima e dopo la modifica (assenti = vuoto).
  Con prima si può annullare la modifica dalla dashboard.
- Le bozze del calendario (salvate di continuo mentre si lavora) non si annotano.
- Valori molto grandi non si copiano (primaOmessa): quella voce non si può annullare.
*/

const NON_ANNOTARE = /\/(CalendarioBozza|CalendarioBloccate)(\/|$)/;
const DIMENSIONE_MASSIMA = 200_000;

function copiaLimitata(valore) {
  if (valore === undefined || valore === null) return { valore: null };
  const testo = JSON.stringify(valore);
  return testo.length > DIMENSIONE_MASSIMA ? { omesso: true } : { valore };
}

export function creaRegistro(utente) {
  const chi = utente.email;

  return {
    // Prima della scrittura: legge i valori attuali e restituisce la funzione
    // che annota la modifica quando la scrittura è riuscita
    async prima(tipo, valoriPerPercorso) {
      const percorsi = Object.keys(valoriPerPercorso).filter(
        (percorso) => !NON_ANNOTARE.test(percorso) && !percorso.startsWith(PERCORSO_REGISTRO)
      );
      if (!percorsi.length) return null;

      const precedenti = await Promise.all(
        percorsi.map((percorso) =>
          get(ref(db, percorso))
            .then((snapshot) => snapshot.val())
            .catch(() => null)
        )
      );

      return () => {
        const modifiche = percorsi.map((percorso, indice) => {
          const prima = copiaLimitata(precedenti[indice]);
          const dopo = copiaLimitata(valoriPerPercorso[percorso]);
          return {
            percorso,
            ...(prima.omesso ? { primaOmessa: true } : { prima: prima.valore }),
            ...(dopo.omesso ? { dopoOmesso: true } : { dopo: dopo.valore }),
          };
        });

        setSdk(push(ref(db, PERCORSO_REGISTRO)), {
          quando: serverTimestamp(),
          chi,
          tipo,
          modifiche,
        }).catch((errore) => console.error("Registro non aggiornato:", errore));
      };
    },

    file(percorso) {
      setSdk(push(ref(db, PERCORSO_REGISTRO)), {
        quando: serverTimestamp(),
        chi,
        tipo: "file",
        modifiche: [{ percorso }],
      }).catch((errore) => console.error("Registro non aggiornato:", errore));
    },
  };
}

// Ultime voci, dalla più recente. prima = chiave da cui continuare (pagina successiva)
export async function leggiRegistro(quante = 30, prima = null) {
  const vincoli = [orderByKey()];
  if (prima) vincoli.push(endBefore(prima));
  vincoli.push(limitToLast(quante));
  const snapshot = await get(query(ref(db, PERCORSO_REGISTRO), ...vincoli));
  const voci = [];
  snapshot.forEach((figlio) => {
    voci.push({ id: figlio.key, ...figlio.val() });
  });
  return voci.reverse();
}

export function annullabile(voce) {
  return (
    voce.tipo !== "file" &&
    Array.isArray(voce.modifiche) &&
    voce.modifiche.length > 0 &&
    voce.modifiche.every((modifica) => !modifica.primaOmessa)
  );
}

const uguali = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/*
 Riporta i percorsi della voce al valore di prima. Se nel frattempo qualcuno
 li ha cambiati di nuovo restituisce { modificatoDopo: true } senza toccare
 nulla, a meno di forzare.
*/
export async function annullaVoce(voce, { forza = false } = {}) {
  if (!annullabile(voce)) throw new Error("Questa modifica non si può annullare");

  if (!forza) {
    const attuali = await Promise.all(
      voce.modifiche.map((modifica) => get(ref(db, modifica.percorso)).then((s) => s.val()))
    );
    const cambiati = voce.modifiche.some(
      (modifica, indice) => !modifica.dopoOmesso && !uguali(attuali[indice], modifica.dopo)
    );
    if (cambiati) return { modificatoDopo: true };
  }

  const ripristino = Object.fromEntries(
    voce.modifiche.map((modifica) => [modifica.percorso, modifica.prima ?? null])
  );
  await update(ref(db), ripristino);
  return { annullata: true };
}

/*
 Descrizione leggibile di un percorso, es.
 Calcio/2026/Superiori/Partite/3/A:B -> "Risultato · Superiori · Giornata 3 · A – B"
*/
const NOMI_NODI = {
  Partite: "Risultato",
  Calendario: "Calendario",
  Squadre: "Squadra",
  Referti: "Referto",
  GiornataDaMostrare: "Giornata da mostrare",
  Iscrizioni: "Iscrizione",
  FaseFinale: "Fase finale",
};

export function descriviPercorso(percorso) {
  const parti = percorso.split("/");
  const squadre = (chiave) => chiave.replace(/_/g, ".").replace(":", " – ");

  if (parti[0] === "Calcio") {
    if (parti[1] === "AlboOro") return "Albo d'oro";
    const [, edizione, terzo, nodo, giornata, partita, campo] = parti;
    if (terzo === "Iscrizioni") return `Iscrizione · ${squadre(nodo || "tutte")}`;
    if (terzo === "GiornataDaMostrare") return `Giornata da mostrare · edizione ${edizione}`;
    const etichetta = [NOMI_NODI[nodo] || nodo || "Divisione", nomeDivisione(terzo)];
    if (nodo === "Squadre") {
      if (giornata) etichetta.push(squadre(giornata));
      if (partita) etichetta.push(partita);
    } else {
      if (giornata) etichetta.push(/^\d+$/.test(giornata) ? `Giornata ${giornata}` : giornata);
      if (partita) etichetta.push(squadre(partita));
      if (campo) etichetta.push(campo);
    }
    return etichetta.filter(Boolean).join(" · ");
  }

  if (parti[0].startsWith("Impostazioni")) {
    return parti.length > 1 ? `Impostazione · ${parti.slice(1).join(" › ")}` : "Impostazioni";
  }
  if (parti[0] === "Amministratori") {
    return `Amministratori · ${(parti[1] || "").replace(/,/g, ".")}`;
  }
  if (parti[0] === "Loghi") return "Logo caricato";
  return percorso;
}
