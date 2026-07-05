import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, updateDoc } from "firebase/firestore";
import * as fs from "fs";

const envVars = fs.readFileSync(".env.local", "utf-8").split("\n");
const env: Record<string, string> = {};
for (const line of envVars) {
  if (line.includes("=")) {
    const [k, ...v] = line.split("=");
    env[k.trim()] = v.join("=").trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '');
  }
}

const firebaseConfig = {
  apiKey: env["NEXT_PUBLIC_FIREBASE_API_KEY"],
  authDomain: env["NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"],
  projectId: env["NEXT_PUBLIC_FIREBASE_PROJECT_ID"],
  storageBucket: env["NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"],
  messagingSenderId: env["NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"],
  appId: env["NEXT_PUBLIC_FIREBASE_APP_ID"],
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  const reports = await getDocs(collection(db, "reports"));
  reports.docs.forEach(r => {
    console.log(r.id, "photoUrl:", r.data().photoUrl);
  });
  process.exit(0);
}
run();
