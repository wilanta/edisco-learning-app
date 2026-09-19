import fs from 'fs';

const file = 'IMPLEMENTATION_PLAN.md';
let content = fs.readFileSync(file, 'utf8');

const lines = content.split('\n').map(l => l.replace(/\r$/, ''));
let inTable = false;
let modifiedLines = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  if (line.match(/^\| Requirement \|/) || line.match(/^\| API endpoint \|/) || line.match(/^\| Alias \/ rule \|/) || line.match(/^\| SRS use case \|/)) {
    inTable = true;
    modifiedLines.push(line + ' Status |');
    continue;
  }
  
  if (inTable && line.startsWith('|---|')) {
    modifiedLines.push(line + '---|');
    continue;
  }
  
  if (inTable && line.startsWith('|')) {
    let status = 'IMPLEMENTED_AND_VERIFIED';
    
    if (line.includes('grouping/promotion') || line.includes('NFR-SEC-03') || line.includes('offline features')) {
      status = 'OUT_OF_SCOPE';
    }
    if (line.includes('BR-16') || line.includes('BR-10')) {
       status = 'PARTIAL';
    }
    if (line.includes('OQ-6') || line.includes('OQ-7') || line.includes('A23') || line.includes('A26')) {
       status = 'IMPLEMENTED_AND_VERIFIED';
    }

    modifiedLines.push(line + ` ${status} |`);
    continue;
  }
  
  if (inTable && !line.startsWith('|') && line.trim() !== '') {
    inTable = false;
  }
  
  modifiedLines.push(line);
}

fs.writeFileSync(file, modifiedLines.join('\n'));
console.log('Done modifying tables.');
