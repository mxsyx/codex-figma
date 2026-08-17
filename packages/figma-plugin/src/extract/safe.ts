/** Defensive property access — Figma nodes have very heterogeneous shapes. */
export function safe<T>(fn: () => T, fallback: T): T {
  try {
    const value = fn();
    return value === undefined || value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

export function safeOptional<T>(fn: () => T): NonNullable<T> | undefined {
  try {
    const value = fn();
    return value === undefined || value === null ? undefined : (value as NonNullable<T>);
  } catch {
    return undefined;
  }
}

export function isFrameLike(node: SceneNode): node is FrameNode | ComponentNode | InstanceNode {
  return (
    node.type === 'FRAME' ||
    node.type === 'COMPONENT' ||
    node.type === 'COMPONENT_SET' ||
    node.type === 'INSTANCE'
  );
}

export function isVectorLike(node: SceneNode): boolean {
  return (
    node.type === 'VECTOR' ||
    node.type === 'STAR' ||
    node.type === 'LINE' ||
    node.type === 'POLYGON' ||
    node.type === 'BOOLEAN_OPERATION' ||
    node.type === 'ELLIPSE' ||
    node.type === 'RECTANGLE' ||
    node.type === 'TEXT'
  );
}
