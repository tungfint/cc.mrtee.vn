import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { AdminOrganizationsController } from './admin-organizations.controller';

@Module({ controllers: [OrganizationsController, AdminOrganizationsController] })
export class OrganizationsModule {}
