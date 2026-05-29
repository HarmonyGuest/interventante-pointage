"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    if (user) router.replace("/dashboard");
  }, [user, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.replace("/dashboard");
    } catch {
      setError("Identifiant ou mot de passe incorrect.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--bg)",
      padding: "24px",
    }}>
      {/* Background orb */}
      <div style={{
        position: "fixed",
        top: "20%",
        left: "50%",
        transform: "translateX(-50%)",
        width: 600,
        height: 600,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(108,99,255,0.08) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      <div style={{
        width: "100%",
        maxWidth: 420,
        position: "relative",
        zIndex: 1,
      }}>
        {/* Logo / Header */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 64,
            height: 64,
            borderRadius: 20,
            background: "linear-gradient(135deg, var(--accent), #9b8fff)",
            marginBottom: 20,
            boxShadow: "0 0 40px var(--accent-glow)",
          }}>
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="white" opacity="0.9"/>
              <circle cx="12" cy="9" r="2.5" fill="white"/>
            </svg>
          </div>
          <h1 style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: 28,
            fontWeight: 700,
            color: "var(--text)",
            letterSpacing: "-0.5px",
          }}>
            Harmony Team
          </h1>
          <p style={{
            color: "var(--text-muted)",
            fontSize: 14,
            marginTop: 8,
            fontWeight: 300,
          }}>
            Système de pointage
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: "var(--surface)",
          borderRadius: 24,
          border: "1px solid var(--border)",
          padding: "36px 32px",
          boxShadow: "0 24px 48px rgba(0,0,0,0.3)",
        }}>
          <h2 style={{
            fontSize: 18,
            fontWeight: 600,
            marginBottom: 28,
            color: "var(--text)",
          }}>
            Connexion
          </h2>

          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{
                display: "block",
                fontSize: 12,
                fontWeight: 500,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 8,
              }}>
                Adresse email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="prenom@exemple.fr"
                required
                style={{
                  width: "100%",
                  background: "var(--surface2)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "12px 16px",
                  color: "var(--text)",
                  fontSize: 15,
                  outline: "none",
                  transition: "border-color 0.2s",
                  fontFamily: "'DM Sans', sans-serif",
                }}
                onFocus={e => e.target.style.borderColor = "var(--accent)"}
                onBlur={e => e.target.style.borderColor = "var(--border)"}
              />
            </div>

            <div>
              <label style={{
                display: "block",
                fontSize: 12,
                fontWeight: 500,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 8,
              }}>
                Mot de passe
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={{
                    width: "100%",
                    background: "var(--surface2)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    padding: "12px 48px 12px 16px",
                    color: "var(--text)",
                    fontSize: 15,
                    outline: "none",
                    transition: "border-color 0.2s",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                  onFocus={e => e.target.style.borderColor = "var(--accent)"}
                  onBlur={e => e.target.style.borderColor = "var(--border)"}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute", right: 12, top: "50%",
                    transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer",
                    color: "var(--text-muted)", fontSize: 18, padding: 4,
                  }}
                >
                  {showPassword ? "🙈" : "👁️"}
                </button>
              </div>
            </div>

            {error && (
              <div style={{
                background: "rgba(255,92,108,0.1)",
                border: "1px solid rgba(255,92,108,0.3)",
                borderRadius: 10,
                padding: "10px 14px",
                fontSize: 13,
                color: "var(--danger)",
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 8,
                background: loading
                  ? "var(--surface2)"
                  : "linear-gradient(135deg, var(--accent), #9b8fff)",
                border: "none",
                borderRadius: 12,
                padding: "14px 24px",
                color: "white",
                fontSize: 15,
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                transition: "all 0.2s",
                fontFamily: "'DM Sans', sans-serif",
                boxShadow: loading ? "none" : "0 4px 20px var(--accent-glow)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {loading ? (
                <>
                  <div style={{
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    border: "2px solid rgba(255,255,255,0.3)",
                    borderTopColor: "white",
                    animation: "spin 0.8s linear infinite",
                  }} />
                  Connexion…
                </>
              ) : "Se connecter"}
            </button>
          </form>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input::placeholder { color: var(--text-dim); }
      `}</style>
    </div>
  );
}
