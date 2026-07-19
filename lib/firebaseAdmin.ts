import "server-only";

import { applicationDefault, cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

function getServiceAccountFromEnv(): ServiceAccount | null {
  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!rawServiceAccount) return null;

  const decodedServiceAccount = rawServiceAccount.trim().startsWith("{")
    ? rawServiceAccount
    : Buffer.from(rawServiceAccount, "base64").toString("utf8");

  const serviceAccount = JSON.parse(decodedServiceAccount) as ServiceAccount & {
    client_email?: string;
    private_key?: string;
    project_id?: string;
  };

  return {
    clientEmail: serviceAccount.clientEmail ?? serviceAccount.client_email,
    privateKey: serviceAccount.privateKey ?? serviceAccount.private_key,
    projectId: serviceAccount.projectId ?? serviceAccount.project_id,
  };
}

const firebaseServiceAccount = getServiceAccountFromEnv();

const adminApp =
  getApps()[0] ??
  initializeApp(
    firebaseServiceAccount
      ? {
          credential: cert(firebaseServiceAccount),
          projectId: firebaseServiceAccount.projectId,
        }
      : {
          credential: applicationDefault(),
          projectId: process.env.FIREBASE_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT,
        },
  );

export const adminDb = getFirestore(adminApp);
export const adminServerTimestamp = FieldValue.serverTimestamp;
