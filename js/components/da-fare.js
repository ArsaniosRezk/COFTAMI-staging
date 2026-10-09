import { getData } from "../firebase.js";
import { edition, DIVISIONI, DIVISIONE_UNICA, divisioneUnica } from "../divisione.js";

/*
===================================
COSE DA FARE (gestionale)
===================================
- Referti da confermare: inviati da un arbitro ma con un risultato diverso
  da quello pubblicato (o non ancora pubblicato).
- Iscrizioni nuove: arrivate dal modulo e non ancora trasformate in squadra.
*/

// Il risultato sul sito è quello del referto: già confermato (i marcatori si possono
// correggere a mano dalla sezione Risultati senza farlo tornare "da confermare")
export function refertoConfermato(referto, partita) {
  if (!partita) return false;
  return (
    Number(partita.GolSquadraCasa) === Number(referto.GolSquadraCasa) &&
    Number(partita.GolSquadraOspite) === Number(referto.GolSquadraOspite)
  );
}

// Con la divisione unica conta solo la conversione fatta lì: un'iscrizione già
// diventata squadra in Superiori o Giovani va convertita di nuovo
export function iscrizioneConvertita(iscrizione) {
  if (iscrizione?.Stato !== "Convertita") return false;
  return !divisioneUnica() || iscrizione.ConvertitaIn === DIVISIONE_UNICA;
}

// Tutti i referti dell'edizione: [{ divisione, giornata, chiave, referto, partita }]
export async function leggiReferti() {
  const elenco = [];
  await Promise.all(
    DIVISIONI.map(async (divisione) => {
      const base = `Calcio/${edition}/${divisione}`;
      const [referti, partite] = await Promise.all([getData(`${base}/Referti`), getData(`${base}/Partite`)]);
      for (const [giornata, perPartita] of Object.entries(referti || {})) {
        for (const [chiave, referto] of Object.entries(perPartita || {})) {
          elenco.push({
            divisione,
            giornata,
            chiave,
            referto,
            partita: partite?.[giornata]?.[chiave] || null,
          });
        }
      }
    })
  );
  return elenco.sort((a, b) =>
    String(b.referto?.OraInvio || "").localeCompare(String(a.referto?.OraInvio || ""))
  );
}

export async function contaDaFare() {
  const [referti, iscrizioni] = await Promise.all([leggiReferti(), getData(`Calcio/${edition}/Iscrizioni`)]);
  return {
    refertiDaConfermare: referti.filter(({ referto, partita }) => !refertoConfermato(referto, partita))
      .length,
    iscrizioniNuove: Object.values(iscrizioni || {}).filter((iscrizione) => !iscrizioneConvertita(iscrizione))
      .length,
  };
}
