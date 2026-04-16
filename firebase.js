import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc, query, orderBy, onSnapshot, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAgcFAVzZTkar8emf5em7wpU9YvYYsvC0A",
  authDomain: "sillones-fb.firebaseapp.com",
  projectId: "sillones-fb",
  storageBucket: "sillones-fb.firebasestorage.app",
  messagingSenderId: "99076494191",
  appId: "1:99076494191:web:d922c5ab34ba69d8468e9a"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
await setPersistence(auth, browserLocalPersistence);

const COLLECTIONS = { products: "products", admins: "admins", home: "home", settings: "settings" };
const DOCS = { home: "content", settings: "general" };
const ADMIN_UIDS = new Set([
  "aPc1gQTq6SXHgYNeUoGEikJAW7l2"
]);

async function getSettings() {
  const snapshot = await getDoc(doc(db, COLLECTIONS.settings, DOCS.settings));
  return snapshot.exists() ? snapshot.data() : null;
}

async function getHome() {
  const snapshot = await getDoc(doc(db, COLLECTIONS.home, DOCS.home));
  return snapshot.exists() ? snapshot.data() : null;
}

function listenVisibleProducts(callback) {
  return onSnapshot(query(collection(db, COLLECTIONS.products), orderBy("orden", "asc")), (snapshot) => {
    callback(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })).filter((item) => item.visible));
  });
}

function listenAllProducts(callback) {
  return onSnapshot(query(collection(db, COLLECTIONS.products), orderBy("orden", "asc")), (snapshot) => {
    callback(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
  });
}

async function saveProduct(productId, payload) {
  const target = productId ? doc(db, COLLECTIONS.products, productId) : doc(collection(db, COLLECTIONS.products));
  const body = { ...payload, orden: payload.orden ?? Date.now(), updatedAt: serverTimestamp() };
  if (!productId) body.createdAt = serverTimestamp();
  await setDoc(target, body, { merge: true });
  return target.id;
}

async function removeProduct(productId) {
  await deleteDoc(doc(db, COLLECTIONS.products, productId));
}

async function saveHome(payload) {
  await setDoc(doc(db, COLLECTIONS.home, DOCS.home), { ...payload, updatedAt: serverTimestamp() }, { merge: true });
}

async function saveSettings(payload) {
  await setDoc(doc(db, COLLECTIONS.settings, DOCS.settings), { ...payload, updatedAt: serverTimestamp() }, { merge: true });
}

async function reorderProducts(products) {
  const batch = writeBatch(db);
  products.forEach((product, index) => {
    batch.update(doc(db, COLLECTIONS.products, product.id), { orden: index + 1, updatedAt: serverTimestamp() });
  });
  await batch.commit();
}

async function isAdmin(uid) {
  if (!uid) return false;
  if (ADMIN_UIDS.has(uid)) return true;
  const snapshot = await getDoc(doc(db, COLLECTIONS.admins, uid));
  if (!snapshot.exists()) return false;
  const data = snapshot.data() || {};
  return data.role === "admin" || data.admin === true || data.isAdmin === true || data.activo === true;
}

async function getInitialProducts() {
  const snapshot = await getDocs(query(collection(db, COLLECTIONS.products), orderBy("orden", "asc")));
  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
}

export { auth, db, onAuthStateChanged, signInWithEmailAndPassword, signOut, getSettings, getHome, getInitialProducts, listenVisibleProducts, listenAllProducts, saveProduct, removeProduct, saveHome, saveSettings, reorderProducts, isAdmin };
