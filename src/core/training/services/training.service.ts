// Dependencies
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

// Models
import {
  User,
  TrainingPlan,
  WeeklyTrainingPlan,
  RunningSession,
} from '../../../models';

/**
 * Training service for managing training plans and weekly missions.
 *
 * This service handles:
 * - Training plan CRUD operations
 * - Weekly mission generation and tracking
 * - AI-powered plan generation
 * - Progress tracking and updates
 * - Workout history and analytics
 */
@Injectable()
export class TrainingService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(TrainingPlan)
    private readonly trainingPlanRepository: Repository<TrainingPlan>,
    @InjectRepository(WeeklyTrainingPlan)
    private readonly weeklyTrainingPlanRepository: Repository<WeeklyTrainingPlan>,
    @InjectRepository(RunningSession)
    private readonly runningSessionRepository: Repository<RunningSession>,
  ) {}

  /**
   * Get user's current training plan
   */
  async getCurrentPlan(fid: number): Promise<any> {
    // TODO: Implement get current plan logic
    return { message: 'Get current plan - to be implemented' };
  }

  /**
   * Create a new training plan
   */
  async createPlan(fid: number, planData: any): Promise<any> {
    // TODO: Implement create plan logic
    return { message: 'Create plan - to be implemented' };
  }

  /**
   * Update training plan
   */
  async updatePlan(fid: number, planId: string, planData: any): Promise<any> {
    // TODO: Implement update plan logic
    return { message: 'Update plan - to be implemented' };
  }

  /**
   * Get current weekly mission
   */
  async getCurrentMission(fid: number): Promise<any> {
    // TODO: Implement get current mission logic
    return { message: 'Get current mission - to be implemented' };
  }

  /**
   * Generate AI training plan
   */
  async generateAIPlan(fid: number, preferences: any): Promise<any> {
    // TODO: Implement AI plan generation logic
    return { message: 'Generate AI plan - to be implemented' };
  }

  /**
   * Update a workout session
   *
   * @param userFid - The FID of the user requesting the update
   * @param workoutId - The ID of the workout to update
   * @param updateData - The data to update the workout with
   * @returns Updated workout session
   */
  async updateWorkout(
    userFid: number,
    workoutId: number,
    updateData: any,
  ): Promise<RunningSession> {
    // Find the workout by ID
    const workout = await this.runningSessionRepository.findOne({
      where: { id: workoutId },
      relations: ['user', 'intervals'],
    });

    if (!workout) {
      throw new NotFoundException('Workout not found');
    }

    // Check if the user owns this workout
    if (workout.fid !== userFid) {
      throw new BadRequestException('You can only update your own workouts');
    }

    // Validate and sanitize update data
    const allowedFields = [
      'comment',
      'distance',
      'duration',
      'pace',
      'calories',
      'avgHeartRate',
      'maxHeartRate',
      'notes',
      'units',
      'completedDate',
    ];

    const updateFields: Partial<RunningSession> = {};

    // Only allow updates to specific fields
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        updateFields[field] = updateData[field];
      }
    }

    // Validate required fields if provided
    if (updateFields.distance !== undefined) {
      if (
        typeof updateFields.distance !== 'number' ||
        updateFields.distance <= 0
      ) {
        throw new BadRequestException('Distance must be a positive number');
      }
    }

    if (updateFields.duration !== undefined) {
      if (
        typeof updateFields.duration !== 'number' ||
        updateFields.duration <= 0
      ) {
        throw new BadRequestException('Duration must be a positive number');
      }
    }

    if (updateFields.calories !== undefined) {
      if (
        typeof updateFields.calories !== 'number' ||
        updateFields.calories < 0
      ) {
        throw new BadRequestException('Calories must be a non-negative number');
      }
    }

    if (updateFields.avgHeartRate !== undefined) {
      if (
        typeof updateFields.avgHeartRate !== 'number' ||
        updateFields.avgHeartRate < 0
      ) {
        throw new BadRequestException(
          'Average heart rate must be a non-negative number',
        );
      }
    }

    if (updateFields.maxHeartRate !== undefined) {
      if (
        typeof updateFields.maxHeartRate !== 'number' ||
        updateFields.maxHeartRate < 0
      ) {
        throw new BadRequestException(
          'Maximum heart rate must be a non-negative number',
        );
      }
    }

    if (updateFields.units !== undefined) {
      if (!['km', 'mi'].includes(updateFields.units)) {
        throw new BadRequestException('Units must be either "km" or "mi"');
      }
    }

    // Update the workout
    await this.runningSessionRepository.update(workoutId, updateFields);

    // Return the updated workout
    const updatedWorkout = await this.runningSessionRepository.findOne({
      where: { id: workoutId },
      relations: ['user', 'intervals'],
    });

    return updatedWorkout;
  }

  /**
   * Get global recent workouts from all users with pagination
   *
   * @param page - Page number (1-based)
   * @param limit - Number of items per page (max 100)
   * @returns Paginated workout data with metadata
   */
  async getRecentWorkouts(
    page: number = 1,
    limit: number = 30,
  ): Promise<{
    workouts: RunningSession[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }> {
    // Calculate offset for pagination
    const offset = (page - 1) * limit;

    // Get total count for pagination metadata (all users)
    const total = await this.runningSessionRepository.count();

    // Get workouts with pagination, ordered by creation date (newest first)
    const workouts = await this.runningSessionRepository.find({
      order: { createdAt: 'DESC' },
      skip: offset,
      take: limit,
      relations: ['intervals', 'user'], // Include intervals and user data
    });

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return {
      workouts,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext,
        hasPrev,
      },
    };
  }

  /**
   * Get leaderboard with aggregated user statistics
   *
   * @param sortBy - Sort by metric (totalDistance, totalWorkouts, totalTime)
   * @param limit - Number of users to return (max 100)
   * @returns Leaderboard data with user statistics
   */
  async getLeaderboard(
    sortBy: string = 'totalDistance',
    limit: number = 50,
  ): Promise<{
    success: boolean;
    data: any[];
    message: string;
    totalUsers: number;
  }> {
    // Query to get aggregated user statistics
    const queryBuilder = this.runningSessionRepository
      .createQueryBuilder('session')
      .select('session.fid', 'fid')
      .addSelect('user.username', 'username')
      .addSelect('user.pfpUrl', 'pfpUrl')
      .addSelect('SUM(session.distance)', 'totalDistance')
      .addSelect('COUNT(session.id)', 'totalWorkouts')
      .addSelect('SUM(session.duration)', 'totalTime')
      .addSelect('AVG(session.distance)', 'avgDistance')
      .addSelect('MAX(session.distance)', 'bestDistance')
      .addSelect('MAX(session.duration)', 'bestTime')
      .innerJoin('session.user', 'user')
      .groupBy('session.fid')
      .addGroupBy('user.username')
      .addGroupBy('user.pfpUrl')
      .having('COUNT(session.id) > 0'); // Only include users with at least one workout

    // Apply sorting
    let sortField: string;
    switch (sortBy) {
      case 'totalDistance':
        sortField = 'totalDistance';
        break;
      case 'totalWorkouts':
        sortField = 'totalWorkouts';
        break;
      case 'totalTime':
        sortField = 'totalTime';
        break;
      default:
        sortField = 'totalDistance';
    }

    queryBuilder.orderBy(sortField, 'DESC').limit(limit);

    const rawResults = await queryBuilder.getRawMany();

    // Get total count of users with workouts
    const totalUsersQuery = this.runningSessionRepository
      .createQueryBuilder('session')
      .select('COUNT(DISTINCT session.fid)', 'count')
      .where('session.fid IS NOT NULL');

    const totalUsersResult = await totalUsersQuery.getRawOne();
    const totalUsers = parseInt(totalUsersResult.count, 10);

    // Process results and calculate additional metrics
    const processedData = rawResults.map((row, index) => {
      const totalDistance = parseFloat(row.totalDistance) || 0;
      const totalWorkouts = parseInt(row.totalWorkouts, 10) || 0;
      const totalTime = parseFloat(row.totalTime) || 0;
      const bestDistance = parseFloat(row.bestDistance) || 0;
      const bestTime = parseFloat(row.bestTime) || 0;

      // Calculate average pace (assume distance is in km and time is in minutes)
      let averagePace = 'N/A';
      if (totalDistance > 0 && totalTime > 0) {
        const paceMinutesPerKm = totalTime / totalDistance;
        const paceMinutes = Math.floor(paceMinutesPerKm);
        const paceSeconds = Math.round((paceMinutesPerKm - paceMinutes) * 60);
        averagePace = `${paceMinutes}:${paceSeconds.toString().padStart(2, '0')}/km`;
      }

      return {
        fid: parseInt(row.fid, 10),
        username: row.username || 'Unknown',
        pfpUrl: row.pfpUrl || null,
        totalDistance: Math.round(totalDistance * 10) / 10, // Round to 1 decimal place
        totalWorkouts,
        totalTime: Math.round(totalTime), // Round to nearest minute
        averagePace,
        bestDistance: Math.round(bestDistance * 10) / 10, // Round to 1 decimal place
        bestTime: Math.round(bestTime), // Round to nearest minute
        rank: index + 1,
      };
    });

    return {
      success: true,
      data: processedData,
      message: 'Leaderboard data retrieved successfully',
      totalUsers,
    };
  }
}
