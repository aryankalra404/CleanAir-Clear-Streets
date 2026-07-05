"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import HotspotPreview from "@/components/landing/HotspotPreview";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import { reportToIncident, type FirestoreReport } from "@/lib/firestoreReports";
import type { Incident } from "@/lib/types";

export default function HeroSection() {
  const [liveIncidents, setLiveIncidents] = useState<Incident[]>([]);

  useEffect(() => {
    if (!isFirebaseConfigured || !db) return;
    const incidentsQuery = query(collection(db, "incidents"), orderBy("updatedAt", "desc"));
    return onSnapshot(incidentsQuery, (snapshot) => {
      setLiveIncidents(
        snapshot.docs.map((doc) => reportToIncident(doc.id, doc.data() as FirestoreReport))
      );
    });
  }, []);

  const activeIncidents = liveIncidents.filter((i) => i.status !== "resolved");
  const criticalCount = activeIncidents.filter((i) => i.severity === "critical").length;
  
  const resolvedTodayCount = liveIncidents.filter((i) => {
    if (i.status !== "resolved" || !i.resolvedAt) return false;
    const resolvedDate = new Date(i.resolvedAt);
    const today = new Date();
    return resolvedDate.toDateString() === today.toDateString();
  }).length;

  const dispatchedIncidents = liveIncidents.filter(i => i.dispatchStatus === "dispatched" && i.dispatchedAt && i.timestamp);
  let avgResponse = "—";
  if (dispatchedIncidents.length > 0) {
    const totalMinutes = dispatchedIncidents.reduce((sum, i) => {
      const created = new Date(i.timestamp).getTime();
      const dispatched = new Date(i.dispatchedAt!).getTime();
      return sum + Math.max(1, (dispatched - created) / 60000);
    }, 0);
    avgResponse = `${Math.round(totalMinutes / dispatchedIncidents.length)}m`;
  }

  const liveStats = [
    {
      label: "Active hotspots",
      value: activeIncidents.length.toString(),
      detail: `${criticalCount} critical`,
    },
    {
      label: "Resolved today",
      value: resolvedTodayCount.toString(),
      detail: "cleanup crews logged",
    },
    {
      label: "Avg response",
      value: avgResponse,
      detail: "report to dispatch",
    },
    {
      label: "Next spike",
      value: "—",
      detail: "Awaiting forecast data",
    },
  ];

  return (
    <div className="hero-layout">
      <div className="hero-copy">
        <div className="live-pill">
          <span />
          Live data feed · Last updated: {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>

        <h1>Detect pollution hotspots before they spread.</h1>

        <p>
          CleanAir Command combines citizen photos, local sensor readings, and
          satellite context to detect street-level smoke, dust, and waste
          burning, then turns them into action-ready municipal alerts.
        </p>

        <div className="hero-actions">
          <Link href="/report" className="btn btn-primary">
            Report a Hotspot
          </Link>
          <Link href="/dashboard" className="btn btn-secondary">
            Open Command Center
          </Link>
        </div>

        <div className="stats-grid" aria-label="Live city metrics">
          {liveStats.map((stat) => (
            <article className="stat-card" key={stat.label}>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
              <small>{stat.detail}</small>
            </article>
          ))}
        </div>
      </div>

      <HotspotPreview 
        priorityIncidents={activeIncidents.sort((a, b) => b.aiConfidence - a.aiConfidence).slice(0, 3)} 
        criticalCount={criticalCount} 
      />
    </div>
  );
}
