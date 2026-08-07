export const JOB_TYPES = ['contract', 'minor_works', 'remedial'];

// Canonical per-type colour, served on every job (see publicJob in
// routes/jobs.js) so every app that shows a job — rostr included — tints it
// the same way instead of each one guessing/maintaining its own copy.
// Fuchsia for Minor Works isn't an arbitrary pick: it sits far enough
// around the hue wheel from both Contract's teal and Remedial's amber to
// still read as clearly distinct at the low opacity a row tint needs.
export const JOB_TYPE_COLORS = {
  contract: '#2f8f7a',
  minor_works: '#d946ef',
  remedial: '#f59e0b',
};
