import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function getAllPackageJsons(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);
  arrayOfFiles = arrayOfFiles || [];

  files.forEach((file) => {
    if (file === 'node_modules' || file === '.git' || file === 'dist') return;
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllPackageJsons(fullPath, arrayOfFiles);
    } else {
      if (file === 'package.json') {
        arrayOfFiles.push(fullPath);
      }
    }
  });

  return arrayOfFiles;
}

const rootDir = process.cwd();
const allPackageJsons = getAllPackageJsons(rootDir);
const packageMap = new Map();

allPackageJsons.forEach((f) => {
  try {
    const pkg = JSON.parse(fs.readFileSync(f, 'utf8'));
    packageMap.set(pkg.name, f);
    process.stdout.write(`Found package: ${pkg.name} at ${f}\n`);
  } catch {}
});

process.stdout.write(`Found ${packageMap.size} packages.\n`);

const targetPkgPath = path.join(rootDir, 'apps', 'web-ele', 'package.json');
const targetPkg = JSON.parse(fs.readFileSync(targetPkgPath, 'utf8'));

const deps = { ...targetPkg.dependencies, ...targetPkg.devDependencies };
Object.keys(deps).forEach((dep) => {
  const version = deps[dep];
  if (version.startsWith('workspace:')) {
    if (packageMap.has(dep)) {
      // console.log("Found " + dep);
    } else {
      console.error(`MISSING WORKSPACE PACKAGE: ${dep}`);
    }
  }
});
