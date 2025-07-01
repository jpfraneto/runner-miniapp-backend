# Workout Validation System

## Overview

The RUNNER platform includes a comprehensive workout validation system to ensure users submit legitimate running workout data and prevent abuse of the platform.

## How It Works

### 1. Validation Process

When a user uploads workout screenshots, the system:

1. **AI Processing**: Uses GPT-4 Vision to extract workout data from screenshots
2. **Validation Check**: Validates the extracted data against realistic parameters
3. **Suspicious Pattern Detection**: Identifies potentially fraudulent submissions
4. **User Tracking**: Tracks invalid submissions per user
5. **Ban System**: Automatically bans users after 3 invalid submissions

### 2. Validation Criteria

#### Essential Data Requirements

- **Distance**: Must be between 0.1km and 100km
- **Duration**: Must be between 0.5 minutes and 600 minutes (10 hours)
- **Confidence**: AI extraction confidence must be ≥ 30%

#### Suspicious Pattern Detection

- **Extremely Fast Paces**: < 3 minutes per kilometer
- **Impossible Speed**: Distance/duration ratio suggesting impossible speeds
- **Unrealistic Heart Rates**:
  - Average HR: < 40 or > 220 BPM
  - Max HR: < 60 or > 250 BPM
- **Unrealistic Calorie Burn**: > 20 calories per minute

#### Non-Workout Image Detection

- Screenshots that don't contain workout data
- Random photos, selfies, food pictures, etc.
- Screenshots from non-fitness apps

### 3. Ban System

#### Warning System

- **1st Invalid Submission**: Warning logged
- **2nd Invalid Submission**: Warning logged
- **3rd Invalid Submission**: 1-week ban applied

#### Ban Details

- **Duration**: 7 days from ban start
- **Automatic Expiry**: Bans automatically expire
- **Ban History**: All bans are tracked in user record

## Database Schema

### User Model Additions

```typescript
// Workout validation fields
invalidWorkoutSubmissions: number; // Count of invalid submissions
isBanned: boolean; // Whether user is currently banned
bannedAt: Date; // When the ban started
banExpiresAt: Date; // When the ban expires
banHistory: Array<{
  bannedAt: string;
  expiresAt: string;
  reason: string;
  invalidSubmissions: number;
}>;
```

### CompletedRun Model Additions

```typescript
// Validation tracking fields
isValidWorkout: boolean; // Whether this was a valid workout
validationNotes: string; // Notes about why workout was invalid
```

## API Endpoints

### User Endpoints

#### Get Validation Status

```http
GET /training-service/runner-workflow/validation-status
```

Response:

```json
{
  "invalidSubmissions": 1,
  "isBanned": false,
  "banExpiresAt": null,
  "remainingDays": null,
  "warningsRemaining": 2
}
```

### Admin Endpoints

#### Get Users with Validation Issues

```http
GET /admin-service/users/validation-issues
```

#### Reset User Validation Status

```http
POST /admin-service/users/:id/reset-validation
```

## Implementation Details

### Core Validation Logic

The validation system is implemented in `RunnerWorkflowService` with these key methods:

- `validateWorkoutData()`: Main validation logic
- `detectSuspiciousPatterns()`: Pattern detection
- `handleInvalidWorkoutSubmission()`: Ban management
- `isUserBanned()`: Ban status checking

### Integration Points

1. **Workout Processing**: Validation occurs during `processWorkoutSession()`
2. **Ban Checking**: All workout operations check ban status first
3. **Admin Management**: Admins can view and reset validation status

## Error Messages

### User-Facing Messages

- "Non-workout image detected - please upload screenshots from your running app"
- "Missing essential workout data (distance or duration)"
- "Unrealistic distance: X km"
- "Unrealistic duration: X minutes"
- "Suspicious workout patterns detected: [patterns]"
- "Low confidence in data extraction - please ensure clear screenshots"
- "Your account has been temporarily suspended for submitting invalid workouts. You can resume using RUNNER on [date]."

### Admin Messages

- "User validation status reset successfully"
- "Users with validation issues retrieved successfully"

## Best Practices

### For Users

1. Upload clear, high-quality screenshots from running apps
2. Ensure screenshots show complete workout data
3. Don't upload non-workout images
4. Contact support if you believe you were incorrectly banned

### For Admins

1. Monitor users with validation issues regularly
2. Review ban history before resetting validation status
3. Consider context when evaluating suspicious patterns
4. Use the admin dashboard to track validation trends

## Monitoring and Analytics

### Key Metrics to Track

- Total invalid submissions per day/week
- Ban rate and duration
- Most common validation failure reasons
- Users with multiple validation issues
- False positive rate (legitimate users banned)

### Logging

All validation events are logged with appropriate levels:

- `INFO`: Valid workout processed
- `WARN`: Invalid workout detected
- `ERROR`: Validation system errors

## Future Enhancements

### Potential Improvements

1. **Machine Learning**: Train models on legitimate vs. fraudulent patterns
2. **Community Reporting**: Allow users to report suspicious activities
3. **App Integration**: Direct API connections to verify workout data
4. **Progressive Penalties**: Different ban durations based on severity
5. **Appeal System**: Allow users to appeal bans with evidence

### Advanced Detection

1. **GPS Route Analysis**: Verify route plausibility
2. **Time Pattern Analysis**: Detect impossible time sequences
3. **Device Fingerprinting**: Track device patterns
4. **Social Graph Analysis**: Identify coordinated abuse

## Security Considerations

1. **Rate Limiting**: Prevent rapid submission of invalid workouts
2. **IP Tracking**: Monitor for suspicious IP patterns
3. **Account Recovery**: Secure process for legitimate users to regain access
4. **Audit Trail**: Complete logging of all validation decisions
5. **Data Privacy**: Ensure validation data doesn't compromise user privacy
