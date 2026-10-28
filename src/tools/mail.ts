import { listMessages, moveToTrash, readMessage, restoreFromTrash, searchMessages, setSeen, type MailMessage, type MailSearchHit, type MailSummary } from '../mail/backend.js';

export const handleMailListMessages = (input: { folder: string; limit: number; unseen_only: boolean }): Promise<{ folder: string; messages: MailSummary[] }> =>
  listMessages({ folder: input.folder, limit: input.limit, unseenOnly: input.unseen_only }).then(messages => ({ folder: input.folder, messages }));

export const handleMailReadMessage = (input: { folder: string; uid: number }): Promise<MailMessage> =>
  readMessage({ folder: input.folder, uid: input.uid });

export const handleMailSearch = (input: { folders?: string[]; from?: string; to?: string; subject?: string; text?: string; since?: string; before?: string; unseen_only: boolean; limit: number }): Promise<{ messages: MailSearchHit[] }> =>
  searchMessages({ folders: input.folders, from: input.from, to: input.to, subject: input.subject, text: input.text, since: input.since, before: input.before, unseenOnly: input.unseen_only, limit: input.limit }).then(messages => ({ messages }));

export const handleMailDeleteMessages = (input: { folder: string; uids: number[] }) => moveToTrash({ folder: input.folder, uids: [...new Set(input.uids)] });

export const handleMailRestoreMessages = (input: { uids: number[]; folder: string }) => restoreFromTrash({ uids: [...new Set(input.uids)], to: input.folder });

export const handleMailSetSeen = (input: { folder: string; uids: number[]; seen: boolean }) => setSeen({ folder: input.folder, uids: [...new Set(input.uids)], seen: input.seen });
