"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import CommandCenterTabs from "@/components/shared/CommandCenterTabs";
import CommandCenter from "@/components/command/CommandCenter";
import Navbar from "@/components/shared/Navbar";

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) return;
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      setError("Invalid email or password.");
    }
  };

  const handleSignOut = () => {
    if (auth) signOut(auth);
  };

  if (loading) {
    return (
      <main className="app-page-shell">
        <div className="app-page-container">
          <Navbar />
        </div>
        <div className="app-page-container app-page-content" style={{ display: "flex", justifyContent: "center", padding: "100px 0" }}>
          <p>Loading workspace...</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="app-page-shell">
        <div className="app-page-container">
          <Navbar />
        </div>
        <div className="app-page-container app-page-content" style={{ display: "flex", justifyContent: "center", padding: "80px 0" }}>
          <div style={{ background: "white", padding: "32px", borderRadius: "12px", width: "100%", maxWidth: "380px", boxShadow: "0 4px 20px rgba(0,0,0,0.06)", border: "1px solid var(--line)" }}>
            <h2 style={{ margin: "0 0 24px", fontSize: "1.4rem", fontWeight: 800 }}>Command Center Login</h2>
            <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "0.85rem", fontWeight: 650, color: "var(--ink)" }}>Email Address</label>
                <input 
                  type="email" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  required 
                  style={{ padding: "10px", borderRadius: "8px", border: "1px solid var(--line)", background: "var(--surface)", fontSize: "0.95rem" }}
                  placeholder="operator@cleanair.gov"
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "0.85rem", fontWeight: 650, color: "var(--ink)" }}>Password</label>
                <input 
                  type="password" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  required 
                  style={{ padding: "10px", borderRadius: "8px", border: "1px solid var(--line)", background: "var(--surface)", fontSize: "0.95rem" }}
                />
              </div>
              {error && <p style={{ color: "#d92d20", fontSize: "0.85rem", margin: 0, fontWeight: 500 }}>{error}</p>}
              <button type="submit" className="btn btn-primary" style={{ width: "100%", marginTop: "8px", padding: "12px", fontSize: "1rem" }}>
                Sign In
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="app-page-shell">
      <div className="app-page-container">
        <Navbar />
      </div>
      <div className="app-page-container app-page-content">
        <div className="command-hero-row">
          <div className="command-header">
            <p className="eyebrow">Municipal workspace</p>
            <h1>Command Center</h1>
            <p>
              Live hotspot verification, dispatch decisions, and escalation
              tracking across Delhi NCR.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "16px" }}>
            <button 
              onClick={handleSignOut} 
              style={{ background: "transparent", border: "none", color: "var(--muted)", textDecoration: "underline", cursor: "pointer", fontSize: "0.9rem", fontWeight: 600, padding: 0 }}
            >
              Sign out
            </button>
            <CommandCenterTabs active="incidents" />
          </div>
        </div>

        <CommandCenter />
      </div>
    </main>
  );
}
