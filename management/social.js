import { caricaDatiSocial, generaGrafiche } from "/js/components/grafiche-social.js";
import { getSelectedDivision } from "/js/divisione.js";

// Immagini generate: { nome, blob, url, selezionata }
let immaginiCorrenti = [];

export const initSocial = async () => {
  const division = document.getElementById("division")?.value || getSelectedDivision();
  const contenuto = document.getElementById("social-content");
  const giornataSelect = contenuto.querySelector("#social-giornata-select");
  const bottoni = contenuto.querySelectorAll(".social-buttons button");

  let dati;
  try {
    dati = await caricaDatiSocial(division);
  } catch (errore) {
    console.error("Errore caricamento dati social:", errore);
    mostraStato("Impossibile caricare i dati del torneo.", true);
    return;
  }

  // Se nel frattempo si è cambiata sezione o divisione questo contenuto è
  // stato sostituito: il nuovo ha già il suo initSocial
  if (!contenuto.isConnected) return;

  dati.giornate.forEach((giornata) => {
    const option = document.createElement("option");
    option.value = giornata;
    option.textContent = giornata;
    giornataSelect.appendChild(option);
  });

  if (dati.giornate.includes(dati.giornataDaMostrare)) {
    giornataSelect.value = dati.giornataDaMostrare;
  } else if (dati.giornate.length) {
    giornataSelect.value = dati.giornate[dati.giornate.length - 1];
  } else {
    giornataSelect.disabled = true;
  }

  bottoni.forEach((bottone) => {
    bottone.addEventListener("click", async () => {
      const tipi = bottone.dataset.tipi.split(",");
      bottoni.forEach((b) => (b.disabled = true));
      mostraStato("Generazione delle immagini in corso…");

      try {
        const esito = await generaGrafiche(dati, tipi, giornataSelect.value);
        // Immagini della divisione di prima: non vanno nel contenuto nuovo
        if (contenuto.isConnected) mostraRisultato(esito);
      } catch (errore) {
        console.error("Errore generazione grafiche:", errore);
        mostraStato(`Errore durante la generazione: ${errore.message}`, true);
      } finally {
        bottoni.forEach((b) => (b.disabled = false));
      }
    });
  });

  document.getElementById("social-seleziona").addEventListener("click", () => {
    const tutteSelezionate = immaginiCorrenti.every((img) => img.selezionata);
    immaginiCorrenti.forEach((img) => (img.selezionata = !tutteSelezionate));
    aggiornaSelezione();
  });

  document.getElementById("social-scarica").addEventListener("click", () => scarica(selezionate()));

  document.getElementById("social-condividi").addEventListener("click", () => condividi(selezionate()));
};

function selezionate() {
  return immaginiCorrenti.filter((img) => img.selezionata);
}

function mostraStato(html, errore = false) {
  const stato = document.getElementById("social-stato");
  if (!stato) return;
  stato.hidden = !html;
  stato.classList.toggle("errore", errore);
  stato.innerHTML = html;
}

function mostraRisultato({ immagini, messaggi, loghiMancanti }) {
  const avvisi = [...new Set(messaggi)];

  if (loghiMancanti.length) {
    avvisi.push(
      `Loghi non caricati (sostituiti dalle iniziali): <b>${loghiMancanti.join(", ")}</b>.<br>` +
        "Se mancano tutti, il bucket di Firebase Storage non ha il CORS abilitato. " +
        "Va fatto una volta sola dalla Cloud Shell di Google Cloud:" +
        '<code>echo \'[{"origin":["*"],"method":["GET"],"maxAgeSeconds":3600}]\' > cors.json\n' +
        "gsutil cors set cors.json gs://cofta-mi.appspot.com</code>"
    );
  }

  if (immagini.length) {
    avvisi.unshift(
      `${immagini.length} ${immagini.length === 1 ? "immagine generata" : "immagini generate"}.`
    );
  }

  mostraStato(avvisi.join("<br><br>"), immagini.length === 0);
  mostraAnteprime(immagini);
}

function mostraAnteprime(immagini) {
  const contenitore = document.getElementById("social-anteprime");
  const azioni = document.getElementById("social-azioni");
  if (!contenitore) return;

  immaginiCorrenti.forEach((img) => URL.revokeObjectURL(img.url));
  immaginiCorrenti = immagini.map(({ nome, blob }) => ({
    nome,
    blob,
    url: URL.createObjectURL(blob),
    selezionata: false,
  }));
  contenitore.innerHTML = "";

  immaginiCorrenti.forEach((immagine) => {
    const scheda = document.createElement("div");
    scheda.className = "social-anteprima";

    // Toccare l'immagine la seleziona o deseleziona
    const selettore = document.createElement("button");
    selettore.type = "button";
    selettore.className = "social-selettore";
    selettore.setAttribute("aria-label", `Seleziona ${immagine.nome}`);

    const img = document.createElement("img");
    img.src = immagine.url;
    img.alt = immagine.nome;

    const spunta = document.createElement("span");
    spunta.className = "social-spunta";
    spunta.innerHTML = '<i class="icona icona-check-semplice" aria-hidden="true"></i>';

    selettore.append(img, spunta);
    selettore.addEventListener("click", () => {
      immagine.selezionata = !immagine.selezionata;
      aggiornaSelezione();
    });

    // Download della singola immagine
    const link = document.createElement("a");
    link.className = "social-scarica-singola";
    link.href = immagine.url;
    link.download = immagine.nome;
    link.innerHTML = '<i class="icona icona-download" aria-hidden="true"></i>';
    link.append(immagine.nome);

    scheda.append(selettore, link);
    immagine.scheda = scheda;
    contenitore.appendChild(scheda);
  });

  azioni.hidden = immaginiCorrenti.length === 0;
  aggiornaSelezione();
}

function aggiornaSelezione() {
  const scelte = selezionate();
  const numero = scelte.length;
  const tutte = numero === immaginiCorrenti.length && numero > 0;

  immaginiCorrenti.forEach((img) => img.scheda?.classList.toggle("selezionata", img.selezionata));

  document.querySelector("#social-seleziona span").textContent = tutte
    ? "Deseleziona tutte"
    : "Seleziona tutte";

  const scarica = document.getElementById("social-scarica");
  scarica.disabled = numero === 0;
  scarica.querySelector("span").textContent =
    numero === 0 ? "Scarica selezionate" : `Scarica selezionate (${numero})`;

  const condividi = document.getElementById("social-condividi");
  condividi.hidden = !puoCondividere();
  condividi.disabled = numero === 0;
  condividi.querySelector("span").textContent =
    numero === 0 ? "Condividi / Salva in galleria" : `Condividi / Salva in galleria (${numero})`;
}

function comeFile(immagini) {
  return immagini.map(({ nome, blob }) => new File([blob], nome, { type: "image/png" }));
}

function puoCondividere() {
  return (
    immaginiCorrenti.length > 0 &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: comeFile(immaginiCorrenti.slice(0, 1)) })
  );
}

async function condividi(immagini) {
  if (immagini.length === 0) return;
  try {
    await navigator.share({ files: comeFile(immagini) });
  } catch (errore) {
    // Chiudere il pannello di condivisione non è un errore
    if (errore.name !== "AbortError") {
      console.error("Condivisione non riuscita:", errore);
      scarica(immagini);
    }
  }
}

async function scarica(immagini) {
  for (const { nome, url } of immagini) {
    const link = document.createElement("a");
    link.href = url;
    link.download = nome;
    document.body.appendChild(link);
    link.click();
    link.remove();

    // Alcuni browser ignorano i download lanciati tutti insieme
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
}
