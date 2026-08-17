import { Module } from '@nestjs/common';
import { RewardsAdminController } from './rewards-admin.controller';
import { RewardsController } from './rewards.controller';
import { RewardsService } from './rewards.service';

@Module({
  controllers: [RewardsController, RewardsAdminController],
  providers: [RewardsService],
  exports: [RewardsService],
})
export class RewardsModule {}
