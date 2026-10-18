import { useState } from 'react';
import { needsBackup } from './persistence';
import { useProject } from './store';

export function timeAgo(iso?: string | number): string {
  if (!iso) return 'never';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d} day${d === 1 ? '' : 's'} ago` : new Date(iso).toLocaleDateString();
}

const dismissKey = (id: string, generatedAt?: string) => `timetablesama.backup-dismissed.${id}.${generatedAt ?? ''}`;

function isDismissed(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

/** Warns when changes are not being saved, and nudges a backup once a timetable exists. */
export function SaveBanner() {
  const { project, active, save, backup } = useProject();
  const key = dismissKey(active.id, project.generatedAt);
  const [dismissed, setDismissed] = useState<string | null>(null);

  if (save.state === 'unavailable' || save.state === 'error') {
    return (
      <div className="alert error banner no-print" role="alert">
        <div>
          <b>{save.state === 'unavailable' ? 'This browser is not saving your work.' : 'Your latest changes were not saved.'}</b>
          {save.state === 'unavailable'
            ? 'Storage is blocked (private window or strict privacy settings), so everything is lost when this tab closes.'
            : `${save.error} It will retry on your next change.`}{' '}
          Download a backup file now to keep your work.
        </div>
        <button className="btn primary sm" onClick={backup}>Download backup</button>
      </div>
    );
  }

  if (!needsBackup(active, project) || dismissed === key || isDismissed(key)) return null;
  return (
    <div className="alert warning banner no-print" role="status">
      <div>
        <b>Your timetable is only stored in this browser.</b>
        Download a backup file so you can restore it if browser data is cleared, or open it on another computer.
        {active.lastBackupAt && <span className="muted"> Last backup {timeAgo(active.lastBackupAt)}.</span>}
      </div>
      <div className="row">
        <button className="btn primary sm" onClick={backup}>Download backup</button>
        <button className="btn ghost sm" onClick={() => {
          try {
            sessionStorage.setItem(key, '1');
          } catch {
            /* ignore */
          }
          setDismissed(key);
        }}>Not now</button>
      </div>
    </div>
  );
}

export function SaveStatus() {
  const { save, active } = useProject();
  const label =
    save.state === 'saved' ? 'Saved on this computer'
    : save.state === 'pending' ? 'Saving…'
    : save.state === 'error' ? 'Not saved'
    : 'Not saving: storage is blocked';
  return (
    <div className="small" aria-live="polite">
      <b style={{ fontWeight: 500, color: save.state === 'error' || save.state === 'unavailable' ? 'var(--danger)' : undefined }}>{label}</b>
      <div>Last backup: {timeAgo(active.lastBackupAt)}</div>
    </div>
  );
}
