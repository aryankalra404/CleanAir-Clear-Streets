"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import Link from "next/link";
import { defaultLocation, hazardTags } from "@/components/report/reportData";
import ReportLocationPicker from "@/components/report/ReportLocationPicker";
import Navbar from "@/components/shared/Navbar";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import { hasPollutionSignal, type FirestoreReport } from "@/lib/firestoreReports";
import { submitCitizenReport } from "@/lib/reportSubmissions";

type SubmitState = "idle" | "submitting" | "submitted" | "error";
type ClassificationFeedback =
  | {
      tone: "accepted" | "neutral" | "error" | "processing";
      message: string;
    }
  | null;

const MAX_SOURCE_IMAGE_BYTES = 6_000_000;
const MAX_UPLOAD_IMAGE_CHARS = 620_000;
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

async function compressPhotoForUpload(file: File) {
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
    if (compressed.length <= MAX_UPLOAD_IMAGE_CHARS) return compressed;
  }

  throw new Error("Choose a simpler or smaller image so it can upload safely.");
}

async function uploadPhotoToImgBB(dataUrl: string, fileName: string) {
  const response = await fetch("/api/upload-image", {
    body: JSON.stringify({
      image: dataUrl,
      name: `cleanair-${Date.now()}-${fileName.replace(/\.[^.]+$/, "")}`,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const payload = (await response.json()) as { error?: string; imageUrl?: string };

  if (!response.ok || !payload.imageUrl) {
    throw new Error(payload.error ?? "Could not upload photo.");
  }

  return payload.imageUrl;
}

export default function ReportPortal() {
  const [selectedTag, setSelectedTag] = useState(hazardTags[0].id);
  const [anonymous, setAnonymous] = useState(true);
  const [location, setLocation] = useState(defaultLocation);
  const [note, setNote] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState("");
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
  const isNoSignalFeedback = classificationFeedback?.tone === "neutral";
  const isProcessingFeedback =
    classificationFeedback?.tone === "processing" ||
    (submitState === "submitted" && storedInFirebase && !classificationFeedback);

  useEffect(() => {
    if (!submissionId || !storedInFirebase || !isFirebaseConfigured || !db) return;

    return onSnapshot(doc(db, "reports", submissionId), (snapshot) => {
      if (!snapshot.exists()) return;

      const report = snapshot.data() as FirestoreReport;
      if (report.status === "pending") {
        setClassificationFeedback({
          message: "Analyzing your photo...",
          tone: "processing",
        });
        return;
      }

      if (report.status === "classification_failed") {
        setClassificationFeedback({
          message:
            "Report saved, but Gemini could not classify this photo. It stays hidden until reviewed or retried.",
          tone: "error",
        });
        return;
      }

      if (report.status === "no_signal") {
        setClassificationFeedback({
          message:
            "We couldn't detect a clear pollution signal in this photo. It won't appear on the public map, but thanks for the report - feel free to try again with a clearer photo of the smoke, dust, or haze if you still see something.",
          tone: "neutral",
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
    setPhotoPreviewUrl("");
    setIsPreparingPhoto(true);

    try {
      const compressedPhoto = await compressPhotoForUpload(file);
      setPhotoPreviewUrl(compressedPhoto);
      const uploadedPhotoUrl = await uploadPhotoToImgBB(compressedPhoto, file.name);
      setPhotoUrl(uploadedPhotoUrl);
      setSubmitError("");
      setSubmitState("idle");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Could not prepare that image.");
      setSubmitState("error");
    } finally {
      setIsPreparingPhoto(false);
    }
  }

  function handleRemovePhoto() {
    setPhotoUrl("");
    setPhotoPreviewUrl("");
    setSubmitError("");
    setSubmitState("idle");
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
      if (submission.stored) {
        setClassificationFeedback({
          message: "Analyzing your photo...",
          tone: "processing",
        });
      }
      setSubmitState("submitted");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unknown Firebase error");
      setSubmitState("error");
    }
  }

  return (
    <main className="app-page-shell">
      <div className="app-page-container">
        <Navbar />

        <div className="app-page-content">
          <header className="public-map-header" style={{ marginBottom: "24px" }}>
            <div>
              <p className="eyebrow">Public intake</p>
              <h1>Report pollution hotspots.</h1>
              <p>
                Upload a photo, tag what you see, and share location context.
                CleanAir Command validates the report with AI, local sensors, and
                satellite signals before alerting municipal responders.
              </p>
            </div>
          </header>

        <section className="report-layout">
          <form
            className="report-form-card"
            onSubmit={(event) => {
              event.preventDefault();
              handleSubmit();
            }}
          >
            <div className={photoPreviewUrl ? "upload-zone has-photo" : "upload-zone"}>
              <input
                id="pollution-photo"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) => handlePhotoChange(event.target.files?.[0])}
              />
              {!photoPreviewUrl ? (
                <label htmlFor="pollution-photo">
                  <span>Upload photo</span>
                  <strong>
                    {isPreparingPhoto
                      ? "Uploading photo for Gemini screening"
                      : "Open camera or choose image"}
                  </strong>
                  <small>Smoke, dust, flame, or visible haze works best.</small>
                </label>
              ) : (
                <div className="uploaded-evidence-card">
                  {/* eslint-disable-next-line @next/next/no-img-element -- Local data URL preview before the image is hosted. */}
                  <img alt="Uploaded pollution report evidence" src={photoPreviewUrl} />
                  <div className="uploaded-evidence-copy">
                    <span>{photoUrl ? "Photo uploaded" : "Uploading photo"}</span>
                    <strong>
                      {photoUrl
                        ? "Ready for Gemini screening"
                        : "Securing evidence image"}
                    </strong>
                    <small>Stored as a hosted URL before the report is saved.</small>
                    <div className="uploaded-evidence-actions">
                      <label htmlFor="pollution-photo">Change photo</label>
                      <button onClick={handleRemovePhoto} type="button">
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              )}
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

            <ReportLocationPicker value={location} onChange={setLocation} />

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
                ? "Uploading photo..."
                : submitState === "submitting"
                  ? "Submitting..."
                  : "Submit Report"}
            </button>
          </form>

          <aside className="report-side-panel">
            <div className="report-flow-card">
              <h2>What happens next</h2>
              <ol>
                <li>Photo is classified for smoke, dust, fire, or emission.</li>
                <li>Location is matched with sensors and known risk zones.</li>
                <li>Verified hotspots are pushed to the municipal dashboard.</li>
              </ol>
            </div>

            {submitState === "submitted" && (
              <div
                className={
                  isNoSignalFeedback
                    ? "submission-card neutral"
                    : "submission-card"
                }
                role="status"
              >
                <strong>
                  {isNoSignalFeedback
                    ? "Report checked"
                    : isProcessingFeedback
                      ? "Analyzing report"
                    : storedInFirebase
                      ? "Report saved to Firebase"
                      : "Report submitted"}
                </strong>
                <p>
                  {isNoSignalFeedback
                    ? "The report remains saved for audit, but it will stay out of the public hotspot layer."
                    : isProcessingFeedback
                      ? "This can take a little while while the system checks whether the image shows smoke, dust, haze, or fire."
                    : `Your report helped flag a possible hotspot near ${location.label}. Municipal teams will see it in the incident queue after validation.`}
                </p>
                {submissionId && <small>Submission ID: {submissionId}</small>}
                {classificationFeedback && (
                  <small className={`classification-feedback ${classificationFeedback.tone}`}>
                    {classificationFeedback.tone === "processing" && (
                      <span className="classification-spinner" aria-hidden="true" />
                    )}
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
      </div>
    </main>
  );
}
