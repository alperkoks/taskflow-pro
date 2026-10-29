const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const wwwDir = path.resolve(rootDir, 'www');
const androidAssetsDir = path.resolve(rootDir, 'android', 'app', 'src', 'main', 'assets', 'public');

[wwwDir, androidAssetsDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const filesToCopy = [
  'index.html',
  'styles.css',
  'app.js',
  'fit_recipes_data.js',
  'fit_recipes.json',
  'sw.js',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  'icon-1024.png',
  'favicon.ico',
  'icon.ico'
];

filesToCopy.forEach(file => {
  const src = path.join(rootDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(wwwDir, file));
    fs.copyFileSync(src, path.join(androidAssetsDir, file));
    console.log(`Copied ${file} to www/ and android assets/public/`);
  }
});

// Recursively copy assets/ folder
function copyDirRecursive(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDirRecursive(path.join(rootDir, 'assets'), path.join(wwwDir, 'assets'));
copyDirRecursive(path.join(rootDir, 'assets'), path.join(androidAssetsDir, 'assets'));
console.log('Copied assets/ to www/assets and android assets/public/assets');

console.log('All web assets prepared and synced successfully!');
