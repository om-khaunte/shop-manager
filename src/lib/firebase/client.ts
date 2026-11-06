import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { firebaseOptions, USE_EMULATORS } from "./config";

interface Clients {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

let clients: Clients | null = null;

export function firebaseClients(): Clients {
  if (clients) return clients;
  const app = getApps().length ? getApp() : initializeApp(firebaseOptions());
  const auth = getAuth(app);
  const db = getFirestore(app);
  if (USE_EMULATORS) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
  }
  clients = { app, auth, db };
  return clients;
}
