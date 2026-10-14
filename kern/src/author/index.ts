/**
 * Author path (S5): documents from Markdown with a template, from Word (OOXML) and — through the
 * PDF import of P9 — from PDF; every reader reports what it could not carry over.
 */
export { Messages, plain } from './model.js';
export type { AuthorSource, Block, Category, Cell, Image, Inline, Message, Severity, SourceMeta } from './model.js';
export { findTemplate, parseTemplate, TEMPLATES } from './templates.js';
export type { Template, TemplateField } from './templates.js';
export { formatDate, hasErrors, ID_PATTERN, normalizeDate, slugify, writeDocument } from './write.js';
export type { WriteOptions, WriteResult } from './write.js';
export { blocksText, MARKDOWN_TOOL, parseFrontMatter, readMarkdown } from './markdown.js';
export type { MarkdownOptions } from './markdown.js';
export { DOCX_MEDIA_TYPE, DOCX_TOOL, DocxError, readDocx } from './docx.js';
export type { DocxOptions } from './docx.js';
export { FODT_MEDIA_TYPE, ODF_TOOL, ODT_MEDIA_TYPE, OdfError, readOdf } from './odf.js';
export type { OdfOptions } from './odf.js';
