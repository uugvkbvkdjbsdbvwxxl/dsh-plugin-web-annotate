/**
 * Host half of `web-annotate`.
 *
 * The feature is entirely a Client concern — it draws a Browser tab, reads the
 * visited page through the Desktop shell's guest bridge, and sends the collected
 * comments through the existing Conversation service. Nothing here needs a Host
 * tool, prompt section, or Session event, so this module only exists to give the
 * bundle a mountable row.
 */
export const name = 'web-annotate';

export function apply() {}
