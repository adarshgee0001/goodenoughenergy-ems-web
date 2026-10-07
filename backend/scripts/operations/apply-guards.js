const fs = require('fs');
const path = require('path');

const guardCode = `
if (process.env.NODE_ENV === "production" || process.env.DATABASE_URL?.includes("ems?schema")) {
  throw new Error("This script cannot run against a production environment.");
}
`;

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Fix imports from './src/...' to '../../src/...'
  content = content.replace(/from\s+['"]\.\/src\//g, "from '../../src/");
  
  // Check if it already has the guard
  if (!content.includes('This script cannot run against a production environment')) {
    // Insert guard after the imports
    const importMatch = content.match(/import.*?[\r\n]+(?:import.*?[\r\n]+)*(?:const prisma.*?[\r\n]+)?/);
    if (importMatch) {
      content = content.replace(importMatch[0], importMatch[0] + "\n" + guardCode + "\n");
    } else {
      // For require
      const requireMatch = content.match(/const.*?require.*?[\r\n]+/);
      if (requireMatch) {
         content = content.replace(requireMatch[0], requireMatch[0] + "\n" + guardCode + "\n");
      } else {
         content = guardCode + "\n" + content;
      }
    }
  }

  // Phase 7: Live MQTT Diagnostic Safety
  if (filePath.includes('test-live-mqtt.ts')) {
     // Remove any credentials hardcoded (though we checked earlier there weren't any hardcoded, just process.env)
     // Ensure it doesn't try to reuse deleted credentials. It already uses process.env.
  }

  fs.writeFileSync(filePath, content);
}

const filesToGuard = [
  'scripts/operations/backfill-all.ts',
  'scripts/operations/create-bcms.js',
  'scripts/operations/test-live-mqtt.ts',
  'scripts/scratch/scratch_test_delete.ts',
  'scripts/scratch/scratch_test_multi_tenant.ts',
  'scripts/scratch/scratch_create_site.ts',
  'scripts/scratch/scratch_test_patch.ts',
  'scripts/scratch/scratch_test_bess_update.ts',
  'scripts/debug/debug-data.ts' // It might mutate if we are not sure, better safe than sorry
];

for (const file of filesToGuard) {
  if (fs.existsSync(file)) {
    fixFile(file);
    console.log("Fixed: " + file);
  }
}
