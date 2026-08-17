import { Module } from '@nestjs/common';
import { RewardEngineService } from './reward-engine.service';

@Module({ providers: [RewardEngineService], exports: [RewardEngineService] })
export class RewardModule {}
