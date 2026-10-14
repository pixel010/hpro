/**
 * Versions of the library (S8). `KERN_VERSION` follows semantic versioning and equals the
 * `version` of `kern/package.json` (a test compares both); `SPEC_VERSION` is the version of the
 * specification the library implements; `CLI_INTERFACE_VERSION` is the version of the stable
 * command line (commands, options, exit codes, JSON reports) described in
 * docs/spezifikation/06-einbau.md — it only changes when something is removed or changes meaning.
 */
export const KERN_VERSION = '0.1.0';
export const SPEC_VERSION = '0.1';
export const CLI_INTERFACE_VERSION = 1;
