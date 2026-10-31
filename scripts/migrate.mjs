// One-off migration tool; run only in a trusted terminal with Turso env vars.
import { readFile } from 'node:fs/promises';
import { executeSql, databaseHealth } from '../database.mjs';
if(process.argv[2]!=='--apply'){console.error('Usage: node scripts/migrate.mjs --apply');process.exitCode=2;}
else{
  const health=await databaseHealth();
  if(health.status!=='connected'){console.error('Database not connected:',health.reason||health.status);process.exitCode=1;}
  else{
    const source=await readFile(new URL('../turso/migrations/001_core.sql',import.meta.url),'utf8');
    // Migration is a fixed, reviewed file. No remote or user-supplied SQL accepted.
    const statements=source.split(';').map(s=>s.trim()).filter(Boolean);
    for(const statement of statements)await executeSql(statement);
    const rows=await executeSql("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('organizations','users','memberships','organization_invitations','audit_events') ORDER BY name");
    const names=(rows?.rows||[]).map(r=>r[0]?.value??r[0]);
    if(names.length!==5)throw new Error('Expected five core tables; got '+names.length);
    console.log('Core schema verified:',names.join(', '));
  }
}
