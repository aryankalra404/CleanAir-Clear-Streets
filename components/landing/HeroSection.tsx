"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import HotspotPreview from "@/components/landing/HotspotPreview";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import { reportToIncident, type FirestoreReport } from "@/lib/firestoreReports";
import type { Incident } from "@/lib/types";
import { useT } from "@/lib/languageContext";

export default function HeroSection() {
  const t = useT();
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
      label: t("hero_stat_active"),
      value: activeIncidents.length.toString(),
      detail: `${criticalCount} ${t("hero_stat_critical")}`,
    },
    {
      label: t("hero_stat_resolved"),
      value: resolvedTodayCount.toString(),
      detail: t("hero_stat_cleanup"),
    },
    {
      label: t("hero_stat_avg_response"),
      value: avgResponse,
      detail: t("hero_stat_report_to_dispatch"),
    },
    {
      label: t("hero_stat_next_spike"),
      value: "—",
      detail: t("hero_stat_awaiting_forecast"),
    },
  ];

  return (
    <div className="hero-layout">
      <div className="hero-copy">
        <div className="live-pill" suppressHydrationWarning>
          <span />
          {t("hero_live_data_feed").replace("{time}", new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}
        </div>

        <h1>{t("hero_title")}</h1>

        <p>
          {t("hero_description")}
        </p>

        <div className="hero-actions">
          <Link href="/report" className="btn btn-primary">
            {t("hero_report_button")}
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
