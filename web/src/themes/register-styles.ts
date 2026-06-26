/**
 * Bundles all theme CSS: add themes/<id>/index.scss only; no app.scss @use per theme.
 */
import.meta.glob('./*/index.scss', { eager: true });