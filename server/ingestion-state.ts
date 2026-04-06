// Shared ingestion lock. Imported by both the admin route handler and the
// weekly ingestion agent so they can't overlap.
let _ingestionRunning = false;

export function isIngestionRunning(): boolean {
  return _ingestionRunning;
}

export function setIngestionRunning(value: boolean): void {
  _ingestionRunning = value;
}
