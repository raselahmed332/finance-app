const fs = require('fs');
const path = require('path');

const gradlePath = path.join(__dirname, '..', 'android', 'app', 'build.gradle');
let gradle = fs.readFileSync(gradlePath, 'utf8');
const codeMatch = gradle.match(/versionCode\s+(\d+)/);
const nameMatch = gradle.match(/versionName\s+"([^"]+)"/);
let code = codeMatch ? parseInt(codeMatch[1]) : 1;
let name = nameMatch ? nameMatch[1] : '1.0';
code++;
const parts = name.split('.');
if (parts.length >= 2) {
  parts[parts.length - 1] = (parseInt(parts[parts.length - 1]) + 1).toString();
  name = parts.join('.');
} else {
  name = name + '.1';
}
gradle = gradle.replace(/versionCode\s+\d+/, 'versionCode ' + code);
gradle = gradle.replace(/versionName\s+"[^"]+"/, 'versionName "' + name + '"');
fs.writeFileSync(gradlePath, gradle);
console.log(code + ',' + name);