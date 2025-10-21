const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔨 Starting build process...\n');

try {
  // 1. Clean dist folder
  console.log('📦 Cleaning dist folder...');
  if (fs.existsSync('dist')) {
    fs.rmSync('dist', { recursive: true, force: true });
  }
  
  // 2. Run TypeScript compiler
  console.log('🔧 Running TypeScript compiler...');
  execSync('npx tsc --skipLibCheck', { stdio: 'inherit' });
  
  // 3. Verify output
  console.log('\n✅ Verifying build output...');
  const mainPath = path.join(__dirname, 'dist', 'apps', 'api', 'main.js');
  
  if (fs.existsSync(mainPath)) {
    console.log('✅ Build successful!');
    console.log('📁 Main file location:', mainPath);
    
    // List dist structure
    console.log('\n📂 Build output structure:');
    execSync('ls -R dist || dir /s dist', { stdio: 'inherit' });
  } else {
    console.error('❌ Error: main.js not found at expected location');
    console.error('Expected:', mainPath);
    process.exit(1);
  }
  
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}
