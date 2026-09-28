import { Module } from "@nestjs/common";
import { CampaignController } from "./campaign/campaign.controller.ts";
import { LibraryController } from "./library/library.controller.ts";
import { TableGateway } from "./table/table.gateway.ts";

@Module({ controllers: [CampaignController, LibraryController], providers: [TableGateway] })
export class AppModule {}
