import { impostazioniPronte } from "./impostazioni.js";
import { DIVISIONI, nomeDivisione } from "./divisione.js";
import { osservaDivisione, mostraErroreCaricamento } from "./dati-torneo.js";
import { classificaGirone, scheletroClassifica } from "./components/classifiche.js";

/*
===================================
CLASSIFICA COMPLETA
===================================
Le classifiche di tutte le divisioni nella stessa pagina (es. da
proiettare durante le partite). Si aggiornano in tempo reale.

La divisione si passa esplicitamente: la scelta salvata dal visitatore
nell'header del sito non viene toccata.
*/

// Un blocco per divisione, nell'ordine di DIVISIONI. Con la divisione unica
// resta solo il primo, senza titolo
const BLOCCHI = [
  { contenitore: "superiori", titolo: "space1" },
  { contenitore: "giovani", titolo: "space2" },
];

BLOCCHI.forEach(({ contenitore }) => scheletroClassifica(contenitore));

await impostazioniPronte;

BLOCCHI.forEach(({ contenitore, titolo }, indice) => {
  const divisione = DIVISIONI[indice];
  const elementoTitolo = document.getElementById(titolo);
  elementoTitolo.textContent = nomeDivisione(divisione).toUpperCase();
  elementoTitolo.style.display = elementoTitolo.textContent ? "" : "none";
  document.getElementById(contenitore).closest(".division-container").style.display = divisione ? "" : "none";
  if (!divisione) return;

  osservaDivisione((dati) => classificaGirone(contenitore, false, dati), {
    divisione,
    onLento: () => mostraErroreCaricamento([contenitore]),
  });
});
