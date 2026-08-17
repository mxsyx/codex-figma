/**
 * Resolve every bound design-token variable on a node. Async because
 * resolving a variable id → Variable → Collection requires figma API calls.
 *
 * For each binding we surface: property path, variable name, collection +
 * mode, the resolved value, and the alias chain (when a variable references
 * another variable).
 */
import type { BoundVariableInfo } from '../types.js';
import { safeOptional } from './safe.js';

export async function extractVariables(node: SceneNode): Promise<BoundVariableInfo[]> {
  const raw = safeOptional(() => (node as { boundVariables?: BoundVariablesShape }).boundVariables);
  if (!raw || typeof raw !== 'object') return [];

  type Pending = { property: string; alias: VariableAlias };
  const pending: Pending[] = [];

  for (const [property, aliasOrArray] of Object.entries(raw)) {
    if (!aliasOrArray) continue;
    if (Array.isArray(aliasOrArray)) {
      aliasOrArray.forEach((alias, index) => {
        pending.push({ property: `${property}.${index}`, alias });
      });
    } else {
      pending.push({ property, alias: aliasOrArray });
    }
  }

  const results: BoundVariableInfo[] = [];
  await Promise.all(pending.map((p) => resolveAndPush(p, results)));
  return results;
}

interface BoundVariablesShape {
  [property: string]: VariableAlias | VariableAlias[] | undefined;
}

async function resolveAndPush(
  p: { property: string; alias: VariableAlias },
  results: BoundVariableInfo[],
): Promise<void> {
  const variable = await safeAsync(() => figma.variables.getVariableByIdAsync(p.alias.id));
  if (!variable) return;

  const collection = await safeAsync(() =>
    figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId),
  );
  if (!collection) return;

  const modeId = collection.defaultModeId;
  const mode = collection.modes.find((m) => m.modeId === modeId);
  const rawValue = variable.valuesByMode[modeId];
  const resolved = await resolveValue(rawValue);

  results.push({
    property: p.property,
    variableId: variable.id,
    name: variable.name,
    collectionId: collection.id,
    collectionName: collection.name,
    modeId,
    modeName: mode?.name ?? null,
    resolvedValue: resolved.value,
    aliasOf: resolved.aliasOf,
  });
}

async function resolveValue(raw: unknown): Promise<{ value: unknown; aliasOf: string | null }> {
  if (raw && typeof raw === 'object' && (raw as { type?: string }).type === 'VARIABLE_ALIAS') {
    const aliasId = (raw as { id: string }).id;
    const aliased = await safeAsync(() => figma.variables.getVariableByIdAsync(aliasId));
    if (aliased) {
      // Surface the aliased variable's name as both the value and the alias.
      return { value: aliased.name, aliasOf: aliased.name };
    }
  }
  return { value: raw, aliasOf: null };
}

async function safeAsync<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}
