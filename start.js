#!/usr/bin/env node

const path = require('path');
const fs = require('fs');

const possiblePaths = [
  path.join(process.cwd(), 'dist', 'apps', 'api', 'main.js'),
  path.join(__dirname, 'dist', 'apps', 'api', 'main.js'),
  '/opt/render/project/src/dist/apps/api/main.js',
  path.join(process.env.RENDER_PROJECT_DIR || '', 'dist', 'apps', 'api', 'main.js'),
];

console.log('🔍 Searching for main.js...');
console.log('CWD:', process.cwd());
console.log('DIR:', __dirname);

let mainPath = null;

for (const testPath of possiblePaths) {
  if (fs.existsSync(testPath)) {
    mainPath = testPath;
    console.log(`✅ Found: ${testPath}`);
    break;
  }
}

if (!mainPath) {
  console.error('❌ main.js not found in:');
  possiblePaths.forEach(p => console.error(`  - ${p}`));
  process.exit(1);
}

console.log(`🚀 Starting: ${mainPath}`);
require(mainPath);
