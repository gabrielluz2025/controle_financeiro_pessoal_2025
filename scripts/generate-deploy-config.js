const fs = require('fs');
const path = require('path');

const config = {
  db_host: 'localhost',
  db_name: process.env.DB_NAME || '',
  db_user: process.env.DB_USER || '',
  db_pass: process.env.DB_PASSWORD || '',
};

const escapePhp = (value) => String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const lines = [
  '<?php',
  'return [',
  ...Object.entries(config).map(([key, value]) => `    '${key}' => '${escapePhp(value)}',`),
  '];',
  '',
];

const outputPath = path.join('deploy', 'api', 'config.php');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, lines.join('\n'));

if (!config.db_name || !config.db_user || !config.db_pass) {
  console.error('DB_NAME, DB_USER e DB_PASSWORD são obrigatórios nos secrets do GitHub.');
  process.exit(1);
}

console.log('config.php gerado com sucesso.');
