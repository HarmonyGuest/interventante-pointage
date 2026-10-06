"use client";

// Écart entre l'horloge du téléphone et celle du serveur (en millisecondes).
// Il sert à ne pas dépendre de l'heure réglée sur le téléphone.
let decalage = 0;

// Demande l'heure au serveur. Renvoie false sans réseau : on garde alors
// l'heure du téléphone, et le pointage est marqué « hors connexion ».
export async function synchroniserHeure(): Promise<boolean> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const avant = Date.now();
    const res = await fetch("/api/heure", { cache: "no-store", signal: ctrl.signal });
    const apres = Date.now();
    if (!res.ok) return false;
    const { maintenant } = await res.json();
    if (typeof maintenant !== "number") return false;
    decalage = maintenant - (avant + apres) / 2;
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function maintenant(): Date {
  return new Date(Date.now() + decalage);
}
