// The migrations in this repository contain comment lines with semicolons.
// Strip whole-line comments before splitting SQL statements.
export function sqlStatements(sql){
 if(typeof sql!=='string')throw Error('Invalid SQL');
 const withoutComments=sql.split(/\r?\n/).filter(line=>!line.trimStart().startsWith('--')).join('\n');
 return withoutComments.split(';').map(s=>s.trim()).filter(Boolean);
}
