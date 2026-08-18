import dotenv from 'dotenv';
dotenv.config({ path: './scripts/.env.ops' });

const EXPO_TOKEN = process.env.EXPO_TOKEN;
const EXPO_API_BASE_URL = 'https://api.expo.dev/v2';

if (!EXPO_TOKEN) {
  console.error('FATAL: EXPO_TOKEN is not defined in scripts/.env.ops');
  process.exit(1);
}

const authHeaders = {
  'Authorization': `Bearer ${EXPO_TOKEN}`,
  'Content-Type': 'application/json',
};

/**
 * Inspect EAS Cloud Build pipeline status.
 */
async function inspectEASBuilds() {
  try {
    const response = await fetch(`${EXPO_API_BASE_URL}/builds?limit=5`, {
      method: 'GET',
      headers: authHeaders,
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(`Expo API returned status ${response.status}: ${JSON.stringify(payload)}`);
    }

    const buildList = payload.data || [];

    console.log('\n==================================================');
    console.log('              EAS CLOUD BUILD PIPELINE            ');
    console.log('==================================================');

    if (buildList.length === 0) {
      console.log('No recent EAS cloud builds found.');
      console.log('To initiate a new standalone APK build, execute:');
      console.log('  cd mobile && npx eas-cli build --profile development --platform android');
      console.log('==================================================');
      return;
    }

    buildList.forEach((build, index) => {
      console.log(`[#${index + 1}] Build ID: ${build.id}`);
      console.log(`     Platform:    ${build.platform.toUpperCase()}`);
      console.log(`     Profile:     ${build.buildProfile}`);
      console.log(`     Status:      ${build.status.toUpperCase()}`);
      console.log(`     Duration:    ${build.metrics?.duration ? `${build.metrics.duration}s` : 'In Progress'}`);
      if (build.artifacts?.buildUrl) {
        console.log(`     Artifact URL: ${build.artifacts.buildUrl}`);
      }
      console.log('--------------------------------------------------');
    });
  } catch (error) {
    console.error('[Mobile DevOps Error] Failed to retrieve EAS builds:', error.message);
  }
}

inspectEASBuilds();