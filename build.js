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
  
  // Check multiple possible locations
  const possiblePaths = [
    path.join(__dirname, 'dist', 'apps', 'api', 'main.js'),
    path.join(__dirname, 'dist', 'main.js'),
    path.join(__dirname, 'dist', 'apps', 'api', 'src', 'main.js'),
  ];
  
  let mainPath = null;
  for (const testPath of possiblePaths) {
    if (fs.existsSync(testPath)) {
      mainPath = testPath;
      break;
    }
  }
  
  if (mainPath) {
    console.log('✅ Build successful!');
    console.log('📁 Main file location:', mainPath);
    
    // List dist structure
    console.log('\n📂 Build output structure:');
    try {
      execSync('ls -la dist/apps/api/ || dir dist\\apps\\api\\', { stdio: 'inherit' });
    } catch (e) {
      console.log('Could not list directory structure');
    }
    
  } else {
    console.error('❌ Error: main.js not found in any expected location');
    console.error('Checked paths:', possiblePaths);
    
    // List all files in dist
    console.log('\nActual dist structure:');
    try {
      execSync('find dist -name "*.js" 2>/dev/null || dir /s /b dist\\*.js', { stdio: 'inherit' });
    } catch (e) {
      console.error('Could not list dist files');
    }
    
    process.exit(1);
  }
  
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}
