import { Module } from "@nestjs/common";
import { CampaignController } from "./campaign/campaign.controller.ts";
import { TableGateway } from "./table/table.gateway.ts";

@Module({ controllers: [CampaignController], providers: [TableGateway] })
export class AppModule {}
