import { useMemo } from "react";
import type { BookmarkNode } from "@/types";
import { cn } from "@/lib/utils";
import { ChevronRight, Folder, FolderOpen, Pin, PinOff } from "lucide-react";

export interface FolderTreeProps {
  tree: BookmarkNode[];
  selectedId?: string;
  expanded: Set<string>;
  pinnedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string | "") => void;
  onTogglePin: (id: string) => void;
}

interface FolderItem {
  id: string;
  title: string;
  depth: number;
  count: number;
  hasChildren: boolean;
  parentChain: string[];
}

export default function FolderTree(props: FolderTreeProps) {
  const {
    tree,
    selectedId,
    expanded,
    pinnedIds,
    onToggle,
    onSelect,
    onTogglePin,
  } = props;

  const items = useMemo(() => flattenForTree(tree, expanded), [tree, expanded]);

  return (
    <div className="space-y-0.5 text-sm">
      <button
        onClick={() => onSelect("")}
        className={cn(
          "relative flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/60",
          !selectedId
            ? "bg-primary/10 font-medium text-primary before:absolute before:inset-y-1 before:left-0 before:w-[2px] before:rounded-full before:bg-primary"
            : "text-foreground/85",
        )}
      >
        <Folder
          className={cn(
            "h-4 w-4 transition-colors",
            !selectedId ? "text-primary" : "text-primary/60",
          )}
        />
        <span className="flex-1 truncate">全部书签</span>
      </button>

      {items.map((f) => {
        const isExpanded = expanded.has(f.id);
        const isSelected = selectedId === f.id;
        const isPinned = pinnedIds.has(f.id);
        return (
          <div
            key={f.id}
            className={cn(
              "group relative flex items-center gap-1 rounded-md pr-1 transition-colors hover:bg-muted/60",
              isSelected &&
                "bg-primary/10 text-primary before:absolute before:inset-y-1 before:left-0 before:w-[2px] before:rounded-full before:bg-primary",
            )}
            style={{ paddingLeft: Math.max(0, f.depth - 1) * 14 + "px" }}
          >
            <button
              type="button"
              onClick={() => f.hasChildren && onToggle(f.id)}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition hover:bg-background/60",
                !f.hasChildren && "invisible",
              )}
              aria-label="toggle"
            >
              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  isExpanded && "rotate-90",
                )}
              />
            </button>
            <button
              onClick={() => onSelect(f.id)}
              className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
              title={f.title}
            >
              {isExpanded ? (
                <FolderOpen
                  className={cn(
                    "h-4 w-4 shrink-0 transition-colors",
                    isSelected ? "text-primary" : "text-primary/75",
                  )}
                />
              ) : (
                <Folder
                  className={cn(
                    "h-4 w-4 shrink-0 transition-colors",
                    isSelected ? "text-primary" : "text-primary/55",
                  )}
                />
              )}
              <span
                className={cn("flex-1 truncate", isSelected && "font-medium")}
              >
                {f.title || "(未命名)"}
              </span>
              <span
                className={cn(
                  "shrink-0 text-[11px] tabular-nums transition-colors",
                  isSelected
                    ? "text-primary/80"
                    : "text-muted-foreground",
                )}
              >
                {f.count}
              </span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin(f.id);
              }}
              className={cn(
                "h-6 w-6 rounded text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-background/60",
                isPinned && "opacity-100 text-primary",
              )}
              title={isPinned ? "取消置顶" : "置顶"}
            >
              {isPinned ? (
                <Pin className="mx-auto h-3.5 w-3.5" />
              ) : (
                <PinOff className="mx-auto h-3.5 w-3.5" />
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function flattenForTree(
  tree: BookmarkNode[],
  expanded: Set<string>,
): FolderItem[] {
  const out: FolderItem[] = [];
  const walk = (
    node: BookmarkNode,
    depth: number,
    parentChain: string[],
  ) => {
    if (!node.url && node.id !== "0") {
      const children = node.children ?? [];
      const subFolders = children.filter((c) => !c.url);
      const count = countBookmarks(node);
      out.push({
        id: node.id,
        title: node.title || "(未命名)",
        depth,
        count,
        hasChildren: subFolders.length > 0,
        parentChain,
      });
      if (expanded.has(node.id)) {
        for (const c of subFolders) walk(c, depth + 1, [...parentChain, node.id]);
      }
    } else if (node.id === "0") {
      for (const c of node.children ?? []) walk(c, 1, []);
    }
  };
  for (const n of tree) walk(n, 1, []);
  return out;
}

function countBookmarks(n: BookmarkNode): number {
  if (n.url) return 1;
  return (n.children ?? []).reduce((s, c) => s + countBookmarks(c), 0);
}
