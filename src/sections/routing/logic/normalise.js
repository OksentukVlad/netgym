// Keep each legacy grader's spelling rules, including the RouterOS default quirk.
export const normIp = value => String(value || '').trim().replace(/\s+/g, '');
export const normalizeAnswer = value => normIp(value).replace(/^0\.0\.0\.00\.0\.0\.0$/i, '0.0.0.0/0').toLowerCase();
