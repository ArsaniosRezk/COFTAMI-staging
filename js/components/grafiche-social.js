import { edition, nomeDivisione } from "../divisione.js";

import { partiteGiornata, calcolaClassifiche } from "./social/dati.js";
import {
  W,
  H,
  H_STORIA,
  FONT_TITOLI,
  FONT_TESTO,
  LOGO_COFTA,
  PARTITE_PER_PAGINA,
  caricaImmagine,
  preparaSquadre,
  font,
} from "./social/disegno.js";
import { disegnaPaginaPartite, disegnaPaginaClassifica, disegnaStoria } from "./social/pagine.js";

// I dati per le grafiche si leggono da qui (management/social.js)
export { caricaDatiSocial } from "./social/dati.js";

/*
===================================
GRAFICHE SOCIAL
===================================

Disegna su canvas i post Instagram (1080x1350, formato 4:5) di calendario,
risultati e classifica di una divisione, più una storia (1080x1920) per ogni
partita giocata con i marcatori, e li restituisce come PNG.

I loghi delle squadre stanno su Firebase Storage: per poterli disegnare ed
esportare il bucket deve avere il CORS abilitato. Se un logo non si carica
al suo posto compare un cerchio con le iniziali e la grafica resta esportabile.

Divisa in social/dati.js, social/disegno.js e social/pagine.js; qui
si mettono insieme le pagine richieste e si esportano come PNG.
*/

/*
-----------------------------------
GENERAZIONE
-----------------------------------
*/

async function preparaRisorse() {
  await Promise.all([
    document.fonts.load(font(400, 100, FONT_TITOLI)),
    document.fonts.load(font(800, 30, FONT_TESTO)),
    document.fonts.load(font(700, 30, FONT_TESTO)),
    document.fonts.load(font(600, 30, FONT_TESTO)),
  ]);
  return { logoCofta: await caricaImmagine(LOGO_COFTA) };
}

function nuovaTela(altezza = H) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = altezza;
  return canvas;
}

function esporta(canvas, nome) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve({ nome, blob });
      else reject(new Error(`Impossibile esportare ${nome}`));
    }, "image/png");
  });
}

function nomeFile(division, tipo, suffisso = "") {
  return `${["COFTA", edition, nomeDivisione(division), tipo].filter(Boolean).join("-")}${suffisso}.png`;
}

/**
 * Genera le grafiche richieste per una divisione.
 * @param {object} dati - risultato di caricaDatiSocial()
 * @param {string[]} tipi - "calendario", "risultati", "classifica", "storie"
 * @param {string} giornata - giornata per calendario, risultati e storie
 * @returns {Promise<{immagini: {nome, blob}[], messaggi: string[], loghiMancanti: string[]}>}
 */
export async function generaGrafiche(dati, tipi, giornata) {
  const risorse = await preparaRisorse();
  const loghiMancanti = new Set();
  const squadre = await preparaSquadre(dati, loghiMancanti);

  const immagini = [];
  const messaggi = [];

  for (const tipo of tipi) {
    if (tipo !== "classifica") {
      if (!giornata) {
        messaggi.push("Il calendario non è ancora stato creato.");
        continue;
      }

      let partite = partiteGiornata(dati, giornata);
      if (tipo !== "calendario") partite = partite.filter((p) => p.giocata);

      if (partite.length === 0) {
        messaggi.push(
          tipo === "calendario"
            ? `Nessuna partita in calendario per la giornata ${giornata}.`
            : `Nessun risultato inserito per la giornata ${giornata}.`
        );
        continue;
      }

      if (tipo === "storie") {
        for (const partita of partite) {
          const canvas = nuovaTela(H_STORIA);
          disegnaStoria(canvas.getContext("2d"), risorse, {
            partita,
            squadre,
            giornata,
            division: dati.division,
          });
          const sigla = (chiave) => chiave.replace(/[^A-Za-z0-9]+/g, "");
          const suffisso = `-G${giornata}-${sigla(partita.casa)}-${sigla(partita.ospite)}`;
          immagini.push(await esporta(canvas, nomeFile(dati.division, "Storia", suffisso)));
        }
        continue;
      }

      const pagine = Math.ceil(partite.length / PARTITE_PER_PAGINA);
      // Pagine bilanciate: 6 partite diventano 3+3, non 5+1
      const perPagina = Math.ceil(partite.length / pagine);
      for (let pagina = 0; pagina < pagine; pagina++) {
        const canvas = nuovaTela();
        disegnaPaginaPartite(canvas.getContext("2d"), risorse, {
          partite: partite.slice(pagina * perPagina, (pagina + 1) * perPagina),
          squadre,
          modalita: tipo,
          giornata,
          division: dati.division,
          pagina,
        });
        const titolo = tipo === "risultati" ? "Risultati" : "Calendario";
        const suffisso = `-G${giornata}` + (pagine > 1 ? `-${pagina + 1}` : "");
        immagini.push(await esporta(canvas, nomeFile(dati.division, titolo, suffisso)));
      }
    }

    if (tipo === "classifica") {
      if (Object.keys(dati.squadre).length === 0) {
        messaggi.push("Nessuna squadra: impossibile generare la classifica.");
        continue;
      }
      const { classifiche, ultimaGiornata } = calcolaClassifiche(dati);
      for (const { girone, righe } of classifiche) {
        const canvas = nuovaTela();
        disegnaPaginaClassifica(canvas.getContext("2d"), risorse, {
          righe,
          squadre,
          girone,
          ultimaGiornata,
          division: dati.division,
        });
        const suffisso = girone ? `-Girone${girone}` : "";
        immagini.push(await esporta(canvas, nomeFile(dati.division, "Classifica", suffisso)));
      }
    }
  }

  return { immagini, messaggi, loghiMancanti: [...loghiMancanti] };
}
