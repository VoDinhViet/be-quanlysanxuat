const fs = require('fs');
const path = require('path');

function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);
  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function(file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
    } else {
      arrayOfFiles.push(path.join(dirPath, "/", file));
    }
  });

  return arrayOfFiles;
}

const srcDir = path.join(__dirname, '../src');
const files = getAllFiles(srcDir).filter(f => f.endsWith('.ts'));

files.forEach(filePath => {
  let content = fs.readFileSync(filePath, 'utf8');
  const relativeToSrc = path.relative(path.dirname(filePath), srcDir);
  const prefix = relativeToSrc === '' ? './' : (relativeToSrc.endsWith('..') ? relativeToSrc + '/' : relativeToSrc + '/');
  
  // Use a more robust regex for imports
  // Matches from '@/' and handle the replacement
  const newContent = content.replace(/from '@\/(.*?)'/g, (match, p1) => {
    let relPath = prefix + p1;
    if (relPath.startsWith('//')) relPath = relPath.substring(1);
    // Ensure it starts with ./ or ../
    if (!relPath.startsWith('.')) relPath = './' + relPath;
    return `from '${relPath}'`;
  }).replace(/import\('@\/(.*?)'\)/g, (match, p1) => {
    let relPath = prefix + p1;
    if (relPath.startsWith('//')) relPath = relPath.substring(1);
    if (!relPath.startsWith('.')) relPath = './' + relPath;
    return `import('${relPath}')`;
  });

  if (content !== newContent) {
    console.log(`Updating ${path.relative(process.cwd(), filePath)}`);
    fs.writeFileSync(filePath, newContent, 'utf8');
  }
});
