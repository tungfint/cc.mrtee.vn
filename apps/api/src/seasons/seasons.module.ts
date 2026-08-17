import { Module } from '@nestjs/common';
import { SeasonsController } from './seasons.controller';
import { SeasonClosureService } from './season-closure.service';

@Module({ controllers: [SeasonsController], providers: [SeasonClosureService] })
export class SeasonsModule {}
