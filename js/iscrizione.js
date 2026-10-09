import { PERCORSO_IMPOSTAZIONI } from "./ambiente.js";
import { getData, setData, uploadFile, attivaAppCheck } from "./firebase.js";
import { edition, divisioneUnica, DIVISIONE_UNICA } from "./divisione.js";
import { impostazioniPronte, osservaImpostazioni } from "./impostazioni.js";
import { capitalize } from "./utils/formattazione.js";
import { pulisciTelefono, telefonoValido } from "./utils/contatti.js";

/*
===================================
ISCRIZIONE SQUADRA (form pubblico)
===================================
Salva su: Calcio/{edizione}/Iscrizioni/{Divisione}-{NomeSquadra}
*/

// Numero di righe mostrate all'apertura del modulo
const RIGHE_INIZIALI = {
  responsabili: 2,
  allenatori: 3,
  giocatori: 10,
  arbitri: 1,
};

// Quante persone servono come minimo per ogni sezione (0 = facoltativa)
const MINIMI = {
  responsabili: 1,
  allenatori: 1,
  giocatori: 7,
  arbitri: 0,
};

// Nome e cognome: almeno due parole di 2+ lettere, niente numeri
const NOME_REGEX = /^[A-Za-zÀ-ÖØ-öø-ÿ'’-]{2,}(?:\s+[A-Za-zÀ-ÖØ-öø-ÿ'’-]{2,})+$/;

// MODULO DI PARTECIPAZIONE firmato: è obbligatorio per poter inviare l'iscrizione
const MODULO_MAX_BYTE = 10 * 1024 * 1024;

// Tipo MIME accettato -> estensione usata per il file su Storage
const MODULO_TIPI = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

// Le foto dal telefono vengono ridotte prima dell'invio: lato lungo massimo e
// qualità JPEG. Un foglio A4 resta leggibile e il caricamento è molto più rapido.
const FOTO_LATO_MASSIMO = 2400;
const FOTO_QUALITA = 0.85;
const FOTO_DA_RIDURRE_BYTE = 1.5 * 1024 * 1024;

// Prima della compressione si accettano foto più pesanti del limite finale
const FOTO_MAX_BYTE_ORIGINALE = 40 * 1024 * 1024;

// L'edizione arriva dalle impostazioni: la chiave va calcolata al momento
const chiaveBozza = () => `cofta_iscrizione_bozza_${edition}`;

const SEZIONI = ["responsabili", "allenatori", "giocatori", "arbitri"];

const PLACEHOLDER = {
  responsabili: "Nome e Cognome",
  allenatori: "Nome e Cognome",
  giocatori: "Nome e Cognome",
  arbitri: "Nome e Cognome",
};

const ETICHETTA = {
  responsabili: { singolare: "responsabile", plurale: "responsabili" },
  allenatori: { singolare: "allenatore", plurale: "allenatori" },
  giocatori: { singolare: "giocatore", plurale: "giocatori" },
  arbitri: { singolare: "arbitro", plurale: "arbitri" },
};

/*
-----------------------------------
HELPER
-----------------------------------
*/

function normalizzaSpazi(valore) {
  return valore.replace(/\s+/g, " ").trim();
}

function nomeValido(nome) {
  return NOME_REGEX.test(normalizzaSpazi(nome));
}

// Firebase non accetta . # $ / [ ] nelle chiavi
function chiaveSicura(valore) {
  return normalizzaSpazi(valore)
    .replace(/[.#$/[\]]/g, "_")
    .replace(/\s/g, "_");
}

/*
-----------------------------------
MODULO DI PARTECIPAZIONE FIRMATO
-----------------------------------
*/

// Il file caricato e' leggibile da chi ne conosce l'URL: il percorso
// non deve essere indovinabile partendo dal nome della squadra
function codiceCasuale() {
  const valori = new Uint8Array(8);
  crypto.getRandomValues(valori);
  return [...valori].map((v) => v.toString(16).padStart(2, "0")).join("");
}

function fileModulo() {
  return document.getElementById("isc-modulo").files[0] || null;
}

function formattaDimensione(byte) {
  const mega = byte / (1024 * 1024);
  return mega >= 1 ? `${mega.toFixed(1)} MB` : `${Math.ceil(byte / 1024)} KB`;
}

// Aggiorna l'etichetta del selettore con il file scelto
function mostraFileScelto() {
  const etichetta = document.getElementById("modulo-nome");
  const selettore = document.querySelector(".file-picker");
  const file = fileModulo();

  if (!file) {
    etichetta.textContent = "Allega il modulo firmato";
    selettore.classList.remove("pieno");
    return;
  }

  etichetta.textContent = `${file.name} (${formattaDimensione(file.size)})`;
  selettore.classList.add("pieno");
}

// Restituisce il messaggio di errore, oppure "" se il file va bene
function erroreModulo(file) {
  if (!file) {
    return "Allega il MODULO DI PARTECIPAZIONE firmato: senza non possiamo accettare l'iscrizione.";
  }
  if (!MODULO_TIPI[file.type]) {
    return "Formato non valido: allega il modulo in PDF, JPG o PNG.";
  }
  const eFoto = file.type.startsWith("image/");
  if (eFoto && file.size <= FOTO_MAX_BYTE_ORIGINALE) return "";
  if (file.size > MODULO_MAX_BYTE) {
    return `Il file pesa ${formattaDimensione(file.size)}: il limite è 10 MB.`;
  }
  return "";
}

// Riduce una foto del modulo (JPG/PNG) prima del caricamento.
// I PDF e le immagini già leggere restano invariati.
async function preparaModulo(file) {
  if (!file.type.startsWith("image/") || file.size <= FOTO_DA_RIDURRE_BYTE) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scala = Math.min(1, FOTO_LATO_MASSIMO / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scala);
    canvas.height = Math.round(bitmap.height * scala);
    const contesto = canvas.getContext("2d");
    // Sfondo bianco: un PNG trasparente diventerebbe nero in JPEG
    contesto.fillStyle = "#fff";
    contesto.fillRect(0, 0, canvas.width, canvas.height);
    contesto.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", FOTO_QUALITA));
    if (!blob || blob.size >= file.size) return file;

    const nome = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], nome, { type: "image/jpeg" });
  } catch (errore) {
    console.warn("Impossibile ridurre la foto, si invia l'originale:", errore);
    return file;
  }
}

/*
-----------------------------------
COSTRUZIONE RIGHE
-----------------------------------
*/

function creaRiga(sezione, rimovibile) {
  const riga = document.createElement("div");
  riga.className = "persona-row";

  const nomeInput = document.createElement("input");
  nomeInput.type = "text";
  nomeInput.className = "p-nome";
  nomeInput.placeholder = PLACEHOLDER[sezione];
  nomeInput.spellcheck = false;
  nomeInput.autocomplete = "off";

  const telInput = document.createElement("input");
  telInput.type = "tel";
  telInput.className = "p-tel";
  telInput.placeholder = "Telefono";
  telInput.inputMode = "tel";
  telInput.autocomplete = "off";

  const rimuovi = document.createElement("button");
  rimuovi.type = "button";
  rimuovi.className = rimovibile ? "row-remove" : "row-remove placeholder";
  rimuovi.innerHTML = '<i class="icona icona-xmark" aria-hidden="true"></i>';
  rimuovi.title = "Rimuovi";
  rimuovi.setAttribute("aria-label", `Rimuovi questo ${ETICHETTA[sezione].singolare}`);
  if (rimovibile) {
    rimuovi.addEventListener("click", () => {
      riga.remove();
      salvaBozza();
    });
  } else {
    rimuovi.disabled = true;
    rimuovi.setAttribute("aria-hidden", "true");
  }

  const errore = document.createElement("p");
  errore.className = "row-error";

  riga.appendChild(nomeInput);
  riga.appendChild(telInput);
  riga.appendChild(rimuovi);
  riga.appendChild(errore);

  return riga;
}

function aggiungiRiga(sezione, rimovibile = true, valori = null) {
  const lista = document.getElementById(`lista-${sezione}`);
  const riga = creaRiga(sezione, rimovibile);
  if (valori) {
    riga.querySelector(".p-nome").value = valori.Nome || "";
    riga.querySelector(".p-tel").value = valori.Telefono || "";
  }
  lista.appendChild(riga);
  return riga;
}

/*
-----------------------------------
VALIDAZIONE
-----------------------------------
*/

function segnalaErroreRiga(riga, messaggio) {
  riga.querySelector(".row-error").textContent = messaggio;
  riga.querySelector(".p-nome").classList.add("invalid");
}

function pulisciErrori() {
  document.querySelectorAll(".row-error, .group-error, .field-error").forEach((el) => (el.textContent = ""));
  document.querySelectorAll(".invalid").forEach((el) => el.classList.remove("invalid"));
  document.getElementById("form-error").textContent = "";
}

// Legge una sezione e restituisce le persone valide + il numero di errori
function raccogliSezione(sezione) {
  const lista = document.getElementById(`lista-${sezione}`);
  const righe = [...lista.querySelectorAll(".persona-row")];
  const persone = [];
  const nomiVisti = new Set();
  let errori = 0;

  righe.forEach((riga) => {
    const nomeInput = riga.querySelector(".p-nome");
    const telInput = riga.querySelector(".p-tel");
    const nome = normalizzaSpazi(nomeInput.value);
    const telefono = telInput.value.trim();

    // Riga completamente vuota: viene semplicemente ignorata
    if (!nome && !telefono) return;

    if (!nome) {
      segnalaErroreRiga(riga, "Inserisci il nome: è obbligatorio se indichi un numero.");
      errori++;
      return;
    }

    if (!nomeValido(nome)) {
      segnalaErroreRiga(riga, "Scrivi nome e cognome per esteso (niente soprannomi).");
      errori++;
      return;
    }

    if (!telefono) {
      segnalaErroreRiga(riga, "Il numero di telefono è obbligatorio quando inserisci un nome.");
      telInput.classList.add("invalid");
      errori++;
      return;
    }

    if (!telefonoValido(telefono)) {
      segnalaErroreRiga(riga, "Numero di telefono non valido (8-15 cifre).");
      telInput.classList.add("invalid");
      errori++;
      return;
    }

    const nomeNormalizzato = capitalize(nome);
    if (nomiVisti.has(nomeNormalizzato.toLowerCase())) {
      segnalaErroreRiga(riga, `${nomeNormalizzato} è già stato inserito in questa sezione.`);
      errori++;
      return;
    }
    nomiVisti.add(nomeNormalizzato.toLowerCase());

    persone.push({
      Nome: nomeNormalizzato,
      Telefono: pulisciTelefono(telefono),
    });
  });

  const minimo = MINIMI[sezione];
  if (errori === 0 && persone.length < minimo) {
    const etichetta = minimo === 1 ? ETICHETTA[sezione].singolare : ETICHETTA[sezione].plurale;
    document.getElementById(`err-${sezione}`).textContent =
      `Inserisci almeno ${minimo} ${etichetta} con il relativo numero di telefono.`;
    errori++;
  }

  return { persone, errori };
}

/*
-----------------------------------
BOZZA (salvataggio locale)
-----------------------------------
*/

function leggiSezioneGrezza(sezione) {
  const lista = document.getElementById(`lista-${sezione}`);
  return [...lista.querySelectorAll(".persona-row")].map((riga) => ({
    Nome: riga.querySelector(".p-nome").value,
    Telefono: riga.querySelector(".p-tel").value,
  }));
}

function salvaBozza() {
  try {
    const bozza = {
      Divisione: document.getElementById("isc-divisione").value,
      NomeSquadra: document.getElementById("isc-chiesa").value,
    };
    SEZIONI.forEach((sezione) => {
      bozza[sezione] = leggiSezioneGrezza(sezione);
    });
    localStorage.setItem(chiaveBozza(), JSON.stringify(bozza));
    document.getElementById("draft-info").textContent =
      "I dati inseriti restano salvati su questo dispositivo finché non invii il modulo.";
  } catch (error) {
    console.warn("Impossibile salvare la bozza:", error);
  }
}

function cancellaBozza() {
  try {
    localStorage.removeItem(chiaveBozza());
  } catch (error) {
    console.warn("Impossibile cancellare la bozza:", error);
  }
  document.getElementById("draft-info").textContent = "";
}

function caricaBozza() {
  try {
    const salvata = localStorage.getItem(chiaveBozza());
    return salvata ? JSON.parse(salvata) : null;
  } catch (error) {
    console.warn("Bozza non leggibile:", error);
    return null;
  }
}

/*
-----------------------------------
INIZIALIZZAZIONE MODULO
-----------------------------------
*/

function costruisciModulo(bozza) {
  SEZIONI.forEach((sezione) => {
    document.getElementById(`lista-${sezione}`).innerHTML = "";

    const salvate = bozza?.[sezione]?.length ? bozza[sezione] : null;
    const totale = salvate ? Math.max(salvate.length, RIGHE_INIZIALI[sezione]) : RIGHE_INIZIALI[sezione];

    // Le righe di responsabili e allenatori sono fisse: non si possono rimuovere
    const fissa = sezione === "responsabili" || sezione === "allenatori";

    for (let i = 0; i < totale; i++) {
      aggiungiRiga(sezione, !fissa, salvate?.[i] || null);
    }
  });

  if (bozza) {
    if (bozza.Divisione) {
      document.getElementById("isc-divisione").value = bozza.Divisione;
    }
    document.getElementById("isc-chiesa").value = bozza.NomeSquadra || "";
    document.getElementById("draft-info").textContent =
      "I dati inseriti restano salvati su questo dispositivo finché non invii il modulo.";
  }
}

/*
-----------------------------------
INVIO
-----------------------------------
*/

async function inviaIscrizione(event) {
  event.preventDefault();
  pulisciErrori();

  // Il percorso dipende dall'edizione corrente, letta dalle impostazioni
  await impostazioniPronte;

  const submitBtn = document.getElementById("submit-btn");
  const divisioneEl = document.getElementById("isc-divisione");
  const chiesaEl = document.getElementById("isc-chiesa");

  let errori = 0;

  // Con la divisione unica la divisione non si sceglie
  const divisione = divisioneUnica() ? DIVISIONE_UNICA : divisioneEl.value;
  const traParentesi = divisioneUnica() ? "" : ` (${divisione})`;
  if (!divisione) {
    document.getElementById("err-divisione").textContent = "Seleziona la divisione.";
    divisioneEl.classList.add("invalid");
    errori++;
  }

  const nomeSquadra = normalizzaSpazi(chiesaEl.value);
  if (nomeSquadra.length < 3) {
    document.getElementById("err-chiesa").textContent =
      "Inserisci il nome della chiesa (almeno 3 caratteri).";
    chiesaEl.classList.add("invalid");
    errori++;
  }

  const modulo = fileModulo();
  const problemaModulo = erroreModulo(modulo);
  if (problemaModulo) {
    document.getElementById("err-modulo").textContent = problemaModulo;
    document.querySelector(".file-picker").classList.add("invalid");
    errori++;
  }

  const privacy = document.getElementById("isc-privacy");
  if (!privacy.checked) {
    document.getElementById("err-privacy").textContent =
      "Per inviare l'iscrizione serve la conferma sulla privacy.";
    privacy.closest(".consenso").classList.add("invalid");
    errori++;
  }

  const raccolte = {};
  SEZIONI.forEach((sezione) => {
    raccolte[sezione] = raccogliSezione(sezione);
    errori += raccolte[sezione].errori;
  });

  if (errori > 0) {
    document.getElementById("form-error").textContent = "Controlla i campi evidenziati e riprova.";
    document
      .querySelector(".invalid, .group-error:not(:empty)")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  const chiave = `${divisione}-${chiaveSicura(nomeSquadra)}`;
  const percorso = `Calcio/${edition}/Iscrizioni/${chiave}`;

  submitBtn.disabled = true;
  submitBtn.textContent = "Invio in corso...";

  try {
    // Ricontrollo: le iscrizioni potrebbero essere state chiuse mentre il modulo era aperto
    const impostazioni = await getData(PERCORSO_IMPOSTAZIONI);
    if (impostazioni && impostazioni.iscrizioniAperte === false) {
      document.getElementById("iscrizione-form").classList.add("hidden");
      document.getElementById("iscrizioni-chiuse").classList.remove("hidden");
      return;
    }

    // Il modulo firmato viene caricato solo ora: se l'iscrizione non parte
    // non lasciamo file orfani su Storage
    submitBtn.textContent = "Preparazione del modulo...";
    const daCaricare = await preparaModulo(modulo);

    if (daCaricare.size > MODULO_MAX_BYTE) {
      document.getElementById("err-modulo").textContent =
        `Il file pesa ${formattaDimensione(daCaricare.size)}: il limite è 10 MB.`;
      document.querySelector(".file-picker").classList.add("invalid");
      document.getElementById("form-error").textContent = "Controlla l'allegato e riprova.";
      return;
    }

    const estensione = MODULO_TIPI[daCaricare.type];
    const percorsoModulo = `Moduli/${edition}/${chiave}-${codiceCasuale()}.${estensione}`;

    try {
      // Il modulo è privato: chi lo carica non può rileggerlo, serve solo il percorso
      await uploadFile(percorsoModulo, daCaricare, {
        conUrl: false,
        onProgress: (avanzamento) => {
          submitBtn.textContent = `Caricamento del modulo... ${Math.round(avanzamento * 100)}%`;
        },
      });
    } catch (error) {
      console.error("Errore durante il caricamento del modulo:", error);
      document.getElementById("err-modulo").textContent =
        "Non siamo riusciti a caricare l'allegato. Riprova, oppure scrivi a info@coftamilano.com.";
      document.querySelector(".file-picker").classList.add("invalid");
      document.getElementById("form-error").textContent =
        "Iscrizione non inviata: il modulo firmato non è stato caricato.";
      document.querySelector(".file-picker").scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    submitBtn.textContent = "Invio in corso...";

    const iscrizione = {
      Divisione: divisione,
      NomeSquadra: nomeSquadra,
      Responsabili: raccolte.responsabili.persone,
      Allenatori: raccolte.allenatori.persone,
      Giocatori: raccolte.giocatori.persone,
      Arbitri: raccolte.arbitri.persone,
      ModuloFirmato: {
        NomeFile: daCaricare.name,
        Percorso: percorsoModulo,
      },
      OraInvio: new Date().toISOString(),
      Stato: "Nuova",
      ConsensoPrivacy: new Date().toISOString(),
    };

    try {
      await setData(percorso, iscrizione);
    } catch (error) {
      // Le regole accettano solo iscrizioni nuove: un nome già usato viene rifiutato
      if (
        String(error?.code || error?.message)
          .toUpperCase()
          .includes("PERMISSION")
      ) {
        document.getElementById("err-chiesa").textContent =
          `Risulta già un'iscrizione per "${nomeSquadra}"${traParentesi}. ` +
          "Per modificarla scrivi a info@coftamilano.com; se è un'altra squadra aggiungi una lettera (A, B…) al nome.";
        chiesaEl.classList.add("invalid");
        document.getElementById("form-error").textContent =
          "Iscrizione non inviata: controlla il nome della squadra.";
        chiesaEl.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      throw error;
    }

    cancellaBozza();

    const confermaEl = document.getElementById("conferma-testo");
    confermaEl.textContent =
      `Abbiamo ricevuto l'iscrizione di ${nomeSquadra}${traParentesi}. ` +
      "Ti contatteremo con le istruzioni per versare la quota di iscrizione. " +
      "Per qualsiasi modifica scrivi a info@coftamilano.com.";

    document.getElementById("iscrizione-form").classList.add("hidden");
    document.getElementById("iscrizione-inviata").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    console.error("Errore durante l'invio dell'iscrizione:", error);
    document.getElementById("form-error").textContent =
      "Errore durante l'invio. Controlla la connessione e riprova.";
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Invia iscrizione";
  }
}

/*
-----------------------------------
AVVIO
-----------------------------------
*/

document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("iscrizione-form");
  attivaAppCheck();

  // Il modulo viene costruito subito: se la rete è lenta l'utente vede comunque i campi
  costruisciModulo(caricaBozza());

  // Con la divisione unica il campo "Divisione" sparisce (vedi divisione.js)
  const campoDivisione = document.getElementById("isc-divisione").closest(".field");
  campoDivisione.classList.toggle("hidden", divisioneUnica());
  impostazioniPronte.then(() => campoDivisione.classList.toggle("hidden", divisioneUnica()));

  // Alcuni browser ripristinano il file scelto tornando indietro: riallineo l'etichetta
  mostraFileScelto();

  document.getElementById("add-giocatore").addEventListener("click", () => {
    aggiungiRiga("giocatori").querySelector(".p-nome").focus();
  });

  document.getElementById("add-arbitro").addEventListener("click", () => {
    aggiungiRiga("arbitri").querySelector(".p-nome").focus();
  });

  // Formato e dimensione si controllano subito: inutile far compilare
  // tutto il modulo per poi rifiutare l'allegato all'invio
  document.getElementById("isc-modulo").addEventListener("change", () => {
    mostraFileScelto();
    const problema = fileModulo() ? erroreModulo(fileModulo()) : "";
    document.getElementById("err-modulo").textContent = problema;
    document.querySelector(".file-picker").classList.toggle("invalid", Boolean(problema));
  });

  form.addEventListener("submit", inviaIscrizione);

  // Salvataggio bozza (con debounce)
  let timerBozza;
  form.addEventListener("input", () => {
    clearTimeout(timerBozza);
    timerBozza = setTimeout(salvaBozza, 800);
  });

  document.getElementById("nuova-iscrizione-btn").addEventListener("click", () => {
    document.getElementById("iscrizione-inviata").classList.add("hidden");
    form.classList.remove("hidden");
    form.reset();
    pulisciErrori();
    mostraFileScelto();
    costruisciModulo(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // Iscrizioni aperte/chiuse (interruttore nel gestionale), anche a pagina aperta.
  // Chi ha appena inviato continua a vedere la conferma.
  osservaImpostazioni((impostazioni) => {
    if (!document.getElementById("iscrizione-inviata").classList.contains("hidden")) return;
    const chiuse = impostazioni.iscrizioniAperte === false;
    form.classList.toggle("hidden", chiuse);
    document.getElementById("iscrizioni-chiuse").classList.toggle("hidden", !chiuse);
  });
});
