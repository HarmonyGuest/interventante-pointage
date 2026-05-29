"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { collection, query, where, orderBy, getDocs, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";

interface Pointage {
  id: string;
  type: "arrivee" | "depart";
  timestamp: Timestamp;
  latitude: number;
  longitude: number;
  accuracy: number;
  mission: string;
  userId: string;
}

interface Session {
  date: string;
  mission: string;
  arrivee: Pointage | null;
  depart: Pointage | null;
  duree?: string;
}

function formatTime(ts: Timestamp) {
  return ts.toDate().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function formatDateKey(ts: Timestamp) {
  return ts.toDate().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function getDuree(arrivee: Timestamp, depart: Timestamp) {
  const diff = depart.toDate().getTime() - arrivee.toDate().getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${m} min`;
}

function groupIntoSessions(pointages: Pointage[]): Session[] {
  // Group arrivees and departs by proximity (same mission/day)
  const sessions: Session[] = [];
  const sorted = [...pointages].sort((a, b) =>
    a.timestamp.toDate().getTime() - b.timestamp.toDate().getTime()
  );

  let i = 0;
  while (i < sorted.length) {
    const p = sorted[i];
    if (p.type === "arrivee") {
      const next = sorted[i + 1];
      const session: Session = {
        date: formatDateKey(p.timestamp),
        mission: p.mission,
        arrivee: p,
        depart: null,
      };
      if (next && next.type === "depart") {
        session.depart = next;
        session.duree = getDuree(p.timestamp, next.timestamp);
        i += 2;
      } else {
        i++;
      }
      sessions.push(session);
    } else {
      // Orphan depart
      sessions.push({
        date: formatDateKey(p.timestamp),
        mission: p.mission,
        arrivee: null,
        depart: p,
      });
      i++;
    }
  }
  return sessions.reverse();
}

export default function Historique() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const q = query(
        collection(db, "pointages"),
        where("userId", "==", user.uid),
        orderBy("timestamp", "desc")
      );
      const snap = await getDocs(q);
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Pointage));
      setSessions(groupIntoSessions(all));
      setFetching(false);
    };
    fetch();
  }, [user]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "24px 16px" }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32 }}>
          <button
            onClick={() => router.back()}
            style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 10, width: 38, height: 38,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: "var(--text-muted)",
            }}
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div>
            <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 700 }}>
              Historique
            </h1>
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
              Vos derniers pointages
            </p>
          </div>
        </div>

        {fetching ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              border: "2px solid var(--border)", borderTopColor: "var(--accent)",
              animation: "spin 0.8s linear infinite", margin: "0 auto",
            }} />
          </div>
        ) : sessions.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "60px 24px",
            background: "var(--surface)", borderRadius: 20, border: "1px solid var(--border)",
          }}>
            <p style={{ color: "var(--text-muted)", fontSize: 15 }}>
              Aucun pointage enregistré pour l&apos;instant.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {sessions.map((s, idx) => (
              <div key={idx} style={{
                background: "var(--surface)", borderRadius: 20,
                border: "1px solid var(--border)", padding: "20px 22px",
                overflow: "hidden", position: "relative",
              }}>
                {/* Accent bar */}
                <div style={{
                  position: "absolute", left: 0, top: 0, bottom: 0, width: 3,
                  background: s.depart
                    ? "linear-gradient(to bottom, var(--success), var(--accent))"
                    : "var(--accent)",
                  borderRadius: "3px 0 0 3px",
                }} />

                {/* Mission & date */}
                <div style={{ marginBottom: 14 }}>
                  <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 3 }}>
                    {s.mission || <span style={{ color: "var(--text-dim)" }}>Sans mission</span>}
                  </p>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "capitalize" }}>
                    {s.date}
                  </p>
                </div>

                {/* Times */}
                <div style={{ display: "flex", gap: 24 }}>
                  <div>
                    <p style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>
                      Arrivée
                    </p>
                    <p style={{
                      fontSize: 20, fontFamily: "'Syne', sans-serif", fontWeight: 600,
                      color: s.arrivee ? "var(--success)" : "var(--text-dim)",
                    }}>
                      {s.arrivee ? formatTime(s.arrivee.timestamp) : "—"}
                    </p>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", paddingTop: 18 }}>
                    <svg width="20" height="12" fill="none" viewBox="0 0 20 12">
                      <path d="M0 6h18M13 1l5 5-5 5" stroke="var(--text-dim)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>

                  <div>
                    <p style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>
                      Départ
                    </p>
                    <p style={{
                      fontSize: 20, fontFamily: "'Syne', sans-serif", fontWeight: 600,
                      color: s.depart ? "var(--danger)" : "var(--text-dim)",
                    }}>
                      {s.depart ? formatTime(s.depart.timestamp) : "—"}
                    </p>
                  </div>

                  {s.duree && (
                    <div style={{ marginLeft: "auto" }}>
                      <p style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>
                        Durée
                      </p>
                      <p style={{
                        fontSize: 20, fontFamily: "'Syne', sans-serif", fontWeight: 600,
                        color: "var(--accent)",
                      }}>
                        {s.duree}
                      </p>
                    </div>
                  )}
                </div>

                {/* GPS info */}
                {s.arrivee && (
                  <div style={{
                    marginTop: 12, paddingTop: 12,
                    borderTop: "1px solid var(--border)",
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="var(--text-dim)"/>
                    </svg>
                    <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                      {s.arrivee.latitude.toFixed(5)}, {s.arrivee.longitude.toFixed(5)}
                      {" "}&bull; ±{Math.round(s.arrivee.accuracy)}m
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
