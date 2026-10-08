"use client";
import type { AdminCampaign, AdminUser } from "@wg/shared";

import type { useAdminCall } from "../../hooks/use-admin-call/use-admin-call";

import { GameCard } from "./components/game-card/game-card";

type GamesTabProps = { campaigns: AdminCampaign[]; users: AdminUser[]; call: ReturnType<typeof useAdminCall> };

// GAMES: every game on the server, newest activity first, with the housekeeping an admin does from outside a table.
export function GamesTab({ campaigns, users, call }: GamesTabProps) {
  return (
    <div className="list">
      {campaigns.length === 0 && <div className="dim">No games yet.</div>}
      {campaigns.map((c) => (
        <GameCard key={c.id} campaign={c} users={users} call={call} />
      ))}
    </div>
  );
}
