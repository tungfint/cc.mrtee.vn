import { Module } from '@nestjs/common';
import { RewardsAdminController } from './rewards-admin.controller';
import { RewardsController } from './rewards.controller';
import { RewardsService } from './rewards.service';
import { RewardImageService } from './reward-image.service';
import { StreakService } from './streak.service';

@Module({
  controllers: [RewardsController, RewardsAdminController],
  providers: [RewardsService, RewardImageService, StreakService],
  exports: [RewardsService, StreakService],
})
export class RewardsModule {}
