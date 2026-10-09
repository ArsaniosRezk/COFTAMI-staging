import { recuperaCalendario, scheletroCalendario } from "./components/calendario.js";
import { gestisciAttesaTorneo } from "./components/pre-torneo.js";
import { osservaDivisione, mostraErroreCaricamento } from "./dati-torneo.js";
import { giornateNumerate, dataPartita, haRisultato, nomeSquadra } from "./utils/torneo.js";
import { nomeDivisione } from "./divisione.js";

// Ascolto dei dati della divisione mostrata: va fermato quando si cambia divisione
let fermaAscolto = null;

const ID_DATI_STRUTTURATI = "dati-strutturati-partite";
const MASSIMO_EVENTI = 20;

/*
 Le prossime partite con data, descritte per i motori di ricerca (schema.org
 SportsEvent): Google può mostrarle nei risultati con data e luogo.
*/
function aggiornaDatiStrutturati({ calendario, divisione }) {
  const adesso = new Date();
  const eventi = [];

  for (const giornata of giornateNumerate(calendario)) {
    for (const [chiave, partita] of Object.entries(calendario[giornata] || {})) {
      const inizio = dataPartita(partita);
      if (!inizio || inizio < adesso || haRisultato(partita)) continue;
      const [casa, ospite] = chiave.split(":").map(nomeSquadra);
      eventi.push({
        "@type": "SportsEvent",
        name: `${casa} - ${ospite} (${[nomeDivisione(divisione), `giornata ${giornata}`].filter(Boolean).join(", ")})`,
        startDate: inizio.toISOString(),
        sport: "Calcio",
        eventStatus: "https://schema.org/EventScheduled",
        homeTeam: { "@type": "SportsTeam", name: casa },
        awayTeam: { "@type": "SportsTeam", name: ospite },
        organizer: { "@type": "SportsOrganization", name: "Cofta Milano", url: "https://coftamilano.com/" },
        ...(partita.Luogo
          ? { location: { "@type": "Place", name: partita.Luogo, address: partita.Luogo } }
          : {}),
      });
    }
  }

  document.getElementById(ID_DATI_STRUTTURATI)?.remove();
  if (!eventi.length) return;

  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.id = ID_DATI_STRUTTURATI;
  script.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": eventi.sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(0, MASSIMO_EVENTI),
  });
  document.head.appendChild(script);
}

// Sequenza esecuzione dei contenuti della pagina
// Chiamata da divisione.js all'avvio e a ogni cambio di divisione
export async function sequenzaEsecuzione() {
  fermaAscolto?.();
  scheletroCalendario("giornate");

  fermaAscolto = osservaDivisione(
    async (dati) => {
      if (await gestisciAttesaTorneo(dati.squadre)) return;
      recuperaCalendario(dati);
      aggiornaDatiStrutturati(dati);
    },
    { onLento: () => mostraErroreCaricamento(["giornate"]) }
  );
}
