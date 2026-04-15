import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(__dirname, '..', 'verify_sweep_output.txt');

const checks = [
  ['lint', 'npm run lint'],
  ['build', 'npm run build'],
  ['type-check', 'npm run type-check'],
  ['e2e-ticketing', 'npm run test:e2e:ticketing'],
];

const results = [];

for (const [name, command] of checks) {
  try {
    const output = execSync(command, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 1024 * 1024 * 20,
    });
    results.push({ name, exitCode: 0, output: output.slice(-4000) });
  } catch (error) {
    results.push({
      name,
      exitCode: error.status ?? 1,
      output: `${error.stdout || ''}${error.stderr || ''}`.slice(-6000),
    });
  }
}

writeFileSync(outputPath, JSON.stringify(results, null, 2));

const failed = results.find((r) => r.exitCode !== 0);
if (failed) {
  process.exit(failed.exitCode || 1);
}
