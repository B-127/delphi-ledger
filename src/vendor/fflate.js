/**
 * fflate provides the zip and unzip used by the workbook writer.
 *
 * It is loaded from a CDN here so the site runs with no build step. Before this is
 * relied on for real work, download fflate 0.8.2 and replace this file with its
 * contents -- one file changes, no import path moves, and the CDN entry can then be
 * dropped from the CSP in index.html. That also removes a third party from the path
 * of every workbook edit, which is the point.
 */
export * from 'https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js';
