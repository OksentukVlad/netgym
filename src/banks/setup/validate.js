// Bank linting and runtime creation share one validation implementation.
export { validateSetupRecord as validate, validateSetupRecord as validateBank } from '../../engine/vendors/setup-record.js';
