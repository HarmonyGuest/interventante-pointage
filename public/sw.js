// Garde une copie de l'appli sur le téléphone pour qu'elle s'ouvre même sans réseau.
// Les pointages eux-mêmes sont gardés par Firebase (voir lib/firebase.ts).
const CACHE = "sap-pro-v1";
const PAGES = ["/", "/login", "/dashboard"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then(async (cache) => {
        await cache.addAll(PAGES);
        // Les fichiers utilisés par ces pages (scripts, styles)
        const fichiers = new Set();
        for (const page of PAGES) {
          const html = await (await cache.match(page)).text();
          for (const f of html.match(/\/_next\/static\/[^"'\s)\\]+/g) || []) fichiers.add(f);
        }
        await Promise.all([...fichiers].map((f) => cache.add(f).catch(() => {})));
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((cle) => cle !== CACHE).map((cle) => caches.delete(cle))))
      .then(() => self.clients.claim())
  );
});

// Fichiers chargés par la page avant que le service worker soit installé
self.addEventListener("message", (event) => {
  if (event.data?.type !== "garder" || !Array.isArray(event.data.fichiers)) return;
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(event.data.fichiers.map((url) => cache.match(url).then((copie) => copie || cache.add(url).catch(() => {}))))
    )
  );
});

function garderCopie(requete, reponse) {
  if (reponse.ok) {
    const copie = reponse.clone();
    caches.open(CACHE).then((cache) => cache.put(requete, copie));
  }
  return reponse;
}

self.addEventListener("fetch", (event) => {
  const requete = event.request;
  const url = new URL(requete.url);
  if (requete.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  // Fichiers de l'appli : leur nom change à chaque version, la copie suffit
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(requete).then((copie) => copie || fetch(requete).then((reponse) => garderCopie(requete, reponse)))
    );
    return;
  }

  // Pages : le réseau d'abord (pour avoir la dernière version), la copie sinon.
  // Avec un réseau très faible, on n'attend pas plus de 5 secondes.
  if (requete.mode === "navigate") {
    const reseau = fetch(requete).then((reponse) => garderCopie(url.pathname, reponse));
    const copie = () => caches.match(url.pathname).then((c) => c || caches.match("/dashboard"));
    event.respondWith(
      Promise.race([
        reseau,
        new Promise((_, echec) => setTimeout(() => echec(new Error("lent")), 5000)),
      ]).catch(() => copie().then((c) => c || reseau))
    );
  }
});
