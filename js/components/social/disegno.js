import { nomeSquadra } from "./dati.js";
import { nomeDivisione } from "../../divisione.js";

/*
===================================
GRAFICHE SOCIAL: DISEGNO
===================================
Misure, colori, caratteri, immagini (loghi e colori dominanti) e primitive
di disegno su canvas condivise da tutte le grafiche.
*/

export const W = 1080;
export const H = 1350;
// Storie Instagram: in alto e in basso l'interfaccia dell'app copre ~250px
export const H_STORIA = 1920;

export const GIALLO = "#F3E600";
export const NERO = "#0b0b0c";

export const FONT_TITOLI = '"Bebas Neue", sans-serif';
export const FONT_TESTO = "Montserrat, sans-serif";

export const LOGO_COFTA = "/assets/images/LOGO_COFTA_SITO_2.svg";

// Partite per immagine: oltre si passa a una seconda immagine
export const PARTITE_PER_PAGINA = 5;

export const GIORNI = ["DOM", "LUN", "MAR", "MER", "GIO", "VEN", "SAB"];

/*
-----------------------------------
IMMAGINI E COLORI
-----------------------------------
*/

export const cacheImmagini = new Map();

export function caricaImmagine(url) {
  if (!url) return Promise.resolve(null);
  if (!cacheImmagini.has(url)) {
    cacheImmagini.set(
      url,
      new Promise((resolve) => {
        const img = new Image();
        // Senza CORS il canvas diventerebbe "sporco" e non esportabile:
        // meglio che il caricamento fallisca e si usi il segnaposto
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
      })
    );
  }
  return cacheImmagini.get(url);
}

export function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hsl(h, s, l, a = 1) {
  return `hsla(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%, ${a})`;
}

// Colore dominante del logo, usato per le fasce della squadra.
// Loghi in bianco e nero (o non caricati) restano su un grigio neutro.
export function coloreDominante(img) {
  const neutro = { h: 220, s: 0.06, l: 0.36 };
  if (!img) return neutro;

  const lato = 64;
  const canvas = document.createElement("canvas");
  canvas.width = lato;
  canvas.height = lato;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, lato, lato);

  let pixel;
  try {
    pixel = ctx.getImageData(0, 0, lato, lato).data;
  } catch {
    return neutro;
  }

  const bins = Array.from({ length: 24 }, () => ({ peso: 0, h: 0, s: 0, l: 0 }));
  let opachi = 0;
  let colorati = 0;

  for (let i = 0; i < pixel.length; i += 4) {
    if (pixel[i + 3] < 200) continue;
    opachi++;
    const [h, s, l] = rgbToHsl(pixel[i], pixel[i + 1], pixel[i + 2]);
    if (s < 0.28 || l < 0.12 || l > 0.88) continue;
    colorati++;
    const bin = bins[Math.floor(h / 15) % 24];
    const peso = s * (1 - Math.abs(l - 0.5));
    bin.peso += peso;
    bin.h += h * peso;
    bin.s += s * peso;
    bin.l += l * peso;
  }

  if (opachi === 0 || colorati / opachi < 0.06) return neutro;

  const migliore = bins.reduce((a, b) => (b.peso > a.peso ? b : a));
  return {
    h: migliore.h / migliore.peso,
    // Tinte sature ma non accecanti, sempre leggibili con testo bianco
    s: Math.min(0.75, Math.max(0.45, migliore.s / migliore.peso)),
    l: Math.min(0.46, Math.max(0.3, migliore.l / migliore.peso)),
  };
}

export async function preparaSquadre(dati, avvisi) {
  const risultato = {};
  await Promise.all(
    Object.entries(dati.squadre).map(async ([chiave, squadra]) => {
      const logo = await caricaImmagine(squadra.Logo || squadra.LogoLR);
      if (!logo) avvisi.add(nomeSquadra(chiave));
      risultato[chiave] = {
        nome: nomeSquadra(chiave),
        logo,
        colore: coloreDominante(logo),
      };
    })
  );
  return risultato;
}

export function squadraDi(squadre, chiave) {
  return (
    squadre[chiave] || {
      nome: nomeSquadra(chiave),
      logo: null,
      colore: { h: 220, s: 0.06, l: 0.36 },
    }
  );
}

/*
-----------------------------------
PRIMITIVE DI DISEGNO
-----------------------------------
*/

// Generatore pseudo-casuale con seme: stessa grafica a ogni generazione
export function casuale(seme) {
  return () => {
    seme |= 0;
    seme = (seme + 0x6d2b79f5) | 0;
    let t = Math.imul(seme ^ (seme >>> 15), 1 | seme);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function parallelogramma(ctx, x, y, w, h, inclinazione) {
  ctx.beginPath();
  ctx.moveTo(x + inclinazione, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w - inclinazione, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
}

export function font(peso, dimensione, famiglia) {
  return `${peso} ${Math.round(dimensione)}px ${famiglia}`;
}

// Divide il testo in righe cercando la dimensione più grande che ci sta
export function adattaTesto(ctx, testo, larghezza, maxRighe, dimMax, dimMin, peso = 800) {
  const parole = testo.split(/\s+/).filter(Boolean);

  for (let dim = dimMax; dim >= dimMin; dim -= 1) {
    ctx.font = font(peso, dim, FONT_TESTO);
    const righe = [];
    let riga = "";
    for (const parola of parole) {
      const prova = riga ? `${riga} ${parola}` : parola;
      if (ctx.measureText(prova).width <= larghezza || !riga) {
        riga = prova;
      } else {
        righe.push(riga);
        riga = parola;
      }
    }
    if (riga) righe.push(riga);

    const entra = righe.every((r) => ctx.measureText(r).width <= larghezza);
    if (righe.length <= maxRighe && entra) return { righe, dim };
  }

  ctx.font = font(peso, dimMin, FONT_TESTO);
  return { righe: [testo], dim: dimMin };
}

export function disegnaRighe(ctx, righe, dim, x, yCentro, allineamento) {
  const interlinea = dim * 1.08;
  ctx.textAlign = allineamento;
  ctx.textBaseline = "middle";
  const yInizio = yCentro - ((righe.length - 1) * interlinea) / 2;
  righe.forEach((riga, i) => ctx.fillText(riga, x, yInizio + i * interlinea));
}

export function disegnaLogo(ctx, squadra, cx, cy, diametro) {
  ctx.save();
  if (squadra.logo) {
    const { naturalWidth: lw, naturalHeight: lh } = squadra.logo;
    const scala = diametro / Math.max(lw, lh);
    ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
    ctx.shadowBlur = diametro * 0.18;
    ctx.shadowOffsetY = diametro * 0.04;
    ctx.drawImage(squadra.logo, cx - (lw * scala) / 2, cy - (lh * scala) / 2, lw * scala, lh * scala);
  } else {
    // Segnaposto: cerchio con le iniziali della squadra
    const r = diametro / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = hsl(squadra.colore.h, squadra.colore.s, 0.16);
    ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
    ctx.shadowBlur = diametro * 0.18;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.lineWidth = Math.max(3, diametro * 0.04);
    ctx.strokeStyle = GIALLO;
    ctx.stroke();

    const iniziali =
      squadra.nome
        .replace(/\b(S\.?\s?t[ia]|S\.|e|ed)\b/gi, " ")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0])
        .join("")
        .toUpperCase() || "?";
    ctx.fillStyle = "#ffffff";
    ctx.font = font(400, diametro * 0.46, FONT_TITOLI);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(iniziali, cx, cy + diametro * 0.03);
  }
  ctx.restore();
}

/*
-----------------------------------
SFONDO, INTESTAZIONE, PIÈ DI PAGINA
-----------------------------------
*/

let trama = null;

export function tramaGrana() {
  if (trama) return trama;
  const lato = 256;
  trama = document.createElement("canvas");
  trama.width = lato;
  trama.height = lato;
  const ctx = trama.getContext("2d");
  const dati = ctx.createImageData(lato, lato);
  const rnd = casuale(7);
  for (let i = 0; i < dati.data.length; i += 4) {
    const v = rnd() * 255;
    dati.data[i] = v;
    dati.data[i + 1] = v;
    dati.data[i + 2] = v;
    dati.data[i + 3] = 255;
  }
  ctx.putImageData(dati, 0, 0);
  return trama;
}

export function disegnaSfondo(ctx, seme) {
  const H = ctx.canvas.height;

  ctx.fillStyle = NERO;
  ctx.fillRect(0, 0, W, H);

  // Luce gialla negli angoli
  const bagliore = (x, y, r, alpha) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(243, 230, 0, ${alpha})`);
    g.addColorStop(0.45, `rgba(243, 200, 0, ${alpha * 0.35})`);
    g.addColorStop(1, "rgba(243, 200, 0, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  bagliore(-60, H + 40, 760, 0.5);
  bagliore(W + 60, -80, 620, 0.42);

  // Linee ondulate in trasparenza
  const rnd = casuale(seme);
  const fase = rnd() * Math.PI * 2;
  ctx.save();
  ctx.lineWidth = 2;
  for (let i = -6; i < Math.ceil(H / 46) + 4; i++) {
    const base = i * 46;
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.04 + (i % 3 === 0 ? 0.025 : 0)})`;
    ctx.beginPath();
    for (let x = -20; x <= W + 20; x += 12) {
      const y =
        base +
        x * 0.32 +
        Math.sin(x * 0.006 + fase + i * 0.18) * 60 +
        Math.sin(x * 0.017 + fase * 2 + i * 0.07) * 14;
      if (x === -20) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();

  // Vignettatura
  const vignetta = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.8);
  vignetta.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignetta.addColorStop(1, "rgba(0, 0, 0, 0.55)");
  ctx.fillStyle = vignetta;
  ctx.fillRect(0, 0, W, H);

  // Grana
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = ctx.createPattern(tramaGrana(), "repeat");
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// "6ª GIORNATA" con la "a" in apice
export function disegnaGiornata(ctx, numero, prefisso, x, y, dimensione, colore) {
  const numeroTesto = String(numero);
  ctx.save();
  ctx.fillStyle = colore;
  ctx.textBaseline = "alphabetic";

  ctx.font = font(400, dimensione, FONT_TITOLI);
  const lPrefisso = prefisso ? ctx.measureText(prefisso + " ").width : 0;
  const lNumero = ctx.measureText(numeroTesto).width;
  const lResto = ctx.measureText(" GIORNATA").width;
  ctx.font = font(800, dimensione * 0.36, FONT_TESTO);
  const lApice = ctx.measureText("a").width + dimensione * 0.03;

  let cursore = x - (lPrefisso + lNumero + lApice + lResto) / 2;

  ctx.textAlign = "left";
  ctx.font = font(400, dimensione, FONT_TITOLI);
  if (prefisso) {
    ctx.fillText(prefisso + " ", cursore, y);
    cursore += lPrefisso;
  }
  ctx.fillText(numeroTesto, cursore, y);
  cursore += lNumero + dimensione * 0.015;

  ctx.font = font(800, dimensione * 0.36, FONT_TESTO);
  ctx.fillText("a", cursore, y - dimensione * 0.42);
  ctx.fillRect(cursore, y - dimensione * 0.36, lApice - dimensione * 0.04, dimensione * 0.035);
  cursore += lApice;

  ctx.font = font(400, dimensione, FONT_TITOLI);
  ctx.fillText(" GIORNATA", cursore, y);
  ctx.restore();
}

export function disegnaIntestazione(ctx, logoCofta, titolo, sottotitolo) {
  // Logo COFTA Milano
  if (logoCofta) {
    const altezza = 104;
    const larghezza = (logoCofta.naturalWidth / logoCofta.naturalHeight) * altezza || altezza * 2.575;
    ctx.drawImage(logoCofta, 56, 54, larghezza, altezza);
  }

  // Titolo
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 30;
  ctx.font = font(400, 196, FONT_TITOLI);
  ctx.fillText(titolo, W / 2, 372);
  ctx.restore();

  if (sottotitolo) sottotitolo(ctx, W / 2, 448);
}

export function disegnaPiePagina(ctx, division, y = ctx.canvas.height - 108) {
  // La divisione unica non ha nome: niente fascia
  const testo = nomeDivisione(division).toUpperCase();
  if (!testo) return;
  ctx.save();
  ctx.font = font(400, 50, FONT_TITOLI);
  const larghezza = ctx.measureText(testo).width + 90;
  const altezza = 66;

  ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
  ctx.shadowBlur = 24;
  parallelogramma(ctx, W / 2 - larghezza / 2, y, larghezza, altezza, 18);
  ctx.fillStyle = GIALLO;
  ctx.fill();
  ctx.shadowColor = "transparent";

  ctx.fillStyle = NERO;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(testo, W / 2, y + altezza / 2 + 3);
  ctx.restore();
}
