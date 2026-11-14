// The migrations in this repository contain comment lines with semicolons.
// Strip whole-line comments before splitting SQL statements.
export function sqlStatements(sql){
 if(typeof sql!=='string')throw Error('Invalid SQL');
 const withoutComments=sql.split(/\r?\n/).filter(line=>!line.trimStart().startsWith('--')).join('\n');
 return withoutComments.split(';').map(s=>s.trim()).filter(Boolean);
}

// Statements the server actually sends to Turso. PRAGMA is per-connection state:
// over the Turso HTTP pipeline a PRAGMA set in one request is gone by the next,
// so it can never enable foreign-key enforcement (see the audit §11.1 and the
// Turso docs on PRAGMA). Sending it is at best a no-op and at worst the statement
// that aborts the whole migration run (staging 2026-11-13: "Core migration / QA
// fixture failed: SQL_INPUT_ERROR" with /healthz schema not-ready). Drop it here.
export function executableStatements(sql){
 return sqlStatements(sql).filter(s=>!/^pragma\b/i.test(s));
}
