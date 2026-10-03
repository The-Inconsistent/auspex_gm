import { flatTree, placeTree, wouldCycle } from "@wg/shared";

type Place = { id: string; name: string; parentId: string | null };

// A place select's options in tree order, indented by depth (issue #50). `except` leaves out a place and everything
// inside it, so INSIDE can't offer a loop.
export function placeOptions(places: readonly Place[], except?: string): [id: string, label: string][] {
  const parentOf = new Map(places.map((l) => [l.id, l.parentId]));
  return flatTree(placeTree(places))
    .filter(({ row }) => !except || !wouldCycle({ id: except, parentId: row.id, parentOf }))
    .map(({ row, depth }) => [row.id, `${"   ".repeat(depth)}${row.name}`]);
}
