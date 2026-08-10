/* Judo Coach 4.0 — Firebase-only identity + cloud data layer.
 * No Google Drive OAuth / GIS is used here.
 * Google is only the identity provider inside Firebase Authentication.
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut
} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  writeBatch,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyB-XLndhemneFVIxBwB8J0_kaKbVLcBaYo',
  authDomain: 'judocoachapp.firebaseapp.com',
  projectId: 'judocoachapp',
  storageBucket: 'judocoachapp.firebasestorage.app',
  messagingSenderId: '381987352706',
  appId: '1:381987352706:web:2959b3cd85949033b4049b',
  measurementId: 'G-PV3N36BVB9'
};

const ADMIN_EMAIL = 'peihyei@gmail.com';
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

try {
  await setPersistence(auth, browserLocalPersistence);
} catch (e) {
  console.warn('Firebase Auth persistence setup failed:', e);
}


function safeEmail(user) {
  return String(user?.email || '').trim().toLowerCase();
}

async function ensureUserProfile(user) {
  if (!user) return null;
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  const existing = snap.exists() ? snap.data() : null;
  const isInitialAdmin = safeEmail(user) === ADMIN_EMAIL;

  if (!existing) {
    const roles = isInitialAdmin ? ['admin'] : [];
    const profile = {
      uid: user.uid,
      email: user.email || null,
      displayName: user.displayName || '',
      photoURL: user.photoURL || '',
      roles,
      primaryRole: roles[0] || null,
      clubId: isInitialAdmin ? 'club_001' : null,
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastLoginAt: serverTimestamp()
    };
    await setDoc(ref, profile);
    return profile;
  }

  // Never remove roles here. Role changes are an admin operation and are
  // enforced by Firestore Security Rules.
  await setDoc(ref, {
    email: user.email || existing.email || null,
    displayName: user.displayName || existing.displayName || '',
    photoURL: user.photoURL || existing.photoURL || '',
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp()
  }, { merge: true });
  return { ...existing, uid: user.uid };
}

async function signIn() {
  if (!/^https?:$/.test(window.location.protocol)) {
    throw new Error('Firebase Auth требует запуск через http:// или https://, а не через file://.');
  }
  try {
    await signInWithRedirect(auth, provider);
  } catch (error) {
    console.error('Firebase signInWithRedirect failed:', error);
    throw error;
  }
}

async function handleRedirect() {
  try {
    return await getRedirectResult(auth);
  } catch (error) {
    console.error('Firebase redirect sign-in failed:', error);
    window.dispatchEvent(new CustomEvent('judo:firebase-auth-error', { detail: error }));
    return null;
  }
}

const api = {
  app,
  auth,
  db,
  provider,
  adminEmail: ADMIN_EMAIL,
  signIn,
  signOut: () => signOut(auth),
  getCurrentUser: () => auth.currentUser,
  getUserProfile: async (uid) => {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? snap.data() : null;
  },
  getUserDataCollection: (uid) => collection(db, 'users', uid, 'data'),
  getUserDataDoc: (uid, docId) => doc(db, 'users', uid, 'data', docId),
  getDoc,
  setDoc,
  getDocs,
  writeBatch,
  serverTimestamp,
  onAuthStateChanged
};

window.JudoFirebase = api;

(async () => {
  // Resolve any pending Google/Firebase redirect before notifying the UI.
  // This prevents a race where the app renders as signed-out for a moment
  // after Google returns to the application.
  await handleRedirect();
  window.dispatchEvent(new Event('judo:firebase-ready'));
})();

onAuthStateChanged(auth, async (user) => {
  let profile = null;
  try {
    if (user) profile = await ensureUserProfile(user);
  } catch (e) {
    console.error('Unable to initialize Firebase user profile:', e);
  }
  window.dispatchEvent(new CustomEvent('judo:firebase-auth-state', {
    detail: { user, profile }
  }));
});
