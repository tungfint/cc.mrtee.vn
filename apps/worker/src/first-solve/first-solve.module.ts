import { Module } from '@nestjs/common';
import { FirstSolveService } from './first-solve.service';

@Module({ providers: [FirstSolveService], exports: [FirstSolveService] })
export class FirstSolveModule {}
