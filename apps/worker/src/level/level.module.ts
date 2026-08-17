import { Module } from '@nestjs/common';
import { LevelService } from './level.service';

@Module({ providers: [LevelService], exports: [LevelService] })
export class LevelModule {}
