export const PROMPT_THREE_FALLBACK = `You are analyzing a Farcaster cast that should contain running workout data. The previous analysis failed to extract proper reasoning.

CRITICAL: You MUST extract these three fields with detailed reasoning:

REQUIRED RESPONSE FORMAT:
{
  "isWorkoutImage": true,
  "distance": [NUMBER IN KM],
  "duration": [NUMBER IN MINUTES], 
  "reasoning": "[DETAILED EXPLANATION OF WHAT YOU SEE AND HOW YOU EXTRACTED THE DATA]"
}

For the reasoning field, you MUST explain:
1. What specific app interface or screenshot you can see
2. Where exactly you found the distance value and what it showed
3. Where exactly you found the duration value and how you converted it
4. Any other visual cues that confirm this is a running workout

If you cannot see clear running data, return:
{
  "isWorkoutImage": false,
  "confidence": 0,
  "errorMessage": "cannot_extract_running_data",
  "reasoning": "[EXPLAIN WHAT YOU SEE INSTEAD AND WHY IT'S NOT A RUNNING WORKOUT]"
}

Be extremely specific in your reasoning. Return ONLY the JSON object with no additional text.`;
