import fc from 'fast-check';

const runs = Number(process.env.FC_RUNS);
if (Number.isSafeInteger(runs) && runs > 0) fc.configureGlobal({ numRuns: runs });
