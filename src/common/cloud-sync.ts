// Set REMOTE_ANALYTICS_AUTO_SYNC=false on dev/test copies so they never upload
// snapshots or send sale pushes on their own (the manual upload button still works)
export const isAutoSyncEnabled = () =>
  (process.env.REMOTE_ANALYTICS_AUTO_SYNC ?? 'true').trim().toLowerCase() !==
  'false';
