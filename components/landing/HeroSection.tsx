"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import HotspotPreview from "@/components/landing/HotspotPreview";
import { collection, limit, onSnapshot, query, orderBy } from "firebase/firestore";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import {
  hasPollutionSignal,
  reportToIncident,
  type FirestoreReport,
} from "@/lib/firestoreReports";
import type { Incident } from "@/lib/types";
import { useT } from "@/lib/languageContext";

export default function HeroSection() {
  const t = useT();
  const [liveIncidents, setLiveIncidents] = useState<Incident[]>([]);
  const [citizenReports, setCitizenReports] = useState<Incident[]>([]);

  useEffect(() => {
    if (!isFirebaseConfigured || !db) return;
    const incidentsQuery = query(collection(db, "incidents"), orderBy("updatedAt", "desc"));
    return onSnapshot(incidentsQuery, (snapshot) => {
      setLiveIncidents(
        snapshot.docs.map((doc) => reportToIncident(doc.id, doc.data() as FirestoreReport))
      );
    });
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured || !db) return;
    const reportsQuery = query(
      collection(db, "reports"),
      orderBy("createdAt", "desc"),
      limit(20),
    );

    return onSnapshot(reportsQuery, (snapshot) => {
      setCitizenReports(
        snapshot.docs
          .map((doc) => ({
            data: doc.data() as FirestoreReport,
            id: doc.id,
          }))
          .filter((report) => hasPollutionSignal(report.data))
          .map((report) => reportToIncident(report.id, report.data))
          .filter((incident) => incident.status !== "resolved"),
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

  const avgResponse = "-";

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

        <h1>{t("hero_title")}</h1>

        <p>
          {t("hero_description")}
        </p>

        <div className="hero-actions" style={{ display: 'flex', gap: '16px' }}>
          <Link href="/report" className="btn btn-primary">
            {t("hero_report_button")}
          </Link>
          <Link href="/map" className="btn btn-outline">
            Explore live map
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
        incidents={citizenReports.slice(0, 4)}
      />
    </div>
  );
}
