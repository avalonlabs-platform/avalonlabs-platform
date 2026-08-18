import dotenv from 'dotenv';
dotenv.config({ path: './scripts/.env.ops' });

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_API_BASE_URL = 'https://api.vercel.com';

if (!VERCEL_TOKEN) {
  console.error('FATAL: VERCEL_TOKEN is not defined in scripts/.env.ops');
  process.exit(1);
}

const authHeaders = {
  'Authorization': `Bearer ${VERCEL_TOKEN}`,
  'Content-Type': 'application/json',
};

/**
 * List latest project deployments and operational states.
 */
async function inspectDeployments() {
  try {
    const response = await fetch(`${VERCEL_API_BASE_URL}/v6/deployments?limit=8`, {
      method: 'GET',
      headers: authHeaders,
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(`Vercel API error [${response.status}]: ${JSON.stringify(payload)}`);
    }

    const deployments = payload.deployments || [];

    console.log('\n==================================================');
    console.log('             VERCEL DEPLOYMENT TELEMETRY          ');
    console.log('==================================================');

    deployments.forEach((dep, index) => {
      const stateBadge = dep.state === 'READY' ? '[HEALTHY]' : `[${dep.state}]`;
      console.log(`[#${index + 1}] ${stateBadge} ${dep.name}`);
      console.log(`     URL:         https://${dep.url}`);
      console.log(`     Target:      ${dep.target || 'preview'}`);
      console.log(`     Commit:      ${dep.meta?.githubCommitMessage || 'Direct Deployment'}`);
      console.log(`     Author:      ${dep.creator?.username || 'Unknown'}`);
      console.log(`     Created At:  ${new Date(dep.created).toISOString()}`);
      console.log('--------------------------------------------------');
    });
  } catch (error) {
    console.error('[DevOps Error] Failed to retrieve Vercel deployments:', error.message);
  }
}

/**
 * Trigger an instant redeployment of the main project.
 */
async function triggerDeployment(projectId) {
  if (!projectId) {
    console.error('Usage: node scripts/vercel-controller.mjs deploy <PROJECT_ID_OR_NAME>');
    return;
  }

  try {
    console.log(`Triggering deployment for project "${projectId}"...`);
    const response = await fetch(`${VERCEL_API_BASE_URL}/v13/deployments`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: projectId,
        target: 'production',
      }),
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(`Deployment creation failed: ${JSON.stringify(payload)}`);
    }

    console.log(`Successfully triggered deployment! Target URL: https://${payload.url}`);
  } catch (error) {
    console.error('[DevOps Error] Failed to trigger deployment:', error.message);
  }
}

const action = process.argv[2] || 'status';
const secondaryArg = process.argv[3];

if (action === 'status') {
  inspectDeployments();
} else if (action === 'deploy') {
  triggerDeployment(secondaryArg);
} else {
  console.log(`Invalid command: "${action}". Supported commands: "status", "deploy <project>"`);
}