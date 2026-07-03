"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import Link from "next/link";
import { defaultLocation, hazardTags } from "@/components/report/reportData";
import Navbar from "@/components/shared/Navbar";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import { hasPollutionSignal, type FirestoreReport } from "@/lib/firestoreReports";
import { submitCitizenReport } from "@/lib/reportSubmissions";

type SubmitState = "idle" | "submitting" | "submitted" | "error";
type ClassificationFeedback =
  | {
      tone: "accepted" | "neutral" | "error";
      message: string;
    }
  | null;

const MAX_SOURCE_IMAGE_BYTES = 6_000_000;
const MAX_STORED_IMAGE_CHARS = 620_000;
const COMPRESSED_IMAGE_MAX_EDGE = 960;

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read that image. Try another photo."));
    image.src = dataUrl;
  });
}

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Could not read that image. Try another photo."));
      }
    };
    reader.onerror = () => reject(new Error("Could not read that image. Try another photo."));
    reader.readAsDataURL(file);
  });
}

async function compressPhotoForFirestore(file: File) {
  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error("Choose a photo under 6 MB for the demo upload.");
  }

  const originalDataUrl = await fileToDataUrl(file);
  const image = await loadImage(originalDataUrl);
  const scale = Math.min(
    1,
    COMPRESSED_IMAGE_MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare that image. Try another photo.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const qualityLevels = [0.72, 0.62, 0.52, 0.42];
  for (const quality of qualityLevels) {
    const compressed = canvas.toDataURL("image/jpeg", quality);
    if (compressed.length <= MAX_STORED_IMAGE_CHARS) return compressed;
  }

  throw new Error("Choose a simpler or smaller image so the demo can store it safely.");
}

export default function ReportPortal() {
  const [selectedTag, setSelectedTag] = useState(hazardTags[0].id);
  const [anonymous, setAnonymous] = useState(true);
  const [location, setLocation] = useState(defaultLocation);
  const [note, setNote] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [isPreparingPhoto, setIsPreparingPhoto] = useState(false);
  const [submissionId, setSubmissionId] = useState("");
  const [storedInFirebase, setStoredInFirebase] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [classificationFeedback, setClassificationFeedback] =
    useState<ClassificationFeedback>(null);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");

  const selectedHazard = useMemo(
    () => hazardTags.find((tag) => tag.id === selectedTag) ?? hazardTags[0],
    [selectedTag],
  );

  function handleLocationClick() {
    setLocation(defaultLocation);
  }

  useEffect(() => {
    if (!submissionId || !storedInFirebase || !isFirebaseConfigured || !db) return;

    return onSnapshot(doc(db, "reports", submissionId), (snapshot) => {
      if (!snapshot.exists()) return;

      const report = snapshot.data() as FirestoreReport;
      if (report.status === "classification_failed") {
        setClassificationFeedback({
          message:
            "Report saved, but Gemini could not classify this photo. It stays hidden until reviewed or retried.",
          tone: "error",
        });
        return;
      }

      if (report.status !== "classified" || !report.geminiClassification) return;

      if (hasPollutionSignal(report)) {
        setClassificationFeedback({
          message:
            "Pollution signal detected. Your report can appear on the public map while it waits for corroboration.",
          tone: "accepted",
        });
        return;
      }

      setClassificationFeedback({
        message:
          "No pollution signal detected in this photo. The report is saved for audit, but it will not appear on the public map.",
        tone: "neutral",
      });
    });
  }, [storedInFirebase, submissionId]);

  async function handlePhotoChange(file: File | undefined) {
    if (!file) return;
    setSubmitError("");
    setPhotoUrl("");
    setIsPreparingPhoto(true);

    try {
      const compressedPhoto = await compressPhotoForFirestore(file);
      setPhotoUrl(compressedPhoto);
      setSubmitError("");
      setSubmitState("idle");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Could not prepare that image.");
      setSubmitState("error");
    } finally {
      setIsPreparingPhoto(false);
    }
  }

  async function handleSubmit() {
    setSubmitState("submitting");
    setSubmitError("");
    setClassificationFeedback(null);

    if (isPreparingPhoto) {
      setSubmitError("Photo is still preparing. Try again in a moment.");
      setSubmitState("error");
      return;
    }

    if (!photoUrl) {
      setSubmitError("Attach a photo before submitting so Gemini can classify the report.");
      setSubmitState("error");
      return;
    }

    try {
      const submission = await submitCitizenReport({
        anonymous,
        aiConfidence: selectedHazard.confidence,
        hazardId: selectedHazard.id,
        hazardLabel: selectedHazard.label,
        location,
        note,
        photoUrl,
        result: selectedHazard.result,
      });

      setSubmissionId(submission.id);
      setStoredInFirebase(submission.stored);
      setSubmitState("submitted");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unknown Firebase error");
      setSubmitState("error");
    }
  }

  return (
    <main className="report-page">
      <div className="report-grid-bg" />
      <div className="report-container">
        <Navbar />

        <section className="report-hero">
          <div>
            <p className="eyebrow">Public intake</p>
            <h1>Report pollution hotspots.</h1>
            <p>
              Upload a photo, tag what you see, and share location context.
              CleanAir Command validates the report with AI, local sensors, and
              satellite signals before alerting municipal responders.
            </p>
          </div>
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
              <input
                id="pollution-photo"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) => handlePhotoChange(event.target.files?.[0])}
              />
              <label htmlFor="pollution-photo">
                <span>Upload photo</span>
                <strong>
                  {isPreparingPhoto
                    ? "Preparing photo for Gemini screening"
                    : photoUrl
                      ? "Photo attached for Gemini screening"
                      : "Open camera or choose image"}
                </strong>
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
                value={note}
                onChange={(event) => setNote(event.target.value)}
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

            <button
              className="btn btn-primary report-submit"
              disabled={submitState === "submitting" || isPreparingPhoto}
              type="submit"
            >
              {isPreparingPhoto
                ? "Preparing photo..."
                : submitState === "submitting"
                  ? "Submitting..."
                  : "Submit Report"}
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
                <strong>
                  {storedInFirebase ? "Report saved to Firebase" : "Report submitted"}
                </strong>
                <p>
                  Your report helped flag a possible hotspot near{" "}
                  {location.label}. Municipal teams will see it in the incident
                  queue after validation.
                </p>
                {submissionId && <small>Submission ID: {submissionId}</small>}
                {classificationFeedback && (
                  <small className={`classification-feedback ${classificationFeedback.tone}`}>
                    {classificationFeedback.message}
                  </small>
                )}
                <Link href="/map">See nearby hotspots</Link>
              </div>
            )}

            {submitState === "error" && (
              <div className="submission-card error" role="alert">
                <strong>
                  {photoUrl ? "Could not save report" : "Photo needed before submit"}
                </strong>
                <p>
                  {photoUrl
                    ? "Check Firestore setup and security rules, then try submitting again."
                    : "Attach a photo so Gemini can classify the report before validation."}
                </p>
                {submitError && <small>{submitError}</small>}
              </div>
            )}
          </aside>
        </section>
      </div>
    </main>
  );
}
