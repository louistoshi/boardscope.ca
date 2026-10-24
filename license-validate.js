module.exports = async (req, res) => {
  try {
    const { key } = req.body;
    if (!key) {
      return res.json({ valid: false, error: 'Missing license key' });
    }

    const k = key.trim().toUpperCase();

    // Polar key formats: BOARDSCOPE-<UUID4> (current), BOARDSCOPE_<UUID4>
    // (legacy), BOARDSCOPE-XXXXX-NNNN (legacy serial)
    const isPolarSerial = /^BOARDSCOPE-[A-Z0-9]+-[0-9]+$/.test(k);
    const isPolarUUID = /^BOARDSCOPE[-_][0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(k);

    if (!isPolarSerial && !isPolarUUID) {
      return res.json({ valid: false, error: 'Invalid license format' });
    }

    const orgId = process.env.POLAR_ORG_ID;
    if (!orgId) {
      // No Polar config on this deployment — permissive fallback, same policy
      // as the local server. Set POLAR_ORG_ID to enable real validation.
      return res.json({ valid: true, plan: 'lifetime', dev_mode: true });
    }

    const resp = await fetch('https://api.polar.sh/v1/customer-portal/license-keys/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: key.trim(), organization_id: orgId, label: 'boardscope-activation' })
    });
    const data = await resp.json().catch(() => ({}));
    // the API returns the key object at the top level today; accept the
    // older {license_key: ...} wrapper too
    const lk = (resp.ok && (data.license_key || (data.status ? data : null)));
    if (lk) {
      return res.json({
        valid: lk.status === 'granted',
        plan: lk.expires_at ? 'yearly' : 'lifetime',
        expires: lk.expires_at
      });
    }
    return res.json({ valid: false, error: data.detail || 'Key invalid or deactivated' });
  } catch (e) {
    res.json({ valid: false, error: 'Server error: ' + e.message });
  }
};
