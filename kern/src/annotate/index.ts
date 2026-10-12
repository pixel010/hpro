/** Annotations, review threads, export and comparison (package P7, change request HPC-0010). */
export {
  ANNO_CONTEXT, ANNOTATION_MEDIA_TYPE, ANNOTATIONS_DIR, AnnotationError, COLORS, CONTEXT, HIGHLIGHT_COLORS, HP_TERMS, INK_COLORS, KIND_LABEL, STATUS_KEY, STATUS_LABEL, STYLESHEET,
  createAnnotation, createReply, describe, deterministicId, fileOf, inkSvg, parseInk, pathFromPoints, randomId, splitAddress, threadsOf, validateAnnotation,
} from './model.js';
export type { AnnotationInfo, AnnotationKind, ColorName, InkDrawing, NewAnnotation, NewReply, ReviewStatus, Thread, WebAnnotation } from './model.js';
export { elementText, findQuote, normalizeText, piecesOf, quoteAt, rawOffsetOf, rawRange, rawToNorm, QUOTE_CONTEXT } from './text.js';
export type { ElementText, NodeLike, Quote, TextPiece } from './text.js';
export { DocumentIndex, quoteFor, quoteOfText, resolveAnchor } from './anchor.js';
export type { Anchor, AnchorState } from './anchor.js';
export { readAnnotations, saveAnnotations, saveModeOf, signedPaths } from './container.js';
export type { AnnotationChanges, AnnotationProblem, AnnotationSet, SaveAnnotationsOptions, SaveAnnotationsResult, SaveMode, StoredAnnotation } from './container.js';
export { CSV_COLUMNS, fromCollection, orderedItems, serializeCollection, toCollection, toCsv, toXhtml } from './export.js';
export type { DocumentLabel } from './export.js';
export { canonicalJson, diffAnnotations, mergeAnnotations, reviewReport, reviewText } from './review.js';
export type { AffectedThread, AnnotationDiff, MergeResult, ReviewReport } from './review.js';
