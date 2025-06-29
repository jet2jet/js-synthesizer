import * as fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const packageJson = require('../package.json');

fs.writeFileSync(
	process.argv[2],
	`export default '${packageJson.version}';\n`,
	'utf8'
);
