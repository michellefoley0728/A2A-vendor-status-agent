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
    skills: [
      {
        id: 'check_vendor_status',
        name: 'Check Vendor Status',
        description: 'Returns live operational status for a named SaaS vendor including any active incidents and ETAs.',
        examples: [
          'Is Salesforce down?',
          'Check Okta status',
          'Any active Slack incidents?',
          'Users cannot log into Okta',
          'GitHub repositories are not loading'
        ]
      }
    ]
  });
});

app.post('/a2a', async (req, res) => {
  const body = req.body || {};
  console.log('Incoming A2A request body:', JSON.stringify(body, null, 2));

  const extractText = (val) => {
    if (typeof val === 'string') return val;
    if (Array.isArray(val)) return val.map(extractText).join(' ');
    if (typeof val === 'object' && val !== null) return Object.values(val).map(extractText).join(' ');
    return '';
  };

  const userMessage = extractText(body);
  console.log('Extracted message text:', userMessage);

  const vendor = detectVendor(userMessage.toLowerCase());
  console.log('Detected vendor:', vendor);

  if (!vendor) {
    const noVendorResponse = buildResponse(
      'unknown',
      null,
      `Vendor Status Agent received the request but could not identify a supported vendor. Message received: "${userMessage.substring(0, 200)}". Supported vendors: ${Object.keys(VENDOR_STATUS_URLS).join(', ')}.`
    );
    console.log('No vendor detected. Returning:', JSON.stringify(noVendorResponse, null, 2));
    return res.json(noVendorResponse);
  }

  try {
    console.log(`Fetching live status for: ${vendor}`);
    const statusData = await fetchVendorStatus(vendor);
    console.log('Raw status API response:', JSON.stringify(statusData, null, 2));
    const response = buildResponse(vendor, statusData, null);
    console.log('Final A2A response:', JSON.stringify(response, null, 2));
    return res.json(response);
  } catch (err) {
    console.log('Error fetching vendor status:', err.message);
    const errorResponse = buildResponse(
      vendor,
      null,
      `Vendor Status Agent encountered an error fetching status for ${vendor}: ${err.message}`
    );
    return res.json(errorResponse);
  }
});

app.get('/a2a/test', async (req, res) => {
  const vendor = req.query.vendor || 'github';
  const message = req.query.message || '';
  const detectedVendor = message ? detectVendor(message.toLowerCase()) : vendor;

  try {
    const statusData = await fetchVendorStatus(detectedVendor);
    const response = buildResponse(detectedVendor, statusData, null);
    res.json({
      debug: {
        input_vendor: vendor,
        input_message: message,
        detected_vendor: detectedVendor,
        raw_status_data: statusData
      },
      a2a_response: response
    });
  } catch (err) {
    res.json({
      debug: {
        detected_vendor: detectedVendor,
        error: err.message
      },
      a2a_response: buildResponse(detectedVendor, null, err.message)
    });
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
  if (!url) throw new Error(`No status URL configured for vendor: ${vendor}`);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return await response.json();
}

function buildResponse(vendor, data, errorMessage) {
  let summary = '';
  let vendorStatus = 'error';

  if (errorMessage) {
    summary = errorMessage;
    vendorStatus = 'error';

  } else if (vendor === 'salesforce' && data) {
    const active = Array.isArray(data)
      ? data.filter(i => i.status !== 'resolved')
      : [];
    if (active.length === 0) {
      vendorStatus = 'operational';
      summary = [
        'VENDOR STATUS CHECK COMPLETE',
        'Vendor: Salesforce',
        'Status: FULLY OPERATIONAL',
        'No active incidents detected.',
        'Recommendation: Salesforce is not the cause of this incident. Proceed with internal triage.'
      ].join('\n');
    } else {
      vendorStatus = 'incident';
      const inc = active[0];
      summary = [
        'VENDOR STATUS CHECK COMPLETE',
        'Vendor: Salesforce',
        'Status: ACTIVE INCIDENT DETECTED',
        `Incident: ${inc.name}`,
        `Severity: ${inc.impact}`,
        `Started: ${inc.created_at}`,
        `Latest Update: ${inc.incident_updates?.[0]?.body || 'No update available'}`,
        'Recommendation: This is likely a Salesforce-side issue. Pause internal triage. Notify affected users. Monitor Salesforce status for resolution.'
      ].join('\n');
    }

  } else if (vendor === 'slack' && data) {
    const current = data.current_incident;
    if (!current) {
      vendorStatus = 'operational';
      summary = [
        'VENDOR STATUS CHECK COMPLETE',
        'Vendor: Slack',
        'Status: FULLY OPERATIONAL',
        'No active incidents detected.',
        'Recommendation: Slack is not the cause of this incident. Proceed with internal triage.'
      ].join('\n');
    } else {
      vendorStatus = 'incident';
      summary = [
        'VENDOR STATUS CHECK COMPLETE',
        'Vendor: Slack',
        'Status: ACTIVE INCIDENT DETECTED',
        `Incident: ${current.name}`,
        `Started: ${current.created_at}`,
        'Recommendation: This is likely a Slack-side issue. Pause internal triage. Notify affected users.'
      ].join('\n');
    }

  } else if (data?.status) {
    const s = data.status;
    const indicator = s.indicator || 'unknown';
    const description = s.description || 'No description available';
    const vendorName = vendor.charAt(0).toUpperCase() + vendor.slice(1);

    if (indicator === 'none') {
      vendorStatus = 'operational';
      summary = [
        'VENDOR STATUS CHECK COMPLETE',
        `Vendor: ${vendorName}`,
        'Status: FULLY OPERATIONAL',
        description,
        `Recommendation: ${vendorName} is not the cause of this incident. Proceed with internal triage.`
      ].join('\n');
    } else {
      vendorStatus = 'incident';
      summary = [
        'VENDOR STATUS CHECK COMPLETE',
        `Vendor: ${vendorName}`,
        'Status: ACTIVE INCIDENT DETECTED',
        `Indicator: ${indicator}`,
        description,
        `Recommendation: This is likely a ${vendorName}-side issue. Pause internal triage. Notify affected users. Monitor ${vendorName} status for resolution.`
      ].join('\n');
    }

  } else {
    vendorStatus = 'unknown';
    summary = [
      'VENDOR STATUS CHECK COMPLETE',
      `Vendor: ${vendor}`,
      'Status: UNABLE TO DETERMINE',
      'Status data was retrieved but could not be parsed.',
      'Recommendation: Manually check vendor status page and proceed with internal triage in parallel.'
    ].join('\n');
  }

  return {
    jsonrpc: '2.0',
    id: 1,
    result: {
      status: 'completed',
      artifacts: [
        {
          name: 'vendor_status_result',
          parts: [{ type: 'text', text: summary }]
        }
      ],
      message: {
        role: 'agent',
        parts: [{ type: 'text', text: summary }]
      },
      metadata: {
        vendor: vendor,
        vendor_status: vendorStatus,
        checked_at: new Date().toISOString()
      }
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
