/**
 * JSON Schema (draft 2020-12) validation for data files (HPR-SBX-018). Supports the
 * assertion and applicator keywords that matter for form and table data: type, enum, const,
 * multipleOf, maximum, exclusiveMaximum, minimum, exclusiveMinimum, maxLength, minLength,
 * pattern, maxItems, minItems, uniqueItems, maxProperties, minProperties, required,
 * dependentRequired, properties, patternProperties, additionalProperties, propertyNames,
 * items, prefixItems, contains, allOf, anyOf, oneOf, not, if/then/else, `$ref` within the
 * document (`#…` and `$defs`). `format` is an annotation in 2020-12 and not asserted.
 * Unknown keywords are ignored as the specification requires.
 */
type Schema = boolean | { [k: string]: unknown };

const TYPES = new Set(['null', 'boolean', 'object', 'array', 'number', 'string', 'integer']);

export interface SchemaProblem {
  readonly path: string;
  readonly message: string;
}

/** Structural check of a schema: keyword values have the types 2020-12 requires; `$ref` stays in the document. */
export function schemaProblems(schema: unknown, path = '#'): SchemaProblem[] {
  const out: SchemaProblem[] = [];
  const walk = (s: unknown, p: string) => {
    if (typeof s === 'boolean') return;
    if (typeof s !== 'object' || s === null || Array.isArray(s)) {
      out.push({ path: p, message: 'Schema ist weder Objekt noch boolesch' });
      return;
    }
    const o = s as Record<string, unknown>;
    if ('$schema' in o && o.$schema !== 'https://json-schema.org/draft/2020-12/schema') out.push({ path: `${p}/$schema`, message: `$schema „${String(o.$schema)}“ ist nicht 2020-12` });
    if ('$ref' in o) {
      if (typeof o.$ref !== 'string') out.push({ path: `${p}/$ref`, message: '$ref ist kein String' });
      else if (!o.$ref.startsWith('#')) out.push({ path: `${p}/$ref`, message: `$ref „${o.$ref}“ zeigt aus dem Schema hinaus` });
    }
    if ('type' in o) {
      const t = o.type;
      const list = Array.isArray(t) ? t : [t];
      if (!list.every((x) => typeof x === 'string' && TYPES.has(x))) out.push({ path: `${p}/type`, message: 'type hat einen unbekannten Wert' });
    }
    for (const k of ['required'] as const) if (k in o && !(Array.isArray(o[k]) && (o[k] as unknown[]).every((x) => typeof x === 'string'))) out.push({ path: `${p}/${k}`, message: `${k} ist keine Liste von Strings` });
    for (const k of ['enum'] as const) if (k in o && !Array.isArray(o[k])) out.push({ path: `${p}/${k}`, message: `${k} ist keine Liste` });
    for (const k of ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf'] as const) if (k in o && typeof o[k] !== 'number') out.push({ path: `${p}/${k}`, message: `${k} ist keine Zahl` });
    for (const k of ['minLength', 'maxLength', 'minItems', 'maxItems', 'minProperties', 'maxProperties'] as const) {
      if (k in o && !(Number.isInteger(o[k]) && (o[k] as number) >= 0)) out.push({ path: `${p}/${k}`, message: `${k} ist keine nicht negative Ganzzahl` });
    }
    if ('pattern' in o) {
      try {
        new RegExp(String(o.pattern), 'u');
      } catch {
        out.push({ path: `${p}/pattern`, message: 'pattern ist kein gültiger regulärer Ausdruck' });
      }
    }
    for (const k of ['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas'] as const) {
      if (!(k in o)) continue;
      const v = o[k];
      if (typeof v !== 'object' || v === null || Array.isArray(v)) out.push({ path: `${p}/${k}`, message: `${k} ist kein Objekt` });
      else for (const [name, sub] of Object.entries(v)) walk(sub, `${p}/${k}/${name}`);
    }
    for (const k of ['items', 'additionalProperties', 'propertyNames', 'contains', 'not', 'if', 'then', 'else', 'unevaluatedItems', 'unevaluatedProperties'] as const) if (k in o) walk(o[k], `${p}/${k}`);
    for (const k of ['allOf', 'anyOf', 'oneOf', 'prefixItems'] as const) {
      if (!(k in o)) continue;
      if (!Array.isArray(o[k]) || (o[k] as unknown[]).length === 0) out.push({ path: `${p}/${k}`, message: `${k} ist keine nicht leere Liste` });
      else (o[k] as unknown[]).forEach((sub, i) => walk(sub, `${p}/${k}/${i}`));
    }
  };
  walk(schema, path);
  return out;
}

function typeOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function equal(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])]));
  return v;
}

function resolvePointer(root: Schema, ref: string): Schema | undefined {
  if (ref === '#') return root;
  if (!ref.startsWith('#/')) return undefined;
  let cur: unknown = root;
  for (const raw of ref.slice(2).split('/')) {
    const key = decodeURIComponent(raw).replace(/~1/g, '/').replace(/~0/g, '~');
    if (cur && typeof cur === 'object') cur = (cur as Record<string, unknown>)[key];
    else return undefined;
  }
  return cur as Schema;
}

/** Validates an instance; returns the problems (empty when valid). */
export function validateInstance(instance: unknown, schema: Schema, root: Schema = schema, path = '', depth = 0): SchemaProblem[] {
  const out: SchemaProblem[] = [];
  const fail = (message: string) => out.push({ path: path || '/', message });
  if (depth > 64) return [{ path: path || '/', message: 'Schema zu tief verschachtelt (Zyklus?)' }];
  if (schema === true) return out;
  if (schema === false) {
    fail('Schema false');
    return out;
  }
  const s = schema as Record<string, unknown>;
  const sub = (inst: unknown, sch: unknown, p: string) => validateInstance(inst, sch as Schema, root, p, depth + 1);
  if (typeof s.$ref === 'string') {
    const target = resolvePointer(root, s.$ref);
    if (target === undefined) fail(`$ref ${s.$ref} nicht auflösbar`);
    else out.push(...sub(instance, target, path));
  }
  if ('type' in s) {
    const types = Array.isArray(s.type) ? (s.type as string[]) : [s.type as string];
    const t = typeOf(instance);
    const ok = types.some((x) => x === t || (x === 'integer' && typeof instance === 'number' && Number.isInteger(instance)));
    if (!ok) {
      fail(`Typ ${t}, erwartet ${types.join('|')}`);
      return out;
    }
  }
  if (Array.isArray(s.enum) && !s.enum.some((e) => equal(e, instance))) fail(`Wert ${JSON.stringify(instance)} nicht in enum`);
  if ('const' in s && !equal(s.const, instance)) fail(`Wert ${JSON.stringify(instance)} ungleich const`);
  if (typeof instance === 'number') {
    if (typeof s.multipleOf === 'number' && Math.abs(instance / s.multipleOf - Math.round(instance / s.multipleOf)) > 1e-9) fail(`${instance} ist kein Vielfaches von ${s.multipleOf}`);
    if (typeof s.maximum === 'number' && instance > s.maximum) fail(`${instance} > maximum ${s.maximum}`);
    if (typeof s.exclusiveMaximum === 'number' && instance >= s.exclusiveMaximum) fail(`${instance} >= exclusiveMaximum ${s.exclusiveMaximum}`);
    if (typeof s.minimum === 'number' && instance < s.minimum) fail(`${instance} < minimum ${s.minimum}`);
    if (typeof s.exclusiveMinimum === 'number' && instance <= s.exclusiveMinimum) fail(`${instance} <= exclusiveMinimum ${s.exclusiveMinimum}`);
  }
  if (typeof instance === 'string') {
    const len = [...instance].length;
    if (typeof s.maxLength === 'number' && len > s.maxLength) fail(`Länge ${len} > maxLength ${s.maxLength}`);
    if (typeof s.minLength === 'number' && len < s.minLength) fail(`Länge ${len} < minLength ${s.minLength}`);
    if (typeof s.pattern === 'string' && !new RegExp(s.pattern, 'u').test(instance)) fail(`„${instance}“ passt nicht auf pattern ${s.pattern}`);
  }
  if (Array.isArray(instance)) {
    if (typeof s.maxItems === 'number' && instance.length > s.maxItems) fail(`${instance.length} Elemente > maxItems ${s.maxItems}`);
    if (typeof s.minItems === 'number' && instance.length < s.minItems) fail(`${instance.length} Elemente < minItems ${s.minItems}`);
    if (s.uniqueItems === true && new Set(instance.map((x) => JSON.stringify(canonical(x)))).size !== instance.length) fail('Elemente nicht eindeutig');
    const prefix = Array.isArray(s.prefixItems) ? s.prefixItems : [];
    instance.forEach((item, i) => {
      if (i < prefix.length) out.push(...sub(item, prefix[i], `${path}/${i}`));
      else if ('items' in s) out.push(...sub(item, s.items, `${path}/${i}`));
    });
    if ('contains' in s && !instance.some((item, i) => sub(item, s.contains, `${path}/${i}`).length === 0)) fail('kein Element erfüllt contains');
  }
  if (instance && typeof instance === 'object' && !Array.isArray(instance)) {
    const obj = instance as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (typeof s.maxProperties === 'number' && keys.length > s.maxProperties) fail(`${keys.length} Schlüssel > maxProperties`);
    if (typeof s.minProperties === 'number' && keys.length < s.minProperties) fail(`${keys.length} Schlüssel < minProperties`);
    for (const r of Array.isArray(s.required) ? (s.required as string[]) : []) if (!(r in obj)) fail(`Pflichtfeld „${r}“ fehlt`);
    if (s.dependentRequired && typeof s.dependentRequired === 'object') {
      for (const [k, deps] of Object.entries(s.dependentRequired as Record<string, string[]>)) if (k in obj) for (const d of deps) if (!(d in obj)) fail(`„${d}“ fehlt (abhängig von „${k}“)`);
    }
    const props = (s.properties ?? {}) as Record<string, unknown>;
    const patterns = Object.entries((s.patternProperties ?? {}) as Record<string, unknown>).map(([p, sch]) => [new RegExp(p, 'u'), sch] as const);
    for (const k of keys) {
      const p = `${path}/${k.replace(/~/g, '~0').replace(/\//g, '~1')}`;
      let matched = false;
      if (k in props) {
        matched = true;
        out.push(...sub(obj[k], props[k], p));
      }
      for (const [re, sch] of patterns) {
        if (re.test(k)) {
          matched = true;
          out.push(...sub(obj[k], sch, p));
        }
      }
      if (!matched && 'additionalProperties' in s) out.push(...sub(obj[k], s.additionalProperties, p));
      if ('propertyNames' in s) out.push(...sub(k, s.propertyNames, `${p}(Name)`));
    }
  }
  if (Array.isArray(s.allOf)) for (const x of s.allOf) out.push(...sub(instance, x, path));
  if (Array.isArray(s.anyOf) && !s.anyOf.some((x) => sub(instance, x, path).length === 0)) fail('keine Alternative aus anyOf erfüllt');
  if (Array.isArray(s.oneOf)) {
    const n = s.oneOf.filter((x) => sub(instance, x, path).length === 0).length;
    if (n !== 1) fail(`${n} statt genau einer Alternative aus oneOf erfüllt`);
  }
  if ('not' in s && sub(instance, s.not, path).length === 0) fail('not-Schema ist erfüllt');
  if ('if' in s) {
    const cond = sub(instance, s.if, path).length === 0;
    if (cond && 'then' in s) out.push(...sub(instance, s.then, path));
    if (!cond && 'else' in s) out.push(...sub(instance, s.else, path));
  }
  return out;
}
