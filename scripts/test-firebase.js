// Quick test script to verify Firebase connection and fetch Bengali square data
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, getDoc } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: 'AIzaSyCpS3vu6HSVGhmmiV5d4QV3ESLKXX1WYEA',
  authDomain: 'valley01-f3742.firebaseapp.com',
  projectId: 'valley01-f3742',
  storageBucket: 'valley01-f3742.firebasestorage.app',
  messagingSenderId: '711733237472',
  appId: '1:711733237472:web:85cf97962b2d8ce6b1a285',
  measurementId: 'G-WC2VF92MEP',
};

async function testFirebase() {
  console.log('🔌 Initializing Firebase...');
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  console.log('✅ Firebase initialized!\n');

  // Try fetching the specific document
  console.log('📡 Fetching "Bengali square" from "indore" collection...\n');
  
  try {
    // Method 1: Get specific document
    const docRef = doc(db, 'indore', 'Bengali square');
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      console.log('✅ DOCUMENT FOUND: "Bengali square"');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      const data = docSnap.data();
      Object.entries(data).forEach(([key, value]) => {
        console.log(`  ${key}: ${value}`);
      });
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    } else {
      console.log('⚠️  Document "Bengali square" not found. Trying to list all documents...\n');
    }

    // Method 2: List all documents in the collection
    console.log('📋 All documents in "indore" collection:');
    const querySnapshot = await getDocs(collection(db, 'indore'));
    
    if (querySnapshot.empty) {
      console.log('  ⚠️  No documents found in "indore" collection');
    } else {
      querySnapshot.forEach((doc) => {
        console.log(`\n  📍 Document: "${doc.id}"`);
        const data = doc.data();
        Object.entries(data).forEach(([key, value]) => {
          console.log(`     ${key}: ${value}`);
        });
      });
    }

    console.log('\n✅ Firebase connection test complete!');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  process.exit(0);
}

testFirebase();
