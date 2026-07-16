import "server-only";

import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import serviceAccount from "@/credentials/cleanair-clear-streets-b2e96f18917e.json";

const firebaseServiceAccount = serviceAccount as ServiceAccount;

const adminApp =
  getApps()[0] ??
  initializeApp({
    credential: cert(firebaseServiceAccount),
    projectId: serviceAccount.project_id,
  });

export const adminDb = getFirestore(adminApp);
export const adminServerTimestamp = FieldValue.serverTimestamp;
