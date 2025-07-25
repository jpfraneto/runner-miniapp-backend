import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { 
  WEEK_ZERO_END_DATE, 
  getCurrentWeekNumber, 
  getWeekRange,
  getWeekForTimestamp 
} from '../../constants/week-calculation';
import { hasResponse, hasError, HttpStatus } from '../../utils';

@ApiTags('week-service')
@Controller('week-service')
export class WeekController {
  /**
   * Get current week information
   * URL: /week-service/current
   */
  @Get('current')
  @ApiOperation({
    summary: 'Get current week information',
    description: 'Returns current week number, range, and constants for frontend use',
  })
  async getCurrentWeek(@Res() res: Response) {
    try {
      const currentWeek = getCurrentWeekNumber();
      const weekRange = getWeekRange(currentWeek);
      
      return hasResponse(res, {
        currentWeek,
        weekRange,
        currentTime: new Date().toISOString(),
        constants: {
          WEEK_ZERO_END_DATE: WEEK_ZERO_END_DATE.toISOString(),
        },
      });
    } catch (error) {
      console.error('❌ [WeekController] Failed to get current week:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getCurrentWeek',
        'Unable to retrieve current week information.',
      );
    }
  }
}