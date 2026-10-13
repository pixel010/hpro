/** Accessibility check with direct corrections (package P8). */
export { CATEGORIES, CATEGORY_LABEL, CHECKER, READER_SCHEMES, VALUE } from './model.js';
export type { A11yReport, Category, Finding, FixInput, FixSuggestion, NotChecked, Scheme, Severity } from './model.js';
export { auditContainer, auditFiles } from './audit.js';
export type { AuditOptions } from './audit.js';
export { applyFinding, fixContainer, fixSession, FixError, opsFor, valueFor } from './fix.js';
export type { FixOptions, FixOutcome } from './fix.js';
export { contrastRatio, nearestWithContrast, parseColor, toHex } from './color.js';
export type { Rgba } from './color.js';
export { editRuleDeclaration, editStyleAttribute, findRule } from './cssedit.js';
export type { RuleAddress } from './cssedit.js';
export { foreignLanguage, langProblem, suggestLang } from './lang.js';
