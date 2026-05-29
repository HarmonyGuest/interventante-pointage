"use client";

export interface GeoPosition {
  lat: number;
  lon: number;
  acc: number;
}

export function obtenirGPS(): Promise<GeoPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("GPS non supporté sur cet appareil"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({
        lat: p.coords.latitude,
        lon: p.coords.longitude,
        acc: Math.round(p.coords.accuracy),
      }),
      (e) => {
        const m: Record<number, string> = {
          1: "Accès GPS refusé. Allez dans Réglages et autorisez la localisation.",
          2: "Signal GPS indisponible. Essayez dehors.",
          3: "Délai GPS dépassé. Réessayez.",
        };
        reject(new Error(m[e.code] || "Erreur GPS inconnue."));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

// Version optionnelle — ne bloque jamais le pointage
export async function tryGetPosition(): Promise<GeoPosition | null> {
  try {
    return await obtenirGPS();
  } catch {
    return null;
  }
}
