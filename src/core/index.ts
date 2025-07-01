// Dependencies - RUNNER Core Modules
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { TrainingModule } from './training/training.module';
import { CoachModule } from './coach/coach.module';
import { AchievementModule } from './achievement/achievement.module';
import { SocialModule } from './social/social.module';
import { NotificationModule } from './notification/notification.module';
import { EmbedsModule } from './embeds/embeds.module';
import { TokenModule } from './token/token.module';

/**
 * Core modules for the RUNNER Farcaster miniapp
 *
 * Module Responsibilities:
 * - AuthModule: Farcaster QuickAuth integration
 * - UserModule: User management, profiles, stats
 * - TrainingModule: Training plans, weekly missions, AI plan generation
 * - CoachModule: AI coach interactions, motivational messages
 * - AchievementModule: Streak tracking, milestones, gamification
 * - SocialModule: Share image generation, Farcaster posts, community feed
 * - NotificationModule: Daily reminders, streak notifications, achievement alerts
 * - EmbedsModule: Dynamic embeds for workout shares, achievements
 * - TokenModule: $RUNNER token rewards, claiming system, Base integration
 */
const CoreModules = [
  UserModule, // Foundation - user management
  AuthModule, // Authentication & session management
  TrainingModule, // Core feature - training plans & weekly missions
  CoachModule, // AI coach system
  AchievementModule, // Gamification & rewards
  SocialModule, // Social sharing & community
  NotificationModule, // Engagement & retention
  EmbedsModule, // Viral sharing system
  TokenModule, // Blockchain rewards
];

export default CoreModules;
