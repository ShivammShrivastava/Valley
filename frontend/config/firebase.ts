// Firebase configuration for Suvega app
// NOTE: getAnalytics is not supported in React Native, so we skip it.
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCpS3vu6HSVGhmmiV5d4QV3ESLKXX1WYEA',
  authDomain: 'valley01-f3742.firebaseapp.com',
  projectId: 'valley01-f3742',
  storageBucket: 'valley01-f3742.firebasestorage.app',
  messagingSenderId: '711733237472',
  appId: '1:711733237472:web:85cf97962b2d8ce6b1a285',
  measurementId: 'G-WC2VF92MEP',
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

export default app;
