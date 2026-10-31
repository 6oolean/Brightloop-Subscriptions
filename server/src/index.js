const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
require('./db');
const { errorHandler } = require('./util');
const { runBilling } = require('./billing');

const app = express();
app.use(cors());
app.use(express.json({ limit: '200kb' }));

app.get('/api/v1/health', (_req, res) => res.json({ ok: true }));
app.use('/api/v1/auth', require('./routes/auth'));
app.use('/api/v1', require('./routes/catalog'));
app.use('/api/v1', require('./routes/sales'));
app.use('/api/v1', require('./routes/finance'));
app.use('/api/v1', (_req, res) => res.status(404).json({ error: 'Not found' }));

// Serve the built client when present (single-process demo: `npm run build` then `npm start`)
const dist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => (req.method === 'GET' && !req.path.startsWith('/api') ? res.sendFile(path.join(dist, 'index.html')) : next()));
}
app.use(errorHandler);

const port = process.env.PORT || 4000;
if (require.main === module) {
  app.listen(port, () => console.log(`Brightloop API on http://localhost:${port}`));
  // Nightly billing at 02:00; the "Run billing" button calls the same function.
  cron.schedule('0 2 * * *', () => { const r = runBilling(); console.log('[cron] billing', r); });
}
module.exports = app;
