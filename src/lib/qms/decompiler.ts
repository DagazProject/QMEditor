import { Jump, Location, QM, QMParam } from "../qmreader";

// ======================== Вспомогательные функции ========================

/**
 * Проверяет, является ли строка пустой (игнорируя пробельные символы).
 */
function isEmpty(s: string): boolean {
  return s.trim() === "";
}

/**
 * Преобразует внутренние маркеры обратно в синтаксис исходного языка.
 * @param s - исходная строка
 * @param varId - ID переменной (если нужно экранировать $ для текстов переменных)
 */
function prepareText(s: string, varId: number | null): string {
  let result = s.replace(/\[p(\d+)\]/g, '$p$1');
  if (varId) {
    result = result.replace(/<>/g, '$');
    result = result.replace(/\*/g, '\\*');
  }
  result = result
    .replace(/<fix>/g, '^')
    .replace(/<\/fix>/g, '^')
    .replace(/<clr>/g, '%')
    .replace(/<clrEnd>/g, '%');

  // Восстанавливаем формулы: <<...>> -> {...}
  result = result.replace(/<<([^>]+)>>/g, '{$1}');

  return result;
}

/**
 * Формирует строку вида `#show:p1;p2` или `#hide:p1;p2`.
 */
function buildShowHideString(changes: QMParam["paramsChanges"][0][], paramsCount: number, type: 1 | 2): string {
  const names: string[] = [];
  for (let i = 0; i < Math.min(changes.length, paramsCount); i++) {
    if (changes[i].showingType === type) {
      names.push(`p${i + 1}`);
    }
  }
  return names.length > 0 ? ` #${type === 1 ? "show" : "hide"}:${names.join(";")}` : "";
}

/**
 * Генерирует строки с присваиваниями параметров для локации или перехода.
 */
function buildParamAssignments(
  changes: QMParam["paramsChanges"][0][],
  paramsCount: number,
  indent: string = ""
): string {
  const lines: string[] = [];
  for (let i = 0; i < Math.min(changes.length, paramsCount); i++) {
    const c = changes[i];
    const varName = `p${i + 1}`;
    if (c.isChangeFormula) {
      const formula = prepareText(c.changingFormula, null);
      lines.push(`${indent}$${varName}=${formula}`);
    } else if (c.isChangeValue) {
      lines.push(`${indent}$${varName}=${c.change}`);
    } else if (c.change !== 0) {
      const op = c.change > 0 ? "+" : "-";
      const value = Math.abs(c.change);
      lines.push(`${indent}$${varName}=$${varName}${op}${value}`);
    }
  }
  return lines.join("\n");
}

// ======================== Генерация секций QM ========================

function generateIntroAndCongrats(qm: QM): string {
  let result = "";
  if (qm.taskText) {
    result += `#intro\n${qm.taskText}\n\n`;
  }
  if (qm.successText) {
    result += `#congratulation\n${qm.successText}\n\n`;
  }
  return result;
}

function generateParams(qm: QM): string {
  let result = "";
  const count = Math.min(qm.params.length, qm.paramsCount);
  for (let i = 0; i < count; i++) {
    const p = qm.params[i];
    const varId = i + 1;

    // Основное объявление
    let line = `#var:p${varId} #range:${p.min}..${p.max} #default:${p.starting} #order:${varId}`;
    if (p.isMoney) {
      line += " #money";
    }
    if (p.showWhenZero) {
      line += " #zero";
    }
    if (!p.active) {
      line += " #hide";
    }
    line += ` // ${p.name}`;
    result += line + "\n";

    // Текстовые диапазоны
    for (const range of p.showingInfo) {
      const text = prepareText(range.str, varId);
      result += `  #text:${range.from}..${range.to} '${text}'\n`;
    }

    // Критические значения (win/lose/death)
    if (p.type > 0) {
      let msgLine = "  #message:";
      if (p.critType === 0) {
        msgLine += `-${p.max}`;
      } else {
        msgLine += `+${p.min}`;
      }
      if (p.type === 1) {
        msgLine += " #lose";
      } else if (p.type === 2) {
        msgLine += " #win";
      } else if (p.type === 3) {
        msgLine += " #death";
      }

      if (p.critValueString) {
        if (p.critValueString.includes("\n")) {
          result += msgLine + "\n" + p.critValueString + "\n";
        } else {
          result += `${msgLine}:'${p.critValueString}'\n`;
        }
      } else {
        result += msgLine + "\n";
      }
    }
  }
  return result ? result + "\n" : "";
}

function generateLocations(qm: QM): string {
  let result = "";
  const locCount = Math.min(qm.locations.length, qm.locationsCount);

  for (let i = 0; i < locCount; i++) {
    const loc = qm.locations[i];
    let header = `#site:L${loc.id}`;

    // Спецификации
    if (loc.isStarting) {
      header += " #default";
    }
    if (loc.isSuccess) {
      header += " #win";
    }
    if (loc.isFaily) {
      header += " #lose";
    }
    if (loc.isFailyDeadly) {
      header += " #death";
    }
    if (loc.dayPassed) {
      header += " #day";
    }

    // Формула выбора текста
    if (loc.isTextByFormula) {
      const formula = prepareText(loc.textSelectFormula, null);
      header += ` {${formula}}`;
    }

    // Show/Hide
    header += buildShowHideString(loc.paramsChanges, qm.paramsCount, 1);
    header += buildShowHideString(loc.paramsChanges, qm.paramsCount, 2);

    result += header + "\n";

    // Страницы с текстом
    for (let pageIdx = 0; pageIdx < loc.texts.length; pageIdx++) {
      if (isEmpty(loc.texts[pageIdx])) {
        continue;
      }
      result += `#page:${pageIdx + 1}\n`;
      result += prepareText(loc.texts[pageIdx], null) + "\n";
    }

    // Присваивания параметров на локации
    const assignments = buildParamAssignments(loc.paramsChanges, qm.paramsCount);
    if (assignments) {
      result += assignments + "\n";
    }

    // Переходы (кейсы)
    for (let j = 0; j < Math.min(qm.jumps.length, qm.jumpsCount); j++) {
      const jump = qm.jumps[j];
      if (jump.fromLocationId !== loc.id) {
        continue;
      }

      let caseLine = `#case:L${jump.toLocationId}`;

      if (!isEmpty(jump.text)) {
        caseLine += ` '${prepareText(jump.text, null)}'`;
      }
      if (!isEmpty(jump.formulaToPass)) {
        caseLine += ` {${prepareText(jump.formulaToPass, null)}}`;
      }
      caseLine += ` #order:${jump.showingOrder} #priority:${jump.priority}`;
      if (jump.dayPassed) {
        caseLine += " #day";
      }
      if (jump.jumpingCountLimit > 0) {
        caseLine += ` #count:${jump.jumpingCountLimit}`;
      }

      caseLine += buildShowHideString(jump.paramsChanges, qm.paramsCount, 1);
      caseLine += buildShowHideString(jump.paramsChanges, qm.paramsCount, 2);

      result += caseLine + "\n";

      // Описание перехода (если есть)
      if (jump.description) {
        result += prepareText(jump.description, null) + "\n";
      }

      // Присваивания параметров внутри перехода
      const jumpAssignments = buildParamAssignments(jump.paramsChanges, qm.paramsCount);
      if (jumpAssignments) {
        result += jumpAssignments + "\n";
      }
    }

    result += "\n";
  }

  return result;
}

function generatePositions(qm: QM): string {
  let result = "";
  const locCount = Math.min(qm.locations.length, qm.locationsCount);
  for (let i = 0; i < locCount; i++) {
    const loc = qm.locations[i];
    result += `#position:L${loc.id}:${loc.locX}:${loc.locY}\n`;
  }
  return result;
}

// ======================== Основная функция ========================

export function decompileQms(qm: QM): string {
  const parts: string[] = [];

  parts.push(generateIntroAndCongrats(qm));
  parts.push(generateParams(qm));
  parts.push(generateLocations(qm));
  parts.push(generatePositions(qm));

  return parts.join("");
}
