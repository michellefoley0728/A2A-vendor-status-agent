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
          'Salesforce is not loading for anyone'
        ]
      }
    ]
  });
});

app.post('/a2a', async (req, res) => {
  console.log('Incoming A2A request body:', JSON.stringify(req.body, null, 2));

  const userMessage =
    req.body?.message?.parts?.[0]?.text ||
    req.body?.params?.message ||
    req.body?.input ||
    req.body?.task ||
    req.body?.text ||
    '';

  console.log('Extracted message:', userMessage);

  const vendor = detectVendor(userMessage.toLowerCase());
  console.log('Detected vendor:', vendor);

  if (!vendor) {
    const noVendorResponse = buildResponse(
      'unknown',
      null,
      `Vendor Status Agent received the request but could not identify a supported vendor in: "${userMessage}". Supported vendors: ${Object.keys(VENDOR_STATUS_URLS).join(', ')}.`
    );
    console.log('No vendor response:', JSON.stringify(noVendorResponse, null, 2));
    return res.json(noVendorResponse);
  }

  try {
    console.log(`Fetching status for vendor: ${vendor}`);
    const statusData = await fetchVendorStatus(vendor);
    console.log('Raw status data:', JSON.stringify(statusData, null, 2));
    const response = buildResponse(vendor, statusData, null);
    console.log('Final response:', JSON.stringify(response, null, 2));
    return res.json(response);
  } catch (err) {
    console.log('Fetch error:', err.message);
    const errorResponse = buildResponse(
      vendor,
      null,
      `Vendor Status Agent encountered an error fetching status for ${vendor}: ${err.message}`
    );
    return res.json(errorResponse);
  }
});

app.get('/a2a/test', async (req, res) => {
  const vendor = req.query.vendor || 'salesforce';
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
      debug: { detected_vendor: detectedVendor, error: err.message },
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
  let status = 'operational';

  if (errorMessage) {
    summary = errorMessage;
    status = 'error';

  } else if (vendor === 'salesforce' && data) {
    const active = Array.isArray(data)
      ? data.filter(i => i.status !== 'resolved')
      : [];
    if (active.length === 0) {
      summary = `VENDOR STATUS CHECK COMPLETE\nVendor: Salesforce\nStatus: FULLY OPERATIONAL\nNo active incidents detected.\nRecommendation: Salesforce is not the cause of this incident. Proceed with internal triage.`;
      status = 'operational';
    } else {
      const inc = active[0];
      summary = `VENDOR STATUS CHECK COMPLETE\nVendor: Salesforce\nStatus: ACTIVE INCIDENT DETECTED\nIncident: ${inc.name}\nSeverity: ${inc.impact}\nStarted: ${inc.created_at}\nLatest Update: ${inc.incident_updates?.[0]?.body || 'No update available'}\nRecommendation: This is likely a Salesforce-side issue. Pause internal triage. Notify affected users. Monitor Salesforce status for resolution.`;
      status = 'incident';
    }

  } else if (vendor === 'slack' && data) {
    const current = data.current_incident;
    if (!current) {
      summary = `VENDOR STATUS CHECK COMPLETE\nVendor: Slack\nStatus: FULLY OPERATIONAL\nNo active incidents detected.\nRecommendation: Slack is not the cause of this incident. Proceed with internal triage.`;
      status = 'operational';
    } else {
      summary = `VENDOR STATUS CHECK COMPLETE\nVendor: Slack\nStatus: ACTIVE INCIDENT DETECTED\nIncident: ${current.name}\nStarted: ${current.created_at}\nRecommendation: This is likely a Slack-side issue. Pause internal triage. Notify affected users.`;
      status = 'incident';
    }

  } else if (data?.status) {
    const s = data.status;
    const indicator = s.indicator || 'unknown';
    const description = s.description || 'No description available';
    const vendorName = vendor.charAt(0).toUpperCase() + vendor.slice(1);

    if (indicator === 'none') {
      summary = `VENDOR STATUS CHECK COMPLETE\nVendor: ${vendorName}\nStatus: FULLY OPERATIONAL\n${description}\nRecommendation: ${vendorName} is not the cause of this incident. Proceed with internal triage.`;
      status = 'operational';
    } else {
      summary = `VENDOR STATUS CHECK COMPLETE\nVendor: ${vendorName}\nStatus: ACTIVE INCIDENT DETECTED\nIndicator: ${indicator}\n${description}\nRecommendation: This is likely a ${vendorName}-side issue. Pause internal triage. Notify affected users. Monitor ${vendorName} status for resolution.`;
      status = 'incident';
    }

  } else {
    summary = `VENDOR STATUS CHECK COMPLETE\nVendor: ${vendor}\nStatus: UNABLE TO DETERMINE\nStatus data was retrieved but could not be parsed.\nRecommendation: Manually check vendor status page and proceed with internal triage in parallel.`;
    status = 'unknown';
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
        vendor_status: status,
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
