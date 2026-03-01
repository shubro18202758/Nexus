import fs from 'fs';
import path from 'path';

const configPath = path.resolve(process.cwd(), 'next.config.ts');

const content = fs.readFileSync(configPath, 'utf-8');
const restartComment = '// Force Restart: ' + Date.now();

// Append or update a comment to force Next.js to restart the server
if (content.includes('// Force Restart:')) {
    const newContent = content.replace(/\/\/ Force Restart: .*/, restartComment);
    fs.writeFileSync(configPath, newContent);
} else {
    fs.writeFileSync(configPath, content + '\n' + restartComment);
}

console.log('🔄 Updated next.config.ts to trigger server restart.');
