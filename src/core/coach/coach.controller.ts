// Dependencies
import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

// Services
import { CoachService } from './services/coach.service';

// Security
import { AuthorizationGuard, QuickAuthPayload } from '../../security/guards';
import { Session } from '../../security/decorators';

// Utils
import { hasResponse, hasError, HttpStatus } from '../../utils';

/**
 * Coach controller for AI coach interactions and motivational messages.
 *
 * This controller handles:
 * - AI coach interactions
 * - Motivational messages
 * - Personalized coaching advice
 * - Progress feedback and encouragement
 */
@ApiTags('coach-service')
@Controller('coach-service')
export class CoachController {
  constructor(private readonly coachService: CoachService) {}

  /**
   * Get AI coach message
   */
  @Get('/message')
  @UseGuards(AuthorizationGuard)
  async getCoachMessage(
    @Session() session: QuickAuthPayload,
    @Res() res: Response,
  ) {
    try {
      const message = await this.coachService.getCoachMessage(session.sub);
      return hasResponse(res, message);
    } catch (error) {
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getCoachMessage',
        'Unable to retrieve coach message.',
      );
    }
  }

  /**
   * Ask coach a question
   */
  @Post('/ask')
  @UseGuards(AuthorizationGuard)
  async askCoach(
    @Session() session: QuickAuthPayload,
    @Body() question: any,
    @Res() res: Response,
  ) {
    try {
      const response = await this.coachService.askCoach(session.sub, question);
      return hasResponse(res, response);
    } catch (error) {
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'askCoach',
        'Unable to get coach response.',
      );
    }
  }

  /**
   * Get personalized coaching advice
   */
  @Get('/advice')
  @UseGuards(AuthorizationGuard)
  async getAdvice(@Session() session: QuickAuthPayload, @Res() res: Response) {
    try {
      const advice = await this.coachService.getAdvice(session.sub);
      return hasResponse(res, advice);
    } catch (error) {
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getAdvice',
        'Unable to retrieve coaching advice.',
      );
    }
  }

  /**
   * Get motivational message
   */
  @Get('/motivation')
  @UseGuards(AuthorizationGuard)
  async getMotivation(
    @Session() session: QuickAuthPayload,
    @Res() res: Response,
  ) {
    try {
      const motivation = await this.coachService.getMotivation(session.sub);
      return hasResponse(res, motivation);
    } catch (error) {
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getMotivation',
        'Unable to retrieve motivational message.',
      );
    }
  }
}
