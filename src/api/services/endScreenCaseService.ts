import type {
  EndScreenCase,
  CreateEndScreenCaseInput,
  UpdateEndScreenCaseInput,
  EndScreenCaseSnapshot,
  ValidationIssue,
  EndScreenCaseImportRow,
} from '../../types/authoring';
import * as endScreenCaseRepository from '../repositories/endScreenCaseRepository';

export interface EndScreenCaseValidationResult {
  isValid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export async function getEndScreenCases(shellId: string): Promise<EndScreenCase[]> {
  return endScreenCaseRepository.getEndScreenCasesByShellId(shellId);
}

export async function getEnabledEndScreenCases(shellId: string): Promise<EndScreenCase[]> {
  return endScreenCaseRepository.getEnabledEndScreenCasesByShellId(shellId);
}

export async function createEndScreenCase(
  shellId: string,
  input: CreateEndScreenCaseInput
): Promise<EndScreenCase> {
  validateSingleCaseInput(input);
  return endScreenCaseRepository.createEndScreenCase(shellId, input);
}

export async function updateEndScreenCase(
  id: string,
  input: UpdateEndScreenCaseInput
): Promise<EndScreenCase> {
  if (input.min_percentage !== undefined || input.max_percentage !== undefined) {
    const existing = await endScreenCaseRepository.getEndScreenCaseById(id);
    if (existing) {
      validateSingleCaseInput({
        min_percentage: input.min_percentage ?? existing.min_percentage,
        max_percentage: input.max_percentage !== undefined ? input.max_percentage : existing.max_percentage,
        message: input.message ?? existing.message,
      });
    }
  }
  return endScreenCaseRepository.updateEndScreenCase(id, input);
}

export async function deleteEndScreenCase(id: string): Promise<void> {
  return endScreenCaseRepository.deleteEndScreenCase(id);
}

export async function reorderEndScreenCases(
  shellId: string,
  orderedIds: string[]
): Promise<EndScreenCase[]> {
  return endScreenCaseRepository.reorderEndScreenCases(shellId, orderedIds);
}

export async function validateEndScreenCases(shellId: string): Promise<EndScreenCaseValidationResult> {
  const cases = await endScreenCaseRepository.getEndScreenCasesByShellId(shellId);
  return validateCasesSet(cases);
}

export function validateCasesSet(cases: EndScreenCase[]): EndScreenCaseValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const enabledCases = cases.filter(c => c.enabled);

  if (enabledCases.length === 0) {
    warnings.push({
      code: 'NO_ENABLED_CASES',
      message: 'No enabled end screen cases configured. Default fallback message will be used.',
    });
    return { isValid: true, errors, warnings };
  }

  for (const caseItem of enabledCases) {
    if (caseItem.min_percentage < 0 || caseItem.min_percentage > 100) {
      errors.push({
        code: 'INVALID_MIN_PERCENTAGE',
        message: `Case "${caseItem.message.substring(0, 30)}..." has invalid min_percentage: ${caseItem.min_percentage}`,
        field: 'min_percentage',
        context: { case_id: caseItem.id },
      });
    }

    if (caseItem.max_percentage !== null && (caseItem.max_percentage < 0 || caseItem.max_percentage > 100)) {
      errors.push({
        code: 'INVALID_MAX_PERCENTAGE',
        message: `Case "${caseItem.message.substring(0, 30)}..." has invalid max_percentage: ${caseItem.max_percentage}`,
        field: 'max_percentage',
        context: { case_id: caseItem.id },
      });
    }

    if (caseItem.max_percentage !== null && caseItem.min_percentage > caseItem.max_percentage) {
      errors.push({
        code: 'MIN_GREATER_THAN_MAX',
        message: `Case "${caseItem.message.substring(0, 30)}..." has min_percentage (${caseItem.min_percentage}) greater than max_percentage (${caseItem.max_percentage})`,
        field: 'percentage_range',
        context: { case_id: caseItem.id },
      });
    }

    if (!caseItem.message || caseItem.message.trim().length === 0) {
      errors.push({
        code: 'EMPTY_MESSAGE',
        message: 'An enabled end screen case has an empty message',
        field: 'message',
        context: { case_id: caseItem.id },
      });
    }
  }

  const overlaps = findOverlappingRanges(enabledCases);
  for (const overlap of overlaps) {
    errors.push({
      code: 'OVERLAPPING_RANGES',
      message: `Score ranges overlap between "${overlap.case1.message.substring(0, 20)}..." (${overlap.case1.min_percentage}-${overlap.case1.max_percentage ?? 100}) and "${overlap.case2.message.substring(0, 20)}..." (${overlap.case2.min_percentage}-${overlap.case2.max_percentage ?? 100})`,
      field: 'percentage_range',
      context: { case1_id: overlap.case1.id, case2_id: overlap.case2.id },
    });
  }

  const coversZero = enabledCases.some(c => c.min_percentage === 0);
  if (!coversZero) {
    warnings.push({
      code: 'NO_ZERO_COVERAGE',
      message: 'No end screen case covers 0% score. Players with 0 correct answers may see a fallback message.',
    });
  }

  const coversHundred = enabledCases.some(c =>
    c.max_percentage === null || c.max_percentage === 100
  );
  if (!coversHundred) {
    warnings.push({
      code: 'NO_HUNDRED_COVERAGE',
      message: 'No end screen case covers 100% score. Players with perfect scores may see a fallback message.',
    });
  }

  const gaps = findGaps(enabledCases);
  if (gaps.length > 0) {
    for (const gap of gaps) {
      warnings.push({
        code: 'SCORE_GAP',
        message: `Score range ${gap.start}-${gap.end}% is not covered by any end screen case`,
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

function validateSingleCaseInput(input: CreateEndScreenCaseInput): void {
  if (input.min_percentage < 0 || input.min_percentage > 100) {
    throw new Error(`min_percentage must be between 0 and 100, got ${input.min_percentage}`);
  }

  if (input.max_percentage !== null && (input.max_percentage < 0 || input.max_percentage > 100)) {
    throw new Error(`max_percentage must be between 0 and 100 or null, got ${input.max_percentage}`);
  }

  if (input.max_percentage !== null && input.min_percentage > input.max_percentage) {
    throw new Error(`min_percentage (${input.min_percentage}) cannot be greater than max_percentage (${input.max_percentage})`);
  }

  if (!input.message || input.message.trim().length === 0) {
    throw new Error('message cannot be empty');
  }
}

interface OverlapResult {
  case1: EndScreenCase;
  case2: EndScreenCase;
}

function findOverlappingRanges(cases: EndScreenCase[]): OverlapResult[] {
  const overlaps: OverlapResult[] = [];

  for (let i = 0; i < cases.length; i++) {
    for (let j = i + 1; j < cases.length; j++) {
      const a = cases[i];
      const b = cases[j];

      const aMax = a.max_percentage ?? 100;
      const bMax = b.max_percentage ?? 100;

      if (a.min_percentage <= bMax && aMax >= b.min_percentage) {
        overlaps.push({ case1: a, case2: b });
      }
    }
  }

  return overlaps;
}

interface Gap {
  start: number;
  end: number;
}

function findGaps(cases: EndScreenCase[]): Gap[] {
  if (cases.length === 0) return [{ start: 0, end: 100 }];

  const sorted = [...cases].sort((a, b) => a.min_percentage - b.min_percentage);
  const gaps: Gap[] = [];

  if (sorted[0].min_percentage > 0) {
    gaps.push({ start: 0, end: sorted[0].min_percentage - 1 });
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const currentMax = sorted[i].max_percentage ?? 100;
    const nextMin = sorted[i + 1].min_percentage;

    if (currentMax + 1 < nextMin) {
      gaps.push({ start: currentMax + 1, end: nextMin - 1 });
    }
  }

  const lastMax = sorted[sorted.length - 1].max_percentage ?? 100;
  if (lastMax < 100) {
    gaps.push({ start: lastMax + 1, end: 100 });
  }

  return gaps;
}

export function matchEndScreenCase(
  cases: EndScreenCaseSnapshot[],
  percentage: number
): EndScreenCaseSnapshot | null {
  for (const caseItem of cases) {
    const maxPct = caseItem.max_percentage ?? 100;
    if (percentage >= caseItem.min_percentage && percentage <= maxPct) {
      return caseItem;
    }
  }
  return null;
}

export function casesToSnapshots(cases: EndScreenCase[]): EndScreenCaseSnapshot[] {
  return cases
    .filter(c => c.enabled)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(c => ({
      id: c.id,
      min_percentage: c.min_percentage,
      max_percentage: c.max_percentage,
      message: c.message,
      share_text_override: c.share_text_override,
    }));
}

export interface ImportResult {
  success: boolean;
  created: number;
  errors: { row: number; message: string }[];
}

export async function importEndScreenCasesFromCSV(
  shellId: string,
  rows: EndScreenCaseImportRow[],
  replaceExisting: boolean = false
): Promise<ImportResult> {
  const errors: { row: number; message: string }[] = [];
  const validCases: CreateEndScreenCaseInput[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    try {
      const minPct = parseInt(row.min_percentage, 10);
      const maxPct = row.max_percentage === '' || row.max_percentage === 'null'
        ? null
        : parseInt(row.max_percentage, 10);
      const enabled = row.enabled.toLowerCase() === 'true' || row.enabled === '1';

      if (isNaN(minPct) || minPct < 0 || minPct > 100) {
        errors.push({ row: rowNum, message: `Invalid min_percentage: ${row.min_percentage}` });
        continue;
      }

      if (maxPct !== null && (isNaN(maxPct) || maxPct < 0 || maxPct > 100)) {
        errors.push({ row: rowNum, message: `Invalid max_percentage: ${row.max_percentage}` });
        continue;
      }

      if (maxPct !== null && minPct > maxPct) {
        errors.push({ row: rowNum, message: `min_percentage cannot be greater than max_percentage` });
        continue;
      }

      if (!row.message || row.message.trim().length === 0) {
        errors.push({ row: rowNum, message: 'message cannot be empty' });
        continue;
      }

      validCases.push({
        min_percentage: minPct,
        max_percentage: maxPct,
        message: row.message.trim(),
        enabled,
        sort_order: i,
      });
    } catch (err) {
      errors.push({ row: rowNum, message: (err as Error).message });
    }
  }

  if (validCases.length === 0) {
    return { success: false, created: 0, errors };
  }

  if (replaceExisting) {
    await endScreenCaseRepository.deleteAllEndScreenCases(shellId);
  }

  const created = await endScreenCaseRepository.bulkCreateEndScreenCases(shellId, validCases);

  return {
    success: errors.length === 0,
    created: created.length,
    errors,
  };
}

export async function importEndScreenCasesFromJSON(
  shellId: string,
  data: Array<{
    min_percentage: number;
    max_percentage: number | null;
    message: string;
    enabled?: boolean;
  }>,
  replaceExisting: boolean = false
): Promise<ImportResult> {
  const errors: { row: number; message: string }[] = [];
  const validCases: CreateEndScreenCaseInput[] = [];

  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    const rowNum = i + 1;

    try {
      if (item.min_percentage < 0 || item.min_percentage > 100) {
        errors.push({ row: rowNum, message: `Invalid min_percentage: ${item.min_percentage}` });
        continue;
      }

      if (item.max_percentage !== null && (item.max_percentage < 0 || item.max_percentage > 100)) {
        errors.push({ row: rowNum, message: `Invalid max_percentage: ${item.max_percentage}` });
        continue;
      }

      if (item.max_percentage !== null && item.min_percentage > item.max_percentage) {
        errors.push({ row: rowNum, message: `min_percentage cannot be greater than max_percentage` });
        continue;
      }

      if (!item.message || item.message.trim().length === 0) {
        errors.push({ row: rowNum, message: 'message cannot be empty' });
        continue;
      }

      validCases.push({
        min_percentage: item.min_percentage,
        max_percentage: item.max_percentage,
        message: item.message.trim(),
        enabled: item.enabled ?? true,
        sort_order: i,
      });
    } catch (err) {
      errors.push({ row: rowNum, message: (err as Error).message });
    }
  }

  if (validCases.length === 0) {
    return { success: false, created: 0, errors };
  }

  if (replaceExisting) {
    await endScreenCaseRepository.deleteAllEndScreenCases(shellId);
  }

  const created = await endScreenCaseRepository.bulkCreateEndScreenCases(shellId, validCases);

  return {
    success: errors.length === 0,
    created: created.length,
    errors,
  };
}
