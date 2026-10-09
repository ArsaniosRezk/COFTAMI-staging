import { PERCORSO_IMPOSTAZIONI } from "./ambiente.js";
import { db, ref, onValue } from "./firebase.js";
import { impostaEdizione, impostaDivisioni, edizioneForzata } from "./divisione.js";

/*
===================================
IMPOSTAZIONI
===================================

Un solo ascolto in tempo reale su Impostazioni per tutta la pagina: prima
ogni componente rifaceva la stessa lettura (manutenzione, edizione, fase
finale, iscrizioni aperte...), una dopo l'altra.

- impostazioniPronte: si risolve al primo valore, dopo aver impostato
  l'edizione corrente. Le pagine la aspettano prima di leggere i dati.
- osservaImpostazioni(cb): cb riceve il valore attuale e ogni modifica
  (es. manutenzione attivata dal gestionale mentre la pagina è aperta).
*/

let ultime = null;
const ascoltatori = new Set();
let edizioneIniziale = null;
let divisioneUnicaIniziale = null;

export const impostazioniPronte = new Promise((resolve) => {
  onValue(
    ref(db, PERCORSO_IMPOSTAZIONI),
    (snapshot) => {
      ultime = snapshot.val() || {};
      const edizione = ultime.edizioneCorrente ? String(ultime.edizioneCorrente) : null;

      // Divisioni dell'edizione (vedi divisione.js)
      const divisioneUnica = JSON.stringify(ultime.divisioneUnica || {});

      if (edizioneIniziale === null) {
        edizioneIniziale = edizione;
        divisioneUnicaIniziale = divisioneUnica;
        impostaEdizione(edizione);
        impostaDivisioni(ultime.divisioneUnica);
      } else if (edizione && edizione !== edizioneIniziale && !edizioneForzata) {
        // L'amministratore ha cambiato edizione mentre la pagina era aperta:
        // i dati mostrati sono dell'annata precedente
        impostaEdizione(edizione);
        location.reload();
        return;
      } else if (divisioneUnica !== divisioneUnicaIniziale) {
        // Divisione unica accesa o spenta: i dati vanno letti da un'altra parte
        impostaDivisioni(ultime.divisioneUnica);
        location.reload();
        return;
      }

      resolve(ultime);
      ascoltatori.forEach((callback) => callback(ultime));
    },
    (errore) => {
      console.error("Impossibile leggere le impostazioni:", errore);
      ultime = ultime || {};
      resolve(ultime);
    }
  );
});

export function osservaImpostazioni(callback) {
  ascoltatori.add(callback);
  if (ultime) callback(ultime);
  return () => ascoltatori.delete(callback);
}

// Valore attuale (dopo impostazioniPronte)
export async function leggiImpostazioni() {
  return impostazioniPronte.then(() => ultime);
}
