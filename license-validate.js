// BoardScope license validation handler (mounted at POST /license-validate).
//
// Trial keys embed their own expiry date: BOARDSCOPE-TRIAL-YYYYMMDD
// Pro features work through the end of that day (23:59:59 UTC), then the
// key is rejected here and the app drops back to Free on next re-validation.
// Generate with: node scripts/trial-key.js [days | YYYY-MM-DD]
//
// Paid keys are validated directly with Polar's API (see v6.0.7).

const TRIAL_PREFIX = /^BOARDSCOPE-TRIAL-/;

// Pure check for trial keys.
// Returns { valid: true, plan, expires } | { valid: false, error } | null (not a trial key)
function trialCheck(key) {
  if (!TRIAL_PREFIX.test(key)) return null;

  if (!/^BOARDSCOPE-TRIAL-[0-9]{8}$/.test(key)) {
    return { valid: false, error: 'Invalid trial key format — expected BOARDSCOPE-TRIAL-YYYYMMDD (expiry date)' };
  }

  const y = +key.slice(-8, -4), m = +key.slice(-4, -2), d = +key.slice(-2);
  const expiry = new Date(Date.UTC(y, m - 1, d, 23, 59, 59));
  const isRealDate = expiry.getUTCFullYear() === y && expiry.getUTCMonth() === m - 1 && expiry.getUTCDate() === d;
  if (!isRealDate || y < 2026 || y > 2099) {
    return { valid: false, error: 'Invalid trial key date' };
  }

  if (expiry.getTime() <= Date.now()) {
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return { valid: false, error: `This trial license expired on ${dateStr}. Get Pro at https://boardscope.ca or contact support@boardscope.ca for an extension` };
  }

  return { valid: true, plan: 'trial', expires: expiry.toISOString() };
}

module.exports = async (req, res) => {
  try {
    const { key } = req.body;
    if (!key) {
      return res.json({ valid: false, error: 'Missing license key' });
    }

    const k = key.trim().toUpperCase();

    // Trial keys — expiry enforced by the embedded date
    const trial = trialCheck(k);
    if (trial) return res.json(trial);

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

module.exports.trialCheck = trialCheck;
