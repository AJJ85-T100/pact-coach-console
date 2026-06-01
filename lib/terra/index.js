/**
 * Terra integration — Coach Console
 * SERVER-SIDE ONLY (uses TERRA_API_KEY from env).
 *
 * Powers the PACT-branded wearable picker. Each provider card in the UI
 * POSTs to /api/terra/connect, which calls generateAuthURL() here to mint
 * a Terra-hosted OAuth URL bound to a specific client.id (passed as
 * reference_id). After the user authorises the provider, Terra fires the
 * `auth` webhook to the BOT's /terra endpoint (NOT here) with that same
 * reference_id, and the bot persists terra_user_id onto the client row.
 *
 * The webhook handler is intentionally NOT in this module — it lives with
 * the bot where the data ingest also lives. This module's only job is
 * generating the redirect URL that kicks the OAuth flow off.
 */

const TERRA_BASE = 'https://api.tryterra.co/v2';

/**
 * Generate a Terra-hosted OAuth URL for a given client + provider.
 *
 * @param {string} clientId             Supabase clients.id (UUID). Becomes Terra reference_id.
 * @param {string} provider             Terra resource code (e.g. 'OURA').
 * @param {string} successRedirectUrl   Where Terra sends the user after successful auth.
 * @param {string} failureRedirectUrl   Where Terra sends the user if auth fails / is cancelled.
 * @returns {Promise<string>}           Auth URL to redirect the user to.
 */
export async function generateAuthURL(clientId, provider, successRedirectUrl, failureRedirectUrl) {
  const devId = process.env.TERRA_DEV_ID;
  const apiKey = process.env.TERRA_API_KEY;
  if (!devId || !apiKey) {
    throw new Error('TERRA_DEV_ID and TERRA_API_KEY must be set in env.');
  }

  const res = await fetch(`${TERRA_BASE}/auth/authenticateUser`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'dev-id': devId,
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      resource: provider,
      reference_id: clientId,
      auth_success_redirect_url: successRedirectUrl,
      auth_failure_redirect_url: failureRedirectUrl,
      language: 'en',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Terra authenticateUser failed (${res.status}): ${body}`);
  }

  const json = await res.json();
  if (!json.auth_url) {
    throw new Error(`Terra returned no auth_url: ${JSON.stringify(json)}`);
  }
  return json.auth_url;
}

/**
 * Provider metadata — single source of truth for the picker UI and the
 * route validation. Order here is the order shown in the UI.
 *
 * Add/remove providers in one place; the picker page and the validation
 * both read from this list.
 */
export const PROVIDERS = [
  { id: 'OURA',     name: 'Oura Ring',   tagline: 'Sleep, recovery, HRV',         category: 'wearable' },
  { id: 'WHOOP',    name: 'Whoop',       tagline: 'Strain, recovery, sleep',      category: 'wearable' },
  { id: 'GARMIN',   name: 'Garmin',      tagline: 'Activity, HRV, sleep',         category: 'wearable' },
  { id: 'POLAR',    name: 'Polar',       tagline: 'Heart rate, training load',    category: 'wearable' },
  { id: 'FITBIT',   name: 'Fitbit',      tagline: 'Activity, sleep, heart rate',  category: 'wearable' },
  { id: 'COROS',    name: 'Coros',       tagline: 'Training, recovery',           category: 'wearable' },
  { id: 'SUUNTO',   name: 'Suunto',      tagline: 'Activity, training',           category: 'wearable' },
  { id: 'WITHINGS', name: 'Withings',    tagline: 'Weight, body composition',     category: 'scale'    },
  { id: 'GOOGLE',   name: 'Google Fit',  tagline: 'Cross-device activity',        category: 'app'      },
  { id: 'STRAVA',   name: 'Strava',      tagline: 'Cycling, running',             category: 'app'      },
  { id: 'PELOTON',  name: 'Peloton',     tagline: 'Indoor training',              category: 'app'      },
  { id: 'WAHOO',    name: 'Wahoo',       tagline: 'Bike computers, sensors',      category: 'wearable' },
  { id: 'EIGHT',    name: 'Eight Sleep', tagline: 'Sleep + bed metrics',          category: 'wearable' },
  { id: 'CONCEPT2', name: 'Concept2',    tagline: 'Rower, ski erg, bike',         category: 'wearable' },
];

/**
 * Runtime validation guard for API routes.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidProvider(value) {
  return typeof value === 'string' && PROVIDERS.some(p => p.id === value);
}
