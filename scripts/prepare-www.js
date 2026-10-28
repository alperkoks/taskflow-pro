const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '..');
const destDir = path.resolve(srcDir, 'www');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

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
  const src = path.join(srcDir, file);
  const dest = path.join(destDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied ${file} -> www/`);
  }
});

console.log('WWW preparation complete!');
