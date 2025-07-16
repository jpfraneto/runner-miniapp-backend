# Automated Cast Processing System

## Overview

This system automatically fetches and processes new casts from the `/running` channel every 15 minutes, eliminating the need for manual intervention. It integrates with your existing `cast-processor.service.ts` and `screenshot-processor.service.ts` to detect workout images and add them to the database.

## Features

- **Automatic Cast Fetching**: Runs every 15 minutes to check for new casts
- **Smart Processing**: Only processes casts from the last 24 hours with images
- **Database Integration**: Automatically saves workout data to your existing database
- **Error Handling**: Robust error handling with failure tracking and automatic recovery
- **Health Monitoring**: Built-in health checks and status monitoring
- **Manual Controls**: API endpoints for manual triggers and monitoring

## Architecture

### Core Components

1. **CastSchedulerService**: Manages the cron job that runs every 15 minutes
2. **CastFetcherService**: Fetches new casts from Neynar API
3. **CastProcessorService**: Processes images and extracts workout data (existing)
4. **ScreenshotProcessorService**: Handles image processing (existing)

### Data Flow

```
Cron Job (Every 15 min) → CastFetcherService → Neynar API → CastProcessorService → Database
```

## Configuration

### Environment Variables

Make sure you have these environment variables set:

```bash
# Required
NEYNAR_API_KEY=your_neynar_api_key
NEYNAR_SIGNER_UUID=your_signer_uuid
OPENAI_API_KEY=your_openai_api_key

# Database (existing)
DB_HOST=your_db_host
DB_PORT=3306
DB_USERNAME=your_db_username
DB_PASSWORD=your_db_password
DB_NAME=your_db_name
```

### Cron Schedule

The system runs every 15 minutes using NestJS Schedule module:
- `@Cron(CronExpression.EVERY_15_MINUTES)`
- Checks for new casts since last run
- Only processes casts from last 24 hours

## API Endpoints

### Manual Controls

#### 1. Trigger Manual Fetch
```
POST /social-service/automation/trigger-cast-fetch
```
Manually triggers the cast fetching process.

**Response:**
```json
{
  "success": true,
  "message": "Manual cast fetching completed successfully in 2341ms",
  "duration": 2341
}
```

#### 2. Get Status
```
GET /social-service/automation/status
```
Returns current automation status.

**Response:**
```json
{
  "isRunning": false,
  "lastRunTime": "2024-01-15T10:30:00.000Z",
  "consecutiveFailures": 0,
  "nextRunEstimate": "2024-01-15T10:45:00.000Z"
}
```

#### 3. Health Check
```
GET /social-service/automation/health
```
Returns detailed health information.

**Response:**
```json
{
  "status": "healthy",
  "isRunning": false,
  "lastRunTime": "2024-01-15T10:30:00.000Z",
  "consecutiveFailures": 0,
  "systemHealth": {
    "fetcher": {
      "status": "healthy",
      "lastRun": "2024-01-15T10:30:00.000Z"
    },
    "maxFailuresReached": false
  }
}
```

#### 4. Reset Failures
```
POST /social-service/automation/reset-failures
```
Resets the consecutive failure counter.

## Error Handling

### Failure Tracking
- Tracks consecutive failures
- Stops automated processing after 3 consecutive failures
- Provides detailed error logging

### Recovery
- Automatic recovery on next successful run
- Manual failure counter reset via API
- Comprehensive health monitoring

### Logging
The system provides detailed logging:
- System status before each run
- Processing statistics
- Error details with failure counts
- Performance metrics

## Monitoring

### System Status Logs
Every 15 minutes, the system logs:
- Last successful run time
- Consecutive failure count
- Casts processed in last 24 hours
- Hours since last processed cast

### Health Indicators
- **Healthy**: System running normally, failures < 3
- **Unhealthy**: System has issues or too many failures

## Database Integration

### Processed Casts Tracking
- Uses existing `FarcasterCast` table
- Tracks last processed cast hash
- Prevents duplicate processing

### Workout Data Storage
- Integrates with existing `RunningSession` model
- Creates user records automatically
- Updates user statistics

## Performance

### Optimizations
- 500ms delay between API requests to respect rate limits
- Incremental fetching (only new casts)
- Smart stopping when reaching processed casts
- 24-hour time window to limit processing scope

### Resource Usage
- Minimal CPU usage (only runs every 15 minutes)
- Efficient memory usage with streaming processing
- Database queries optimized for recent data

## Troubleshooting

### Common Issues

1. **API Rate Limits**
   - Check Neynar API key validity
   - Verify rate limit quotas
   - Ensure 500ms delay between requests

2. **Database Connection**
   - Verify database credentials
   - Check network connectivity
   - Confirm table schemas exist

3. **OpenAI Processing**
   - Verify OpenAI API key
   - Check quota limits
   - Monitor image processing errors

### Debug Commands

```bash
# Check automation status
curl http://localhost:3000/social-service/automation/status

# Trigger manual run
curl -X POST http://localhost:3000/social-service/automation/trigger-cast-fetch

# Check health
curl http://localhost:3000/social-service/automation/health

# Reset failures
curl -X POST http://localhost:3000/social-service/automation/reset-failures
```

### Logs to Monitor

Look for these log patterns:
- `🚀 Starting automated cast fetching cron job`
- `📊 System Status:`
- `✅ Cast fetching cron job completed successfully`
- `❌ Cast fetching cron job failed`
- `🚨 CRITICAL: 3 consecutive failures`

## Migration from Manual Scripts

This system replaces your manual workflow:

### Old Process
1. Run first script to fetch casts → `running_casts.json`
2. Run second script to process images → database

### New Process
1. Automated every 15 minutes
2. Direct database integration
3. No manual intervention needed

### Benefits
- No more manual script running
- Real-time processing
- Automatic error recovery
- Better monitoring and logging
- Consistent processing schedule

## Future Enhancements

Potential improvements:
- Webhook integration for real-time processing
- Advanced analytics and metrics
- Custom processing rules
- Notification system for failures
- Dashboard for monitoring

## Support

For issues or questions:
1. Check the logs for error details
2. Use the health endpoint for system status
3. Try manual trigger to test processing
4. Reset failure counter if needed
5. Restart the service if critical failures persist