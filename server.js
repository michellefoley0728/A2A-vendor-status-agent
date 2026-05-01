const express = require('express');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const AGENT_BASE_URL = 'https://a2a-vendor-status-agent-production.up.railway.app';

const VENDOR_STATUS_URLS = {
  'salesforce': 'https://status.salesforce.com/api/v1/incidents',
  'okta': 'https://status.okta.com/api/v2/status.json',
  'slack': 'https://status.slack.com/api/v2.0.0/current',
  'zoom': 'https://status.zoom.us/api/v2/status.json',
  'github': 'https://www.githubstatus.com/api/v2/status.json',
  'servicenow': 'https://status.servicenow.com/api/v2/status.json'
};

app.get('/.well-known/agent.json', (req, res) => {
  res.json({
    name: 'Vendor Status Agent',
    description: 'Checks live operational status for SaaS vendors using public Statuspage APIs. Returns current status, active incidents, and estimated resolution time.',
    url: `${AGENT_BASE_URL}/a2a`,
    version: '1.0.0',
    provider: { organization: 'ServiceNow A2A Demo' },
    capabilities: { streaming: false },
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain'],
    skills: [
      {
        id: 'check_vendor_status',
        name: 'Check Vendor Status',
        description: 'Returns live operational status for a named SaaS vendor including any active incidents and ETAs.',
        inputModes: ['text/plain'],
        outputModes: ['text/plain'],
        examples: [
          'Is Salesforce down?',
          'Check Okta status',
          'Any active Slack incidents?',
          'Check status for GitHub',
          'Check status for Zoom'
        ]
      }
    ]
  });
});

app.post('/a2a', async (req, res) => {
  const body = req.body || {};
  const requestId = body.id || '1';

  console.log('=== INCOMING A2A REQUEST ===');
  console.log(JSON.stringify(body, null, 2));

  const extractText = (val) => {
    if (typeof val === 'string') return val;
    if (Array.isArray(val)) return val.map(extractText).join(' ');
    if (typeof val === 'object' && val !== null) {
      return Object.values(val).map(extractText).join(' ');
    }
    return '';
  };

  const userMessage = extractText(body);
  console.log('Extracted message:', userMessage);

  const vendor = detectVendor(userMessage.toLowerCase());
  console.log('Detected vendor:', vendor);

  if (!vendor) {
    const summary = `VENDOR STATUS CHECK COMPLETE\nVendor: UNKNOWN\nStatus: VENDOR NOT IDENTIFIED\nMessage received: "${userMessage.substring(0, 200)}"\nSupported vendors: ${Object.keys(VENDOR_STATUS_URLS).join(', ')}\nRecommendation: No supported vendor identified. Proceed with internal triage.`;
    console.log('No vendor detected, returning:', summary);
    return res.json(buildA2AResponse(requestId, summary));
  }

  try {
    console.log(`Fetching live status for: ${vendor}`);
    const statusData = await fetchVendorStatus(vendor);
    console.log('Raw status API response:', JSON.stringify(statusData, null, 2));
    const summary = buildSummary(vendor, statusData, null);
    console.log('Summary:', summary);
    return res.json(buildA2AResponse(requestId, summary));
  } catch (err) {
    console.log('Error:', err.message);
    const summary = `VENDOR STATUS CHECK COMPLETE\nVendor: ${vendor}\nStatus: ERROR\nError fetching status: ${err.message}\nRecommendation: Could not retrieve vendor status. Proceed with internal triage.`;
    return res.json(buildA2AResponse(requestId, summary));
  }
});

app.get('/a2a/test', async (req, res) => {
  const vendor = req.query.vendor || 'github';
  try {
    const statusData = await fetchVendorStatus(vendor);
    const summary = buildSummary(vendor, statusData, null);
    res.json({
      debug: { vendor, raw: statusData },
      a2a_response: buildA2AResponse('test-1', summary)
    });
  } catch (err) {
    res.json({ error: err.message });
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
  if (!url) throw new Error(`No status URL configured for: ${vendor}`);
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return await response.json();
}

function buildSummary(vendor, data, errorMessage) {
  if (errorMessage) return errorMessage;

  const vendorName = vendor.charAt(0).toUpperCase() + vendor.slice(1);

  if (vendor === 'salesforce' && data) {
    const active = Array.isArray(data) ? data.filter(i => i.status !== 'resolved') : [];
    if (active.length === 0) {
      return [
        'VENDOR STATUS CHECK COMPLETE',
        `Vendor: ${vendorName}`,
        'Status: FULLY OPERATIONAL',
        'No active incidents detected.',
        `Recommendation: ${vendorName} is not the cause of this incident. Proceed with internal triage.`
      ].join('\n');
    }
    const inc = active[0];
    return [
      'VENDOR STATUS CHECK COMPLETE',
      `Vendor: ${vendorName}`,
      'Status: ACTIVE INCIDENT DETECTED',
      `Incident: ${inc.name}`,
      `Severity: ${inc.impact}`,
      `Started: ${inc.created_at}`,
      `Latest Update: ${inc.incident_updates?.[0]?.body || 'No update available'}`,
      `Recommendation: This is likely a ${vendorName}-side issue. Pause internal triage. Notify affected users.`
    ].join('\n');
  }

  if (vendor === 'slack' && data) {
    const current = data.current_incident;
    if (!current) {
      return [
        'VENDOR STATUS CHECK COMPLETE',
        `Vendor: ${vendorName}`,
        'Status: FULLY OPERATIONAL',
        'No active incidents detected.',
        `Recommendation: ${vendorName} is not the cause of this incident. Proceed with internal triage.`
      ].join('\n');
    }
    return [
      'VENDOR STATUS CHECK COMPLETE',
      `Vendor: ${vendorName}`,
      'Status: ACTIVE INCIDENT DETECTED',
      `Incident: ${current.name}`,
      `Started: ${current.created_at}`,
      `Recommendation: This is likely a ${vendorName}-side issue. Pause internal triage. Notify affected users.`
    ].join('\n');
  }

  if (data?.status) {
    const indicator = data.status.indicator || 'unknown';
    const description = data.status.description || 'No description available';
    if (indicator === 'none') {
      return [
        'VENDOR STATUS CHECK COMPLETE',
        `Vendor: ${vendorName}`,
        'Status: FULLY OPERATIONAL',
        description,
        `Recommendation: ${vendorName} is not the cause of this incident. Proceed with internal triage.`
      ].join('\n');
    }
    return [
      'VENDOR STATUS CHECK COMPLETE',
      `Vendor: ${vendorName}`,
      'Status: ACTIVE INCIDENT DETECTED',
      `Indicator: ${indicator}`,
      description,
      `Recommendation: This is likely a ${vendorName}-side issue. Pause internal triage. Notify affected users.`
    ].join('\n');
  }

  return [
    'VENDOR STATUS CHECK COMPLETE',
    `Vendor: ${vendorName}`,
    'Status: UNABLE TO DETERMINE',
    'Status data retrieved but format unrecognized.',
    'Recommendation: Manually check vendor status page and proceed with internal triage in parallel.'
  ].join('\n');
}

function buildA2AResponse(requestId, text) {
  return {
    jsonrpc: '2.0',
    id: requestId,
    result: {
      id: String(requestId),
      status: {
        state: 'completed'
      },
      artifacts: [
        {
          name: 'vendor_status_result',
          index: 0,
          parts: [
            {
              type: 'text',
              text: text
            }
          ]
        }
      ]
    }
  };
}

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    agent: 'vendor-status-agent',
    supported_vendors: Object.keys(VENDOR_STATUS_URLS),
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`Vendor Status Agent running on port ${PORT}`);
});
