// Package S9: machine view of a document (part 0, section 15a).
export {
  MACHINE_GENERATOR,
  MACHINE_MARKDOWN_PATH,
  MACHINE_VIEW_FORMAT,
  MACHINE_VIEW_NOTICE,
  MACHINE_VIEW_PATH,
  MACHINE_VIEW_SPEC,
  MachineViewError,
  REDACTED_MARK,
  cleanText,
  deriveMachineView,
  serializeMachineView,
} from './derive.js';
export type { Block, ContentDocument, DeriveInput, FieldBlock, Link, ListItem, MachineAnnotation, MachineView, OutlineNode, TableCell } from './derive.js';
export { codeSpan, escapeMarkdown, renderMachineMarkdown } from './markdown.js';
export {
  MACHINE_ENVELOPE_FORMAT,
  MACHINE_ENVELOPE_NOTICE,
  compareMachineView,
  machineEnvelope,
  machineViewFiles,
  refreshMachineViews,
  staleSources,
  writeMachineView,
} from './container.js';
export type { EnvelopeOptions, MachineDifference, MachineEnvelope, WriteMachineViewOptions } from './container.js';
