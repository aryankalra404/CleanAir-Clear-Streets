"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { defaultLocation, hazardTags } from "@/components/report/reportData";
import Navbar from "@/components/shared/Navbar";

type SubmitState = "idle" | "submitted";

export default function ReportPortal() {
  const [selectedTag, setSelectedTag] = useState(hazardTags[0].id);
  const [anonymous, setAnonymous] = useState(true);
  const [location, setLocation] = useState(defaultLocation);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");

  const selectedHazard = useMemo(
    () => hazardTags.find((tag) => tag.id === selectedTag) ?? hazardTags[0],
    [selectedTag],
  );

  function handleLocationClick() {
    setLocation(defaultLocation);
  }

  function handleSubmit() {
    setSubmitState("submitted");
  }

  return (
    <main className="report-page">
      <div className="report-grid-bg" />
      <div className="report-container">
        <Navbar />

        <section className="report-hero">
          <div>
            <p className="eyebrow">Public intake</p>
            <h1>Report smoke, dust, or burning waste in under a minute.</h1>
            <p>
              Upload a photo, tag what you see, and share location context.
              CleanAir Command validates the report with AI, local sensors, and
              satellite signals before alerting municipal responders.
            </p>
          </div>
          <aside className="report-trust-card">
            <strong>No login required</strong>
            <span>Anonymous by default</span>
            <span>Delhi NCR pilot area</span>
          </aside>
        </section>

        <section className="report-layout">
          <form
            className="report-form-card"
            onSubmit={(event) => {
              event.preventDefault();
              handleSubmit();
            }}
          >
            <div className="upload-zone">
              <input id="pollution-photo" type="file" accept="image/*" capture="environment" />
              <label htmlFor="pollution-photo">
                <span>Upload photo</span>
                <strong>Open camera or choose image</strong>
                <small>Smoke, dust, flame, or visible haze works best.</small>
              </label>
            </div>

            <fieldset className="tag-fieldset">
              <legend>What are you seeing?</legend>
              <div className="tag-grid">
                {hazardTags.map((tag) => (
                  <button
                    className={tag.id === selectedTag ? "tag-card active" : "tag-card"}
                    key={tag.id}
                    onClick={() => setSelectedTag(tag.id)}
                    type="button"
                  >
                    <strong>{tag.label}</strong>
                    <span>{tag.description}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="location-card">
              <div>
                <label htmlFor="report-location">Location</label>
                <input
                  id="report-location"
                  value={location.label}
                  onChange={(event) =>
                    setLocation({ ...location, label: event.target.value })
                  }
                />
              </div>
              <button type="button" onClick={handleLocationClick}>
                Detect my location
              </button>
              <div className="coordinate-grid">
                <label>
                  Lat
                  <input
                    value={location.lat}
                    onChange={(event) =>
                      setLocation({ ...location, lat: event.target.value })
                    }
                  />
                </label>
                <label>
                  Long
                  <input
                    value={location.lng}
                    onChange={(event) =>
                      setLocation({ ...location, lng: event.target.value })
                    }
                  />
                </label>
              </div>
            </div>

            <label className="note-field">
              Optional note or voice transcript
              <textarea
                placeholder="Example: black smoke from garbage pile near service road, strong smell, visible since 8:30 AM"
                rows={4}
              />
            </label>

            <label className="anonymous-toggle">
              <input
                checked={anonymous}
                onChange={(event) => setAnonymous(event.target.checked)}
                type="checkbox"
              />
              Submit anonymously
            </label>

            <button className="btn btn-primary report-submit" type="submit">
              Submit Report
            </button>
          </form>

          <aside className="report-side-panel">
            <div className="ai-preview-card">
              <p className="eyebrow">AI preview</p>
              <h2>{selectedHazard.result}</h2>
              <div className="confidence-meter">
                <span style={{ width: `${selectedHazard.confidence}%` }} />
              </div>
              <strong>{selectedHazard.confidence}% visual confidence</strong>
              <p>
                After submission, the system checks nearby citizen reports,
                sensor anomalies, and satellite context before escalating.
              </p>
            </div>

            <div className="report-flow-card">
              <h2>What happens next</h2>
              <ol>
                <li>Photo is classified for smoke, dust, fire, or emission.</li>
                <li>Location is matched with sensors and known risk zones.</li>
                <li>Verified hotspots are pushed to the municipal dashboard.</li>
              </ol>
            </div>

            {submitState === "submitted" && (
              <div className="submission-card" role="status">
                <strong>Report submitted</strong>
                <p>
                  Your report helped flag a possible hotspot near{" "}
                  {location.label}. Municipal teams will see it in the incident
                  queue after validation.
                </p>
                <Link href="/map">See nearby hotspots</Link>
              </div>
            )}
          </aside>
        </section>
      </div>
    </main>
  );
}
