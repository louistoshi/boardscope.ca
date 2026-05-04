#!/usr/bin/env node
const express = require('express');
const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'BoardScope License Server v5.4.1' });
});

app.post('/license-validate', (req, res) => {
  try {
    const { key } = req.body;
    if (!key) {
      return res.json({ valid: false, error: 'Missing license key' });
    }

    const k = key.trim().toUpperCase();

    // Validate Polar serial format: BOARDSCOPE-XXXXX...-NNNN
    const isPolarSerial = /^BOARDSCOPE-[A-Z0-9]+-[0-9]+$/.test(k);

    // Validate Polar UUID format: BOARDSCOPE_XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
    const isPolarUUID = /^BOARDSCOPE_[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(k);

    if (!isPolarSerial && !isPolarUUID) {
      return res.json({ valid: false, error: 'Invalid license format' });
    }

    // If it looks like a valid Polar key, accept it
    res.json({
      valid: true,
      plan: 'yearly',
      expires: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    });
  } catch (e) {
    res.json({ valid: false, error: 'Server error: ' + e.message });
  }
});

const server = app.listen(PORT, () => {
  console.log(`BoardScope License Server listening on port ${PORT}`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
});
