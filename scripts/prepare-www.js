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
  'sw.js',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  'icon-1024.png'
];

filesToCopy.forEach(file => {
  const src = path.join(rootDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(wwwDir, file));
    fs.copyFileSync(src, path.join(androidAssetsDir, file));
    console.log(`Copied ${file} to www/ and android assets/public/`);
  }
});

console.log('All web assets prepared and synced successfully!');
