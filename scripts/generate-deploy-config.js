const fs = require('fs');
const path = require('path');

const esc = (v) => String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const config = {
  db_host: 'localhost',
  db_name: process.env.DB_NAME || '',
  db_user: process.env.DB_USER || '',
  db_pass: process.env.DB_PASSWORD || '',
};

const pluggy = {
  client_id:     process.env.PLUGGY_CLIENT_ID     || '',
  client_secret: process.env.PLUGGY_CLIENT_SECRET || '',
};

const lines = [
  '<?php',
  '// Banco de dados',
  'return [',
  ...Object.entries(config).map(([k, v]) => `    '${k}' => '${esc(v)}',`),
  '];',
  '',
];

const outputPath = path.join('deploy', 'api', 'config.php');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, lines.join('\n'));

// Gera pluggy-credentials.php separado (não commitado)
if (pluggy.client_id && pluggy.client_secret) {
  const pluggyLines = [
    '<?php',
    `define('PLUGGY_CLIENT_ID',     '${esc(pluggy.client_id)}');`,
    `define('PLUGGY_CLIENT_SECRET', '${esc(pluggy.client_secret)}');`,
    '',
  ];
  fs.writeFileSync(path.join('deploy', 'api', 'pluggy-credentials.php'), pluggyLines.join('\n'));
  console.log('pluggy-credentials.php gerado.');
}

if (!config.db_name || !config.db_user || !config.db_pass) {
  console.warn('⚠️  DB secrets não configurados — config.php gerado com valores vazios. Configure DB_NAME, DB_USER, DB_PASSWORD nos Secrets do GitHub para ativar sincronização com MySQL.');
}

console.log('✅ config.php gerado com sucesso.');
