const express = require('express');
const fetch = require('node-fetch');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const AGENT_BASE_URL = process.env.AGENT_BASE_URL || 'https://YOUR-RAILWAY-URL.up.railway.app';

// ---------------------------------------------------------------------------
// VENDOR REGISTRY
// Pre-configured vendors have known status APIs for authoritative data.
// Any vendor not listed falls back to the generic search path.
// ---------------------------------------------------------------------------
const VENDORS = {
  salesforce: {
    label: 'Salesforce', ddSlug: 'salesforce',
    statusApi: 'https://api.status.salesforce.com/v1/incidents',
    statusPage: 'https://status.salesforce.com',
    community: 'https://trailhead.salesforce.com/trailblazer-community/feed',
    keywords: ['salesforce', 'sfdc', 'sales cloud', 'service cloud', 'marketing cloud', 'pardot', 'tableau']
  },
  okta: {
    label: 'Okta', ddSlug: 'okta',
    statusApi: 'https://status.okta.com/api/v2/status.json',
    statusPage: 'https://status.okta.com',
    community: 'https://support.okta.com/help/s/',
    keywords: ['okta', 'sso', 'single sign-on', 'identity provider', 'idp', 'okta verify']
  },
  slack: {
    label: 'Slack', ddSlug: 'slack',
    statusApi: 'https://status.slack.com/api/v2.0.0/current',
    statusPage: 'https://status.slack.com',
    community: 'https://slack.com/help/community',
    keywords: ['slack', 'slack workspace', 'slack message', 'slack channel']
  },
  zoom: {
    label: 'Zoom', ddSlug: 'zoom',
    statusApi: 'https://status.zoom.us/api/v2/status.json',
    statusPage: 'https://status.zoom.us',
    community: 'https://community.zoom.com',
    keywords: ['zoom', 'zoom meeting', 'zoom call', 'zoom video', 'zoom webinar']
  },
  github: {
    label: 'GitHub', ddSlug: 'github',
    statusApi: 'https://www.githubstatus.com/api/v2/status.json',
    statusPage: 'https://githubstatus.com',
    community: 'https://github.community',
    keywords: ['github', 'github actions', 'github pages', 'git push', 'git pull', 'pull request']
  },
  servicenow: {
    label: 'ServiceNow', ddSlug: 'servicenow',
    statusApi: 'https://status.servicenow.com/api/v2/status.json',
    statusPage: 'https://status.servicenow.com',
    community: 'https://www.servicenow.com/community/now-platform-forum/ct-p/now-platform',
    keywords: ['servicenow', 'service now', 'snow', 'now platform']
  },
  microsoft365: {
    label: 'Microsoft 365', ddSlug: 'office-365',
    statusApi: 'https://status.office365.com/api/v2/status.json',
    statusPage: 'https://status.office365.com',
    community: 'https://techcommunity.microsoft.com',
    keywords: ['microsoft 365', 'office 365', 'm365', 'ms teams', 'outlook', 'sharepoint', 'onedrive', 'exchange online']
  },
  workday: {
    label: 'Workday', ddSlug: 'workday',
    statusApi: null,
    statusPage: 'https://trust.workday.com',
    community: 'https://community.workday.com',
    keywords: ['workday', 'workday hcm', 'workday financials', 'workday payroll']
  },
  aws: {
    label: 'AWS', ddSlug: 'amazon-web-services',
    statusApi: null,
    statusPage: 'https://status.aws.amazon.com',
    community: 'https://repost.aws',
    keywords: ['aws', 'amazon web services', 'ec2', 's3', 'lambda', 'rds', 'cloudfront', 'dynamo']
  },
  jira: {
    label: 'Jira / Atlassian', ddSlug: 'jira',
    statusApi: 'https://jira-software.status.atlassian.com/api/v2/status.json',
    statusPage: 'https://status.atlassian.com',
    community: 'https://community.atlassian.com',
    keywords: ['jira', 'atlassian', 'confluence', 'bitbucket', 'jira software', 'jira service management']
  },
  azure: {
    label: 'Microsoft Azure', ddSlug: 'azure-microsoft',
    statusApi: null,
    statusPage: 'https://status.azure.com',
    community: 'https://techcommunity.microsoft.com/t5/azure/ct-p/Azure',
    keywords: ['azure', 'azure devops', 'azure ad', 'azure active directory', 'microsoft azure']
  },
  gcp: {
    label: 'Google Cloud', ddSlug: 'google',
    statusApi: 'https://status.cloud.google.com/incidents.json',
    statusPage: 'https://status.cloud.google.com',
    community: 'https://cloud.google.com/support/docs/community',
    keywords: ['google cloud', 'gcp', 'bigquery', 'google kubernetes', 'cloud run', 'google compute']
  },
  googleworkspace: {
    label: 'Google Workspace', ddSlug: 'gmail',
    statusApi: null,
    statusPage: 'https://www.google.com/appsstatus/dashboard/',
    community: 'https://support.google.com/a/community',
    keywords: ['google workspace', 'google apps', 'gmail', 'google drive', 'google docs', 'google meet', 'g suite']
  },
  pagerduty: {
    label: 'PagerDuty', ddSlug: 'pagerduty',
    statusApi: 'https://status.pagerduty.com/api/v2/status.json',
    statusPage: 'https://status.pagerduty.com',
    community: 'https://community.pagerduty.com',
    keywords: ['pagerduty', 'pager duty', 'pd alert', 'on-call alert']
  },
  zendesk: {
    label: 'Zendesk', ddSlug: 'zendesk',
    statusApi: 'https://status.zendesk.com/api/v2/status.json',
    statusPage: 'https://status.zendesk.com',
    community: 'https://support.zendesk.com/hc/en-us/community/topics',
    keywords: ['zendesk', 'zendesk support', 'zendesk chat', 'zendesk talk']
  },
  datadog: {
    label: 'Datadog', ddSlug: 'datadog',
    statusApi: 'https://status.datadoghq.com/api/v2/status.json',
    statusPage: 'https://status.datadoghq.com',
    community: 'https://help.datadoghq.com/hc/en-us/community/topics',
    keywords: ['datadog', 'data dog', 'dd agent', 'datadog apm']
  },
  snowflake: {
    label: 'Snowflake', ddSlug: 'snowflake',
    statusApi: null,
    statusPage: 'https://status.snowflake.com',
    community: 'https://community.snowflake.com',
    keywords: ['snowflake', 'snowflake data cloud', 'snowflake warehouse']
  },
  hubspot: {
    label: 'HubSpot', ddSlug: 'hubspot',
    statusApi: 'https://status.hubspot.com/api/v2/status.json',
    statusPage: 'https://status.hubspot.com',
    community: 'https://community.hubspot.com',
    keywords: ['hubspot', 'hub spot', 'hubspot crm', 'hubspot marketing']
  },
  box: {
    label: 'Box', ddSlug: 'box',
    statusApi: 'https://status.box.com/api/v2/status.json',
    statusPage: 'https://status.box.com',
    community: 'https://support.box.com/hc/en-us/community/topics',
    keywords: ['box', 'box.com', 'box drive', 'box sync']
  },
  dropbox: {
    label: 'Dropbox', ddSlug: 'dropbox',
    statusApi: 'https://status.dropbox.com/api/v2/status.json',
    statusPage: 'https://status.dropbox.com',
    community: 'https://www.dropboxforum.com',
    keywords: ['dropbox', 'dropbox business', 'dropbox sync']
  },
  twilio: {
    label: 'Twilio', ddSlug: 'twilio',
    statusApi: 'https://status.twilio.com/api/v2/status.json',
    statusPage: 'https://status.twilio.com',
    community: 'https://www.twilio.com/en-us/help/community',
    keywords: ['twilio', 'twilio sms', 'twilio voice', 'twilio api']
  },
  sap: {
    label: 'SAP', ddSlug: 'sap',
    statusApi: null,
    statusPage: 'https://www.sap.com/about/cloud-trust-center/cloud-service-status.html',
    community: 'https://answers.sap.com',
    keywords: ['sap', 'sap s4hana', 'sap hana', 'sap erp', 'sap cloud', 'successfactors']
  },
  oracle: {
    label: 'Oracle Cloud', ddSlug: 'oracle',
    statusApi: null,
    statusPage: 'https://ocistatus.oraclecloud.com',
    community: 'https://community.oracle.com',
    keywords: ['oracle', 'oracle cloud', 'oci', 'oracle erp', 'oracle fusion', 'netsuite']
  }
};

// ---------------------------------------------------------------------------
// Vendor detection -- returns vendor key or null for unknown vendors
// Extracts vendor name from text for generic fallback searches
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

// Extract a best-guess vendor name from free text for generic searches
function extractVendorName(text) {
  // Look for capitalized product/company names
  const matches = text.match(/[A-Z][a-zA-Z0-9]+(?:\s[A-Z][a-zA-Z0-9]+)?/g) || [];
  const stopWords = ['User', 'Multiple', 'Please', 'Users', 'Error', 'Issue', 'Problem', 'Cannot', 'Unable'];
  const candidates = matches.filter(m => !stopWords.includes(m) && m.length > 3);
  return candidates[0] || 'unknown vendor';
}

// ---------------------------------------------------------------------------
// SIGNAL 1: Official vendor status API
// ---------------------------------------------------------------------------
async function fetchOfficialStatus(vendorKey) {
  const vendor = VENDORS[vendorKey];
  const { statusApi, statusPage, label } = vendor;

  if (!statusApi) {
    return {
      status: 'unknown',
      summary: `${label} does not expose a public status API.`,
      incidents: [],
      url: statusPage
    };
  }

  try {
    const res = await fetch(statusApi, { timeout: 6000 });
    const data = await res.json();

    // Salesforce -- returns incidents array directly
    if (vendorKey === 'salesforce') {
      const active = Array.isArray(data) ? data.filter(i => i.isActive || i.status !== 'resolved') : [];
      return {
        status: active.length > 0 ? 'incident' : 'operational',
        summary: active.length > 0
          ? `${active.length} active incident(s) confirmed on Salesforce status page.`
          : 'Salesforce reports all systems operational.',
        incidents: active.slice(0, 3).map(i => ({
          title: i.message || i.summary || i.incidentType || 'Active incident',
          severity: i.severity || i.incidentType || 'unknown',
          started: i.startTime || i.createdAt || 'unknown',
          affectedServices: i.affectedComponents ? i.affectedComponents.map(c => c.name || c).join(', ') : (i.affects || 'unknown'),
          eta: i.estimatedResolutionTime || i.nextUpdate || null,
          latestUpdate: i.message || null,
          instanceKeys: i.instanceKeys ? i.instanceKeys.slice(0, 5).join(', ') : null
        })),
        url: statusPage
      };
    }

    // GCP -- returns incidents array
    if (vendorKey === 'gcp') {
      const active = Array.isArray(data) ? data.filter(i => !i.end) : [];
      return {
        status: active.length > 0 ? 'incident' : 'operational',
        summary: active.length > 0 ? `${active.length} active GCP incident(s).` : 'Google Cloud reports all systems operational.',
        incidents: active.slice(0, 3).map(i => ({
          title: i.external_desc || 'Active incident',
          severity: i.severity || 'unknown',
          started: i.begin || 'unknown',
          affectedServices: (i.affected_products || []).map(p => p.title).join(', ') || 'unknown',
          eta: null,
          latestUpdate: i.updates ? i.updates[0]?.text : null
        })),
        url: statusPage
      };
    }

    // Standard Statuspage v2 format
    const indicator = data?.status?.indicator || 'none';
    const description = data?.status?.description || 'Unknown';
    const isDown = ['minor', 'major', 'critical'].includes(indicator);

    // Try to fetch unresolved incidents for more detail
    let incidents = [];
    try {
      const baseUrl = statusApi.replace('/status.json', '').replace('/api/v2', '');
      const incUrl = `${baseUrl}/api/v2/incidents/unresolved.json`;
      const incRes = await fetch(incUrl, { timeout: 4000 });
      if (incRes.ok) {
        const incData = await incRes.json();
        incidents = (incData?.incidents || []).slice(0, 3).map(i => ({
          title: i.name || 'Active incident',
          severity: i.impact || 'unknown',
          started: i.created_at || 'unknown',
          affectedServices: (i.components || []).map(c => c.name).join(', ') || 'unknown',
          eta: i.scheduled_until || null,
          latestUpdate: i.incident_updates?.[0]?.body || null
        }));
      }
    } catch (e) { /* best effort */ }

    return {
      status: isDown ? 'incident' : 'operational',
      summary: description + (incidents.length > 0 ? ` ${incidents.length} active incident(s) confirmed.` : ''),
      incidents,
      url: statusPage
    };

  } catch (err) {
    return {
      status: 'unknown',
      summary: `Could not reach ${label} status API: ${err.message}`,
      incidents: [],
      url: statusPage
    };
  }
}

// ---------------------------------------------------------------------------
// SIGNAL 2: Downdetector -- user report volume
// ---------------------------------------------------------------------------
async function fetchDowndetector(ddSlug, label) {
  const url = `https://downdetector.com/status/${ddSlug}/`;
  try {
    const res = await fetch(url, {
      timeout: 7000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    });
    const html = await res.text();
    const operational = html.includes('User reports indicate no current problems');
    const elevated = html.includes('Problems at') || html.includes('User reports indicate problems') || html.includes('possible problems');
    const countMatch = html.match(/(\d[\d,]+)\s*reports?\s*in\s*the\s*last/i);
    const count = countMatch ? countMatch[1] : null;

    if (operational) return { status: 'operational', summary: `No significant user-reported problems on Downdetector.`, url };
    if (elevated) return { status: 'elevated', summary: `Elevated user reports on Downdetector${count ? ` (${count} reports)` : ''} -- spike above baseline detected.`, url };
    return { status: 'unknown', summary: `Downdetector signal inconclusive. Manual check: ${url}`, url };
  } catch (err) {
    return { status: 'unknown', summary: `Could not reach Downdetector: ${err.message}`, url };
  }
}

// ---------------------------------------------------------------------------
// SIGNAL 3: Reddit -- community posts (last 3 hours)
// ---------------------------------------------------------------------------
async function fetchReddit(label) {
  const query = encodeURIComponent(`${label} down outage not working`);
  const url = `https://www.reddit.com/search.json?q=${query}&sort=new&limit=10&t=day`;
  try {
    const res = await fetch(url, { timeout: 6000, headers: { 'User-Agent': 'IncidentEnrichmentAgent/1.0' } });
    if (!res.ok) return { status: 'unknown', summary: 'Could not fetch Reddit data.', posts: [] };
    const data = await res.json();
    const posts = (data?.data?.children || []).filter(p => {
      const ageHours = (Date.now() / 1000 - (p.data?.created_utc || 0)) / 3600;
      return ageHours < 3;
    });
    if (posts.length === 0) return { status: 'operational', summary: `No Reddit posts about ${label} issues in the last 3 hours.`, posts: [] };
    const titles = posts.slice(0, 3).map(p => `"${p.data?.title}" (r/${p.data?.subreddit}, ${Math.round((Date.now()/1000 - p.data?.created_utc)/60)} min ago)`);
    return {
      status: 'elevated',
      summary: `${posts.length} Reddit post(s) about ${label} issues in the last 3 hours.`,
      posts: titles
    };
  } catch (err) {
    return { status: 'unknown', summary: `Reddit check failed: ${err.message}`, posts: [] };
  }
}

// ---------------------------------------------------------------------------
// SIGNAL 4: Hacker News -- tech community signal
// ---------------------------------------------------------------------------
async function fetchHackerNews(label) {
  const query = encodeURIComponent(`${label} down outage`);
  const url = `https://hn.algolia.com/api/v1/search?query=${query}&tags=story&numericFilters=created_at_i>${Math.floor(Date.now()/1000)-10800}`;
  try {
    const res = await fetch(url, { timeout: 5000 });
    if (!res.ok) return { status: 'unknown', summary: 'Could not fetch Hacker News data.' };
    const data = await res.json();
    const hits = data?.hits || [];
    if (hits.length === 0) return { status: 'operational', summary: `No Hacker News discussions about ${label} issues in the last 3 hours.` };
    const titles = hits.slice(0, 2).map(h => `"${h.title}" (${h.points || 0} pts, ${h.num_comments || 0} comments)`);
    return {
      status: 'elevated',
      summary: `${hits.length} Hacker News post(s) about ${label} in the last 3 hours.`,
      posts: titles
    };
  } catch (err) {
    return { status: 'unknown', summary: `Hacker News check failed: ${err.message}` };
  }
}

// ---------------------------------------------------------------------------
// SIGNAL 5: Google News RSS -- press coverage
// ---------------------------------------------------------------------------
async function fetchGoogleNews(label) {
  const query = encodeURIComponent(`${label} outage OR down OR disruption`);
  const url = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;
  try {
    const res = await fetch(url, { timeout: 6000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; IncidentEnrichmentAgent/1.0)' } });
    if (!res.ok) return { status: 'unknown', summary: 'Could not fetch Google News data.' };
    const xml = await res.text();
    // Parse pub dates to find recent articles
    const items = [...xml.matchAll(/<item>[\s\S]*?<\/item>/g)];
    const recentItems = items.filter(m => {
      const pubMatch = m[0].match(/<pubDate>(.*?)<\/pubDate>/);
      if (!pubMatch) return false;
      const pub = new Date(pubMatch[1]);
      return (Date.now() - pub.getTime()) < 3 * 60 * 60 * 1000; // 3 hours
    });
    if (recentItems.length === 0) return { status: 'operational', summary: `No recent news articles about ${label} outages in the last 3 hours.` };
    const titles = recentItems.slice(0, 2).map(m => {
      const titleMatch = m[0].match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || m[0].match(/<title>(.*?)<\/title>/);
      return titleMatch ? `"${titleMatch[1]}"` : 'Untitled';
    });
    return {
      status: 'elevated',
      summary: `${recentItems.length} news article(s) about ${label} issues in the last 3 hours.`,
      headlines: titles
    };
  } catch (err) {
    return { status: 'unknown', summary: `Google News check failed: ${err.message}` };
  }
}

// ---------------------------------------------------------------------------
// Orchestrate all signals
// ---------------------------------------------------------------------------
async function fetchAllSignals(vendorKey, label, ddSlug) {
  const [official, dd, reddit, hn, news] = await Promise.all([
    vendorKey ? fetchOfficialStatus(vendorKey) : Promise.resolve({ status: 'unknown', summary: 'No official status API for this vendor.', incidents: [], url: '' }),
    fetchDowndetector(ddSlug || label.toLowerCase().replace(/\s+/g, '-'), label),
    fetchReddit(label),
    fetchHackerNews(label),
    fetchGoogleNews(label)
  ]);
  return { official, dd, reddit, hn, news };
}

// ---------------------------------------------------------------------------
// Synthesize verdict from all signals
// ---------------------------------------------------------------------------
function synthesizeVerdict(label, signals) {
  const { official, dd, reddit, hn, news } = signals;
  const statusPage = official.url || '';

  const officialDown = official.status === 'incident';
  const officialUnknown = official.status === 'unknown';
  const communityElevated = [dd, reddit, hn, news].filter(s => s.status === 'elevated').length;

  let verdict, confidence, reasoning, recommendedAction;

  if (officialDown && communityElevated >= 2) {
    verdict = 'WIDESPREAD OUTAGE CONFIRMED';
    confidence = 'Very High';
    reasoning = `${label}'s official status page confirms an active incident AND multiple independent community sources (${communityElevated} of 4) show elevated reports. This is a confirmed widespread issue affecting many users -- not isolated to your environment.`;
    recommendedAction = `1. Do NOT assign to an internal resolver -- this is a vendor-side issue.
2. Flag the incident as vendor-caused and set category to "External Vendor".
3. Notify affected users immediately with a status update referencing ${statusPage}.
4. Set up a monitoring task to check ${statusPage} every 30 minutes.
5. Consider mass notification if multiple users are reporting.
6. Do not attempt internal troubleshooting until vendor resolves.`;
  } else if (officialDown) {
    verdict = 'VENDOR INCIDENT CONFIRMED';
    confidence = 'High';
    reasoning = `${label}'s official status page confirms an active incident. Community signals are limited but the vendor has acknowledged the problem directly.`;
    recommendedAction = `1. Route incident to monitoring hold -- no internal troubleshooting needed.
2. Notify user this is a known vendor issue with a link to ${statusPage}.
3. Check ${statusPage} for estimated resolution time and affected services.
4. Reassign if vendor resolves while ticket is open.`;
  } else if (!officialDown && communityElevated >= 2) {
    verdict = 'POSSIBLE WIDESPREAD ISSUE';
    confidence = 'Medium';
    reasoning = `${label}'s official status page shows no active incident, but ${communityElevated} independent community sources show elevated reports. This is common in early-stage outages -- vendors typically update their status page 15-30 minutes after users start reporting.`;
    recommendedAction = `1. Hold internal troubleshooting for 15-20 minutes.
2. Monitor ${statusPage} for status updates.
3. If community reports continue to grow, escalate to vendor support proactively.
4. Notify user that a potential widespread issue is being investigated.`;
  } else if (!officialDown && communityElevated === 1) {
    verdict = 'POSSIBLE ISOLATED ISSUE';
    confidence = 'Medium';
    reasoning = `${label}'s official status page shows operational and community signals are mostly quiet. One source shows some elevation. This may be an isolated user or account-level issue.`;
    recommendedAction = `1. Proceed with standard ITSM troubleshooting -- check user-side configuration, network, browser.
2. Monitor ${statusPage} and community sources over the next 15 minutes.
3. If other users begin reporting, escalate to vendor watch.`;
  } else {
    verdict = 'LIKELY ISOLATED';
    confidence = 'High';
    reasoning = `${label}'s official status page is operational and no community sources show elevated activity. This issue appears to be isolated to the reporting user or their local environment.`;
    recommendedAction = `1. Proceed with standard ITSM troubleshooting.
2. Check user-side: browser cache, network connectivity, VPN, account permissions.
3. Escalate to ${label} support if unresolved after standard troubleshooting.`;
  }

  return { verdict, confidence, reasoning, recommendedAction };
}

// ---------------------------------------------------------------------------
// Build the full enrichment report
// ---------------------------------------------------------------------------
function buildReport(label, vendorKey, signals, verdict, userMessage) {
  const { official, dd, reddit, hn, news } = signals;
  const vendor = vendorKey ? VENDORS[vendorKey] : null;
  const timestamp = new Date().toISOString();

  const lines = [
    `INCIDENT ENRICHMENT REPORT`,
    `Generated: ${timestamp}`,
    `Vendor Analyzed: ${label}`,
    `Original Issue: ${userMessage}`,
    ``,
    `════════════════════════════════════════════`,
    `  VERDICT: ${verdict.verdict}`,
    `  Confidence: ${verdict.confidence}`,
    `════════════════════════════════════════════`,
    ``,
    `REASONING:`,
    verdict.reasoning,
    ``,
    `RECOMMENDED ACTIONS FOR ITSM TEAM:`,
    verdict.recommendedAction,
    ``,
    `════════════════════════════════════════════`,
    `  SIGNAL DETAILS (5 independent sources)`,
    `════════════════════════════════════════════`,
    ``,
    `[OFFICIAL] ${label} Status Page`,
    `  Status: ${official.status.toUpperCase()}`,
    `  Summary: ${official.summary}`,
    `  URL: ${official.url || (vendor ? vendor.statusPage : 'N/A')}`,
  ];

  if (official.incidents && official.incidents.length > 0) {
    lines.push(`  Active Incidents (${official.incidents.length}):`);
    official.incidents.forEach((inc, i) => {
      lines.push(`    Incident ${i + 1}: ${inc.title}`);
      lines.push(`      Severity: ${inc.severity}`);
      lines.push(`      Started: ${inc.started}`);
      if (inc.affectedServices) lines.push(`      Affected Services: ${inc.affectedServices}`);
      if (inc.eta) lines.push(`      Estimated Resolution: ${inc.eta}`);
      if (inc.latestUpdate) lines.push(`      Latest Update: ${inc.latestUpdate}`);
      if (inc.instanceKeys) lines.push(`      Affected Instances: ${inc.instanceKeys}`);
    });
  }

  lines.push(``);
  lines.push(`[USER REPORTS] Downdetector`);
  lines.push(`  Status: ${dd.status.toUpperCase()}`);
  lines.push(`  ${dd.summary}`);
  lines.push(`  URL: ${dd.url}`);

  lines.push(``);
  lines.push(`[REDDIT] Community Posts (last 3 hours)`);
  lines.push(`  Status: ${reddit.status.toUpperCase()}`);
  lines.push(`  ${reddit.summary}`);
  if (reddit.posts && reddit.posts.length > 0) {
    reddit.posts.forEach(p => lines.push(`    - ${p}`));
  }

  lines.push(``);
  lines.push(`[HACKER NEWS] Tech Community (last 3 hours)`);
  lines.push(`  Status: ${hn.status.toUpperCase()}`);
  lines.push(`  ${hn.summary}`);
  if (hn.posts && hn.posts.length > 0) {
    hn.posts.forEach(p => lines.push(`    - ${p}`));
  }

  lines.push(``);
  lines.push(`[NEWS] Google News (last 3 hours)`);
  lines.push(`  Status: ${news.status.toUpperCase()}`);
  lines.push(`  ${news.summary}`);
  if (news.headlines && news.headlines.length > 0) {
    news.headlines.forEach(h => lines.push(`    - ${h}`));
  }

  if (vendor) {
    lines.push(``);
    lines.push(`════════════════════════════════════════════`);
    lines.push(`  VENDOR RESOURCES`);
    lines.push(`════════════════════════════════════════════`);
    lines.push(`  Status Page: ${vendor.statusPage}`);
    lines.push(`  Community / Support: ${vendor.community}`);
    lines.push(`  Downdetector: https://downdetector.com/status/${vendor.ddSlug}/`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get('/health', (req, res) => {
  res.json({ status: 'ok', agent: 'Incident Enrichment Agent', timestamp: new Date().toISOString() });
});


// ---------------------------------------------------------------------------
// Debug endpoint -- echoes full request body (remove after debugging)
// ---------------------------------------------------------------------------
app.post('/debug', (req, res) => {
  console.log('DEBUG REQUEST:', JSON.stringify(req.body, null, 2));
  res.json({ received: req.body });
});

// ---------------------------------------------------------------------------
// Core task handler
// ---------------------------------------------------------------------------
async function handleTask(userMessage, taskId) {
  const vendorKey = detectVendor(userMessage);
  const label = vendorKey ? VENDORS[vendorKey].label : extractVendorName(userMessage);
  const ddSlug = vendorKey ? VENDORS[vendorKey].ddSlug : label.toLowerCase().replace(/\s+/g, '-');

  const signals = await fetchAllSignals(vendorKey, label, ddSlug);
  const verdict = synthesizeVerdict(label, signals);
  const responseText = buildReport(label, vendorKey, signals, verdict, userMessage);

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
// A2A Task Endpoint -- matches ServiceNow A2A protocol (message/send format)
// ---------------------------------------------------------------------------
app.post('/a2a', async (req, res) => {
  const { id, method, params } = req.body || {};

  // Reject missing method
  if (!method) {
    return res.status(400).json({
      jsonrpc: '2.0',
      id: id || null,
      error: { code: -32600, message: 'Invalid request: missing method' }
    });
  }

  // Primary handler: message/send (ServiceNow A2A format)
  if (method === 'message/send' || method === 'tasks/send' || method === 'tasks/run') {
    const message = params?.message;
    const parts = message?.parts || [];
    const textPart = parts.find(p => p.kind === 'text' || p.type === 'text');
    const userMessage = textPart?.text || message?.text || params?.input || '';

    if (!userMessage) {
      return res.json({
        jsonrpc: '2.0',
        id,
        result: {
          kind: 'task',
          id: `task-${Date.now()}`,
          contextId: message?.contextId || `ctx-${Date.now()}`,
          status: { state: 'completed', timestamp: new Date().toISOString() },
          artifacts: [{
            artifactId: `art-${Date.now()}`,
            name: 'response',
            parts: [{ kind: 'text', text: 'Please provide a vendor or application name and describe the issue.' }]
          }]
        }
      });
    }

    try {
      const vendorKey = detectVendor(userMessage);
      const label = vendorKey ? VENDORS[vendorKey].label : extractVendorName(userMessage);
      const ddSlug = vendorKey ? VENDORS[vendorKey].ddSlug : label.toLowerCase().replace(/\s+/g, '-');

      const signals = await fetchAllSignals(vendorKey, label, ddSlug);
      const verdict = synthesizeVerdict(label, signals);
      const responseText = buildReport(label, vendorKey, signals, verdict, userMessage);

      return res.json({
        jsonrpc: '2.0',
        id,
        result: {
          kind: 'task',
          id: `task-${Date.now()}`,
          contextId: message?.contextId || `ctx-${Date.now()}`,
          status: { state: 'completed', timestamp: new Date().toISOString() },
          artifacts: [{
            artifactId: `art-${Date.now()}`,
            name: 'incident_enrichment_report',
            parts: [{ kind: 'text', text: responseText }]
          }]
        }
      });
    } catch (err) {
      return res.json({
        jsonrpc: '2.0',
        id,
        error: { code: -32000, message: `Agent error: ${err.message}` }
      });
    }
  }

  // tasks/get -- stateless agent
  if (method === 'tasks/get') {
    return res.json({
      jsonrpc: '2.0',
      id,
      error: { code: -32001, message: 'Task not found (stateless agent)' }
    });
  }

  // Unknown method
  return res.json({
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Method not found: ${method}` }
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Incident Enrichment Agent running on port ${PORT}`);
  console.log(`Agent card: ${AGENT_BASE_URL}/.well-known/agent.json`);
  console.log(`A2A endpoint: ${AGENT_BASE_URL}/a2a`);
});
