// Lists endpoints whose path/params were inferred from Scrapingdog's naming
// convention and should be validated against the live API.
// Run with: npm run list:unverified   (after npm run build)

import { ENDPOINTS } from "../dist/endpoints.js";

const unverified = ENDPOINTS.filter((e) => e.verify);

console.log(`Total endpoints: ${ENDPOINTS.length}`);
console.log(`Unverified (path/params inferred, please confirm): ${unverified.length}\n`);
for (const e of unverified) {
  console.log(`  ${e.tool.padEnd(24)} -> ${e.path}`);
}
