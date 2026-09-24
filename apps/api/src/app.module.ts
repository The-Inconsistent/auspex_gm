import { Module } from "@nestjs/common";
import { CampaignController } from "./campaign.controller.ts";
import { TableGateway } from "./table.gateway.ts";

@Module({ controllers: [CampaignController], providers: [TableGateway] })
export class AppModule {}
