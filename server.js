const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const DATA_BASE_FILE = path.join(__dirname, 'data.base.json');
const INVOICES_DIR = path.join(__dirname, 'invoices');
const BACKUP_DIR = path.join(__dirname, 'backup');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf'
};

const DEFAULT_DATA = {
  tabs: [
    { id: 'tab-1', name: 'Projekt A', events: [], workload: 100 },
    { id: 'tab-2', name: 'Projekt B', events: [], workload: 100 }
  ]
};

function ensureDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    if (fs.existsSync(DATA_BASE_FILE)) {
      try {
        fs.copyFileSync(DATA_BASE_FILE, DATA_FILE);
        console.log('Soubor data.json nebyl nalezen, byl vytvořen kopií z data.base.json');
        return;
      } catch (e) {
        console.error('Chyba při kopírování data.base.json do data.json:', e);
      }
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_DATA, null, 2), 'utf-8');
    console.log('Soubor data.json byl vytvořen z výchozí struktury');
  }
}

function ensureDirs() {
  if (!fs.existsSync(INVOICES_DIR)) {
    fs.mkdirSync(INVOICES_DIR, { recursive: true });
  }
  
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function backupDataFile() {
  // YYMMDD – eg. 1st october 2026 => 261001
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const prefix = `${yy}${mm}${dd}`;

  const backupFile = path.join(BACKUP_DIR, `data-${prefix}.json`);
  const oldBackupFile = `${backupFile}.old`;

  try {
    // Rename the old backup if it exists, so we can restore it in case of failure
    if (fs.existsSync(backupFile)) {
      fs.renameSync(backupFile, oldBackupFile);
    }

    // Copy current data.json to the new backup file
    fs.copyFileSync(DATA_FILE, backupFile);

    // Check if the new backup file was created successfully
    if (!fs.existsSync(backupFile)) {
      throw new Error('New backup could not be created.');
    }

    // New backup was successful, remove the old backup if it exists
    if (fs.existsSync(oldBackupFile)) {
      fs.unlinkSync(oldBackupFile);
    }

    console.log(`Backup created: ${backupFile}`);
  } catch (err) {
    console.error('Error during backup:', err);

    // If the new backup failed, restore the old backup if it exists
    if (!fs.existsSync(backupFile) && fs.existsSync(oldBackupFile)) {
      fs.renameSync(oldBackupFile, backupFile);
    }
  }
}

ensureDataFile();
ensureDirs();
setInterval(backupDataFile, 10 * 60 * 1000);

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // API Endpoints
  if (pathname === '/api/data') {
    if (req.method === 'GET') {
      try {
        ensureDataFile();
        const content = fs.readFileSync(DATA_FILE, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(content);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Error reading data.json: ' + err.message }));
      }
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
      });

      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          // Format with 2 spaces
          const formattedJson = JSON.stringify(parsed, null, 2);
          fs.writeFileSync(DATA_FILE, formattedJson, 'utf-8');

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: true, message: 'Data saved to data.json' }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON or write error: ' + err.message }));
        }
      });
      return;
    }
  }

  // Check if an invoice exists in invoices/
  if (pathname === '/api/invoices/check') {
    if (req.method === 'GET') {
      const filename = parsedUrl.searchParams.get('filename');
      if (!filename) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing filename parameter' }));
        return;
      }

      // Sanitize filename to prevent directory traversal
      const safeFilename = path.basename(filename);
      const targetFile = path.join(INVOICES_DIR, safeFilename);

      ensureDirs();
      const exists = fs.existsSync(targetFile);

      let stats = null;
      if (exists) {
        try {
          const stat = fs.statSync(targetFile);
          stats = {
            size: stat.size,
            mtime: stat.mtime
          };
        } catch (e) {
          // ignore
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        exists,
        filename: safeFilename,
        url: `/invoices/${encodeURIComponent(safeFilename)}`,
        stats
      }));
      return;
    }
  }

  // Save generated invoice to invoices/
  if (pathname === '/api/invoices/save') {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
      });

      req.on('end', () => {
        try {
          const { filename, pdfBase64, overwrite } = JSON.parse(body);
          if (!filename || !pdfBase64) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing filename or pdfBase64 data' }));
            return;
          }

          const safeFilename = path.basename(filename);
          ensureDirs();
          const targetFile = path.join(INVOICES_DIR, safeFilename);

          if (fs.existsSync(targetFile) && !overwrite) {
            res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
              error: 'Invoice already exists',
              exists: true,
              filename: safeFilename,
              url: `/invoices/${encodeURIComponent(safeFilename)}`
            }));
            return;
          }

          // Strip data URL prefix if present
          const base64Data = pdfBase64.replace(/^data:application\/pdf;base64,/, '').replace(/^data:.*?base64,/, '');
          const buffer = Buffer.from(base64Data, 'base64');

          fs.writeFileSync(targetFile, buffer);

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            success: true,
            message: 'Invoice saved successfully to invoices folder',
            filename: safeFilename,
            url: `/invoices/${encodeURIComponent(safeFilename)}`
          }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Error saving invoice: ' + err.message }));
        }
      });
      return;
    }
  }

  // Static File Serving
  let filePath = pathname === '/' ? '/index.html' : pathname;
  // Decode URI components for static files (e.g. spaces or special chars in filenames)
  try {
    filePath = decodeURIComponent(filePath);
  } catch (e) {
    // keep raw
  }
  filePath = path.join(__dirname, filePath);

  // Security: prevent directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Access denied');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('File not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    const headers = { 'Content-Type': contentType };
    if (ext === '.pdf') {
      headers['Content-Disposition'] = `inline; filename="${path.basename(filePath)}"`;
    }

    res.writeHead(200, headers);
    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 TimeTrack server is running on http://localhost:${PORT}`);
  console.log(`💾 Data is automatically written to: ${DATA_FILE}`);
  console.log(`📂 Invoices are saved to: ${INVOICES_DIR}\n`);
});
