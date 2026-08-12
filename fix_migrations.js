const fs = require('fs');
const path = require('path');

const migrationsDir = path.join(__dirname, 'supabase', 'migrations');
const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));

for (const file of files) {
  const filePath = path.join(migrationsDir, file);
  let content = fs.readFileSync(filePath, 'utf-8');

  // Fix CREATE TABLE
  content = content.replace(/CREATE TABLE (?!IF NOT EXISTS)(\w+)/g, 'CREATE TABLE IF NOT EXISTS $1');
  
  // Fix CREATE INDEX
  content = content.replace(/CREATE INDEX (?!IF NOT EXISTS)(\w+)/g, 'CREATE INDEX IF NOT EXISTS $1');

  // Fix triggers
  // For every CREATE TRIGGER name ..., we should prepend DROP TRIGGER IF EXISTS name ON table;
  // Match: CREATE TRIGGER trigger_name \n BEFORE UPDATE ON table_name
  const triggerRegex = /CREATE TRIGGER\s+(\w+)\s+(BEFORE|AFTER)\s+(UPDATE|INSERT|DELETE)\s+ON\s+(\w+)/g;
  let newContent = content;
  let match;
  while ((match = triggerRegex.exec(content)) !== null) {
    const triggerName = match[1];
    const tableName = match[4];
    const dropStmt = `DROP TRIGGER IF EXISTS ${triggerName} ON ${tableName};\n`;
    
    // Check if dropStmt is already right before it
    const index = newContent.indexOf(match[0]);
    const before = newContent.substring(Math.max(0, index - 100), index);
    if (!before.includes(`DROP TRIGGER IF EXISTS ${triggerName}`)) {
      newContent = newContent.substring(0, index) + dropStmt + newContent.substring(index);
    }
  }

  // Fix Policies
  // Policies cannot use IF NOT EXISTS. The safest way is to DROP POLICY IF EXISTS before CREATE POLICY.
  const policyRegex = /CREATE POLICY\s+"([^"]+)"\s+ON\s+(\w+)/g;
  let finalContent = newContent;
  let pMatch;
  while ((pMatch = policyRegex.exec(newContent)) !== null) {
    const policyName = pMatch[1];
    const tableName = pMatch[2];
    const dropStmt = `DROP POLICY IF EXISTS "${policyName}" ON ${tableName};\n`;
    
    const index = finalContent.indexOf(pMatch[0]);
    const before = finalContent.substring(Math.max(0, index - 100), index);
    if (!before.includes(`DROP POLICY IF EXISTS "${policyName}"`)) {
      finalContent = finalContent.substring(0, index) + dropStmt + finalContent.substring(index);
    }
  }

  if (content !== finalContent) {
    fs.writeFileSync(filePath, finalContent, 'utf-8');
    console.log(`Fixed idempotency in ${file}`);
  }
}
