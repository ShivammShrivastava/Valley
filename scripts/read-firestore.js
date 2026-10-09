// Script to read and display Firestore data from Suvega's database
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, getDoc } = require('firebase/firestore');



async function readFirestore() {
  console.log('🔌 Initializing Firebase...');
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  console.log('✅ Firebase initialized!\n');

  // ── 1. Try the "Indore" collection (capital I, as used in trafficSignals.ts) ──
  console.log('═══════════════════════════════════════════════════════');
  console.log('📡 Reading "Indore" collection (capital I)...');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    const indoreSnapshot = await getDocs(collection(db, 'Indore'));

    if (indoreSnapshot.empty) {
      console.log('  ⚠️  "Indore" collection is empty\n');
    } else {
      console.log(`  ✅ Found ${indoreSnapshot.size} document(s) in "Indore":\n`);

      for (const squareDoc of indoreSnapshot.docs) {
        console.log(`  ┌──────────────────────────────────────────────────`);
        console.log(`  │ 📍 Document: "${squareDoc.id}"`);
        console.log(`  ├──────────────────────────────────────────────────`);

        const squareData = squareDoc.data();
        if (Object.keys(squareData).length > 0) {
          Object.entries(squareData).forEach(([key, value]) => {
            console.log(`  │   ${key}: ${JSON.stringify(value)}`);
          });
        } else {
          console.log(`  │   (no top-level fields — data is in sub-collections)`);
        }

        // ── Probe sub-collections: "Traffic light N: XX" ──
        const abbreviation = squareDoc.id
          .split(/\s+/)
          .map((word) => word.charAt(0).toUpperCase())
          .join('');

        for (let i = 1; i <= 10; i++) {
          // Try with abbreviation
          for (const subColName of [
            `Traffic light ${i}: ${abbreviation}`,
            `Traffic light ${i}`,
          ]) {
            try {
              const subSnapshot = await getDocs(
                collection(db, 'Indore', squareDoc.id, subColName),
              );
              if (!subSnapshot.empty) {
                console.log(`  │`);
                console.log(`  │   🚦 Sub-collection: "${subColName}" (${subSnapshot.size} doc(s))`);

                subSnapshot.forEach((signalDoc) => {
                  console.log(`  │     ┌─ Signal Doc: "${signalDoc.id}"`);
                  const data = signalDoc.data();
                  Object.entries(data).forEach(([key, value]) => {
                    console.log(`  │     │  ${key}: ${JSON.stringify(value)}`);
                  });
                  console.log(`  │     └─────────────────────`);
                });
              }
            } catch {
              // sub-collection doesn't exist
            }
          }
        }

        console.log(`  └──────────────────────────────────────────────────\n`);
      }
    }
  } catch (error) {
    console.error('  ❌ Error reading "Indore":', error.message);
  }

  // ── 2. Also try lowercase "indore" ──
  console.log('═══════════════════════════════════════════════════════');
  console.log('📡 Also checking "indore" (lowercase)...');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    const indoreLower = await getDocs(collection(db, 'indore'));
    if (indoreLower.empty) {
      console.log('  ⚠️  "indore" collection is empty\n');
    } else {
      console.log(`  ✅ Found ${indoreLower.size} document(s) in "indore":\n`);
      indoreLower.forEach((d) => {
        console.log(`  📍 "${d.id}":`, JSON.stringify(d.data(), null, 2));
      });
    }
  } catch (error) {
    console.error('  ❌ Error:', error.message);
  }

  // ── 3. Try some other common collection names ──
  const otherCollections = ['users', 'signals', 'traffic', 'routes', 'cities', 'config', 'settings'];
  console.log('═══════════════════════════════════════════════════════');
  console.log('📡 Probing other common collections...');
  console.log('═══════════════════════════════════════════════════════\n');

  for (const colName of otherCollections) {
    try {
      const snap = await getDocs(collection(db, colName));
      if (!snap.empty) {
        console.log(`  ✅ "${colName}": ${snap.size} document(s)`);
        snap.forEach((d) => {
          const data = d.data();
          const preview = JSON.stringify(data).substring(0, 200);
          console.log(`     📄 "${d.id}": ${preview}${JSON.stringify(data).length > 200 ? '...' : ''}`);
        });
        console.log('');
      }
    } catch {
      // skip
    }
  }

  console.log('\n✅ Firestore read complete!');
  process.exit(0);
}

readFirestore();
