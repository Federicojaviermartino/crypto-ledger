#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Production start script
 * Verifies compiled files exist before starting
 */

// Determine the correct path to main.js
const possiblePaths = [
  path.join(__dirname, 'dist', 'apps', 'api', 'main.js'),
  path.join(__dirname, 'dist', 'apps', 'api', 'src', 'main.js'),
  path.join(__dirname, 'dist', 'main.js'),
  path.join(process.cwd(), 'dist', 'apps', 'api', 'main.js'),
];

let mainPath = null;

console.log('🔍 Searching for main.js...');
console.log('CWD:', process.cwd());
console.log('DIR:', __dirname);

for (const testPath of possiblePaths) {
  if (fs.existsSync(testPath)) {
    mainPath = testPath;
    console.log(`✅ Found main.js at: ${testPath}`);
    break;
  }
}

if (!mainPath) {
  console.error('❌ ERROR: Could not find compiled main.js');
  console.error('Searched paths:');
  possiblePaths.forEach(p => console.error(`  - ${p}`));
  
  // List actual directory structure
  console.error('\n📂 Actual dist/ structure:');
  if (fs.existsSync('dist')) {
    const exec = require('child_process').execSync;
    try {
      const result = exec('find dist -name "*.js" 2>/dev/null | head -20 || dir /s /b dist\\*.js 2>nul', { encoding: 'utf-8' });
      console.error(result);
    } catch (e) {
      console.error('Could not list dist/ contents');
    }
  } else {
    console.error('dist/ directory does not exist!');
  }
  
  process.exit(1);
}

// Start the application
console.log(`🚀 Starting application from: ${mainPath}`);
console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`🔌 Port: ${process.env.PORT || 3000}`);

const app = spawn('node', [mainPath], {
  stdio: 'inherit',
  env: { ...process.env }
});

app.on('error', (error) => {
  console.error('❌ Failed to start application:', error);
  process.exit(1);
});

app.on('exit', (code) => {
  if (code !== 0) {
    console.error(`❌ Application exited with code ${code}`);
    process.exit(code);
  }
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('⚠️  Received SIGTERM, shutting down gracefully...');
  app.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('⚠️  Received SIGINT, shutting down gracefully...');
  app.kill('SIGINT');
});
