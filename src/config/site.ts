/**
 * Site identity
 *
 * The canonical production origin. Hard-coded rather than read from env so that
 * preview deployments and the routista.vercel.app alias always point crawlers
 * at www.routista.eu.
 */

/** Canonical production origin, no trailing slash. */
export const SITE_URL = 'https://www.routista.eu';

/** Brand name, used in page titles and Open Graph. */
export const SITE_NAME = 'Routista';
