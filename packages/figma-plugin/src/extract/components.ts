/** Extract component info for INSTANCE / COMPONENT / COMPONENT_SET nodes. */
import type { ComponentInfo } from '../types.js';
import { safeOptional } from './safe.js';

export function extractComponent(node: SceneNode): ComponentInfo | null {
  if (node.type === 'INSTANCE') {
    const instance = node as InstanceNode;
    const mainComponent = safeOptional(() => instance.mainComponent) ?? null;
    return {
      kind: 'INSTANCE',
      mainComponent: mainComponent
        ? {
            id: mainComponent.id,
            name: mainComponent.name,
            key: safeOptional(() => mainComponent.key),
          }
        : null,
      componentPropertyDefinitions: null,
      componentPropertyReferences: safeOptional(() => instance.componentPropertyReferences) ?? null,
      overrides: null,
    };
  }
  if (node.type === 'COMPONENT') {
    const component = node as ComponentNode;
    return {
      kind: 'COMPONENT',
      mainComponent: {
        id: component.id,
        name: component.name,
        key: safeOptional(() => component.key),
      },
      componentPropertyDefinitions: safeOptional(() => component.componentPropertyDefinitions) ?? null,
      componentPropertyReferences: null,
      overrides: null,
    };
  }
  if (node.type === 'COMPONENT_SET') {
    const set = node as ComponentSetNode;
    return {
      kind: 'COMPONENT_SET',
      mainComponent: {
        id: set.id,
        name: set.name,
        key: safeOptional(() => set.key),
      },
      componentPropertyDefinitions: safeOptional(() => set.componentPropertyDefinitions) ?? null,
      componentPropertyReferences: null,
      overrides: null,
    };
  }
  return null;
}
