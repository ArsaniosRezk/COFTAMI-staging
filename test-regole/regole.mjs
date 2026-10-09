/*
 TEST DELLE REGOLE DEL DATABASE (database.rules.json)
 npm run test:regole
 Gira sull'emulatore di Firebase, in locale: serve Java (17 o più recente).
 Controlla chi può leggere e scrivere cosa: pubblico, arbitri, amministratori.
*/
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { ref, get, set, update, remove } from "firebase/database";

const REGOLE = readFileSync(new URL("../database.rules.json", import.meta.url), "utf8");

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-cofta",
    database: { rules: REGOLE, host: "127.0.0.1", port: 9000 },
  });
});

after(async () => {
  await env?.cleanup();
});

const DATI = {
  Amministratori: { "mario,rossi@gmail,com": true },
  Impostazioni: { edizioneCorrente: "2026", iscrizioniAperte: true },
  ImpostazioniTest: { iscrizioniAperte: false },
  Registro: { a: { chi: "x" } },
  Calcio: {
    AlboOro: { Superiori: { 2025: { PrimoClassificato: "S_ Marco" } } },
    2026: {
      GiornataDaMostrare: "auto",
      Iscrizioni: { "Superiori-Esistente": { NomeSquadra: "Esistente", Divisione: "Superiori" } },
      Superiori: {
        Squadre: { A: { Girone: "A" }, B: { Girone: "A" } },
        Calendario: { 1: { "A:B": { Data: "", Orario: "", Luogo: "" } } },
        Partite: { 1: { "A:B": { GolSquadraCasa: 1, GolSquadraOspite: 0 } } },
        Referti: { 2: { "B:A": { NomeArbitro: "x" } } },
        CalendarioBozza: { stato: "{}" },
      },
    },
    Test: {
      Superiori: {
        Calendario: { 1: { "A:B": { Data: "" } } },
      },
    },
  },
  "Beach Volley": {
    Accesso: { Pin: "sabbia123", Sessioni: { vecchia: "pinvecchio" } },
    Impostazioni: { edizioneCorrente: "2026", iscrizioniAperte: true },
    2026: {
      Iscrizioni: { "Maschile-Esistente": { NomeSquadra: "Esistente", Divisione: "Maschile" } },
      Maschile: { Squadre: { A: { Nome: "A" } } },
    },
  },
};

beforeEach(async () => {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await set(ref(ctx.database(), "/"), DATI);
  });
});

const anonimo = () => env.unauthenticatedContext().database();
const admin = () =>
  env.authenticatedContext("u1", { email: "Mario.Rossi@gmail.com", email_verified: true }).database();
const adminNonVerificato = () =>
  env.authenticatedContext("u2", { email: "mario.rossi@gmail.com", email_verified: false }).database();
const qualcuno = () =>
  env.authenticatedContext("u3", { email: "altro@gmail.com", email_verified: true }).database();

const iscrizione = (extra = {}) => ({
  Divisione: "Superiori",
  NomeSquadra: "San Giorgio",
  Responsabili: [{ Nome: "Mario Rossi", Telefono: "3331234567" }],
  Allenatori: [{ Nome: "Luca Bianchi", Telefono: "3331234568" }],
  Giocatori: [{ Nome: "Paolo Verdi", Telefono: "3331234569" }],
  ModuloFirmato: { NomeFile: "modulo.pdf", Percorso: "Moduli/2026/Superiori-San_Giorgio-abc.pdf" },
  OraInvio: new Date().toISOString(),
  Stato: "Nuova",
  ConsensoPrivacy: new Date().toISOString(),
  ...extra,
});

const referto = (extra = {}) => ({
  NomeArbitro: "Giovanni",
  SquadraCasa: "A",
  SquadraOspite: "B",
  GolSquadraCasa: 2,
  GolSquadraOspite: 1,
  Marcatori: { MarcatoriCasa: { Pippo: 2 }, MarcatoriOspite: { Pluto: 1 } },
  MVP: "Pippo",
  Commenti: "",
  Divisione: "Superiori",
  OraInvio: new Date().toISOString(),
  ...extra,
});

// --- LETTURE PUBBLICHE ---

test("il pubblico legge impostazioni, albo d'oro, squadre, calendario, partite, giornata, fase finale e referti", async () => {
  const db = anonimo();
  for (const percorso of [
    "Impostazioni",
    "ImpostazioniTest",
    "Calcio/AlboOro",
    "Calcio/2026/GiornataDaMostrare",
    "Calcio/2026/Superiori/Squadre",
    "Calcio/2026/Superiori/Calendario",
    "Calcio/2026/Superiori/Partite",
    "Calcio/2026/Superiori/Referti",
    "Calcio/2026/Superiori/FaseFinale",
  ]) {
    await assertSucceeds(get(ref(db, percorso)));
  }
});

test("il pubblico NON legge iscrizioni, bozze, registro, elenco degli amministratori", async () => {
  const db = anonimo();
  for (const percorso of [
    "Calcio/2026/Iscrizioni",
    "Calcio/2026/Iscrizioni/Superiori-Esistente",
    "Calcio/2026/Superiori/CalendarioBozza",
    "Calcio/2026/Superiori",
    "Calcio",
    "Registro",
    "Amministratori",
    "/",
  ]) {
    await assertFails(get(ref(db, percorso)));
  }
});

test("il pubblico NON scrive i dati del torneo né le impostazioni", async () => {
  const db = anonimo();
  await assertFails(set(ref(db, "Impostazioni/manutenzione"), true));
  await assertFails(set(ref(db, "Calcio/2026/Superiori/Partite/1/A:B/GolSquadraCasa"), 5));
  await assertFails(set(ref(db, "Calcio/2026/Superiori/Squadre/C"), { Girone: "A" }));
  await assertFails(set(ref(db, "Amministratori/hacker@x,com"), true));
  await assertFails(remove(ref(db, "Calcio/2026/Superiori/Calendario")));
  await assertFails(set(ref(db, "Calcio/2026/Superiori/FaseFinale/Squadre"), 2));
});

// --- ISCRIZIONI ---

test("iscrizione nuova dal modulo pubblico: accettata se le iscrizioni sono aperte", async () => {
  await assertSucceeds(set(ref(anonimo(), "Calcio/2026/Iscrizioni/Superiori-San_Giorgio"), iscrizione()));
});

test("iscrizione: non si sovrascrive una già presente e non si cancella", async () => {
  const db = anonimo();
  await assertFails(set(ref(db, "Calcio/2026/Iscrizioni/Superiori-Esistente"), iscrizione()));
  await assertFails(remove(ref(db, "Calcio/2026/Iscrizioni/Superiori-Esistente")));
});

test("iscrizione: rifiutata a iscrizioni chiuse (staging: ImpostazioniTest)", async () => {
  await assertFails(set(ref(anonimo(), "Calcio/Test/Iscrizioni/Superiori-San_Giorgio"), iscrizione()));
  await env.withSecurityRulesDisabled((ctx) =>
    set(ref(ctx.database(), "Impostazioni/iscrizioniAperte"), false)
  );
  await assertFails(set(ref(anonimo(), "Calcio/2026/Iscrizioni/Superiori-Nuova"), iscrizione()));
});

test("iscrizione: dati non validi rifiutati", async () => {
  const db = anonimo();
  const percorso = "Calcio/2026/Iscrizioni/Superiori-San_Giorgio";
  await assertFails(set(ref(db, percorso), iscrizione({ Divisione: "Adulti" })));
  await assertFails(set(ref(db, percorso), iscrizione({ NomeSquadra: "x".repeat(61) })));
  const senzaModulo = iscrizione();
  delete senzaModulo.ModuloFirmato;
  await assertFails(set(ref(db, percorso), senzaModulo));
  await assertFails(
    set(ref(db, percorso), iscrizione({ ModuloFirmato: { NomeFile: "a", Percorso: "Loghi/brutto.png" } }))
  );
});

test("iscrizione nella divisione unica: solo se l'edizione ha la divisione unica", async () => {
  const db = anonimo();
  const unica = iscrizione({ Divisione: "Unica" });
  await assertFails(set(ref(db, "Calcio/2026/Iscrizioni/Unica-San_Giorgio"), unica));
  await env.withSecurityRulesDisabled((ctx) =>
    set(ref(ctx.database(), "Impostazioni/divisioneUnica/2026"), true)
  );
  await assertSucceeds(set(ref(db, "Calcio/2026/Iscrizioni/Unica-San_Giorgio"), unica));
});

// --- REFERTI ---

test("referto per una partita in calendario: accettato senza codice e senza accesso", async () => {
  await assertSucceeds(set(ref(anonimo(), "Calcio/2026/Superiori/Referti/1/A:B"), referto()));
});

test("referto: rifiutato per partite fuori calendario, già inviate o con dati non validi", async () => {
  const db = anonimo();
  await assertFails(set(ref(db, "Calcio/2026/Superiori/Referti/9/A:B"), referto()));
  await assertFails(set(ref(db, "Calcio/2026/Superiori/Referti/2/B:A"), referto()));
  await assertFails(set(ref(db, "Calcio/2026/Superiori/Referti/1/A:B"), referto({ GolSquadraCasa: "2" })));
  await assertFails(set(ref(db, "Calcio/2026/Superiori/Referti/1/A:B"), referto({ Divisione: "Giovani" })));
  await assertFails(set(ref(db, "Calcio/2026/Superiori/Referti/1/A:B"), referto({ NomeArbitro: "" })));
});

test("referto anche sullo staging (edizione Test)", async () => {
  await assertSucceeds(set(ref(anonimo(), "Calcio/Test/Superiori/Referti/1/A:B"), referto()));
});

// --- AMMINISTRATORI ---

test("l'amministratore (email verificata, con i punti nell'indirizzo) legge e scrive tutto", async () => {
  const db = admin();
  await assertSucceeds(get(ref(db, "/")));
  await assertSucceeds(get(ref(db, "Calcio/2026/Iscrizioni")));
  await assertSucceeds(set(ref(db, "Impostazioni/manutenzione"), true));
  await assertSucceeds(set(ref(db, "Calcio/2026/Superiori/Partite/1/A:B/GolSquadraCasa"), 3));
  await assertSucceeds(
    update(ref(db, "Calcio/2026/Iscrizioni/Superiori-Esistente"), { Stato: "Convertita" })
  );
  await assertSucceeds(set(ref(db, "Amministratori/nuovo@gmail,com"), true));
  await assertSucceeds(remove(ref(db, "Calcio/2026/Superiori/Referti/2/B:A")));
});

test("senza email verificata o fuori dall'elenco non si scrive", async () => {
  await assertFails(set(ref(adminNonVerificato(), "Impostazioni/manutenzione"), true));
  await assertFails(get(ref(adminNonVerificato(), "Calcio/2026/Iscrizioni")));
  await assertFails(set(ref(qualcuno(), "Impostazioni/manutenzione"), true));
  await assertFails(get(ref(qualcuno(), "Registro")));
});

test("ognuno può controllare solo la propria voce dell'elenco", async () => {
  await assertSucceeds(get(ref(admin(), "Amministratori/mario,rossi@gmail,com")));
  await assertSucceeds(get(ref(qualcuno(), "Amministratori/altro@gmail,com")));
  await assertFails(get(ref(qualcuno(), "Amministratori/mario,rossi@gmail,com")));
});

// --- BEACH VOLLEY (gestionale con PIN e accesso anonimo) ---

const anonimoBV = (uid = "bv1") =>
  env.authenticatedContext(uid, { firebase: { sign_in_provider: "anonymous" } }).database();
const iscrizioneBV = (extra = {}) =>
  iscrizione({
    Divisione: "Maschile",
    NomeSquadra: "Sabbia",
    ModuloFirmato: { NomeFile: "modulo.pdf", Percorso: "Moduli/BV-2026/Maschile-Sabbia-abc.pdf" },
    ...extra,
  });

test("beach volley: il pubblico legge le impostazioni e il nome di una squadra iscritta, nient'altro", async () => {
  const db = anonimo();
  await assertSucceeds(get(ref(db, "Beach Volley/Impostazioni")));
  await assertSucceeds(get(ref(db, "Beach Volley/2026/Iscrizioni/Maschile-Esistente/NomeSquadra")));
  for (const percorso of [
    "Beach Volley",
    "Beach Volley/Accesso/Pin",
    "Beach Volley/Accesso/Sessioni",
    "Beach Volley/2026/Iscrizioni",
    "Beach Volley/2026/Iscrizioni/Maschile-Esistente",
    "Beach Volley/2026/Maschile/Squadre",
  ]) {
    await assertFails(get(ref(db, percorso)));
  }
  await assertFails(get(ref(anonimoBV(), "Beach Volley/Accesso/Pin")));
});

test("beach volley: iscrizione nuova accettata, non sovrascrive, rifiutata a iscrizioni chiuse", async () => {
  const db = anonimo();
  await assertSucceeds(set(ref(db, "Beach Volley/2026/Iscrizioni/Maschile-Sabbia"), iscrizioneBV()));
  await assertFails(set(ref(db, "Beach Volley/2026/Iscrizioni/Maschile-Esistente"), iscrizioneBV()));
  await assertFails(
    set(ref(db, "Beach Volley/2026/Iscrizioni/Maschile-Altra"), iscrizioneBV({ Divisione: "Superiori" }))
  );
  await assertFails(
    set(
      ref(db, "Beach Volley/2026/Iscrizioni/Maschile-Altra"),
      iscrizioneBV({ ModuloFirmato: { Percorso: "Moduli/2026/x.pdf" } })
    )
  );
  await env.withSecurityRulesDisabled((ctx) =>
    set(ref(ctx.database(), "Beach Volley/Impostazioni/iscrizioniAperte"), false)
  );
  await assertFails(set(ref(db, "Beach Volley/2026/Iscrizioni/Maschile-Nuova"), iscrizioneBV()));
});

test("beach volley: con il PIN sbagliato non si entra", async () => {
  const db = anonimoBV();
  await assertFails(set(ref(db, "Beach Volley/Accesso/Sessioni/bv1"), "sbagliato"));
  await assertFails(set(ref(db, "Beach Volley/Accesso/Sessioni/altro"), "sabbia123"));
  await assertFails(set(ref(db, "Beach Volley/Accesso/Pin"), "nuovopin"));
  await assertFails(get(ref(db, "Beach Volley/2026/Iscrizioni")));
  await assertFails(get(ref(anonimoBV("vecchia"), "Beach Volley/2026/Iscrizioni")));
});

test("beach volley: con il PIN giusto si legge e scrive tutto il beach volley, non il calcio", async () => {
  const db = anonimoBV();
  await assertSucceeds(set(ref(db, "Beach Volley/Accesso/Sessioni/bv1"), "sabbia123"));
  await assertSucceeds(get(ref(db, "Beach Volley/2026/Iscrizioni")));
  await assertSucceeds(
    update(ref(db, "Beach Volley/2026/Iscrizioni/Maschile-Esistente"), { Stato: "Convertita" })
  );
  await assertSucceeds(set(ref(db, "Beach Volley/2026/Maschile/Squadre/B"), { Nome: "B" }));
  await assertSucceeds(
    update(ref(db, "Beach Volley/Impostazioni"), { iscrizioniAperte: false, adminPin: null })
  );
  await assertFails(get(ref(db, "Calcio/2026/Iscrizioni")));
  await assertFails(set(ref(db, "Impostazioni/manutenzione"), true));
});

test("beach volley: cambiando il PIN si resta dentro e gli altri escono", async () => {
  await assertSucceeds(set(ref(anonimoBV("bv1"), "Beach Volley/Accesso/Sessioni/bv1"), "sabbia123"));
  await assertSucceeds(set(ref(anonimoBV("bv2"), "Beach Volley/Accesso/Sessioni/bv2"), "sabbia123"));
  await assertFails(update(ref(anonimoBV("bv1"), "Beach Volley/Accesso"), { Pin: "corto" }));
  await assertSucceeds(
    update(ref(anonimoBV("bv1"), "Beach Volley/Accesso"), {
      Pin: "nuovopin1",
      Sessioni: { bv1: "nuovopin1" },
    })
  );
  await assertSucceeds(get(ref(anonimoBV("bv1"), "Beach Volley/2026/Iscrizioni")));
  await assertFails(get(ref(anonimoBV("bv2"), "Beach Volley/2026/Iscrizioni")));
});

test("beach volley: senza PIN nel database nessuno entra con il PIN", async () => {
  await env.withSecurityRulesDisabled((ctx) => remove(ref(ctx.database(), "Beach Volley/Accesso")));
  await assertFails(set(ref(anonimoBV(), "Beach Volley/Accesso/Sessioni/bv1"), "qualsiasi"));
  await assertFails(get(ref(anonimoBV(), "Beach Volley/2026/Iscrizioni")));
  await assertSucceeds(get(ref(admin(), "Beach Volley/2026/Iscrizioni")));
});
