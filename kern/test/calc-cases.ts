/**
 * Test cases of the calculator functions (list 8.2 of part 3), shared by the unit test
 * (calc-functions.test.ts) and the cross-check against LibreOffice (scripts/p19-gegenprobe.mjs).
 */
import type { Spec } from './calc-helpers.js';

/**
 * Data table `d` (formulas are evaluated at its cell A1):
 *
 *      A      B        C      D   E                 F        G   H  I       J
 *   1  10     abc      TRUE   1   2026-10-11 (date) Kosten       1  eins    100
 *   2  25     a*c      FALSE  2   08:30:15 (time)   Miete        2  zwei    200
 *   3  x      ABC      –      3   #N/A (value)      Kosten       3  drei    300
 *   4  –      "" (Text) 1.5   4   =1/0              Strom        5  fünf    500
 *   5  -3     Straße   0      5   =[.D5]*2          Miete
 *   6  (empty row)
 *   7  1      2        3
 *   8  a      b        c
 */
export const DATA: Spec[][] = [
  [10, 'abc', true, 1, { v: '2026-10-11', t: 'date', text: '11.10.2026' }, 'Kosten', null, 1, 'eins', 100],
  [25, 'a*c', false, 2, { v: 'PT08H30M15S', t: 'time', text: '08:30:15' }, 'Miete', null, 2, 'zwei', 200],
  ['x', 'ABC', null, 3, { v: '#N/A', t: 'error' }, 'Kosten', null, 3, 'drei', 300],
  [null, { v: '', t: 'string' }, 1.5, 4, { f: '=1/0', t: 'float' }, 'Strom', null, 5, 'fünf', 500],
  [-3, 'Straße', 0, 5, { f: '=[.D5]*2', t: 'float' }, 'Miete'],
  [null],
  [1, 2, 3],
  ['a', 'b', 'c'],
];

export type Case = [formula: string, expected: string, kind?: 'F'];

/** Cases per function. `F` marks the error behaviour; an expected error value counts as `F` as well. */
export const CASES: Record<string, Case[]> = {
  ABS: [['=ABS(-2.5)', '2.5'], ['=ABS("x")', '#VALUE!']],
  AND: [['=AND(TRUE();1)', 'TRUE'], ['=AND([.C1:.C2])', 'FALSE'], ['=AND("x")', '#VALUE!'], ['=AND([.B1:.B2])', '#VALUE!']],
  AVERAGE: [['=AVERAGE([.A1:.A5])', '10.666666666666666'], ['=AVERAGE([.B1:.B2])', '#DIV/0!']],
  AVERAGEIF: [['=AVERAGEIF([.F1:.F5];"Kosten";[.D1:.D5])', '2'], ['=AVERAGEIF([.F1:.F5];"Nix";[.D1:.D5])', '#DIV/0!']],
  CHOOSE: [['=CHOOSE(2;"a";"b";"c")', '"b"'], ['=CHOOSE(1;1;1/0)', '1'], ['=CHOOSE(4;"a";"b";"c")', '#VALUE!']],
  COLUMN: [['=COLUMN([.C5])', '3'], ['=COLUMN()', '1'], ['=COLUMN("x")', '#VALUE!']],
  COLUMNS: [['=COLUMNS([.A1:.F5])', '6'], ['=COLUMNS(1/0)', '#DIV/0!']],
  CONCATENATE: [['=CONCATENATE("a";1;TRUE())', '"a1TRUE"'], ['=CONCATENATE("a";NA())', '#N/A']],
  COUNT: [['=COUNT([.A1:.A5])', '3'], ['=COUNT(1;"x";TRUE())', '2'], ['=COUNT(1/0;1)', '1', 'F'], ['=COUNT()', '#VALUE!']],
  COUNTA: [['=COUNTA([.A1:.A5])', '4'], ['=COUNTA([.E1:.E5])', '5', 'F'], ['=COUNTA([.B4])', '1'], ['=COUNTA()', '#VALUE!']],
  COUNTBLANK: [['=COUNTBLANK([.A1:.C5])', '2'], ['=COUNTBLANK([.A1:.A10])', '4'], ['=COUNTBLANK(1)', '#VALUE!']],
  COUNTIF: [['=COUNTIF([.F1:.F5];"kosten")', '2'], ['=COUNTIF([.A1:.A5];">=10")', '2'], ['=COUNTIF([.B1:.B5];"a*c")', '1'], ['=COUNTIF([.A1:.A5];1/0)', '#DIV/0!']],
  COUNTIFS: [['=COUNTIFS([.F1:.F5];"Miete";[.D1:.D5];">2")', '1'], ['=COUNTIFS([.F1:.F5];"Miete";[.D1:.D4];">2")', '#VALUE!']],
  DATE: [['=DATE(2026;10;11)', '46306'], ['=DATE(2026;0;1)', '45992'], ['=DATE(1898;1;1)', '#NUM!']],
  DATEDIF: [
    ['=DATEDIF(DATE(2020;1;15);DATE(2026;10;11);"y")', '6'],
    ['=DATEDIF(DATE(2020;1;15);DATE(2026;10;11);"M")', '80'],
    ['=DATEDIF(DATE(2020;1;15);DATE(2026;10;11);"d")', '2461'],
    ['=DATEDIF(DATE(2020;1;15);DATE(2026;10;11);"md")', '26'],
    ['=DATEDIF(DATE(2020;1;15);DATE(2026;10;11);"ym")', '8'],
    ['=DATEDIF(DATE(2020;1;15);DATE(2026;10;11);"yd")', '269'],
    ['=DATEDIF(DATE(2026;1;1);DATE(2025;1;1);"d")', '#NUM!'],
    ['=DATEDIF(1;2;"w")', '#VALUE!'],
  ],
  DATEVALUE: [['=DATEVALUE("2026-10-11")', '46306'], ['=DATEVALUE("11.10.2026")', '#VALUE!']],
  DAY: [['=DAY(DATE(2026;10;11))', '11'], ['=DAY("2026-10-11")', '11'], ['=DAY(-1)', '#NUM!']],
  DAYS: [['=DAYS(DATE(2026;12;31);DATE(2026;1;1))', '364'], ['=DAYS("x";1)', '#VALUE!']],
  EDATE: [['=EDATE(DATE(2026;1;31);1)', '46081'], ['=EDATE("x";1)', '#VALUE!']],
  EOMONTH: [['=EOMONTH(DATE(2026;2;10);0)', '46081'], ['=EOMONTH(DATE(2026;1;31);-1)', '46022'], ['=EOMONTH(DATE(9999;12;1);1)', '#NUM!']],
  EXACT: [['=EXACT("a";"a")', 'TRUE'], ['=EXACT("a";"A")', 'FALSE'], ['=EXACT(NA();"a")', '#N/A']],
  EXP: [['=EXP(0)', '1'], ['=EXP(1000)', '#NUM!']],
  FALSE: [['=FALSE()', 'FALSE'], ['=FALSE(1)', '#VALUE!']],
  FIND: [['=FIND("b";"abcb")', '2'], ['=FIND("b";"abcb";3)', '4'], ['=FIND("😀";"x😀y")', '2'], ['=FIND("B";"abc")', '#VALUE!'], ['=FIND("a";"abc";5)', '#VALUE!']],
  FV: [['=FV(0;10;-100)', '1000'], ['=ROUND(FV(0.05;10;-100;-1000);2)', '2886.68'], ['=FV("x";1;1)', '#VALUE!']],
  HLOOKUP: [['=HLOOKUP(2;[.A7:.C8];2;FALSE())', '"b"'], ['=HLOOKUP(2.5;[.A7:.C8];2)', '"b"'], ['=HLOOKUP(9;[.A7:.C8];2;FALSE())', '#N/A'], ['=HLOOKUP(2;[.A7:.C8];3)', '#REF!']],
  HOUR: [['=HOUR([.E2])', '8'], ['=HOUR("x")', '#VALUE!'], ['=HOUR(-1)', '#NUM!']],
  IF: [['=IF(FALSE();1)', 'FALSE'], ['=IF(TRUE())', 'TRUE'], ['=IF(TRUE();;2)', '0'], ['=IF(FALSE();1;)', '0'], ['=IF(1/0;1;2)', '#DIV/0!']],
  IFERROR: [['=IFERROR(1;"x")', '1'], ['=IFERROR([.E3];"leer")', '"leer"', 'F'], ['=IFERROR(1/0;1/0)', '#DIV/0!']],
  IFNA: [['=IFNA([.E3];0)', '0', 'F'], ['=IFNA(1;0)', '1'], ['=IFNA(1/0;0)', '#DIV/0!']],
  INDEX: [['=INDEX([.H1:.J4];3;2)', '"drei"'], ['=SUM(INDEX([.H1:.J4];0;3))', '1100'], ['=INDEX([.A7:.C7];2)', '2'], ['=INDEX([.H1:.J4];5;1)', '#REF!'], ['=INDEX([.H1:.J4];0;2)', '#VALUE!']],
  INT: [['=INT(2.7)', '2'], ['=INT("x")', '#VALUE!']],
  ISBLANK: [['=ISBLANK([.A4])', 'TRUE'], ['=ISBLANK([.B4])', 'FALSE'], ['=ISBLANK(1/0)', 'FALSE', 'F']],
  ISERR: [['=ISERR([.E4])', 'TRUE', 'F'], ['=ISERR([.E3])', 'FALSE', 'F'], ['=ISERR(1)', 'FALSE']],
  ISERROR: [['=ISERROR(1)', 'FALSE'], ['=ISERROR([.E3])', 'TRUE', 'F']],
  ISEVEN: [['=ISEVEN(2.9)', 'TRUE'], ['=ISEVEN(-3)', 'FALSE'], ['=ISEVEN("x")', '#VALUE!']],
  ISLOGICAL: [['=ISLOGICAL([.C1])', 'TRUE'], ['=ISLOGICAL(1)', 'FALSE'], ['=ISLOGICAL(NA())', 'FALSE', 'F']],
  ISNA: [['=ISNA([.E3])', 'TRUE', 'F'], ['=ISNA([.E4])', 'FALSE', 'F'], ['=ISNA(1)', 'FALSE']],
  ISNONTEXT: [['=ISNONTEXT([.A4])', 'TRUE'], ['=ISNONTEXT("a")', 'FALSE'], ['=ISNONTEXT(1/0)', 'TRUE', 'F']],
  ISNUMBER: [['=ISNUMBER([.E1])', 'TRUE'], ['=ISNUMBER([.C1])', 'FALSE'], ['=ISNUMBER(1/0)', 'FALSE', 'F']],
  ISODD: [['=ISODD(-3)', 'TRUE'], ['=ISODD("x")', '#VALUE!']],
  ISOWEEKNUM: [['=ISOWEEKNUM(DATE(2026;1;1))', '1'], ['=ISOWEEKNUM(DATE(2027;1;1))', '53'], ['=ISOWEEKNUM("x")', '#VALUE!']],
  ISTEXT: [['=ISTEXT([.B4])', 'TRUE'], ['=ISTEXT(1)', 'FALSE'], ['=ISTEXT(1/0)', 'FALSE', 'F']],
  LEFT: [['=LEFT("Straße";4)', '"Stra"'], ['=LEFT("abc")', '"a"'], ['=LEFT("abc";-1)', '#VALUE!']],
  LEN: [['=LEN("Straße")', '6'], ['=LEN("😀")', '1'], ['=LEN(NA())', '#N/A']],
  LN: [['=LN(1)', '0'], ['=LN(0)', '#NUM!']],
  LOG10: [['=LOG10(1000)', '3'], ['=LOG10(-1)', '#NUM!']],
  LOWER: [['=LOWER("ÄBC")', '"äbc"'], ['=LOWER(1/0)', '#DIV/0!']],
  MATCH: [
    ['=MATCH(3;[.H1:.H4];0)', '3'],
    ['=MATCH(4;[.H1:.H4])', '3'],
    ['=MATCH("DREI";[.I1:.I4];0)', '3'],
    ['=MATCH(9;[.H1:.H4];0)', '#N/A'],
    ['=MATCH(1;[.H1:.J4];0)', '#N/A'],
    ['=MATCH(1;[.H1:.H4];2)', '#VALUE!'],
  ],
  MAX: [['=MAX([.A1:.A5])', '25'], ['=MAX([.B1:.B2])', '0'], ['=MAX([.E1:.E5])', '#N/A']],
  MEDIAN: [['=MEDIAN(1;3;2;4)', '2.5'], ['=MEDIAN([.D1:.D5])', '3'], ['=MEDIAN([.B1:.B2])', '#NUM!']],
  MID: [['=MID("abcdef";2;3)', '"bcd"'], ['=MID("abc";5;2)', '""'], ['=MID("abc";0;1)', '#VALUE!']],
  MIN: [['=MIN([.A1:.A5])', '-3'], ['=MIN("x")', '#VALUE!']],
  MINUTE: [['=MINUTE([.E2])', '30'], ['=MINUTE("x")', '#VALUE!']],
  MOD: [['=MOD(-7;3)', '2'], ['=MOD(7;-3)', '-2'], ['=MOD(1;0)', '#DIV/0!']],
  MONTH: [['=MONTH([.E1])', '10'], ['=MONTH(-1)', '#NUM!']],
  N: [['=N([.B1])', '0'], ['=N([.C1])', '1'], ['=N(5)', '5'], ['=N([.E3])', '#N/A']],
  NA: [['=ISNA(NA())', 'TRUE'], ['=NA()', '#N/A'], ['=NA(1)', '#VALUE!']],
  NOT: [['=NOT(0)', 'TRUE'], ['=NOT("x")', '#VALUE!']],
  NPER: [['=ROUND(NPER(0.01;-100;1000);2)', '10.59'], ['=NPER(0;-100;1000)', '10'], ['=NPER(0.01;0;1000)', '#NUM!']],
  NPV: [['=ROUND(NPV(0.1;100;100);4)', '173.5537'], ['=NPV(-1;1)', '#DIV/0!']],
  OR: [['=OR(FALSE();0)', 'FALSE'], ['=OR([.C1:.C2])', 'TRUE'], ['=OR("x")', '#VALUE!']],
  PI: [['=PI()', '3.141592653589793'], ['=PI(1)', '#VALUE!']],
  PMT: [['=PMT(0.05/12;360;200000)', '-1073.6432460242795'], ['=PMT(0;10;1000)', '-100'], ['=PMT(0.05;0;1)', '#NUM!']],
  POWER: [['=POWER(2;10)', '1024'], ['=POWER(0;0)', '#NUM!'], ['=POWER(0;-1)', '#DIV/0!'], ['=POWER(-8;1/3)', '#NUM!']],
  PRODUCT: [['=PRODUCT([.D1:.D5])', '120'], ['=PRODUCT([.B1:.B2])', '0'], ['=PRODUCT(2;"x")', '#VALUE!']],
  PROPER: [['=PROPER("hallo welt-x")', '"Hallo Welt-X"'], ['=PROPER(NA())', '#N/A']],
  PV: [['=PV(0;10;-100)', '1000'], ['=ROUND(PV(0.05;10;-100);2)', '772.17'], ['=PV("x";1;1)', '#VALUE!']],
  REPT: [['=REPT("ab";3)', '"ababab"'], ['=REPT("a";-1)', '#VALUE!'], ['=REPT("ab";20000)', '#VALUE!']],
  RIGHT: [['=RIGHT("Straße";3)', '"aße"'], ['=RIGHT("abc";-1)', '#VALUE!']],
  ROUND: [['=ROUND(2.675;2)', '2.68'], ['=ROUND(-2.5;0)', '-3'], ['=ROUND("x";1)', '#VALUE!']],
  ROUNDDOWN: [['=ROUNDDOWN(-2.129;2)', '-2.12'], ['=ROUNDDOWN(1;"x")', '#VALUE!']],
  ROUNDUP: [['=ROUNDUP(2.121;2)', '2.13'], ['=ROUNDUP(-2.121;2)', '-2.13'], ['=ROUNDUP(NA();2)', '#N/A']],
  ROW: [['=ROW([.C5])', '5'], ['=ROW()', '1'], ['=ROW("x")', '#VALUE!']],
  ROWS: [['=ROWS([.A1:.F5])', '5'], ['=ROWS(1/0)', '#DIV/0!']],
  SEARCH: [['=SEARCH("C";"abc")', '3'], ['=SEARCH("*";"a*c")', '2'], ['=SEARCH("z";"abc")', '#VALUE!']],
  SECOND: [['=SECOND([.E2])', '15'], ['=SECOND(TIME(0;0;1.9))', '1'], ['=SECOND("x")', '#VALUE!']],
  SIGN: [['=SIGN(-2)', '-1'], ['=SIGN(0)', '0'], ['=SIGN("x")', '#VALUE!']],
  SQRT: [['=SQRT(16)', '4'], ['=SQRT(-1)', '#NUM!']],
  SUBSTITUTE: [
    ['=SUBSTITUTE("a-b-c";"-";"+")', '"a+b+c"'],
    ['=SUBSTITUTE("a-b-c";"-";"+";2)', '"a-b+c"'],
    ['=SUBSTITUTE("abc";"";"x")', '"abc"'],
    ['=SUBSTITUTE("aBc";"b";"x")', '"aBc"'],
    ['=SUBSTITUTE("abc";"b";"x";0)', '#VALUE!'],
  ],
  SUM: [['=SUM([.A1:.A5])', '32'], ['=SUM([.E1:.E5])', '#N/A'], ['=SUM()', '#VALUE!']],
  SUMIF: [['=SUMIF([.F1:.F5];"Miete";[.D1:.D5])', '7'], ['=SUMIF([.A1:.A5];">0")', '35'], ['=SUMIF([.F1:.F5];"Strom";[.E1:.E5])', '#DIV/0!']],
  SUMIFS: [['=SUMIFS([.D1:.D5];[.F1:.F5];"Kosten";[.A1:.A5];">5")', '1'], ['=SUMIFS([.D1:.D5];[.F1:.F4];"Kosten")', '#VALUE!']],
  SUMPRODUCT: [
    ['=SUMPRODUCT([.D1:.D5];[.D1:.D5])', '55'],
    ['=SUMPRODUCT([.A1:.A5];[.D1:.D5])', '45'],
    ['=SUMPRODUCT([.D1:.D5];[.D1:.D4])', '#VALUE!'],
    ['=SUMPRODUCT([.E1:.E5];[.D1:.D5])', '#N/A'],
  ],
  T: [['=T([.B1])', '"abc"'], ['=T(1)', '""'], ['=T(NA())', '#N/A']],
  TIME: [['=TIME(8;30;0)', '0.3541666666666667'], ['=TIME(25;0;0)', '1.0416666666666667'], ['=TIME(-1;0;0)', '#NUM!']],
  TIMEVALUE: [['=TIMEVALUE("2026-10-11T12:00:00")', '0.5'], ['=TIMEVALUE("8:30")', '#VALUE!']],
  TRIM: [['=TRIM("  a   b  ")', '"a b"'], ['=TRIM(NA())', '#N/A']],
  TRUE: [['=TRUE()', 'TRUE'], ['=TRUE(1)', '#VALUE!']],
  TRUNC: [['=TRUNC(2.789;2)', '2.78'], ['=TRUNC("x")', '#VALUE!']],
  UPPER: [['=UPPER("äb")', '"ÄB"'], ['=UPPER(1/0)', '#DIV/0!']],
  VALUE: [['=VALUE("-1.5e2")', '-150'], ['=VALUE("12%")', '0.12'], ['=VALUE("2026-10-11 12:00")', '46306.5'], ['=VALUE("1,5")', '#VALUE!']],
  VLOOKUP: [
    ['=VLOOKUP(3;[.H1:.J4];2;FALSE())', '"drei"'],
    ['=VLOOKUP(4;[.H1:.J4];3)', '300'],
    ['=VLOOKUP("ZWEI";[.I1:.J4];2;FALSE())', '200'],
    ['=VLOOKUP(9;[.H1:.J4];2;FALSE())', '#N/A'],
    ['=VLOOKUP(1;[.H1:.J4];4)', '#REF!'],
  ],
  WEEKDAY: [['=WEEKDAY(DATE(2026;10;11);11)', '7'], ['=WEEKDAY(DATE(2026;10;11);17)', '1'], ['=WEEKDAY(DATE(2026;10;11);3)', '6'], ['=WEEKDAY(1;4)', '#VALUE!']],
  XOR: [['=XOR(TRUE();TRUE())', 'FALSE'], ['=XOR(TRUE();FALSE();FALSE())', 'TRUE'], ['=XOR("x")', '#VALUE!']],
  YEAR: [['=YEAR([.E1])', '2026'], ['=YEAR("11.10.2026")', '#VALUE!']],
};

/** Test procedures of part 3 without cells, per requirement: [formula, expected]. */
export const SPEC_CASES: Record<string, Array<[string, string]>> = {
  'HPF-SYN-004': [
    ['=if(1;1;0)', '1'],
    ['=IF(1;1;0)', '1'],
    ['=SUM(1,2)', '#NAME?'],
  ],
  'HPF-SYN-005': [
    ['=2+3*4^2', '50'],
    ['=-2^2', '4'],
    ['=[.A1]!1', '#NAME?'],
    ['=[.A1]~[.A2]', '#NAME?'],
  ],
  'HPF-SYN-008': [
    ['=#DIV/0!', '#DIV/0!'],
    ['=#SPILL!', '#NAME?'],
  ],
  'HPF-SYN-009': [
    ['={1;2}', '#NAME?'],
    ['=Mehrwertsteuer*2', '#NAME?'],
    ['=COM.MICROSOFT.XLOOKUP(1;2;3)', '#NAME?'],
  ],
  'HPF-SYN-003': [['="a""b"', '"a\\"b"']],
  'HPF-TYP-001': [
    ['=ISLOGICAL(TRUE())', 'TRUE'],
    ['=ISNUMBER(TRUE())', 'FALSE'],
    ['=ISNUMBER(DATE(2026;1;1))', 'TRUE'],
  ],
  'HPF-TYP-002': [
    ['="3"+4', '#VALUE!'],
    ['=TRUE()+1', '2'],
    ['=VALUE("3")+4', '7'],
  ],
  'HPF-TYP-003': [
    ['=IF(2;"a";"b")', '"a"'],
    ['=IF("TRUE";"a";"b")', '#VALUE!'],
  ],
  'HPF-TYP-004': [
    ['="x"&1.5', '"x1.5"'],
    ['="x"&TRUE()', '"xTRUE"'],
    ['="x"&(1/0)', '#DIV/0!'],
  ],
  'HPF-TYP-005': [
    ['=0.1+0.2=0.3', 'FALSE'],
    ['=1="1"', 'FALSE'],
  ],
  'HPF-TYP-006': [
    ['="Straße"="STRASSE"', 'FALSE'],
    ['="a"<"B"', 'TRUE'],
    ['="ä"<"b"', 'FALSE'],
    ['=EXACT("a";"A")', 'FALSE'],
    ['="Σ"="σ"', 'TRUE'],
    ['="ς"="Σ"', 'TRUE'],
  ],
  'HPF-TYP-007': [
    ['=1<"a"', 'TRUE'],
    ['="a"<TRUE()', 'TRUE'],
    ['=FALSE()<TRUE()', 'TRUE'],
    ['=1<(1/0)', '#DIV/0!'],
  ],
  'HPF-TYP-012': [
    ['=UPPER("straße")', '"STRASSE"'],
    ['=LOWER("İ")', '"i̇"'],
  ],
  'HPF-NUM-001': [
    ['=0.1+0.2', '0.30000000000000004'],
    ['=1-0.9-0.1', '-2.7755575615628914e-17'],
    ['=2^53+1', '9007199254740992'],
  ],
  'HPF-NUM-003': [
    ['=1E308*10', '#NUM!'],
    ['=SQRT(-1)', '#NUM!'],
    ['=1/0', '#DIV/0!'],
    ['=0/0', '#DIV/0!'],
  ],
  'HPF-NUM-004': [
    ['=ROUND(2.675;2)', '2.68'],
    ['=ROUND(1.005;2)', '1.01'],
    ['=ROUND(-2.5;0)', '-3'],
    ['=ROUND(1234.5678;-2)', '1200'],
    ['=ROUNDDOWN(2.675;2)', '2.67'],
    ['=INT(-2.5)', '-3'],
    ['=TRUNC(-2.5)', '-2'],
  ],
  'HPF-NUM-006': [['=19%', '0.19']],
  'HPF-DAT-001': [
    ['=DATE(2026;10;11)', '46306'],
    ['=DATE(1900;3;1)', '61'],
    ['=DATE(1900;1;1)', '2'],
    ['=DATE(9999;12;31)', '2958465'],
    ['=DATE(2000;2;29)', '36585'],
  ],
  'HPF-DAT-002': [
    ['=DATE(10000;1;1)', '#NUM!'],
    ['=DATE(1899;12;29)', '#NUM!'],
    ['=EDATE(DATE(9999;12;31);1)', '#NUM!'],
  ],
  'HPF-DAT-004': [
    ['=DATEVALUE("2026-10-11")', '46306'],
    ['=DATEVALUE("11.10.2026")', '#VALUE!'],
    ['=DATEVALUE("10/11/26")', '#VALUE!'],
    ['=TIMEVALUE("08:30")', '0.3541666666666667'],
    ['=DATEVALUE("2026-10-11T08:30:00")', '46306'],
  ],
  'HPF-DAT-005': [
    ['=NOW()', '#NAME?'],
    ['=TODAY()', '#NAME?'],
  ],
  'HPF-DAT-006': [
    ['=DATE(2026;13;1)', '46388'],
    ['=DATE(2026;2;30)', '46083'],
    ['=EDATE(DATE(2026;1;31);1)', '46081'],
    ['=EOMONTH(DATE(2026;2;10);0)', '46081'],
  ],
  'HPF-DAT-007': [
    ['=WEEKDAY(DATE(2026;10;11))', '1'],
    ['=WEEKDAY(DATE(2026;10;11);2)', '7'],
    ['=ISOWEEKNUM(DATE(2026;10;11))', '41'],
  ],
  'HPF-ERR-002': [
    ['=1+NA()', '#N/A'],
    ['=IFERROR(1/0;"x")', '"x"'],
    ['=COUNTA(NA();1)', '2'],
    ['=IF(TRUE();1;1/0)', '1'],
    ['=(1/0)+NA()', '#DIV/0!'],
  ],
  'HPF-ERR-003': [
    ['=NOW()', '#NAME?'],
    ['=SUM(', '#NAME?'],
    ['=ABS(1;2)', '#VALUE!'],
  ],
  'HPF-FN-003': [
    ['=NOW()', '#NAME?'],
    ['=RAND()', '#NAME?'],
    ['=INDIRECT("A1")', '#NAME?'],
  ],
  'HPF-SYN-011': [['=SUM( 1 ; 2 )', '3']],
};

