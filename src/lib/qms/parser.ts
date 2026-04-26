// https://chat.deepseek.com/share/i1wcjs0vme5ic2pb08

import { calculate } from "../formula";
import {
  addJump,
  addLocation,
  addParam,
  createJump,
  createLocation,
  createParam,
  createQm,
  Jump,
  JumpId,
  Location,
  LocationId,
  QM,
  QMParam,
} from "../qmreader";
import { randomFromMathRandom } from "../randomFunc";

// ======================== Константы ========================

const CX = 25;
const DX = 64;
const DY = 42;
const MAX_VAL = 1000000;

const SCOPE_TYPE = {
  NONE: 0,
  MACRO: 1,
  FOR: 2,
  SITE: 3,
  CASE: 4,
  VAR: 5,
  INTRO: 6,
  CONGRAT: 7,
} as const;

type ScopeType = (typeof SCOPE_TYPE)[keyof typeof SCOPE_TYPE];

const VAR_TYPE = {
  NONE: 0,
  WIN: 1,
  LOSE: 2,
  DEATH: 3,
} as const;

type VarType = (typeof VAR_TYPE)[keyof typeof VAR_TYPE];

const COMPAT_TYPE = {
  OFF: 0,
  ON: 1,
  DEBUG: 2,
} as const;

type CompatType = (typeof COMPAT_TYPE)[keyof typeof COMPAT_TYPE];

// ======================== Типы данных ========================

interface Macro {
  name: string;
  params: string[];
  lines: string[];
  alt: string[];
  altF: boolean;
  ranges: string[];
}

interface Text {
  range: string;
  value: string;
}

/** Описание одного разряда составной переменной */
interface Field {
  name: string;
  texts: Text[];
  // CHANGE: индивидуальное основание (приоритет над общим mod переменной)
  mod: number | null;
  // CHANGE: значение по умолчанию для этого разряда
  def: string | null;
}

interface Var {
  name: string;
  id: number | null;
  range: string;
  def: string;
  texts: Text[];
  type: VarType;
  message: string;
  lim: number | null;
  isNeg: boolean;
  isShow: boolean;
  isHide: boolean;
  isMoney: boolean;
  isShowingZero: boolean;
  order: number | null;
  mod: number | null;
  fields: Field[];
  currentField: Field | null;
}

interface Statement {
  name: string;
  expr: string;
}

interface Case {
  from: string;
  to: string;
  text: string;
  lines: string[];
  stmts: Statement[];
  priority: number;
  order: number;
  expr: string;
  show: string;
  hide: string;
  ret: string;
  isDay: boolean;
  cnt: number;
  jump: Jump | null;
}

interface Page {
  num: number;
  lines: string[];
  image: string;
}

interface Site {
  name: string;
  id: LocationId;
  num: number;
  pages: Page[];
  cases: Case[];
  spec: string;
  expr: string;
  stmts: Statement[];
  show: string;
  hide: string;
  isReturn: boolean;
  isDay: boolean;
  loc: Location | null;
  x: number | null;
  y: number | null;
  image: string;
}

interface Global {
  name: string;
  value: string;
  isIncremetable: boolean;
}

interface Scope {
  type: ScopeType;
  macro: Macro | null;
  site: Site | null;
  case: Case | null;
  vars: Var | null;
}

// ======================== Фабрики ========================

function createMacro(name: string): Macro {
  return { name, params: [], lines: [], alt: [], altF: false, ranges: [] };
}

function createText(range: string): Text {
  return { range, value: "" };
}

function createVar(name: string): Var {
  return {
    name,
    id: null,
    range: "0..1",
    def: "0",
    texts: [],
    type: VAR_TYPE.NONE,
    message: "",
    lim: null,
    isNeg: false,
    isShow: false,
    isHide: false,
    isMoney: false,
    isShowingZero: true,
    order: null,
    mod: null,
    fields: [],
    currentField: null,
  };
}

function createStatement(name: string, expr: string): Statement {
  return { name, expr };
}

function createCase(from: string, to: string): Case {
  return {
    from,
    to,
    text: "",
    lines: [],
    stmts: [],
    priority: 1,
    order: 5,
    expr: "",
    show: "",
    hide: "",
    ret: "",
    isDay: false,
    cnt: 0,
    jump: null,
  };
}

function createPage(num: number): Page {
  return { num, lines: [], image: "" };
}

function createSite(name: string, id: LocationId): Site {
  return {
    name,
    id,
    num: 1,
    pages: [],
    cases: [],
    spec: "",
    expr: "",
    stmts: [],
    show: "",
    hide: "",
    isReturn: false,
    isDay: false,
    loc: null,
    x: null,
    y: null,
    image: "",
  };
}

function createScope(type: ScopeType): Scope {
  return { type, macro: null, site: null, case: null, vars: null };
}

function createGlobal(name: string): Global {
  return { name, value: "0", isIncremetable: false };
}

// ======================== Контекст парсинга ========================

class ParseContext {
  qm: QM = createQm();

  macros = new Map<string, Macro>();
  sites = new Map<string, Site>();
  vars = new Map<string, Var>();
  globals = new Map<string, Global>();

  sitesById = new Map<LocationId, Site>();
  varsById = new Map<number, Var>();

  scopes: Scope[] = [];

  compatibleType: CompatType = COMPAT_TYPE.ON;

  inc = 1;
  ix = 0;
  iy = 0;

  vid = 0;
  jid = 0 as JumpId;

  intro = "";
  congrat = "";

  params: Global[] = [];

  errors: string[] = [];

  getSite(name: string): Site | undefined {
    return this.sites.get(name);
  }

  addSite(site: Site) {
    this.sites.set(site.name, site);
    this.sitesById.set(site.id, site);
  }

  getVar(name: string): Var | undefined {
    return this.vars.get(name);
  }

  addVar(v: Var) {
    this.vars.set(v.name, v);
    if (v.id !== null) {
      this.varsById.set(v.id, v);
    }
  }

  getMacro(name: string): Macro | undefined {
    return this.macros.get(name);
  }

  addMacro(m: Macro) {
    this.macros.set(m.name, m);
  }

  getGlobal(name: string): Global {
    const existing = this.globals.get(name);
    if (existing) {
      return existing;
    }
    const g = createGlobal(name);
    this.globals.set(name, g);
    return g;
  }

  getConstants(): Global[] {
    const names = new Set<string>();
    const result: Global[] = [];

    for (let i = this.params.length - 1; i >= 0; i--) {
      const p = this.params[i];
      if (!names.has(p.name)) {
        result.push(p);
        names.add(p.name);
      }
    }

    for (const g of Array.from(this.globals.values())) {
      if (!names.has(g.name)) {
        result.push(g);
        names.add(g.name);
      }
    }

    return result;
  }

  pushScope(type: ScopeType): Scope {
    const scope = createScope(type);
    this.scopes.push(scope);
    return scope;
  }

  popScope(): Scope | undefined {
    return this.scopes.pop();
  }

  currentScope(): Scope | undefined {
    return this.scopes.length > 0 ? this.scopes[this.scopes.length - 1] : undefined;
  }

  closeAllScopes() {
    while (this.scopes.length > 0) {
      const scope = this.scopes.pop()!;
      if (scope.type === SCOPE_TYPE.VAR && scope.vars) {
        expandVarFields(scope.vars);
        this.addVar(scope.vars);
      } else if (scope.type === SCOPE_TYPE.CASE && scope.case) {
        const parent = this.currentScope();
        if (parent?.type === SCOPE_TYPE.SITE && parent.site) {
          parent.site.cases.push(scope.case);
        }
      } else if (scope.type === SCOPE_TYPE.SITE && scope.site) {
        this.addSite(scope.site);
      }
    }
  }

  isInsideMacroLike(): boolean {
    const scope = this.currentScope();
    return scope?.type === SCOPE_TYPE.MACRO || scope?.type === SCOPE_TYPE.FOR;
  }

  error(message: string) {
    this.errors.push(message);
  }
}

// ======================== Вспомогательные функции ========================

function getNextChar(char: string): string {
  return String.fromCharCode(char.charCodeAt(0) + 1);
}

function iterateRangeEx(range: string): string[] {
  const result: string[] = [];
  const match = range.match(/^\s*([^.]+)\s*\.\.\s*(\S+)/);
  if (match) {
    const start = match[1];
    const end = match[2];
    if (/^\d+$/.test(start) && /^\d+$/.test(end)) {
      for (let i = Number(start); i <= Number(end); i++) {
        result.push(String(i));
      }
    } else {
      let c = start;
      while (true) {
        result.push(c);
        if (c === end) {
          break;
        }
        c = getNextChar(c);
      }
    }
  } else {
    result.push(range);
  }
  return result;
}

function checkList(list: string, name: string): boolean {
  return list.split(";").some((item) => item === name);
}

function getShowingType(show: string, hide: string, name: string): 0 | 1 | 2 {
  if (checkList(show, name)) {
    return 1;
  }
  if (checkList(hide, name)) {
    return 2;
  }
  return 0;
}

// ======================== Раскрытие макросов и вычисление выражений ========================

function expandMacro(source: string, constants: Global[]): string {
  const constMap = new Map(constants.map((c) => [c.name, c.value]));

  const evaluatePlaceholder = (expr: string): string => {
    let evaluated = expr;
    let changed = true;
    while (changed) {
      changed = false;
      evaluated = evaluated.replace(/\$([a-zA-Z0-9_]+)/g, (_, name) => {
        const val = constMap.get(name);
        if (val !== undefined) {
          changed = true;
          return val;
        }
        return `++${name}`; // маркер для отложенной замены
      });
    }

    if (/[\s+\-*\/<>=]/.test(evaluated) && !/[^0-9+\-*\/<>=()\s.]/.test(evaluated)) {
      try {
        evaluated = String(calculate(evaluated, [], randomFromMathRandom));
      } catch {
        // оставляем как есть
      }
    }

    return evaluated.replace(/\+\+/g, "$");
  };

  return source.replace(/\[([^\]]+)\]/g, (_, expr) => evaluatePlaceholder(expr))
               .replace(/{{/g, "[")
               .replace(/}}/g, "]");
}

/**
 * Разворачивает поля переменной в плоский список текстов.
 * Модифицирует переданный объект Var.
 * CHANGE: поддержка индивидуальных оснований у полей (#mod внутри #field).
 *          Если поле не имеет своего mod, используется общий mod переменной.
 *          Произведение оснований должно равняться размеру диапазона переменной.
 */
function expandVarFields(v: Var): void {
  if (v.fields.length === 0) {
    return;
  }

  const rangeMatch = v.range.match(/(-?\d+)\.\.(-?\d+)/);
  if (!rangeMatch) {
    throw new Error(`Invalid range for var with fields: ${v.range}`);
  }
  const min = Number(rangeMatch[1]);
  const max = Number(rangeMatch[2]);
  const totalValues = max - min + 1;

  // Определяем основание для каждого поля
  const bases: number[] = [];
  for (const field of v.fields) {
    const b = field.mod ?? v.mod;
    if (b === null) {
      throw new Error(
        `Field "${field.name}" in var "${v.name}" has no mod (neither global nor local)`
      );
    }
    bases.push(b);
  }

  // Проверяем, что произведение оснований покрывает весь диапазон
  let product = 1;
  for (const b of bases) {
    product *= b;
  }
  if (product !== totalValues) {
    throw new Error(
      `Mismatch in var "${v.name}": ` +
      `fields bases product = ${product}, but range ${v.range} gives ${totalValues} values`
    );
  }

  const newTexts: Text[] = [];

  for (let val = min; val <= max; val++) {
    let idx = val - min;
    const digits: number[] = new Array(v.fields.length);

    // Раскладываем число по основаниям, начиная с младшего разряда (последнее поле)
    for (let i = v.fields.length - 1; i >= 0; i--) {
      const b = bases[i];
      digits[i] = idx % b;
      idx = Math.floor(idx / b);
    }

    // Формируем строку, соединяя тексты разрядов в порядке объявления (старший → младший)
    const parts: string[] = [];
    for (let i = 0; i < v.fields.length; i++) {
      const digit = digits[i];
      const field = v.fields[i];
      const txt = field.texts.find(t => {
        const rm = t.range.match(/(-?\d+)\.\.(-?\d+)/);
        if (!rm) return false;
        const from = Number(rm[1]);
        const to = Number(rm[2]);
        return digit >= from && digit <= to;
      });
      if (!txt) {
        throw new Error(
          `No text for digit ${digit} in field "${field.name}" ` +
          `(var "${v.name}", value ${val})`
        );
      }
      parts.push(txt.value);
    }

    newTexts.push({
      range: `${val}..${val}`,
      value: parts.join(''),
    });
  }

  v.texts = newTexts;
  v.fields = [];
  v.currentField = null;
}

// ======================== Парсинг директив ========================

function parseMacro(line: string, ctx: ParseContext) {
  const match = line.match(/^\s*#macro:([^\s]+)/);
  if (!match) {
    return;
  }

  const args = match[1].split(":");
  const name = args[0];
  const scope = ctx.pushScope(SCOPE_TYPE.MACRO);
  scope.macro = createMacro(name);
  for (let i = 1; i < args.length; i++) {
    scope.macro.params.push(args[i]);
  }
}

function parseFor(line: string, ctx: ParseContext) {
  const match = line.match(/^\s*#for:([^\s:]+):([^\s]+)/);
  if (!match) {
    return;
  }

  const scope = ctx.pushScope(SCOPE_TYPE.FOR);
  scope.macro = createMacro("for");
  const params = match[1].split(";");
  scope.macro.params.push(...params);
  const ranges = match[2].split(":");
  scope.macro.ranges.push(...ranges);
}

function parseIf(line: string, ctx: ParseContext) {
  const match = line.match(/^\s*#if:([^\s:]+)/);
  if (!match) {
    return;
  }

  const scope = ctx.pushScope(SCOPE_TYPE.FOR);
  scope.macro = createMacro("for");
  scope.macro.params.push("_");
  scope.macro.ranges.push(`1..${match[1]}`);
}

function parseEnd(line: string, ctx: ParseContext) {
  if (ctx.scopes.length === 0) {
    return;
  }
  const scope = ctx.currentScope()!;

  const match = line.match(/^\s*#end:([^\s]+)/);
  if (match && scope.macro) {
    const args = match[1].split(":");
    for (const arg of args) {
      const g = ctx.getGlobal(arg);
      g.isIncremetable = true;
      scope.macro.params.push(g.name);
    }
  }

  if (scope.type === SCOPE_TYPE.MACRO && scope.macro) {
    ctx.addMacro(scope.macro);
    ctx.popScope();
  } else if (scope.type === SCOPE_TYPE.FOR && scope.macro) {
    const ranges = scope.macro.ranges[0]?.split(";") ?? [];
    let values: string[] = [];
    for (const r of ranges) {
      values = values.concat(iterateRangeEx(r));
    }

    const macroName = `@${ctx.scopes.length}`;
    scope.macro.name = macroName;
    ctx.addMacro(scope.macro);
    ctx.popScope();

    for (const val of values) {
      const customLine = `#${macroName}:${val}`;
      parseCustom(macroName, customLine, ctx);
    }
    if (values.length === 0) {
      altCustom(macroName, ctx);
    }
    ctx.macros.delete(macroName);
  } else {
    ctx.popScope();
  }
}

function parseVar(line: string, ctx: ParseContext) {
  while (ctx.currentScope()?.type === SCOPE_TYPE.INTRO || ctx.currentScope()?.type === SCOPE_TYPE.CONGRAT) {
    ctx.popScope();
  }
  while (ctx.currentScope()?.type === SCOPE_TYPE.VAR) {
    const scope = ctx.popScope()!;
    if (scope.vars) {
      expandVarFields(scope.vars);
      ctx.addVar(scope.vars);
    }
  }

  const match = line.match(/^\s*#var:(\S+)/);
  if (!match) {
    return;
  }

  const scope = ctx.pushScope(SCOPE_TYPE.VAR);
  scope.vars = createVar(match[1]);

  const v = scope.vars;
  v.isShow = /#show/.test(line);
  v.isHide = /#hide/.test(line);
  v.isShowingZero = /#zero/.test(line);
  v.isMoney = /#money/.test(line);

  let p = line.match(/#range:(\S+)/);
  if (p) {
    v.range = p[1];
  }
  p = line.match(/#default:(\S+)/);
  if (p) {
    v.def = p[1];
  }
  p = line.match(/#order:(\d+)/);
  if (p) {
    v.order = Number(p[1]);
  }
  p = line.match(/#mod:(\d+)/);
  if (p) {
    v.mod = Number(p[1]);
  }
}

function parseSite(line: string, ctx: ParseContext) {
  while (ctx.currentScope()?.type === SCOPE_TYPE.INTRO || ctx.currentScope()?.type === SCOPE_TYPE.CONGRAT) {
    ctx.popScope();
  }
  while (ctx.currentScope()?.type === SCOPE_TYPE.VAR) {
    const scope = ctx.popScope()!;
    if (scope.vars) {
      expandVarFields(scope.vars);
      ctx.addVar(scope.vars);
    }
  }
  while (ctx.currentScope()?.type === SCOPE_TYPE.CASE) {
    const scope = ctx.popScope()!;
    const parent = ctx.currentScope();
    if (parent?.type === SCOPE_TYPE.SITE && parent.site && scope.case) {
      parent.site.cases.push(scope.case);
    }
  }
  while (ctx.currentScope()?.type === SCOPE_TYPE.SITE) {
    const scope = ctx.popScope()!;
    if (scope.site) {
      ctx.addSite(scope.site);
    }
  }

  const match = line.match(/^\s*#site:(\S+)/);
  if (!match) {
    return;
  }

  const name = match[1];
  let site = ctx.getSite(name);
  if (!site) {
    site = createSite(name, (ctx.sites.size + 1) as LocationId);
  }

  const scope = ctx.pushScope(SCOPE_TYPE.SITE);
  scope.site = site;

  const specMatch = line.match(/#(default|win|lose|death)/);
  if (specMatch) {
    site.spec = specMatch[1];
  }

  let p = line.match(/#show:(\S+)/);
  if (p) {
    site.show = p[1];
  }
  p = line.match(/#hide:(\S+)/);
  if (p) {
    site.hide = p[1];
  }
  p = line.match(/{([^}]+)}/);
  if (p) {
    site.expr = p[1];
  }
  p = line.match(/#image:(\S+)/);
  if (p) {
    site.image = p[1];
  }
  site.isDay = /#day/.test(line);
}

function parseCase(line: string, ctx: ParseContext) {
  while (ctx.currentScope()?.type === SCOPE_TYPE.INTRO || ctx.currentScope()?.type === SCOPE_TYPE.CONGRAT) {
    ctx.popScope();
  }
  while (ctx.currentScope()?.type === SCOPE_TYPE.VAR) {
    const scope = ctx.popScope()!;
    if (scope.vars) {
      expandVarFields(scope.vars);
      ctx.addVar(scope.vars);
    }
  }
  while (ctx.currentScope()?.type === SCOPE_TYPE.CASE) {
    const scope = ctx.popScope()!;
    const parent = ctx.currentScope();
    if (parent?.type === SCOPE_TYPE.SITE && parent.site && scope.case) {
      parent.site.cases.push(scope.case);
    }
  }

  const parent = ctx.currentScope();
  if (!parent || parent.type !== SCOPE_TYPE.SITE || !parent.site) {
    return;
  }

  const match = line.match(/^\s*#case:(\S+)/);
  if (!match) {
    return;
  }

  const to = match[1];
  const scope = ctx.pushScope(SCOPE_TYPE.CASE);
  const c = createCase(parent.site.name, to);
  scope.case = c;

  let p = line.match(/#order:(\d+)/);
  if (p) {
    c.order = Number(p[1]);
  }
  p = line.match(/#priority:(\d+)/);
  if (p) {
    c.priority = Number(p[1]);
  }
  p = line.match(/#show:(\S+)/);
  if (p) {
    c.show = p[1];
  }
  p = line.match(/#hide:(\S+)/);
  if (p) {
    c.hide = p[1];
  }
  c.isDay = /#day/.test(line);
  p = line.match(/#count:(\d+)/);
  if (p) {
    c.cnt = Number(p[1]);
  }
  p = line.match(/'([^']+)'/);
  if (p) {
    c.text = p[1];
  }
  p = line.match(/{([^}]+)}/);
  if (p) {
    c.expr = p[1];
  }
  p = line.match(/#return:(\S+)/);
  if (p) {
    if (ctx.vid === 0) {
      const rrr = createVar("RRR");
      rrr.id = 1;
      rrr.range = "0..100000000";
      ctx.addVar(rrr);
      ctx.vid = 1;
    }
    c.ret = p[1];
  }
}

function parseCustom(cmd: string, line: string, ctx: ParseContext) {
  const macro = ctx.getMacro(cmd);
  if (!macro) {
    return;
  }

  let addedParams = 0;
  const match = line.match(/^\s*#[^:\s]+:(\S+)/);
  if (match) {
    const args = match[1].split(":");
    for (let i = 0; i < args.length && i < macro.params.length; i++) {
      const g = createGlobal(macro.params[i]);
      g.value = args[i];
      ctx.params.push(g);
      addedParams++;
    }
  }

  const constants = ctx.getConstants();
  for (const srcLine of macro.lines) {
    const expanded = expandMacro(srcLine, constants);
    parseLine(expanded, ctx);
  }

  ctx.params.splice(ctx.params.length - addedParams, addedParams);

  for (const paramName of macro.params) {
    const g = ctx.getGlobal(paramName);
    if (g.isIncremetable) {
      g.value = String(Number(g.value) + 1);
    }
  }
}

function altCustom(cmd: string, ctx: ParseContext) {
  const macro = ctx.getMacro(cmd);
  if (!macro) {
    return;
  }

  const constants = ctx.getConstants();
  for (const srcLine of macro.alt) {
    const expanded = expandMacro(srcLine, constants);
    parseLine(expanded, ctx);
  }
}

function parseText(line: string, ctx: ParseContext) {
  const scope = ctx.currentScope();
  if (!scope || scope.type !== SCOPE_TYPE.VAR || !scope.vars) {
    return;
  }

  const match = line.match(/^\s*#text:([^:\s]+)/);
  if (match) {
    const t = createText(match[1]);
    const s = line.match(/'([^']*)'/);
    if (s) {
      t.value = s[1];
    }

    const v = scope.vars;
    if (v.currentField) {
      v.currentField.texts.push(t);
    } else {
      v.texts.push(t);
    }
  }
}

function parseMessage(line: string, ctx: ParseContext) {
  const scope = ctx.currentScope();
  if (!scope || scope.type !== SCOPE_TYPE.VAR || !scope.vars) {
    return;
  }

  const match = line.match(/^\s*#message:([+-])(\d+)/);
  if (match) {
    const v = ctx.getVar(scope.vars.name);
    if (v) {
      v.lim = Number(match[2]);
      v.isNeg = match[1] === "-";
      const typeMatch = line.match(/#(win|lose|death):'([^']*)'/);
      if (typeMatch) {
        v.message = typeMatch[2];
        if (typeMatch[1] === "win") {
          v.type = VAR_TYPE.WIN;
        } else if (typeMatch[1] === "lose") {
          v.type = VAR_TYPE.LOSE;
        } else if (typeMatch[1] === "death") {
          v.type = VAR_TYPE.DEATH;
        }
      }
    }
  }
}

function parseReturn(line: string, ctx: ParseContext) {
  const scope = ctx.currentScope();
  if (!scope || scope.type !== SCOPE_TYPE.SITE || !scope.site) {
    return;
  }

  if (ctx.vid === 0) {
    const rrr = createVar("RRR");
    rrr.id = 1;
    rrr.range = "0..100000000";
    ctx.addVar(rrr);
    ctx.vid = 1;
  }
  scope.site.isReturn = true;
}

function parseGlobal(line: string, ctx: ParseContext) {
  const match = line.match(/^\s*#global:([^:]+):([^\s]+)/);
  if (match) {
    const g = ctx.getGlobal(match[1]);
    g.value = match[2];
  }
}

function parsePage(line: string, ctx: ParseContext) {
  const scope = ctx.currentScope();
  if (!scope || scope.type !== SCOPE_TYPE.SITE || !scope.site) {
    return;
  }

  const match = line.match(/^\s*#page:(\d+)/);
  if (match) {
    scope.site.num = Number(match[1]);
    const imgMatch = line.match(/#image:(\S+)/);
    if (imgMatch) {
      scope.site.image = imgMatch[1];
    }
  }
}

function parseCompatible(line: string, ctx: ParseContext) {
  const match = line.match(/^\s*#compatible:(on|off|debug)/);
  if (match) {
    switch (match[1]) {
      case "on":
        ctx.compatibleType = COMPAT_TYPE.ON;
        break;
      case "off":
        ctx.compatibleType = COMPAT_TYPE.OFF;
        break;
      case "debug":
        ctx.compatibleType = COMPAT_TYPE.DEBUG;
        break;
    }
  }
}

function parseElse(line: string, ctx: ParseContext) {
  const scope = ctx.currentScope();
  if (scope && (scope.type === SCOPE_TYPE.MACRO || scope.type === SCOPE_TYPE.FOR) && scope.macro) {
    scope.macro.altF = true;
  }
}

function parseStatement(line: string, ctx: ParseContext) {
  const scope = ctx.currentScope();
  if (!scope) {
    return;
  }

  const match = line.match(/^\s*\$([^\s=]+)\s*=\s*(\S.*)/);
  if (!match) {
    return;
  }

  const stmt = createStatement(match[1], match[2]);
  if (scope.type === SCOPE_TYPE.SITE && scope.site) {
    scope.site.stmts.push(stmt);
  } else if (scope.type === SCOPE_TYPE.CASE && scope.case) {
    scope.case.stmts.push(stmt);
  }
}

function parseString(line: string, ctx: ParseContext) {
  const scope = ctx.currentScope();
  if (!scope) {
    return;
  }

  if ((scope.type === SCOPE_TYPE.MACRO || scope.type === SCOPE_TYPE.FOR) && scope.macro) {
    if (scope.macro.altF) {
      scope.macro.alt.push(line);
    } else {
      scope.macro.lines.push(line);
    }
  } else if (scope.type === SCOPE_TYPE.INTRO) {
    ctx.intro = ctx.intro ? `${ctx.intro}\n${line}` : line;
  } else if (scope.type === SCOPE_TYPE.CONGRAT) {
    ctx.congrat = ctx.congrat ? `${ctx.congrat}\n${line}` : line;
  } else if (scope.type === SCOPE_TYPE.SITE && scope.site) {
    const page = getPage(scope.site, scope.site.num);
    page.lines.push(line);
  } else if (scope.type === SCOPE_TYPE.CASE && scope.case) {
    scope.case.lines.push(line);
  }
}

function getPage(site: Site, num: number): Page {
  const existing = site.pages.find((p) => p.num === num);
  if (existing) {
    return existing;
  }
  const page = createPage(num);
  site.pages.push(page);
  if (site.image) {
    page.image = site.image;
  }
  return page;
}

// ======================== Диспетчер парсинга ========================

function parseCommand(cmd: string, line: string, ctx: ParseContext) {
  switch (cmd) {
    case "macro":
      parseMacro(line, ctx);
      break;
    case "for":
      parseFor(line, ctx);
      break;
    case "if":
      parseIf(line, ctx);
      break;
    case "end":
      parseEnd(line, ctx);
      break;
    case "var":
      parseVar(line, ctx);
      break;
    case "site":
      parseSite(line, ctx);
      break;
    case "case":
      parseCase(line, ctx);
      break;
    case "field": {
      const scope = ctx.currentScope();
      if (scope?.type === SCOPE_TYPE.VAR && scope.vars) {
        const match = line.match(/^\s*#field:(\S+)/);
        if (match) {
          // CHANGE: извлекаем локальные #mod и #default
          const field: Field = { name: match[1], texts: [], mod: null, def: null };
          let pm = line.match(/#mod:(\d+)/);
          if (pm) field.mod = Number(pm[1]);
          pm = line.match(/#default:(\S+)/);
          if (pm) field.def = pm[1];

          // Проверка, что хотя бы где-то есть основание
          if (field.mod === null && scope.vars.mod === null) {
            ctx.error(`#mod not specified for var "${scope.vars.name}" or field "${field.name}"`);
          }

          scope.vars.fields.push(field);
          scope.vars.currentField = field;
        }
      }
      break;
    }
    case "intro":
      ctx.pushScope(SCOPE_TYPE.INTRO);
      break;
    case "congratulation":
      ctx.pushScope(SCOPE_TYPE.CONGRAT);
      break;
    case "position": {
      const match = line.match(/^\s*#position:([^:\s]+):(\d+):(\d+)/);
      if (match) {
        const site = ctx.getSite(match[1]);
        if (site) {
          site.x = Number(match[2]);
          site.y = Number(match[3]);
        }
        ctx.closeAllScopes();
      }
      break;
    }
    case "text":
      parseText(line, ctx);
      break;
    case "message":
      parseMessage(line, ctx);
      break;
    case "return":
      parseReturn(line, ctx);
      break;
    case "global":
      parseGlobal(line, ctx);
      break;
    case "page":
      parsePage(line, ctx);
      break;
    case "compatible":
      parseCompatible(line, ctx);
      break;
    default:
      parseCustom(cmd, line, ctx);
      break;
  }
}

// ======================== Основная функция парсинга строки ========================

export function parseLine(line: string, ctx: ParseContext) {
  const insideMacroLike = ctx.isInsideMacroLike();
  const cmdMatch = line.match(/^\s*#([^:\s]+)/);

  if (insideMacroLike) {
    if (cmdMatch) {
      if (cmdMatch[1] === "else") {
        parseElse(line, ctx);
        return;
      }
      if (cmdMatch[1] === "end") {
        parseEnd(line, ctx);
        return;
      }
    }
    parseString(line, ctx);
  } else {
    if (cmdMatch) {
      parseCommand(cmdMatch[1], line, ctx);
      return;
    }
    if (/^\s*\$[^=]+/.test(line)) {
      parseStatement(line, ctx);
      return;
    }
    parseString(line, ctx);
  }
}

// ======================== Подготовка и генерация QM ========================

function prepareFormula(ctx: ParseContext, expr: string): string {
  return expr
    .replace(/\$([a-zA-Z0-9_]+)/g, (_, name) => {
      const v = ctx.getVar(name);
      if (v) {
        if (v.id === null) {
          v.id = ++ctx.vid;
          ctx.varsById.set(v.id, v);
        }
        return `[p${v.id}]`;
      }
      return "";
    })
    .replace(/<([0-9.-]+)>/g, "[$1]");
}

function prepareText(ctx: ParseContext, text: string, isParam: boolean): string {
  let result = text.replace(/#([^:\s]+)(?::([A-Za-z0-9_:]+))?/g, (_, name, args) => {
    const macro = ctx.getMacro(name);
    if (!macro) {
      return "";
    }

    const constants: Global[] = [];
    if (args) {
      const argVals = args.split(":");
      for (let i = 0; i < macro.params.length && i < argVals.length; i++) {
        const g = createGlobal(macro.params[i]);
        g.value = argVals[i];
        constants.push(g);
      }
    }
    for (const g of Array.from(ctx.globals.values())) {
      if (!constants.some((c) => c.name === g.name)) {
        constants.push(g);
      }
    }

    let expanded = "";
    for (const line of macro.lines) {
      expanded += (expanded ? "\\n" : "") + expandMacro(line, constants);
    }
    return expanded;
  });

  result = result.replace(/{([^}]+)}/g, (_, expr) => {
    const formula = prepareFormula(ctx, expr);
    return `<<${formula}>>`;
  }).replace(/\*/g, "&&");

  // Обработка %...% (жирный текст)
  let match = result.match(/%([^*]+)%/);
  while (match) {
    result = result.replace(`%${match[1]}%`, `<clr>${match[1]}<clrEnd>`);
    match = result.match(/%([^*]+)%/);
  }

  // Обработка ^...^ (фиксированный шрифт)
  match = result.match(/\^([^\^]+)\^/);
  while (match) {
    result = result.replace(`^${match[1]}^`, `<fix>${match[1]}</fix>`);
    match = result.match(/\^([^\^]+)\^/);
  }

  result = result.replace(/(\$|@)([a-zA-Z0-9_]+)/g, (_, prefix, name) => {
    const v = ctx.getVar(name);
    if (v) {
      if (v.id === null) {
        v.id = ++ctx.vid;
        ctx.varsById.set(v.id, v);
      }
      return prefix === "$" ? `[p${v.id}]` : `[d${v.id}]`;
    }
    return "";
  });

  if (isParam) {
    result = result.replace(/\$/g, "<>");
  }

  // Восстанавливаем && обратно в *
  result = result.replace(/&&/g, "*");

  // Обработка спойлеров ~...~ (только в режиме COMPAT_TYPE.OFF)
  if (ctx.compatibleType === COMPAT_TYPE.OFF) {
    match = result.match(/~([^~]+)~/);
    while (match) {
      result = result.replace(`~${match[1]}~`, `<tg-spoiler>${match[1]}</tg-spoiler>`);
      match = result.match(/~([^~]+)~/);
    }
  }

  result = result.replace(/<</g, "{").replace(/>>/g, "}");

  return result;
}

function prepareLocation(ctx: ParseContext, site: Site) {
  site.loc = createLocation(site.id);
  if (site.isDay) {
    site.loc.dayPassed = true;
  }

  let isEmpty = true;
  for (const page of site.pages) {
    let skip = true;
    let newlines = 0;
    for (const line of page.lines) {
      const processed = prepareText(ctx, line, false);
      if (processed.trim() !== "") {
        skip = false;
        if (!site.loc.texts[page.num - 1]) {
          site.loc.texts[page.num - 1] = "";
        }
        site.loc.texts[page.num - 1] += "\n".repeat(newlines) + processed + "\n";
        isEmpty = false;
        newlines = 0;
      } else if (!skip) {
        newlines++;
      }
    }
    if (page.image) {
      site.loc.media[page.num - 1] = { img: page.image, sound: undefined, track: undefined };
    }
  }

  if (site.spec === "default") {
    site.loc.isStarting = true;
  } else if (site.spec === "win") {
    site.loc.isSuccess = true;
  } else if (site.spec === "lose") {
    site.loc.isFaily = true;
  } else if (site.spec === "death") {
    site.loc.isFailyDeadly = true;
  }

  if (!isEmpty && ctx.compatibleType !== COMPAT_TYPE.OFF) {
    site.loc.isEmpty = false;
  }
  if (isEmpty && ctx.compatibleType === COMPAT_TYPE.DEBUG) {
    site.loc.texts[0] = site.name;
  }

  if (site.expr) {
    site.loc.isTextByFormula = true;
    site.loc.textSelectFormula = prepareFormula(ctx, site.expr);
  }

  for (const stmt of site.stmts) {
    prepareFormula(ctx, stmt.name);
    stmt.expr = prepareFormula(ctx, stmt.expr);
  }
}

function prepareJump(ctx: ParseContext, c: Case) {
  const from = ctx.getSite(c.from);
  const to = ctx.getSite(c.to);
  if (!from || !to) {
    return;
  }

  if (c.text) {
    c.text = prepareText(ctx, c.text, false);
  }

  let descr = "";
  let skip = true;
  let newlines = 0;
  for (const line of c.lines) {
    const processed = prepareText(ctx, line, false);
    if (processed.trim() !== "") {
      skip = false;
      descr += "\n".repeat(newlines) + processed + "\n";
      newlines = 0;
    } else if (!skip) {
      newlines++;
    }
  }

  ctx.jid++;
  c.jump = createJump(ctx.jid, from.id, to.id, c.text, descr);
  if (c.isDay) {
    c.jump.dayPassed = true;
  }
  if (c.cnt > 0) {
    c.jump.jumpingCountLimit = c.cnt;
  }

  for (const stmt of c.stmts) {
    prepareFormula(ctx, stmt.name);
    stmt.expr = prepareFormula(ctx, stmt.expr);
  }
  if (c.expr) {
    c.jump.formulaToPass = prepareFormula(ctx, c.expr);
  }
  c.jump.priority = c.priority;
  c.jump.showingOrder = c.order;
}

function addReturns(ctx: ParseContext, jump: Case, ret: string) {
  const target = ctx.getSite(ret);
  const source = ctx.getSite(jump.to);
  if (!target || !source) {
    return;
  }

  const queue: Site[] = [source];
  const visited = new Set<number>([source.id]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.isReturn) {
      const retJump = createCase(current.name, ret);
      retJump.expr = `($RRR mod 256)=${target.id}`;
      retJump.stmts.push(createStatement("RRR", "$RRR div 256"));
      current.cases.push(retJump);
    }
    for (const c of current.cases) {
      const next = ctx.getSite(c.to);
      if (next && !visited.has(next.id)) {
        visited.add(next.id);
        queue.push(next);
      }
    }
  }

  jump.stmts.push(createStatement("RRR", `$RRR*256+${target.id}`));
}

function buildParamChanges(ctx: ParseContext, show: string, hide: string, stmts: Statement[]) {
  const changes = [];
  for (let i = 0; i < ctx.vid; i++) {
    const v = ctx.varsById.get(i + 1);
    if (!v) {
      continue;
    }
    const stmt = stmts.find((s) => s.name === v.name);
    changes.push({
      change: 0,
      showingType: getShowingType(show, hide, v.name),
      isChangePercentage: false,
      isChangeValue: false,
      isChangeFormula: !!stmt,
      changingFormula: stmt?.expr ?? "",
      critText: "",
      img: undefined,
      track: undefined,
      sound: undefined,
    });
  }
  return changes;
}

function finalizeContext(ctx: ParseContext): QM {
  ctx.closeAllScopes();

  for (const v of Array.from(ctx.vars.values())) {
    if (v.order === null) {
      v.order = MAX_VAL;
    }
  }

  const sortedVars = Array.from(ctx.vars.values()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  ctx.vars.clear();
  ctx.varsById.clear();
  for (const v of sortedVars) {
    if ((v.order ?? 0) < MAX_VAL) {
      v.id = ++ctx.vid;
    }
    ctx.addVar(v);
  }

  const startingIds: LocationId[] = [];
  for (const site of Array.from(ctx.sites.values())) {
    prepareLocation(ctx, site);
    if (site.loc?.isStarting) {
      startingIds.push(site.id);
    }
  }

  for (const site of Array.from(ctx.sites.values())) {
    for (const c of site.cases) {
      if (c.ret) {
        addReturns(ctx, c, c.ret);
      }
    }
  }

  for (const site of Array.from(ctx.sites.values())) {
    for (const c of site.cases) {
      prepareJump(ctx, c);
    }
  }

  ctx.qm = createQm();
  if (ctx.intro) {
    ctx.qm.taskText = prepareText(ctx, ctx.intro, false);
  }
  if (ctx.congrat) {
    ctx.qm.successText = prepareText(ctx, ctx.congrat, false);
  }

  for (let id = 1; id <= ctx.vid; id++) {
    const v = ctx.varsById.get(id);
    if (!v) {
      continue;
    }

    const param = createParam(v.name);
    param.showWhenZero = v.isShowingZero;
    const rangeMatch = v.range.match(/(-?\d+)\.\.(-?\d+)/);
    if (rangeMatch) {
      param.min = Number(rangeMatch[1]);
      param.max = Number(rangeMatch[2]);
    }
    param.starting = v.def;
    param.isMoney = v.isMoney;

    if (v.type !== VAR_TYPE.NONE) {
      param.critValueString = v.message;
      if (v.lim !== null) {
        if (v.isNeg) {
          param.max = v.lim;
          param.critType = 0;
        } else {
          param.min = v.lim;
          param.critType = 1;
        }
      }
      if (v.type === VAR_TYPE.LOSE) {
        param.type = 1;
      } else if (v.type === VAR_TYPE.WIN) {
        param.type = 2;
      } else if (v.type === VAR_TYPE.DEATH) {
        param.type = 3;
      }
    }

    for (const t of v.texts) {
      const rm = t.range.match(/(-?\d+)\.\.(-?\d+)/);
      if (rm) {
        param.showingInfo.push({
          from: Number(rm[1]),
          to: Number(rm[2]),
          str: prepareText(ctx, t.value, true),
        });
      }
    }
    param.active = true;
    param.showWhenZero = true;
    addParam(ctx.qm, param);
  }

  const processed = new Set<LocationId>();
  const queue: LocationId[] = [...startingIds];

  while (queue.length > 0) {
    const locId = queue.shift()!;
    if (processed.has(locId)) {
      continue;
    }
    processed.add(locId);

    const site = ctx.sitesById.get(locId);
    if (!site || !site.loc) {
      continue;
    }

    if (site.x !== null && site.y !== null) {
      site.loc.locX = site.x;
      site.loc.locY = site.y;
    } else {
      site.loc.locX = ctx.ix * DX + 32;
      site.loc.locY = ctx.iy * DY + 63;
      ctx.ix += ctx.inc;
      if (ctx.ix >= CX) {
        ctx.iy++;
        ctx.inc = -1;
        ctx.ix--;
      } else if (ctx.ix < 0) {
        ctx.iy++;
        ctx.inc = 1;
        ctx.ix++;
      }
    }

    site.loc.paramsChanges = buildParamChanges(ctx, site.show, site.hide, site.stmts);

    addLocation(ctx.qm, site.loc);

    for (const c of site.cases) {
      if (!c.jump) {
        continue;
      }
      const toSite = ctx.getSite(c.to);
      if (toSite && !processed.has(toSite.id)) {
        queue.push(toSite.id);
      }

      c.jump.paramsChanges = buildParamChanges(ctx, c.show, c.hide, c.stmts);
      addJump(ctx.qm, c.jump);

      if (c.lines.length > 0 && ctx.compatibleType === COMPAT_TYPE.OFF && toSite?.loc) {
        toSite.loc.isEmpty = false;
      }
    }
  }

  return ctx.qm;
}

// ======================== Публичный API ========================

export function createContext(): ParseContext {
  return new ParseContext();
}

export function closeContext(ctx: ParseContext): QM {
  return finalizeContext(ctx);
}

export function loadQms(input: string | Buffer, encoding = "utf-8"): QM {
  let text: string;
  if (typeof input === "string") {
    text = input;
  } else {
    const decoder = new TextDecoder(encoding);
    text = decoder.decode(input);
  }

  const lines = text.split(/\r\n|\n|\r/);
  const ctx = createContext();

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s*\/\/.*/, "");
    parseLine(line, ctx);
  }

  return closeContext(ctx);
}
