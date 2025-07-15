// Test script to verify webhook idempotency
// This script simulates multiple webhook calls with the same cast hash to test duplicate detection

const axios = require('axios');

const WEBHOOK_URL =
  'http://localhost:3000/social-service/farcaster/cast-webhook';
const HEALTH_URL =
  'http://localhost:3000/social-service/farcaster/webhook-health';

// Sample webhook data
const sampleWebhookData = {
  created_at: Date.now(),
  type: 'cast.created',
  data: {
    hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    timestamp: Math.floor(Date.now() / 1000).toString(),
    text: 'Just finished a great run! 🏃‍♂️',
    thread_hash:
      '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    parent_hash: null,
    parent_url: null,
    root_parent_url: null,
    author: {
      object: 'user',
      fid: 194,
      username: 'testuser',
      display_name: 'Test User',
      pfp_url: 'https://example.com/pfp.jpg',
      custody_address: '0x1234567890abcdef1234567890abcdef1234567890',
      profile: {},
      follower_count: 100,
      following_count: 50,
      verifications: [],
    },
    embeds: [
      {
        url: 'https://imagedelivery.net/example/image.jpg',
        metadata: {
          content_type: 'image/jpeg',
        },
      },
    ],
    reactions: {
      likes_count: 0,
      recasts_count: 0,
      likes: [],
      recasts: [],
    },
    replies: {
      count: 0,
    },
    mentioned_profiles: [],
    mentioned_profiles_ranges: [],
    mentioned_channels: [],
    mentioned_channels_ranges: [],
  },
};

async function testIdempotency() {
  console.log('🧪 Testing webhook idempotency...\n');

  try {
    // First, check the health endpoint
    console.log('📊 Checking webhook health...');
    const healthResponse = await axios.get(HEALTH_URL);
    console.log('Health status:', healthResponse.data.status);
    console.log('Initial stats:', healthResponse.data.deduplication.stats);
    console.log('');

    // Send the same webhook multiple times
    const numCalls = 5;
    console.log(`🔄 Sending the same webhook ${numCalls} times...\n`);

    const promises = [];
    for (let i = 0; i < numCalls; i++) {
      promises.push(
        axios
          .post(WEBHOOK_URL, sampleWebhookData)
          .then((response) => {
            console.log(
              `✅ Webhook call ${i + 1} completed with status: ${response.status}`,
            );
            return response.data;
          })
          .catch((error) => {
            console.error(`❌ Webhook call ${i + 1} failed:`, error.message);
            return null;
          }),
      );
    }

    // Wait for all calls to complete
    const results = await Promise.all(promises);
    console.log('');

    // Wait a moment for background processing
    console.log('⏳ Waiting for background processing...');
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Check final health status
    console.log('📊 Checking final webhook health...');
    const finalHealthResponse = await axios.get(HEALTH_URL);
    console.log('Final health status:', finalHealthResponse.data.status);
    console.log('Final stats:', finalHealthResponse.data.deduplication.stats);

    // Analyze results
    const totalWebhooks =
      finalHealthResponse.data.deduplication.stats.totalWebhooks;
    const duplicatesDetected =
      finalHealthResponse.data.deduplication.stats.duplicatesDetected;
    const duplicateRate =
      finalHealthResponse.data.deduplication.stats.duplicateRate;

    console.log('\n📈 Analysis:');
    console.log(`- Total webhook calls: ${totalWebhooks}`);
    console.log(`- Duplicates detected: ${duplicatesDetected}`);
    console.log(`- Duplicate rate: ${duplicateRate}`);
    console.log(
      `- Expected duplicates: ${numCalls - 1} (all but the first call)`,
    );

    if (duplicatesDetected >= numCalls - 1) {
      console.log('✅ SUCCESS: Idempotency is working correctly!');
    } else {
      console.log(
        '❌ FAILURE: Not enough duplicates detected. Idempotency may not be working.',
      );
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testIdempotency();
