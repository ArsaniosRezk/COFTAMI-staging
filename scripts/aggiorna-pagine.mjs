/*
===================================
AGGIORNA PAGINE
===================================

npm run pagine            riscrive le pagine pubbliche
npm run pagine -- --verifica   controlla soltanto che siano aggiornate (CI)

Ogni pagina pubblica ha la stessa cornice: <head> (titolo, descrizione,
anteprime per i social, font, fogli di stile), header con il menu, footer.
La cornice è scritta qui sotto una volta sola e copiata in ogni pagina,
così header e menu sono già nell'HTML: compaiono subito, anche prima che
parta JavaScript, e li vedono i motori di ricerca.

Nelle pagine si modifica solo quello che sta tra
  <!-- inizio contenuto -->  e  <!-- fine contenuto -->
Tutto il resto (titolo, descrizione, menu, footer, fogli di stile, script)
si cambia qui e poi si rilancia lo script.
*/

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const SITO = "https://coftamilano.com";
const IMMAGINE_SOCIAL = `${SITO}/assets/images/og-cofta.png`;
const VERSIONE_FIREBASE = "10.12.2";

// Voci del menu, nell'ordine in cui compaiono
const MENU = [
  { href: "/", testo: "Home", voce: "home" },
  { href: "/campionato.html", testo: "Campionato", voce: "campionato" },
  { href: "/squadre.html", testo: "Squadre", voce: "squadre" },
  { href: "/calendario.html", testo: "Calendario", voce: "calendario" },
  { href: "/regolamento.html", testo: "Regolamento", voce: "regolamento" },
  { href: "/albo-doro.html", testo: "Albo d'Oro", voce: "albo-doro" },
  { href: "/galleria.html", testo: "Galleria", voce: "galleria" },
  { href: "/iscrizione.html", testo: "Iscrizioni", voce: "iscrizione" },
];

const ORGANIZZAZIONE = {
  "@context": "https://schema.org",
  "@type": "SportsOrganization",
  name: "Cofta Milano",
  url: `${SITO}/`,
  logo: `${SITO}/assets/icons/icona-512.png`,
  email: "info@coftamilano.com",
  sport: "Calcio",
  sameAs: ["https://www.instagram.com/coftamilano"],
};

/*
 Configurazione delle pagine:
 - voce: voce del menu evidenziata
 - divisione: mostra il selettore Superiori/Giovani nell'header (nascosto
   comunque nelle edizioni con la divisione unica, vedi js/divisione.js)
 - firebase: la pagina legge i dati del torneo (precarica l'SDK)
 - css / js: fogli e script propri della pagina
*/
const PAGINE = [
  {
    file: "index.html",
    url: "/",
    titolo: "Cofta Milano - Il campionato di calcio diocesano",
    titoloSocial: "Cofta Milano - Il campionato diocesano",
    descrizione:
      "Cofta Milano - Campionato di calcio diocesano. Classifiche, risultati, calendario e squadre del torneo Cofta.",
    voce: "home",
    divisione: true,
    firebase: true,
    css: ["home", "partite", "tabelle", "overlay-partite", "tabellone"],
    js: ["funzioniHome"],
    jsonld: [
      ORGANIZZAZIONE,
      { "@context": "https://schema.org", "@type": "WebSite", name: "Cofta Milano", url: `${SITO}/` },
    ],
  },
  {
    file: "campionato.html",
    titolo: "Classifica e marcatori - Cofta",
    titoloSocial: "Classifica e marcatori - Cofta Milano",
    descrizione:
      "Classifica aggiornata e classifica marcatori del campionato di calcio diocesano Cofta Milano.",
    voce: "campionato",
    divisione: true,
    firebase: true,
    css: ["campionato", "tabelle", "tabellone"],
    js: ["funzioniCampionato"],
  },
  {
    file: "squadre.html",
    titolo: "Squadre - Cofta",
    titoloSocial: "Le squadre - Cofta Milano",
    descrizione:
      "Tutte le squadre del campionato di calcio diocesano Cofta Milano, con partite, marcatori e rosa.",
    voce: "squadre",
    divisione: true,
    firebase: true,
    css: ["squadre"],
    js: ["funzioniSquadre"],
  },
  {
    file: "squadra.html",
    titolo: "Squadra - Cofta",
    titoloSocial: "Squadra - Cofta Milano",
    descrizione:
      "Posizione in classifica, partite, risultati, marcatori e rosa di una squadra del torneo Cofta Milano.",
    voce: "squadre",
    divisione: false,
    firebase: true,
    css: ["calendario", "partite", "tabelle", "overlay-partite", "squadra"],
    js: ["funzioniSquadra"],
  },
  {
    file: "calendario.html",
    titolo: "Calendario - Cofta",
    titoloSocial: "Calendario e risultati - Cofta Milano",
    descrizione:
      "Calendario completo, orari, campi e risultati del campionato di calcio diocesano Cofta Milano.",
    voce: "calendario",
    divisione: true,
    firebase: true,
    css: ["calendario", "partite", "overlay-partite"],
    js: ["funzioniCalendario"],
  },
  {
    file: "regolamento.html",
    titolo: "Regolamento - Cofta",
    titoloSocial: "Regolamento - Cofta Milano",
    descrizione:
      "Regolamento del torneo di calcio diocesano Cofta Milano: iscrizioni, partite, sanzioni e fase finale.",
    voce: "regolamento",
    divisione: false,
    firebase: false,
    css: ["regolamento"],
    js: [],
  },
  {
    file: "albo-doro.html",
    titolo: "Albo d'Oro - Cofta",
    titoloSocial: "Albo d'oro - Cofta Milano",
    descrizione:
      "Albo d'oro del torneo Cofta Milano: vincitori, finalisti e capocannonieri di tutte le edizioni.",
    voce: "albo-doro",
    divisione: false,
    firebase: true,
    css: ["tabelle"],
    js: ["funzioniAlboOro"],
  },
  {
    file: "galleria.html",
    titolo: "Galleria - Cofta",
    titoloSocial: "Galleria fotografica - Cofta Milano",
    descrizione: "Le foto più belle del torneo di calcio diocesano Cofta Milano.",
    voce: "galleria",
    divisione: false,
    firebase: false,
    css: ["galleria"],
    js: ["galleria"],
  },
  {
    file: "iscrizione.html",
    titolo: "Iscrizione squadra - Cofta",
    titoloSocial: "Iscrivi la tua squadra - Cofta Milano",
    descrizione: "Modulo di iscrizione al torneo Cofta Milano: iscrivi la tua squadra parrocchiale.",
    voce: "iscrizione",
    divisione: false,
    firebase: true,
    css: ["iscrizione"],
    js: ["iscrizione"],
  },
  {
    file: "privacy.html",
    titolo: "Privacy e cookie - Cofta",
    titoloSocial: "Privacy e cookie - Cofta Milano",
    descrizione: "Informativa sul trattamento dei dati personali e sui cookie del sito Cofta Milano.",
    voce: null,
    divisione: false,
    firebase: false,
    css: ["regolamento"],
    js: [],
  },
];

const escape = (testo) =>
  String(testo).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function vociMenu(pagina, { classe = "", indentazione }) {
  return MENU.map(({ href, testo, voce }) => {
    const attiva = voce === pagina.voce;
    const classi = [classe, attiva && classe ? "active" : ""].filter(Boolean).join(" ");
    return `${indentazione}<li><a${classi ? ` class="${classi}"` : ""} href="${href}"${attiva ? ' aria-current="page"' : ""}>${escape(testo)}</a></li>`;
  }).join("\n");
}

function testa(pagina) {
  const url = `${SITO}${pagina.url ?? `/${pagina.file}`}`;
  const firebase = pagina.firebase
    ? `
  <!-- SDK Firebase: senza questi il download partirebbe solo dopo firebase.js -->
  <link rel="modulepreload" href="https://www.gstatic.com/firebasejs/${VERSIONE_FIREBASE}/firebase-app.js" />
  <link rel="modulepreload" href="https://www.gstatic.com/firebasejs/${VERSIONE_FIREBASE}/firebase-database.js" />
  <link rel="preconnect" href="https://cofta-mi-default-rtdb.europe-west1.firebasedatabase.app" />`
    : "";
  const jsonld = (pagina.jsonld || [])
    .map((dati) => `\n  <script type="application/ld+json">${JSON.stringify(dati)}</script>`)
    .join("");

  return `  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>${escape(pagina.titolo)}</title>
  <meta name="description" content="${escape(pagina.descrizione)}" />
  <link rel="canonical" href="${url}" />
  <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
  <meta name="theme-color" content="#0f1a15" media="(prefers-color-scheme: dark)" />

  <!-- Anteprima nei link condivisi (WhatsApp, Instagram, Telegram...) -->
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Cofta Milano" />
  <meta property="og:locale" content="it_IT" />
  <meta property="og:title" content="${escape(pagina.titoloSocial)}" />
  <meta property="og:description" content="${escape(pagina.descrizione)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${IMMAGINE_SOCIAL}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />

  <link rel="icon" type="image/svg+xml" href="/assets/images/favicon.svg" />
  <link rel="apple-touch-icon" href="/assets/icons/apple-touch-icon.png" />
  <link rel="manifest" href="/manifest.webmanifest" />

  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />${firebase}
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Montserrat:wght@300..800&display=swap"
    rel="stylesheet" />

  <link rel="stylesheet" href="/css/base.css" />
  <link rel="stylesheet" href="/css/icone.css" />
${pagina.css.map((nome) => `  <link rel="stylesheet" href="/css/${nome}.css" />`).join("\n")}${jsonld}`;
}

function header(pagina) {
  return `    <header class="sito-header">
      <div class="sito-header-interno">
        <div class="left-header">
          <a href="/" aria-label="Cofta Milano, vai alla home">
            <img src="/assets/images/LOGO_COFTA_SITO.svg" width="130" height="58" class="logo" alt="Cofta Milano" />
          </a>

          <!-- Fonte del valore per gli script: lo comandano i pulsanti qui sotto -->
          <select id="division" hidden tabindex="-1" aria-hidden="true">
            <option value="Superiori">Superiori</option>
            <option value="Giovani">Giovani</option>
          </select>
          <div class="division-switch" role="group" aria-label="Divisione"${pagina.divisione ? "" : " hidden"}>
            <button type="button" data-division="Superiori">Superiori</button>
            <button type="button" data-division="Giovani">Giovani</button>
          </div>
        </div>

        <div class="right-header">
          <nav class="nav" aria-label="Menu principale">
            <ul>
${vociMenu(pagina, { classe: "nav-link", indentazione: "              " })}
            </ul>
          </nav>
          <button type="button" class="menu-icon hide-hamb" aria-label="Apri il menu" aria-expanded="false"
            aria-controls="overlay-menu-container">
            <i class="icona icona-bars" aria-hidden="true"></i>
          </button>
          <div id="overlay-menu-container" role="dialog" aria-modal="true" aria-label="Menu">
            <button type="button" class="close-menu-icon" aria-label="Chiudi il menu">
              <i class="icona icona-xmark" aria-hidden="true"></i>
            </button>
            <ul id="overlay-menu">
              <li class="voce-logo">
                <a href="/" aria-label="Home" tabindex="-1">
                  <img src="/assets/images/LOGO_COFTA_SITO.svg" width="150" height="67" class="logo" alt="" />
                </a>
              </li>
${vociMenu(pagina, { indentazione: "              " })}
            </ul>
          </div>
        </div>
      </div>
    </header>`;
}

function footer(pagina) {
  return `    <footer class="sito-footer">
      <div class="footer-grid">
        <nav class="footer-menu" aria-label="Menu nel piè di pagina">
          <h2 class="footer-titolo">Menu</h2>
          <ul>
${vociMenu(pagina, { indentazione: "            " })}
          </ul>
        </nav>
        <div class="footer-logo">
          <a href="/" aria-label="Home"><img src="/assets/images/LOGO_COFTA_SITO_3.svg" width="83" height="90" class="logo"
              alt="Cofta Milano" loading="lazy" /></a>
        </div>
        <div class="footer-contacts">
          <h2 class="footer-titolo">Contatti</h2>
          <p>Per maggiori info manda una <br />mail a: <a href="mailto:info@coftamilano.com"><b>info@coftamilano.com</b></a></p>
          <div class="contacts-icon">
            <a href="https://www.instagram.com/coftamilano" aria-label="Instagram di Cofta Milano" rel="noopener"
              target="_blank"><i class="icona icona-instagram contact-icon" aria-hidden="true"></i></a>
            <a href="mailto:info@coftamilano.com" aria-label="Scrivi una mail a Cofta Milano"><i
                class="icona icona-envelope contact-icon" aria-hidden="true"></i></a>
          </div>
        </div>
      </div>
      <div class="footer-legale">
        <span>© Cofta Milano</span>
        <a href="/privacy.html"${pagina.file === "privacy.html" ? ' aria-current="page"' : ""}>Privacy e cookie</a>
        <button type="button" data-preferenze-cookie>Preferenze cookie</button>
      </div>
    </footer>`;
}

function script(pagina) {
  return ["sito", ...pagina.js]
    .map((nome) => `  <script type="module" src="/js/${nome}.js"></script>`)
    .join("\n");
}

const INIZIO = "<!-- inizio contenuto -->";
const FINE = "<!-- fine contenuto -->";

// Su Windows Git può restituire i file con i fine riga CRLF: si confronta sempre in LF
const leggi = (file) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");

function contenutoDi(file) {
  const html = leggi(file);
  const inizio = html.indexOf(INIZIO);
  const fine = html.indexOf(FINE);
  if (inizio < 0 || fine < 0) throw new Error(`${file}: mancano i segnaposto del contenuto`);
  return html
    .slice(inizio + INIZIO.length, fine)
    .replace(/^\n/, "")
    .replace(/\s*$/, "\n");
}

function componi(pagina, contenuto) {
  return `<!DOCTYPE html>
<html lang="it">

<!-- Cornice generata da scripts/aggiorna-pagine.mjs: si modifica solo il contenuto -->
<head>
${testa(pagina)}
</head>

<body>
  <a class="salta-al-contenuto" href="#contenuto">Vai al contenuto</a>
  <div class="grid">
${header(pagina)}

    <main id="contenuto">
      ${INIZIO}
${contenuto}      ${FINE}
    </main>

${footer(pagina)}
  </div>

${script(pagina)}
</body>

</html>
`;
}

const verifica = process.argv.includes("--verifica");
const daAggiornare = [];

for (const pagina of PAGINE) {
  if (!existsSync(pagina.file)) throw new Error(`${pagina.file} non esiste`);
  const attuale = leggi(pagina.file);
  const nuova = componi(pagina, contenutoDi(pagina.file));
  if (nuova === attuale) continue;
  daAggiornare.push(pagina.file);
  if (!verifica) writeFileSync(pagina.file, nuova);
}

if (verifica && daAggiornare.length) {
  console.error(`Pagine da aggiornare con "npm run pagine": ${daAggiornare.join(", ")}`);
  process.exit(1);
}
console.log(daAggiornare.length ? `Aggiornate: ${daAggiornare.join(", ")}` : "Pagine già aggiornate");
