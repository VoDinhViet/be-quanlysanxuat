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
  const relativeToSrc = path.relative(path.dirname(filePath), srcDir).replace(/\\/g, '/');
  const prefix = relativeToSrc === '' ? './' : (relativeToSrc.endsWith('..') ? relativeToSrc + '/' : relativeToSrc + '/');
  
  // Replace both '@/' and 'src/' prefixes
  const newContent = content.replace(/(from|import)\s+['"](@\/|src\/)(.*?)['"]/g, (match, p1, p2, p3) => {
    let relPath = prefix + p3;
    // Ensure it starts with ./ or ../
    if (!relPath.startsWith('.')) relPath = './' + relPath;
    return `${p1} '${relPath}'`;
  });

  if (content !== newContent) {
    console.log(`Updating ${path.relative(process.cwd(), filePath)}`);
    fs.writeFileSync(filePath, newContent, 'utf8');
  }
});
