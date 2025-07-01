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
import { TokenService } from './services/token.service';

// Security
import { AuthorizationGuard, QuickAuthPayload } from '../../security/guards';
import { Session } from '../../security/decorators';

// Utils
import { hasResponse, hasError, HttpStatus } from '../../utils';

/**
 * Token controller for $RUNNER token rewards and claiming system.
 *
 * This controller handles:
 * - $RUNNER token rewards
 * - Claiming system
 * - Base integration
 * - Token balance tracking
 */
@ApiTags('token-service')
@Controller('token-service')
export class TokenController {
  constructor(private readonly tokenService: TokenService) {}

  /**
   * Get user's token balance
   */
  @Get('/balance')
  @UseGuards(AuthorizationGuard)
  async getTokenBalance(
    @Session() session: QuickAuthPayload,
    @Res() res: Response,
  ) {
    try {
      const balance = await this.tokenService.getTokenBalanceFromFid(
        session.sub,
      );
      return hasResponse(res, balance);
    } catch (error) {
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getTokenBalance',
        'Unable to retrieve token balance.',
      );
    }
  }

  /**
   * Claim tokens
   */
  @Post('/claim')
  @UseGuards(AuthorizationGuard)
  async claimTokens(
    @Session() session: QuickAuthPayload,
    @Body() claimData: any,
    @Res() res: Response,
  ) {
    try {
      const result = await this.tokenService.claimTokens(
        session.sub,
        claimData,
      );
      return hasResponse(res, result);
    } catch (error) {
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'claimTokens',
        'Unable to claim tokens.',
      );
    }
  }

  /**
   * Get available rewards
   */
  @Get('/rewards')
  @UseGuards(AuthorizationGuard)
  async getAvailableRewards(
    @Session() session: QuickAuthPayload,
    @Res() res: Response,
  ) {
    try {
      const rewards = await this.tokenService.getAvailableRewards(session.sub);
      return hasResponse(res, rewards);
    } catch (error) {
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getAvailableRewards',
        'Unable to retrieve available rewards.',
      );
    }
  }

  /**
   * Get transaction history
   */
  @Get('/transactions')
  @UseGuards(AuthorizationGuard)
  async getTransactionHistory(
    @Session() session: QuickAuthPayload,
    @Res() res: Response,
  ) {
    try {
      const transactions = await this.tokenService.getTransactionHistory(
        session.sub,
      );
      return hasResponse(res, transactions);
    } catch (error) {
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getTransactionHistory',
        'Unable to retrieve transaction history.',
      );
    }
  }

  /**
   * Transfer tokens
   */
  @Post('/transfer')
  @UseGuards(AuthorizationGuard)
  async transferTokens(
    @Session() session: QuickAuthPayload,
    @Body() transferData: any,
    @Res() res: Response,
  ) {
    try {
      const result = await this.tokenService.transferTokens(
        session.sub,
        transferData,
      );
      return hasResponse(res, result);
    } catch (error) {
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'transferTokens',
        'Unable to transfer tokens.',
      );
    }
  }
}
