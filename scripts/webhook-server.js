// scripts/webhook-server.js
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 3001;
const SECRET = process.env.GITHUB_WEBHOOK_SECRET || 'your-webhook-secret-here';
const REPO_PATH = '/opt/runner-api';
const LOG_FILE = '/opt/runner-api/logs/deploy.log';

// Ensure log directory exists
const logDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(logMessage.trim());
  fs.appendFileSync(LOG_FILE, logMessage);
}

function verifySignature(payload, signature) {
  const hmac = crypto.createHmac('sha256', SECRET);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

function executeCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    log(`Executing: ${command} ${args.join(' ')}`);
    const child = spawn(command, args, {
      cwd: REPO_PATH,
      stdio: 'pipe',
      ...options,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      log(`STDOUT: ${output.trim()}`);
    });

    child.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      log(`STDERR: ${output.trim()}`);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

async function gracefulDeploy() {
  log('🚀 Starting graceful deployment...');

  try {
    // Step 1: Pull latest changes
    log('📥 Pulling latest changes from main branch...');
    await executeCommand('git', ['fetch', 'origin', 'main']);
    await executeCommand('git', ['reset', '--hard', 'origin/main']);

    // Step 2: Check if there are any running containers
    log('🔍 Checking current container status...');
    const { stdout: psOutput } = await executeCommand('docker-compose', [
      '-f',
      'docker-compose.prod.yml',
      'ps',
      '-q',
    ]);

    if (psOutput.trim()) {
      log('📊 Containers are running, performing graceful shutdown...');

      // Wait for current requests to finish (grace period)
      log('⏳ Waiting 30 seconds for current requests to complete...');
      await new Promise((resolve) => setTimeout(resolve, 30000));

      // Graceful shutdown
      log('🛑 Stopping containers gracefully...');
      await executeCommand('docker-compose', [
        '-f',
        'docker-compose.prod.yml',
        'stop',
      ]);
    }

    // Step 3: Build new image
    log('🔨 Building new Docker image...');
    await executeCommand('docker-compose', [
      '-f',
      'docker-compose.prod.yml',
      'build',
      '--no-cache',
      'api',
    ]);

    // Step 4: Start services
    log('▶️ Starting services...');
    await executeCommand('docker-compose', [
      '-f',
      'docker-compose.prod.yml',
      'up',
      '-d',
    ]);

    // Step 5: Wait for health checks
    log('🏥 Waiting for services to be healthy...');
    let healthCheckAttempts = 0;
    const maxAttempts = 60; // 5 minutes max

    while (healthCheckAttempts < maxAttempts) {
      try {
        const { stdout: healthOutput } = await executeCommand(
          'docker-compose',
          ['-f', 'docker-compose.prod.yml', 'ps', '-q'],
        );
        const containerIds = healthOutput
          .trim()
          .split('\n')
          .filter((id) => id);

        if (containerIds.length === 0) {
          throw new Error('No containers running');
        }

        let allHealthy = true;
        for (const containerId of containerIds) {
          const { stdout: inspectOutput } = await executeCommand('docker', [
            'inspect',
            '--format={{.State.Health.Status}}',
            containerId,
          ]);
          const healthStatus = inspectOutput.trim();

          if (healthStatus !== 'healthy' && healthStatus !== '') {
            allHealthy = false;
            break;
          }
        }

        if (allHealthy) {
          log('✅ All services are healthy!');
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds
        healthCheckAttempts++;
      } catch (error) {
        log(
          `⚠️ Health check attempt ${healthCheckAttempts + 1}/${maxAttempts} failed: ${error.message}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 5000));
        healthCheckAttempts++;
      }
    }

    if (healthCheckAttempts >= maxAttempts) {
      throw new Error(
        'Services failed to become healthy within timeout period',
      );
    }

    // Step 6: Clean up old images
    log('🧹 Cleaning up unused Docker images...');
    await executeCommand('docker', ['image', 'prune', '-f']);

    log('🎉 Deployment completed successfully!');
    return true;
  } catch (error) {
    log(`❌ Deployment failed: ${error.message}`);

    // Attempt to rollback by restarting the last known good state
    try {
      log('🔄 Attempting to restart services...');
      await executeCommand('docker-compose', [
        '-f',
        'docker-compose.prod.yml',
        'up',
        '-d',
      ]);
    } catch (rollbackError) {
      log(`❌ Rollback failed: ${rollbackError.message}`);
    }

    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/webhook') {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }

  let body = '';
  req.on('data', (chunk) => {
    body += chunk.toString();
  });

  req.on('end', async () => {
    try {
      const signature = req.headers['x-hub-signature-256'];

      if (!signature || !verifySignature(body, signature)) {
        log('❌ Invalid webhook signature');
        res.writeHead(401, { 'Content-Type': 'text/plain' });
        res.end('Unauthorized');
        return;
      }

      const payload = JSON.parse(body);

      // Only deploy on push to main branch
      if (payload.ref !== 'refs/heads/main') {
        log(`ℹ️ Ignoring push to ${payload.ref} (not main branch)`);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK - Ignored (not main branch)');
        return;
      }

      log(`🔔 Received push to main branch from ${payload.pusher.name}`);
      log(
        `📝 Commit: ${payload.head_commit.message} (${payload.head_commit.id.substring(0, 7)})`,
      );

      // Respond immediately to GitHub
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK - Deployment started');

      // Start deployment asynchronously
      gracefulDeploy().catch((error) => {
        log(`❌ Deployment error: ${error.message}`);
      });
    } catch (error) {
      log(`❌ Webhook processing error: ${error.message}`);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
  });
});

server.listen(PORT, () => {
  log(`🎣 Webhook server listening on port ${PORT}`);
  log(`🔒 Using webhook secret: ${SECRET.substring(0, 4)}...`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  log('🛑 Webhook server shutting down...');
  server.close(() => {
    log('✅ Webhook server closed');
  });
});

process.on('SIGINT', () => {
  log('🛑 Webhook server shutting down...');
  server.close(() => {
    log('✅ Webhook server closed');
  });
});
