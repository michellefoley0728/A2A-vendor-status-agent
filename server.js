const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const AGENT_BASE_URL = 'https://your-railway-url.up.railway.app';

const VENDOR_STATUS_URLS = {
  'salesforce': 'https://status.salesforce.com/api/v1/incidents',
  'okta': 'https://status.okta.com/api/v2/status.json',
  'slack': 'https://status.slack.com/api/v2.0.0/current',
  'zoom': 'https://status.zoom.us/api/v2/status.json',
  'github': 'https://www.githubstatus.com/api/v2/status.json',
  'aws': 'https://health.aws.amazon.com/health/status',
  'microsoft': 'https://azure.status.microsoft/en-us/status/',
  'servicenow': 'https://status.servicenow.com/api/v2/status.json'
};

// A2A Agent Card
app.get('/.well-known/agent.json', (req, res) => {
  res.json({
    name: 'Vendor Status Agent',
    description: 'Checks live operational status for SaaS vendors using public Statuspage APIs. Returns current status, active incidents, and estimated resolution time.',
    url: `${AGENT_BASE_URL}/a2a`,
    version: '1.0.0',
    provider: { organization: 'ServiceNow A2A Demo' },
    capabilities: { streaming: false },
    skills: [
      {
        id: 'check_vendor_status',
        name: 'Check Vendor Status',
        description: 'Returns live operational status for a named SaaS vendor including any active incidents and ETAs.',
        examples: ['Is Salesforce down?', 'Check Okta status', 'Any active Slack incidents?']
      }
    ]
  });
});

// A2A task endpoint
app.post('/a2a', async (req, res) => {
  const userMessage = req.body?.message?.parts?.[0]?.text || req.body?.params?.message || '';
  const vendor = detectVendor(userMessage.toLowerCase());

  if (!vendor) {
    return res.json(buildResponse(
      'unknown',
      null,
      `Could not identify a supported vendor in the request. Supported vendors: ${Object.keys(VENDOR_STATUS_URLS).join(', ')}.`
    ));
  }

  try {
    const statusData = await fetchVendorStatus(vendor);
    return res.json(buildResponse(vendor, statusData, null));
  } catch (err) {
    return res.json(buildResponse(vendor, null, `Failed to retrieve status for ${vendor}: ${err.message}`));
  }
});

function detectVendor(text) {
  for (const vendor of Object.keys(VENDOR_STATUS_URLS)) {
    if (text.includes(vendor)) return vendor;
  }
  return null;
}

async function fetchVendorStatus(vendor) {
  const url = VENDOR_STATUS_URLS[vendor];
  const response = await fetch(url, { timeout: 8000 });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
}

function buildResponse(vendor, data, errorMessage) {
  let summary = '';

  if (errorMessage) {
    summary = errorMessage;
  } else if (vendor === 'salesforce' && data) {
    const active = data.filter(i => i.status !== 'resolved');
    if (active.length === 0) {
      summary = `Salesforce is fully operational. No active incidents.`;
    } else {
      const inc = active[0];
      summary = `ACTIVE INCIDENT -- Salesforce\nStatus: ${inc.status}\nTitle: ${inc.name}\nStarted: ${inc.created_at}\nLatest update: ${inc.incident_updates?.[0]?.body || 'No update available'}`;
    }
  } else if (data?.status) {
    const s = data.status;
    const indicator = s.indicator || 'unknown';
    const description = s.description || 'No description available';
    if (indicator === 'none') {
      summary = `${vendor.charAt(0).toUpperCase() + vendor.slice(1)} is fully operational. ${description}`;
    } else {
      summary = `${vendor.toUpperCase()} INCIDENT DETECTED\nIndicator: ${indicator}\nStatus: ${description}`;
    }
  } else {
    summary = `Status data retrieved for ${vendor} but format was unrecognized.`;
  }

  return {
    jsonrpc: '2.0',
    id: 1,
    result: {
      status: 'completed',
      message: {
        role: 'agent',
        parts: [{ type: 'text', text: summary }]
      }
    }
  };
}

app.get('/health', (req, res) => res.json({ status: 'ok', agent: 'vendor-status-agent' }));

app.listen(PORT, () => console.log(`Vendor Status Agent running on port ${PORT}`));
