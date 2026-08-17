/**
 * In-memory + on-disk cache of the latest Figma selection payload.
 *
 * The store is intentionally simple: a single in-memory snapshot mirrors
 * what's on disk so MCP tool reads are fast, while every write also hits
 * disk so a user can `cat ~/Library/Caches/codex-figma-bridge/current-selection.json`
 * to see exactly what the agent sees.
 */
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { appendFileSync } from "node:fs";
import { type BridgePaths, safeNodeId, assetFileName } from "./paths.js";
import type { Logger } from "../util/logger.js";
import {
  type CapturedSelection,
  type SelectionEntry,
  type SerializedNode,
  type AssetPayload,
  type BoundVariable,
} from "./schema.js";

export interface GetNodeOptions {
  depth?: number;
  includeStyles?: boolean;
  includeVariables?: boolean;
  includeText?: boolean;
}

export interface SelectionSummary {
  fileKey: string;
  fileName: string;
  pageId: string;
  pageName: string;
  capturedAt: string;
  pluginVersion: string;
  selectionCount: number;
  selection: SelectionEntry[];
}

export interface NodeSearchHit {
  id: string;
  name: string;
  type: string;
  depth: number;
  parentId: string | null;
}

export interface VariableRow {
  nodeId: string;
  nodeName: string;
  property: string;
  variableId: string;
  name: string;
  collectionName: string | undefined;
  modeName: string | null | undefined;
  resolvedValue: unknown;
  aliasOf: string | null | undefined;
}

export class ContextStore {
  private selection: SelectionSummary | null = null;
  private nodes = new Map<string, SerializedNode>();
  private assets = new Map<string, AssetPayload>();

  constructor(
    private readonly paths: BridgePaths,
    private readonly log: Logger,
  ) {}

  // --- Writes -------------------------------------------------------------

  async setSelection(payload: CapturedSelection): Promise<SelectionSummary> {
    const summary: SelectionSummary = {
      fileKey: payload.fileKey,
      fileName: payload.fileName,
      pageId: payload.pageId,
      pageName: payload.pageName,
      capturedAt: payload.capturedAt,
      pluginVersion: payload.pluginVersion,
      selectionCount: payload.selection.length,
      selection: payload.selection,
    };

    this.selection = summary;
    this.nodes.clear();
    this.assets.clear();

    for (const [id, node] of Object.entries(payload.nodes)) {
      this.nodes.set(id, node);
      await this.writeJson(
        join(this.paths.nodesDir, `${safeNodeId(id)}.json`),
        node,
      );
    }

    for (const [id, asset] of Object.entries(payload.assets)) {
      this.assets.set(id, asset);
      await fs.writeFile(
        join(this.paths.assetsDir, assetFileName(id, asset.format)),
        Buffer.from(asset.base64, "base64"),
      );
    }

    await this.writeJson(this.paths.currentSelection, summary);
    this.appendEvent("selection-change", {
      capturedAt: summary.capturedAt,
      fileKey: summary.fileKey,
      pageId: summary.pageId,
      selectionCount: summary.selectionCount,
    });

    this.log.info("selection stored", {
      fileKey: summary.fileKey,
      page: summary.pageName,
      count: summary.selectionCount,
      nodes: this.nodes.size,
      assets: this.assets.size,
    });

    return summary;
  }

  /**
   * Incrementally add a single node (on-demand fetch) without clearing the
   * existing selection cache. Used by POST /node when the plugin responds to
   * a fetch-node-request.
   */
  async addNode(nodeId: string, node: SerializedNode): Promise<void> {
    this.nodes.set(nodeId, node);
    await this.writeJson(
      join(this.paths.nodesDir, `${safeNodeId(nodeId)}.json`),
      node,
    );
    this.log.info("node fetched on demand", {
      nodeId,
      type: node.type,
      nodes: this.nodes.size,
    });
  }

  /**
   * Incrementally add assets (PNG/SVG) for an on-demand fetched node without
   * clearing existing assets.
   */
  async addAssets(assets: Record<string, AssetPayload>): Promise<void> {
    for (const [id, asset] of Object.entries(assets)) {
      this.assets.set(id, asset);
      await fs.writeFile(
        join(this.paths.assetsDir, assetFileName(id, asset.format)),
        Buffer.from(asset.base64, "base64"),
      );
    }
  }

  // --- Reads --------------------------------------------------------------

  getSelection(): SelectionSummary | null {
    return this.selection;
  }

  getNode(nodeId: string, opts: GetNodeOptions = {}): SerializedNode | null {
    const root = this.nodes.get(nodeId);
    if (!root) return null;
    return pruneNode(root, opts);
  }

  /** Returns the node IDs of every captured root (top of each stored tree). */
  listRoots(): string[] {
    return Array.from(this.nodes.keys());
  }

  getScreenshot(
    nodeId: string,
    format: "PNG" | "SVG" = "PNG",
  ): AssetPayload | null {
    const asset = this.assets.get(nodeId);
    if (!asset) return null;
    if (asset.format === format) return asset;
    // If the requested format doesn't match what's cached, prefer the cached
    // one over returning nothing — the agent can still decode it.
    return asset;
  }

  getAsset(nodeId: string, format: "PNG" | "SVG" = "SVG"): AssetPayload | null {
    return this.getScreenshot(nodeId, format);
  }

  /** Absolute path to the cached asset file on disk (for clients that can't render MCP image content). */
  getAssetPath(nodeId: string): string | null {
    const asset = this.assets.get(nodeId);
    if (!asset) return null;
    return join(this.paths.assetsDir, assetFileName(nodeId, asset.format));
  }

  listNodes(filter: { type?: string; name?: string } = {}): NodeSearchHit[] {
    const hits: NodeSearchHit[] = [];
    const nameLower = filter.name?.toLowerCase();
    for (const root of this.nodes.values()) {
      walk(root, null, (node, parentId) => {
        if (filter.type && node.type !== filter.type) return;
        if (nameLower && !node.name.toLowerCase().includes(nameLower)) return;
        hits.push({
          id: node.id,
          name: node.name,
          type: node.type,
          depth: node.depth,
          parentId,
        });
      });
    }
    return hits;
  }

  getVariables(filter: { collectionName?: string } = {}): VariableRow[] {
    const rows: VariableRow[] = [];
    for (const root of this.nodes.values()) {
      walk(root, null, (node) => {
        for (const v of node.variables) {
          if (
            filter.collectionName &&
            v.collectionName !== filter.collectionName
          )
            continue;
          rows.push({
            nodeId: node.id,
            nodeName: node.name,
            property: v.property,
            variableId: v.variableId,
            name: v.name,
            collectionName: v.collectionName,
            modeName: v.modeName,
            resolvedValue: v.resolvedValue,
            aliasOf: v.aliasOf,
          });
        }
      });
    }
    return rows;
  }

  // --- Internal helpers ---------------------------------------------------

  private async writeJson(path: string, value: unknown): Promise<void> {
    try {
      await fs.writeFile(path, JSON.stringify(value, null, 2));
    } catch (err) {
      this.log.error("failed to write cache file", {
        path,
        error: String(err),
      });
    }
  }

  private appendEvent(type: string, data: unknown): void {
    try {
      appendFileSync(
        this.paths.eventsLog,
        JSON.stringify({ ts: new Date().toISOString(), type, data }) + "\n",
      );
    } catch {
      // Events log is best-effort.
    }
  }
}

// --- Pure helpers ---------------------------------------------------------

function walk(
  node: SerializedNode,
  parentId: string | null,
  visit: (node: SerializedNode, parentId: string | null) => void,
): void {
  visit(node, parentId);
  if (node.children) {
    for (const child of node.children) {
      walk(child, node.id, visit);
    }
  }
}

function pruneNode(node: SerializedNode, opts: GetNodeOptions): SerializedNode {
  const maxDepth = opts.depth ?? Number.POSITIVE_INFINITY;
  const includeStyles = opts.includeStyles ?? true;
  const includeVariables = opts.includeVariables ?? true;
  const includeText = opts.includeText ?? true;

  const prune = (n: SerializedNode, depth: number): SerializedNode => ({
    id: n.id,
    name: n.name,
    type: n.type,
    visible: n.visible,
    x: n.x,
    y: n.y,
    width: n.width,
    height: n.height,
    rotation: n.rotation,
    depth: n.depth,
    layout: n.layout,
    styles: includeStyles ? n.styles : null,
    text: includeText ? n.text : null,
    variables: includeVariables ? n.variables : [],
    component: n.component,
    children:
      n.children && depth < maxDepth
        ? n.children.map((c) => prune(c, depth + 1))
        : n.children && depth >= maxDepth
          ? null // truncate subtree at depth limit
          : null,
  });

  return prune(node, 0);
}
