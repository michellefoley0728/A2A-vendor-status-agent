const express = require('express');
const fetch = require('node-fetch');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const AGENT_BASE_URL = process.env.AGENT_BASE_URL || 'https://YOUR-RAILWAY-URL.up.railway.app';

// ---------------------------------------------------------------------------
// Supported vendors: status page URL + community/forum signal URL
// ---------------------------------------------------------------------------
const VENDORS = {
  salesforce: {
    label: 'Salesforce',
    statusApi: 'https://api.status.salesforce.com/v1/incidents',
    statusPage: 'https://status.salesforce.com',
    communitySearch: 'https://trailhead.salesforce.com/trailblazer-community/feed',
    downdetector: 'https://downdetector.com/status/salesforce/',
    keywords: ['salesforce', 'sfdc', 'sales cloud', 'service cloud', 'marketing cloud']
  },
  okta: {
    label: 'Okta',
    statusApi: 'https://status.okta.com/api/v2/status.json',
    statusPage: 'https://status.okta.com',
    communitySearch: 'https://support.okta.com/help/s/',
    downdetector: 'https://downdetector.com/status/okta/',
    keywords: ['okta', 'sso', 'single sign-on', 'identity provider', 'idp']
  },
  slack: {
    label: 'Slack',
    statusApi: 'https://status.slack.com/api/v2.0.0/current',
    statusPage: 'https://status.slack.com',
    communitySearch: 'https://slack.com/help/community',
    downdetector: 'https://downdetector.com/status/slack/',
    keywords: ['slack', 'slack workspace', 'slack message']
  },
  zoom: {
    label: 'Zoom',
    statusApi: 'https://status.zoom.us/api/v2/status.json',
    statusPage: 'https://status.zoom.us',
    communitySearch: 'https://community.zoom.com',
    downdetector: 'https://downdetector.com/status/zoom/',
    keywords: ['zoom', 'zoom meeting', 'zoom call', 'zoom video']
  },
  github: {
    label: 'GitHub',
    statusApi: 'https://www.githubstatus.com/api/v2/status.json',
    statusPage: 'https://githubstatus.com',
    communitySearch: 'https://github.community',
    downdetector: 'https://downdetector.com/status/github/',
    keywords: ['github', 'git', 'github actions', 'github pages', 'repo']
  },
  servicenow: {
    label: 'ServiceNow',
    statusApi: 'https://status.servicenow.com/api/v2/status.json',
    statusPage: 'https://status.servicenow.com',
    communitySearch: 'https://www.servicenow.com/community/now-platform-forum/ct-p/now-platform',
    downdetector: 'https://downdetector.com/status/servicenow/',
    keywords: ['servicenow', 'service now', 'snow', 'now platform']
  },
  microsoft365: {
    label: 'Microsoft 365',
    statusApi: 'https://status.office365.com/api/v2/status.json',
    statusPage: 'https://status.office365.com',
    communitySearch: 'https://techcommunity.microsoft.com',
    downdetector: 'https://downdetector.com/status/office-365/',
    keywords: ['microsoft 365', 'office 365', 'm365', 'teams', 'outlook', 'sharepoint', 'onedrive', 'ms teams']
  },
  workday: {
    label: 'Workday',
    statusApi: null,
    statusPage: 'https://trust.workday.com',
    communitySearch: 'https://community.workday.com',
    downdetector: 'https://downdetector.com/status/workday/',
    keywords: ['workday', 'workday hcm', 'workday financials']
  },
  aws: {
    label: 'AWS',
    statusApi: 'https://status.aws.amazon.com/data.json',
    statusPage: 'https://status.aws.amazon.com',
    communitySearch: 'https://repost.aws',
    downdetector: 'https://downdetector.com/status/amazon-web-services/',
    keywords: ['aws', 'amazon web services', 'ec2', 's3', 'lambda', 'rds', 'cloudfront']
  },
  jira: {
    label: 'Jira / Atlassian',
    statusApi: 'https://jira-software.status.atlassian.com/api/v2/status.json',
    statusPage: 'https://status.atlassian.com',
    communitySearch: 'https://community.atlassian.com',
    downdetector: 'https://downdetector.com/status/jira/',
    keywords: ['jira', 'atlassian', 'confluence', 'bitbucket', 'jira software', 'jira service']
  }
};

// ---------------------------------------------------------------------------
// Vendor detection from natural language input
// ---------------------------------------------------------------------------
function detectVendor(text) {
  const lower = text.toLowerCase();
  for (const [key, vendor] of Object.entries(VENDORS)) {
    if (vendor.keywords.some(kw => lower.includes(kw))) {
      return key;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Fetch official status page (Statuspage v2 format)
// ---------------------------------------------------------------------------
async function fetchOfficialStatus(vendor) {
  const { statusApi, statusPage, label } = VENDORS[vendor];

  if (!statusApi) {
    return {
      source: 'Official Status Page',
      url: statusPage,
      status: 'unknown',
      summary: `${label} does not expose a public status API. Check ${statusPage} manually.`,
      incidents: []
    };
  }

  try {
    const res = await fetch(statusApi, { timeout: 5000 });
    const data = await res.json();

    // Salesforce uses a different shape -- returns array of incidents directly
    if (vendor === 'salesforce') {
      const activeIncidents = Array.isArray(data)
        ? data.filter(i => i.isActive || i.status !== 'resolved')
        : [];
      return {
        source: 'Salesforce Official Status',
        url: statusPage,
        status: activeIncidents.length > 0 ? 'incident' : 'operational',
        summary: activeIncidents.length > 0
          ? `${activeIncidents.length} active incident(s) reported on Salesforce status page.`
          : 'Salesforce reports all systems operational.',
        incidents: activeIncidents.slice(0, 3).map(i => ({
          title: i.message || i.summary || 'Active incident',
          severity: i.severity || 'unknown',
          started: i.startTime || 'unknown'
        }))
      };
    }

    // Statuspage v2 standard format (most vendors)
    const statusIndicator = data?.status?.indicator || 'none';
    const statusDescription = data?.status?.description || 'Unknown';
    const isDown = ['minor', 'major', 'critical'].includes(statusIndicator);

    return {
      source: `${label} Official Status`,
      url: statusPage,
      status: isDown ? 'incident' : 'operational',
      summary: statusDescription,
      incidents: []
    };

  } catch (err) {
    return {
      source: `${label} Official Status`,
      url: statusPage,
      status: 'unknown',
      summary: `Could not reach ${label} status API: ${err.message}`,
      incidents: []
    };
  }
}

// ---------------------------------------------------------------------------
// Fetch Downdetector signal via HTML scrape (user report spike check)
// ---------------------------------------------------------------------------
async function fetchDowndetectorSignal(vendor) {
  const { downdetector, label } = VENDORS[vendor];

  try {
    const res = await fetch(downdetector, {
      timeout: 6000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; IncidentEnrichmentAgent/1.0)'
      }
    });
    const html = await res.text();

    // Look for Downdetector's status signal in page content
    const hasSpike = html.includes('Problems at') || html.includes('User reports indicate');
    const operational = html.includes('User reports indicate no current problems');
    const possibleOutage = html.includes('Problems at') || html.includes('possible problems');

    let status = 'unknown';
    let summary = `Could not parse Downdetector signal for ${label}.`;

    if (operational) {
      status = 'operational';
      summary = `Downdetector shows no significant user-reported problems for ${label}.`;
    } else if (possibleOutage || hasSpike) {
      status = 'elevated';
      summary = `Downdetector is showing elevated user-reported problems for ${label}. Possible widespread issue.`;
    } else {
      status = 'unknown';
      summary = `Downdetector data inconclusive for ${label}. Check manually: ${downdetector}`;
    }

    return { source: 'Downdetector (User Reports)', url: downdetector, status, summary };

  } catch (err) {
    return {
      source: 'Downdetector (User Reports)',
      url: downdetector,
      status: 'unknown',
      summary: `Could not reach Downdetector for ${label}: ${err.message}`
    };
  }
}

// ---------------------------------------------------------------------------
// Synthesize all signals into a structured verdict
// ---------------------------------------------------------------------------
function synthesizeVerdict(vendorKey, officialStatus, downdetectorSignal, userMessage) {
  const vendor = VENDORS[vendorKey];
  const signals = [officialStatus.status, downdetectorSignal.status];

  let verdict = 'ISOLATED';
  let confidence = 'High';
  let reasoning = '';
  let recommendedAction = '';

  const officialDown = officialStatus.status === 'incident';
  const userReportsElevated = downdetectorSignal.status === 'elevated';
  const officialUnknown = officialStatus.status === 'unknown';

  if (officialDown && userReportsElevated) {
    verdict = 'WIDESPREAD OUTAGE';
    confidence = 'High';
    reasoning = `Both ${vendor.label}'s official status page and Downdetector user reports confirm active problems. This is a confirmed widespread issue, not isolated to your environment.`;
    recommendedAction = `Do NOT assign to internal resolver. Flag incident as vendor-caused. Set expectation with user: resolution is dependent on ${vendor.label}. Monitor ${vendor.statusPage} for updates. Consider mass notification if multiple users affected.`;
  } else if (officialDown && !userReportsElevated) {
    verdict = 'VENDOR INCIDENT CONFIRMED';
    confidence = 'High';
    reasoning = `${vendor.label}'s official status page shows an active incident. User report volume on Downdetector is not yet elevated, but the vendor has acknowledged a problem.`;
    recommendedAction = `Route to monitoring hold. Do not attempt internal troubleshooting. Notify user this is a known vendor issue. Check ${vendor.statusPage} for estimated resolution time.`;
  } else if (!officialDown && userReportsElevated) {
    verdict = 'POSSIBLE WIDESPREAD ISSUE';
    confidence = 'Medium';
    reasoning = `${vendor.label}'s official status page shows operational, but Downdetector is showing elevated user reports. The vendor may not have updated their status page yet -- this is common in early-stage outages.`;
    recommendedAction = `Hold internal troubleshooting for 15-20 minutes. Monitor ${vendor.statusPage} for updates. If reports continue to climb, escalate to vendor support proactively.`;
  } else if (officialUnknown && userReportsElevated) {
    verdict = 'POSSIBLE WIDESPREAD ISSUE';
    confidence = 'Medium';
    reasoning = `Could not confirm official status from ${vendor.label}, but Downdetector shows elevated user reports. Treat with caution.`;
    recommendedAction = `Check ${vendor.statusPage} manually. Hold internal troubleshooting pending confirmation. Notify user of investigation status.`;
  } else {
    verdict = 'LIKELY ISOLATED';
    confidence = 'Medium';
    reasoning = `${vendor.label}'s official status page shows operational and no significant user-reported problems on Downdetector. This issue appears isolated to the reporting user or local environment.`;
    recommendedAction = `Proceed with standard ITSM troubleshooting. Check user-side configuration, network, or account-level permissions. Escalate to ${vendor.label} support if unresolved.`;
  }

  return { verdict, confidence, reasoning, recommendedAction };
}

// ---------------------------------------------------------------------------
// Build the full structured response returned to ServiceNow
// ---------------------------------------------------------------------------
function buildResponse(vendorKey, officialStatus, downdetectorSignal, verdict, userMessage) {
  const vendor = VENDORS[vendorKey];
  const timestamp = new Date().toISOString();

  const lines = [
    `INCIDENT ENRICHMENT REPORT`,
    `Generated: ${timestamp}`,
    `Vendor Analyzed: ${vendor.label}`,
    ``,
    `VERDICT: ${verdict.verdict}`,
    `Confidence: ${verdict.confidence}`,
    ``,
    `REASONING:`,
    verdict.reasoning,
    ``,
    `RECOMMENDED ACTION:`,
    verdict.recommendedAction,
    ``,
    `--- SIGNAL DETAILS ---`,
    ``,
    `[1] Official Vendor Status`,
    `    Source: ${officialStatus.source}`,
    `    Status: ${officialStatus.status.toUpperCase()}`,
    `    Summary: ${officialStatus.summary}`,
    `    URL: ${officialStatus.url}`,
  ];

  if (officialStatus.incidents && officialStatus.incidents.length > 0) {
    lines.push(`    Active Incidents:`);
    officialStatus.incidents.forEach(i => {
      lines.push(`      - ${i.title} (Severity: ${i.severity}, Started: ${i.started})`);
    });
  }

  lines.push(``);
  lines.push(`[2] Community / User Reports (Downdetector)`);
  lines.push(`    Source: ${downdetectorSignal.source}`);
  lines.push(`    Status: ${downdetectorSignal.status.toUpperCase()}`);
  lines.push(`    Summary: ${downdetectorSignal.summary}`);
  lines.push(`    URL: ${downdetectorSignal.url}`);
  lines.push(``);
  lines.push(`[3] Vendor Resources`);
  lines.push(`    Status Page: ${vendor.statusPage}`);
  lines.push(`    Community / Support: ${vendor.communitySearch}`);
  lines.push(`    Downdetector: ${vendor.downdetector}`);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// A2A Agent Card
// ---------------------------------------------------------------------------
app.get('/.well-known/agent.json', (req, res) => {
  res.json({
    name: 'Incident Enrichment Agent',
    description: 'Enriches ServiceNow incidents by determining whether a reported issue with a SaaS vendor is a widespread outage, a known vendor incident, or an isolated user problem. Synthesizes signals from official vendor status pages and public user-report platforms.',
    url: `${AGENT_BASE_URL}/a2a`,
    version: '1.0.0',
    provider: {
      organization: 'ServiceNow A2A Demo',
      url: 'https://servicenow.com'
    },
    capabilities: { streaming: false },
    skills: [
      {
        id: 'enrich_incident',
        name: 'Enrich Incident',
        description: 'Given a vendor name or application name from an incident, checks public status sources and returns a structured verdict: WIDESPREAD OUTAGE / VENDOR INCIDENT CONFIRMED / POSSIBLE WIDESPREAD ISSUE / LIKELY ISOLATED. Includes recommended triage action.',
        examples: [
          'User cannot log into Salesforce',
          'Teams is down for the whole office',
          'Okta SSO failing for multiple users',
          'GitHub Actions not running',
          'Workday is throwing 503 errors'
        ]
      }
    ]
  });
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get('/health', (req, res) => {
  res.json({ status: 'ok', agent: 'Incident Enrichment Agent', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Core task handler -- shared by both JSON-RPC and direct formats
// ---------------------------------------------------------------------------
async function handleTask(userMessage, taskId) {
  const vendorKey = detectVendor(userMessage);

  if (!vendorKey) {
    const supportedList = Object.values(VENDORS).map(v => v.label).join(', ');
    return {
      id: taskId,
      status: { state: 'completed' },
      result: {
        message: {
          role: 'agent',
          parts: [{
            type: 'text',
            text: `Could not identify a supported vendor in the request: "${userMessage}"\n\nSupported vendors: ${supportedList}\n\nTip: Include the vendor name in your message, e.g. "Salesforce login failing" or "Okta SSO down".`
          }]
        }
      }
    };
  }

  const [officialStatus, downdetectorSignal] = await Promise.all([
    fetchOfficialStatus(vendorKey),
    fetchDowndetectorSignal(vendorKey)
  ]);

  const verdict = synthesizeVerdict(vendorKey, officialStatus, downdetectorSignal, userMessage);
  const responseText = buildResponse(vendorKey, officialStatus, downdetectorSignal, verdict, userMessage);

  return {
    id: taskId,
    status: { state: 'completed' },
    result: {
      message: {
        role: 'agent',
        parts: [{ type: 'text', text: responseText }]
      }
    }
  };
}

// ---------------------------------------------------------------------------
// A2A Task Endpoint -- handles both JSON-RPC (ServiceNow) and direct formats
// ---------------------------------------------------------------------------
app.post('/a2a', async (req, res) => {
  const body = req.body;

  // JSON-RPC format (ServiceNow A2A protocol)
  if (body?.jsonrpc === '2.0') {
    const method = body.method;
    const id = body.id || 'unknown';

    // Handle supported methods
    if (method === 'tasks/send' || method === 'tasks/run') {
      const userMessage =
        body.params?.message?.parts?.[0]?.text ||
        body.params?.input ||
        '';

      if (!userMessage) {
        return res.json({
          jsonrpc: '2.0',
          id,
          error: { code: -32602, message: 'Invalid params: no message text found' }
        });
      }

      const taskResult = await handleTask(userMessage, id);
      return res.json({
        jsonrpc: '2.0',
        id,
        result: taskResult
      });
    }

    // Unknown method
    return res.json({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${method}` }
    });
  }

  // Direct format (testing / non-ServiceNow callers)
  const userMessage =
    body?.message?.parts?.[0]?.text ||
    body?.params?.message ||
    body?.input ||
    '';

  if (!userMessage) {
    return res.status(400).json({
      error: 'No message provided. Send a vendor name or incident description.'
    });
  }

  const taskResult = await handleTask(userMessage, body?.id || 'unknown');
  return res.json(taskResult);
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Incident Enrichment Agent running on port ${PORT}`);
  console.log(`Agent card: ${AGENT_BASE_URL}/.well-known/agent.json`);
  console.log(`A2A endpoint: ${AGENT_BASE_URL}/a2a`);
});
