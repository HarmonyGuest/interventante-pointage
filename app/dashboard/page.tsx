"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { collection, addDoc, updateDoc, doc, query, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";

interface Mission {
  id: string;
  nomMission: string;
  arrive: string;
  depart: string | null;
  pause: number;
  closed: boolean;
  date: string;
  interv: string;
}

function getNow() {
  return new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function getToday() {
  return new Date().toLocaleDateString("fr-FR");
}

function diffMinutes(t1: string, t2: string): number {
  if (!t1 || !t2) return 0;
  const [h1, m1] = t1.split(":").map(Number);
  const [h2, m2] = t2.split(":").map(Number);
  let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (diff < 0) diff += 24 * 60;
  return diff;
}

function minsToHHMM(m: number): string {
  if (m < 0) m = 0;
  return Math.floor(m / 60) + "h" + String(m % 60).padStart(2, "0");
}

const USERS: Record<string, string> = {
  "drouche@harmony.fr": "Drouche Zedjiga",
  "djedjiga@harmony.fr": "Djedjiga",
  "siham@harmony.fr": "Siham",
};

async function tryGetPosition() {
  return new Promise<{ lat: number; lon: number; acc: number } | null>((resolve) => {
    if (typeof window === "undefined" || !navigator.geolocation) { resolve(null); return; }
    const timer = setTimeout(() => resolve(null), 8000);
    navigator.geolocation.getCurrentPosition(
      (pos) => { clearTimeout(timer); resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, acc: Math.round(pos.coords.accuracy) }); },
      () => { clearTimeout(timer); resolve(null); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

// Ajoute filigrane sur la photo avec Canvas
async function getAdresse(lat: number, lon: number): Promise<string> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`, {
      headers: { "Accept-Language": "fr" }
    });
    const data = await res.json();
    const r = data.address;
    const rue = r.road || r.pedestrian || r.footway || "";
    const ville = r.city || r.town || r.village || r.suburb || "";
    return [rue, ville].filter(Boolean).join(", ") || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  }
}

async function addWatermark(file: File, prenom: string, heure: string, gps: { lat: number; lon: number } | null): Promise<string> {
  const adresse = gps ? await getAdresse(gps.lat, gps.lon) : "Localisation non disponible";
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const maxSize = 800;
      const ratio = Math.min(maxSize / img.width, maxSize / img.height);
      canvas.width = img.width * ratio;
      canvas.height = img.height * ratio;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const bannerH = 56;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, canvas.height - bannerH, canvas.width, bannerH);

      ctx.fillStyle = "white";
      ctx.font = `bold ${Math.round(canvas.width * 0.028)}px Arial`;
      ctx.fillText(`${prenom} — ${heure} — ${getToday()}`, 10, canvas.height - bannerH + 20);
      ctx.font = `${Math.round(canvas.width * 0.022)}px Arial`;
      ctx.fillText(adresse, 10, canvas.height - bannerH + 42);

      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.src = url;
  });
}

type Etape = 1 | 2 | 3;

export default function Dashboard() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const fileInputArrivee = useRef<HTMLInputElement>(null);

  const [prenom, setPrenom] = useState("");
  const [etape, setEtape] = useState<Etape>(1);
  const [missionId, setMissionId] = useState<string | null>(null);
  const [nomClient, setNomClient] = useState("");
  const [heureArrivee, setHeureArrivee] = useState("");
  const [heureDepart_state, setHeureDepartState] = useState("");
  const [pause, setPause] = useState("");
  const [photoArrivee, setPhotoArrivee] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [currentTime, setCurrentTime] = useState(new Date());
  const [onglet, setOnglet] = useState<"pointer" | "historique">("pointer");
  const [historique, setHistorique] = useState<(Mission & { total?: string; photoArrivee?: string })[]>([]);
  const [loadingHistorique, setLoadingHistorique] = useState(false);
  const [photoModal, setPhotoModal] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
    if (user) setPrenom(USERS[user.email || ""] || user.email || "Intervenante");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    const checkMission = async () => {
      const interv = USERS[user.email || ""] || "";
      const q = query(collection(db, "pointages"), where("interv", "==", interv));
      const snap = await getDocs(q);
      const today = getToday();
      const missions = snap.docs.map(d => ({ id: d.id, ...d.data() } as Mission)).filter(m => m.date === today);
      const open = missions.find(m => !m.closed);
      if (open) {
        setMissionId(open.id);
        setNomClient(open.nomMission);
        setHeureArrivee(open.arrive);
        setEtape(open.depart ? 3 : 2);
      }
    };
    checkMission();
  }, [user]);

  const handlePhotoArrivee = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus("loading");
    setStatusMessage("Traitement de la photo…");
    const gps = await tryGetPosition();
    const heure = getNow();
    const base64 = await addWatermark(file, prenom, heure, gps);
    setPhotoArrivee(base64);
    setStatus("idle");
    setStatusMessage("");
  };


  const loadHistorique = async () => {
    if (!user) return;
    setLoadingHistorique(true);
    try {
      const interv = USERS[user.email || ""] || "";
      const q = query(collection(db, "pointages"), where("interv", "==", interv));
      const snap = await getDocs(q);
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Mission & { total?: string; photoArrivee?: string }))
        .sort((a, b) => {
          const [da, ma, ya] = a.date.split("/").map(Number);
          const [db2, mb, yb] = b.date.split("/").map(Number);
          return new Date(yb, mb-1, db2).getTime() - new Date(ya, ma-1, da).getTime();
        });
      setHistorique(list);
    } catch (err) {
      console.error(err);
    }
    setLoadingHistorique(false);
  };

  const pointerArrivee = async () => {
    if (!user || !nomClient.trim()) {
      setStatus("error");
      setStatusMessage("Veuillez indiquer le nom du client.");
      return;
    }
    if (!photoArrivee) {
      setStatus("error");
      setStatusMessage("La photo d'arrivée est obligatoire.");
      return;
    }
    setStatus("loading");
    setStatusMessage("Enregistrement de l'arrivée…");
    const gps = await tryGetPosition();
    const heure = getNow();
    try {
      const docRef = await addDoc(collection(db, "pointages"), {
        nomMission: nomClient.trim(),
        numMission: "M1",
        arrive: heure,
        depart: null,
        pause: 0,
        closed: false,
        date: getToday(),
        interv: USERS[user.email || ""] || user.email,
        gpsArrive: gps ? { ...gps, mapsLink: `https://maps.google.com/?q=${gps.lat},${gps.lon}` } : null,
        gpsDepart: null,
        photoArrivee: photoArrivee || null,
        photoDepart: null,
        timestamp: Timestamp.now(),
      });
      setMissionId(docRef.id);
      setHeureArrivee(heure);
      setPhotoArrivee(null);
      setEtape(2);
      setStatus("success");
      setStatusMessage(`Arrivée pointée à ${heure}${gps ? " ✓ GPS" : ""}${photoArrivee ? " ✓ Photo" : ""}`);
    } catch {
      setStatus("error");
      setStatusMessage("Erreur réseau. Vérifiez votre connexion.");
    }
  };

  const pointerDepart = async () => {
    if (!missionId) return;
    setStatus("loading");
    setStatusMessage("Enregistrement du départ…");
    const gps = await tryGetPosition();
    const heure = getNow();
    try {
      await updateDoc(doc(db, "pointages", missionId), {
        depart: heure,
        gpsDepart: gps ? { ...gps, mapsLink: `https://maps.google.com/?q=${gps.lat},${gps.lon}` } : null,
      });
      setHeureDepartState(heure);
      setEtape(3);
      setStatus("success");
      setStatusMessage(`Départ pointé à ${heure}${gps ? " ✓ GPS" : ""}`);
    } catch {
      setStatus("error");
      setStatusMessage("Erreur réseau. Vérifiez votre connexion.");
    }
  };

  const cloturerJournee = async () => {
    if (!missionId || pause === "") {
      setStatus("error");
      setStatusMessage("Indiquez les minutes de pause (0 si aucune).");
      return;
    }
    setStatus("loading");
    setStatusMessage("Clôture de la journée…");
    try {
      const pauseMins = parseInt(pause) || 0;
      const heureDepart = heureDepart_state || getNow();
      const totalMinsCalc = Math.max(0, diffMinutes(heureArrivee, heureDepart) - pauseMins);
      const totalStr = minsToHHMM(totalMinsCalc);
      await updateDoc(doc(db, "pointages", missionId), {
        pause: pauseMins,
        closed: true,
        statut: "cloturee",
        total: totalStr,
        totalMins: totalMinsCalc,
      });
      setEtape(1);
      setNomClient("");
      setHeureArrivee("");
      setHeureDepartState("");
      setPause("");
      setMissionId(null);
      setStatus("success");
      setStatusMessage(`Journée clôturée — ${totalStr} travaillé. Bonne soirée ! 🌙`);
    } catch {
      setStatus("error");
      setStatusMessage("Erreur réseau. Vérifiez votre connexion.");
    }
  };

  if (loading || !user) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <div style={{ width: 40, height: 40, borderRadius: "50%", border: "2px solid var(--border)", borderTopColor: "var(--accent)", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "24px 16px 40px" }}>
      <div style={{ position: "fixed", top: 0, left: "50%", transform: "translateX(-50%)", width: 800, height: 400, background: "radial-gradient(ellipse, rgba(108,99,255,0.06) 0%, transparent 70%)", pointerEvents: "none" }} />

      <div style={{ maxWidth: 480, margin: "0 auto", position: "relative", zIndex: 1 }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, var(--accent), #9b8fff)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 20px var(--accent-glow)" }}>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="white" opacity="0.9"/>
                <circle cx="12" cy="9" r="2.5" fill="white"/>
              </svg>
            </div>
            <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: 16 }}>Harmony Team</span>
          </div>
          <button onClick={logout} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-dim)", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>
            Déconnexion
          </button>
        </div>

        {/* Onglets */}
        <div style={{ display: "flex", background: "var(--surface)", borderRadius: 14, border: "1px solid var(--border)", padding: 4, marginBottom: 16, gap: 4 }}>
          {(["pointer", "historique"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => { setOnglet(tab); if (tab === "historique") loadHistorique(); }}
              style={{
                flex: 1, padding: "10px", borderRadius: 10, border: "none",
                background: onglet === tab ? "linear-gradient(135deg, var(--accent), #9b8fff)" : "transparent",
                color: onglet === tab ? "white" : "var(--text-muted)",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
                boxShadow: onglet === tab ? "0 4px 12px var(--accent-glow)" : "none",
                transition: "all 0.2s",
              }}
            >
              {tab === "pointer" ? "⏱ Pointer" : "📋 Historique"}
            </button>
          ))}
        </div>

        {/* Horloge */}
        <div style={{ background: "var(--surface)", borderRadius: 24, border: "1px solid var(--border)", padding: "24px 28px", marginBottom: 16 }}>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 2 }}>
            Bonjour, <span style={{ color: "var(--accent)", fontWeight: 600 }}>{prenom}</span>
          </p>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 48, fontWeight: 700, letterSpacing: "-2px", lineHeight: 1, background: "linear-gradient(135deg, var(--text) 60%, var(--text-muted))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            {currentTime.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 6, textTransform: "capitalize" }}>
            {currentTime.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>

        {/* CONTENU SELON ONGLET */}
        {onglet === "pointer" && (<>

        {/* ÉTAPE 1 */}
        {etape === 1 && (
          <div style={{ background: "var(--surface)", borderRadius: 20, border: "1px solid var(--border)", padding: "22px 24px", marginBottom: 16 }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
              Nom du client / Mission
            </p>
            <input
              type="text"
              value={nomClient}
              onChange={e => setNomClient(e.target.value)}
              placeholder="Ex : Mme Dupont"
              style={{ width: "100%", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "13px 16px", color: "var(--text)", fontSize: 15, outline: "none", fontFamily: "'DM Sans', sans-serif", marginBottom: 12 }}
              onFocus={e => e.target.style.borderColor = "var(--accent)"}
              onBlur={e => e.target.style.borderColor = "var(--border)"}
            />

            {/* Photo arrivée optionnelle */}
            <input ref={fileInputArrivee} type="file" accept="image/*" capture="environment" onChange={handlePhotoArrivee} style={{ display: "none" }} />
            {photoArrivee ? (
              <div style={{ marginBottom: 12, position: "relative" }}>
                <img src={photoArrivee} alt="Photo arrivée" style={{ width: "100%", borderRadius: 12, maxHeight: 180, objectFit: "cover" }} />
                <button onClick={() => setPhotoArrivee(null)} style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: "50%", width: 28, height: 28, color: "white", cursor: "pointer", fontSize: 14 }}>✕</button>
                <div style={{ position: "absolute", bottom: 8, left: 8, background: "rgba(34,211,160,0.9)", borderRadius: 6, padding: "2px 8px", fontSize: 11, color: "white", fontWeight: 600 }}>✓ Photo prête</div>
              </div>
            ) : (
              <button onClick={() => fileInputArrivee.current?.click()} style={{ width: "100%", background: "var(--surface2)", border: "1px dashed var(--border)", borderRadius: 12, padding: "11px", color: "var(--text-muted)", fontSize: 13, cursor: "pointer", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                📷 Prendre une photo — obligatoire
              </button>
            )}

            <button
              onClick={pointerArrivee}
              disabled={status === "loading"}
              style={{ width: "100%", background: "linear-gradient(135deg, var(--success), #1ab887)", border: "none", borderRadius: 14, padding: "15px", color: "white", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", boxShadow: "0 8px 24px var(--success-glow)", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}
            >
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" opacity="0.5"/>
                <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Pointer l&apos;arrivée
            </button>
          </div>
        )}

        {/* ÉTAPE 2 */}
        {etape === 2 && (
          <div style={{ background: "var(--surface)", borderRadius: 20, border: "1px solid rgba(108,99,255,0.3)", padding: "22px 24px", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, padding: "12px 16px", background: "rgba(108,99,255,0.08)", borderRadius: 12 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--accent)", boxShadow: "0 0 10px var(--accent)", animation: "pulse 2s infinite", flexShrink: 0 }} />
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{nomClient}</p>
                <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Mission démarrée à {heureArrivee}</p>
              </div>
            </div>
            <button
              onClick={pointerDepart}
              disabled={status === "loading"}
              style={{ width: "100%", background: "linear-gradient(135deg, var(--danger), #e04455)", border: "none", borderRadius: 14, padding: "15px", color: "white", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", boxShadow: "0 8px 24px var(--danger-glow)", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}
            >
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" opacity="0.5"/>
                <path d="M8 12h8M13 8l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Pointer le départ
            </button>
          </div>
        )}

        {/* ÉTAPE 3 */}
        {etape === 3 && (
          <div style={{ background: "var(--surface)", borderRadius: 20, border: "1px solid rgba(34,211,160,0.3)", padding: "22px 24px", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, padding: "12px 16px", background: "rgba(34,211,160,0.08)", borderRadius: 12 }}>
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" stroke="var(--success)" strokeWidth="1.5"/>
                <path d="M8 12l3 3 5-5" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <p style={{ fontSize: 14, color: "var(--success)", fontWeight: 500 }}>
                Mission terminée — {nomClient}
              </p>
            </div>
            <p style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
              Temps de pause (en minutes)
            </p>
            <input
              type="number"
              value={pause}
              onChange={e => setPause(e.target.value)}
              placeholder="0"
              min="0"
              style={{ width: "100%", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "13px 16px", color: "var(--text)", fontSize: 15, outline: "none", fontFamily: "'DM Sans', sans-serif", marginBottom: 14 }}
              onFocus={e => e.target.style.borderColor = "var(--accent)"}
              onBlur={e => e.target.style.borderColor = "var(--border)"}
            />
            <button
              onClick={cloturerJournee}
              disabled={status === "loading"}
              style={{ width: "100%", background: "linear-gradient(135deg, #7c3aed, var(--accent))", border: "none", borderRadius: 14, padding: "15px", color: "white", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", boxShadow: "0 8px 24px var(--accent-glow)", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}
            >
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Clôturer la journée
            </button>
          </div>
        )}

        </>)}

        {/* ONGLET HISTORIQUE */}
        {onglet === "historique" && (
          <div>
            {loadingHistorique ? (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", border: "2px solid var(--border)", borderTopColor: "var(--accent)", animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
              </div>
            ) : historique.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 24px", background: "var(--surface)", borderRadius: 20, border: "1px solid var(--border)", color: "var(--text-muted)", fontSize: 14 }}>
                Aucun pointage enregistré.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {historique.map(p => (
                  <div key={p.id} style={{ background: "var(--surface)", borderRadius: 16, border: `1px solid ${p.closed ? "var(--border)" : "rgba(108,99,255,0.3)"}`, padding: "16px 18px", position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: p.closed ? "var(--success)" : "var(--accent)", borderRadius: "3px 0 0 3px" }} />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 2 }}>{p.nomMission || "—"}</p>
                        <p style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "capitalize" }}>{p.date}</p>
                      </div>
                      <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 8, background: p.closed ? "rgba(34,211,160,0.1)" : "rgba(108,99,255,0.1)", color: p.closed ? "var(--success)" : "var(--accent)", fontWeight: 600 }}>
                        {p.closed ? "Clôturée" : "En cours"}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 20 }}>
                      <div>
                        <p style={{ fontSize: 10, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>Arrivée</p>
                        <p style={{ fontSize: 17, fontFamily: "'Syne', sans-serif", fontWeight: 700, color: "var(--success)" }}>{p.arrive || "—"}</p>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", paddingTop: 14 }}>
                        <svg width="16" height="10" fill="none" viewBox="0 0 20 12"><path d="M0 6h18M13 1l5 5-5 5" stroke="var(--text-dim)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </div>
                      <div>
                        <p style={{ fontSize: 10, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>Départ</p>
                        <p style={{ fontSize: 17, fontFamily: "'Syne', sans-serif", fontWeight: 700, color: p.depart ? "var(--danger)" : "var(--text-dim)" }}>{p.depart || "—"}</p>
                      </div>
                      {p.total && (
                        <div style={{ marginLeft: "auto" }}>
                          <p style={{ fontSize: 10, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>Total</p>
                          <p style={{ fontSize: 17, fontFamily: "'Syne', sans-serif", fontWeight: 700, color: "var(--accent)" }}>{p.total}</p>
                        </div>
                      )}
                    </div>
                    {p.pause > 0 && (
                      <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>Pause : {p.pause} min</p>
                    )}
                    {p.photoArrivee && (
                      <div style={{ marginTop: 10 }}>
                        <img
                          src={p.photoArrivee}
                          alt="Photo arrivée"
                          onClick={() => setPhotoModal(p.photoArrivee!)}
                          style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, cursor: "pointer", border: "2px solid var(--success)" }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Photo modal */}
        {photoModal && (
          <div onClick={() => setPhotoModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div style={{ position: "relative", maxWidth: 480, width: "100%" }}>
              <img src={photoModal} alt="Photo" style={{ width: "100%", borderRadius: 12 }} />
              <button onClick={() => setPhotoModal(null)} style={{ position: "absolute", top: -14, right: -14, background: "white", border: "none", borderRadius: "50%", width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>✕</button>
            </div>
          </div>
        )}

        {/* Status */}
        {onglet === "pointer" && status !== "idle" && statusMessage && (
          <div style={{ background: status === "loading" ? "rgba(108,99,255,0.1)" : status === "success" ? "rgba(34,211,160,0.1)" : "rgba(255,92,108,0.1)", border: `1px solid ${status === "loading" ? "rgba(108,99,255,0.3)" : status === "success" ? "rgba(34,211,160,0.3)" : "rgba(255,92,108,0.3)"}`, borderRadius: 14, padding: "14px 18px", display: "flex", alignItems: "center", gap: 10 }}>
            {status === "loading" && <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(108,99,255,0.4)", borderTopColor: "var(--accent)", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />}
            <span style={{ color: status === "loading" ? "var(--accent)" : status === "success" ? "var(--success)" : "var(--danger)", fontSize: 14 }}>
              {statusMessage}
            </span>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        input::placeholder { color: var(--text-dim); }
        input[type=number]::-webkit-inner-spin-button { opacity: 0.5; }
      `}</style>
    </div>
  );
}
