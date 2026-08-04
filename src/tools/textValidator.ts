import { diffLines } from 'diff';
import { logError, logInfo } from '../utils/logger.js';

export const validateText = (text: string, template: string, opts?: { requestId?: string }): boolean => {
  const changes = diffLines(template ?? '', text ?? '');
  const hasDiff = (changes as Array<{ added?: boolean; removed?: boolean }>).some((c) => Boolean(c.added || c.removed));
  if (!hasDiff) {
    logInfo('Text validation passed', {
      _validation_type: 'text',
      _status: 'success',
      request_id: opts?.requestId
    });
    return true;
  }
  const diffs: string[] = [];
  for (const change of changes as Array<{ added?: boolean; removed?: boolean; value: string }>) {
    if (change.added) {
      diffs.push(`[extra] ${change.value}`);
    } else if (change.removed) {
      diffs.push(`[missing] ${change.value}`);
    }
  }
  logError('Text validation failed: Differences detected', null, {
    _validation_type: 'text',
    _differences: diffs.join('\n'),
    request_id: opts?.requestId
  });
  return false;
}


