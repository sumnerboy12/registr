export const CHECKLIST_ITEM_STATUSES = ['open', 'in_progress', 'done', 'not_done'];

// Statuses that count as the item being finished — Won't Do is a deliberate
// resolution (doesn't apply / decided against), same as Done, not an
// outstanding item. Mirrored client-side in types.ts.
export const CHECKLIST_ITEM_COMPLETE_STATUSES = ['done', 'not_done'];
