import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db, isFirebaseConfigured } from "@/lib/firebase";

export interface ReportSubmissionInput {
  anonymous: boolean;
  aiConfidence: number;
  hazardId: string;
  hazardLabel: string;
  location: {
    label: string;
    lat: string;
    lng: string;
  };
  note: string;
  result: string;
}

export async function submitCitizenReport(report: ReportSubmissionInput) {
  if (!isFirebaseConfigured || !db) {
    return {
      id: `local-${Date.now()}`,
      stored: false,
    };
  }

  const docRef = await addDoc(collection(db, "reports"), {
    ...report,
    aiModel: "Gemini multimodal preview",
    createdAt: serverTimestamp(),
    source: "citizen",
    status: "submitted",
  });

  return {
    id: docRef.id,
    stored: true,
  };
}
