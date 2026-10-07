"use client";
import Link from "next/link";
import { useState } from "react";

import { UserButton } from "@wg/auth/react";
import type { AdminCampaign, AdminEvent, AdminUser } from "@wg/shared";

import { ThemeToggle } from "@/components/ui/theme-toggle/theme-toggle";

import { ADMIN_TABS, type AdminTab } from "./constants";
import { EventsLog } from "./components/events-log/events-log";
import { GamesTab } from "./components/games-tab/games-tab";
import { UsersTab } from "./components/users-tab/users-tab";
import { useAdminCall } from "./hooks/use-admin-call/use-admin-call";

type AdminViewProps = { selfId: string; users: AdminUser[]; campaigns: AdminCampaign[]; events: AdminEvent[] };

// /admin: every user and every game on this server, for a Clerk admin. The data is read on the server (app/admin/page),
// and every change goes through /api/admin, then the page is read again.
export function AdminView({ selfId, users, campaigns, events }: AdminViewProps) {
  const [tab, setTab] = useState<AdminTab>("GAMES");
  const call = useAdminCall();
  const names = new Map(users.map((u) => [u.id, u.name]));

  return (
    <main className="pad stack admin">
      <header
        className="band torn"
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          padding: "14px 16px",
          marginBottom: 12,
        }}
      >
        <Link href="/" aria-label="Lobby" className="display" style={{ fontSize: 30, textDecoration: "none" }}>
          ◂
        </Link>
        <div className="display" style={{ fontSize: 30, flex: 1, minWidth: 0 }}>
          AUSPEX <span className="dim">· ADMIN</span>
        </div>
        <ThemeToggle />
        <UserButton />
      </header>

      <nav className="tabs" role="tablist" aria-label="Admin sections">
        {ADMIN_TABS.map((t) => (
          <button
            key={t}
            id={`admin-tab-${t}`}
            role="tab"
            className="tab"
            aria-selected={tab === t}
            aria-controls="admin-panel"
            onClick={() => setTab(t)}
          >
            {t} · {t === "USERS" ? users.length : campaigns.length}
          </button>
        ))}
      </nav>

      {call.msg && (
        <div className={call.msg.startsWith("!") ? "red" : "accent"} role="status">
          {call.msg}
        </div>
      )}

      <div id="admin-panel" role="tabpanel" aria-labelledby={`admin-tab-${tab}`} className="stack">
        {tab === "USERS" && <UsersTab selfId={selfId} users={users} call={call} />}
        {tab === "GAMES" && <GamesTab campaigns={campaigns} users={users} call={call} />}
      </div>

      <EventsLog events={events} campaigns={campaigns} names={names} />
    </main>
  );
}
