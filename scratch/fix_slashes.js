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
  
  // Fix backslashes in imports
  const newContent = content.replace(/(from|import)\s+['"](.*?)['"]/g, (match, p1, p2) => {
    if (p2.startsWith('.')) {
      return `${p1} '${p2.replace(/\\/g, '/')}'`;
    }
    return match;
  });

  if (content !== newContent) {
    console.log(`Fixing slashes in ${path.relative(process.cwd(), filePath)}`);
    fs.writeFileSync(filePath, newContent, 'utf8');
  }
});
