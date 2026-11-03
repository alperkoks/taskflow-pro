const fs = require('fs');
const js = fs.readFileSync('app.js', 'utf8');
const lines = js.split('\n');

console.log('--- Lines 3480 to 3540 ---');
console.log(lines.slice(3480, 3540).join('\n'));
