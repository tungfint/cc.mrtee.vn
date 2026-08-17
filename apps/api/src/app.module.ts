import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { AuthorizationModule } from './authorization/authorization.module';
import { AuditModule } from './audit/audit.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { UsersModule } from './users/users.module';
import { CodeforcesAccountsModule } from './codeforces-accounts/codeforces-accounts.module';
import { SyncModule } from './sync/sync.module';
import { ScoringModule } from './scoring/scoring.module';
import { SeasonsModule } from './seasons/seasons.module';
import { RewardsModule } from './rewards/rewards.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    RedisModule,
    AuditModule,
    AuthorizationModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    CodeforcesAccountsModule,
    SyncModule,
    ScoringModule,
    SeasonsModule,
    RewardsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
