import { DataSource } from 'typeorm';
import { getConfig } from './security/config';

// Import all entities
import { User } from './models/User/User.model';
import { RunningSession } from './models/RunningSession/RunningSession.model';
import { NotificationQueue } from './models/NotificationQueue/NotificationQueue.model';
import { UserStats } from './models/UserStats/UserStats.model';
import { LeaderboardHistory } from './models/LeaderboardHistory/LeaderboardHistory.model';
import { UserBadge } from './models/UserBadge/UserBadge.model';

// Create data source for TypeORM CLI commands
export const AppDataSource = new DataSource({
  type: 'mysql',
  host: getConfig().db.host,
  port: getConfig().db.port,
  username: getConfig().db.username,
  password: getConfig().db.password,
  database: getConfig().db.name,
  entities: [
    User,
    RunningSession,
    NotificationQueue,
    UserStats,
    LeaderboardHistory,
    UserBadge,
  ],
  migrations: ['src/database/migrations/*.ts'],
  subscribers: ['src/database/subscribers/*.ts'],
  synchronize: false, // Always false for CLI commands
  logging: getConfig().isProduction ? false : 'all',
  ssl: getConfig().db.requireSSL
    ? {
        rejectUnauthorized: false,
      }
    : false,
  extra: {
    connectionLimit: 10,
  },
});

// Initialize data source
AppDataSource.initialize()
  .then(() => {
    console.log('Data Source has been initialized!');
  })
  .catch((err) => {
    console.error('Error during Data Source initialization', err);
  });
