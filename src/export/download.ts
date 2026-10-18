/** Browser-only: saves `text` as a file via a temporary object URL and anchor. */
export function downloadText(filename: string, text: string, mime = 'text/plain;charset=utf-8'): void {
  // Excel reads a CSV as UTF-8 (Urdu, accents) only when it starts with a byte-order mark.
  const body = mime.startsWith('text/csv') ? `﻿${text}` : text;
  const url = URL.createObjectURL(new Blob([body], { type: mime }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
