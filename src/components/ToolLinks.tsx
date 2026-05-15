import { useState } from "react";
import { Plus, Pencil, Trash2, X, Check, ExternalLink, Sparkles } from "lucide-react";
import { cn, hostnameOf } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import CachedFavicon from "@/components/CachedFavicon";

interface ToolLink {
  id: string;
  title: string;
  url: string;
  tag: string;
  description: string;
}

interface ToolLinksProps {
  links: ToolLink[];
  onChange: (links: ToolLink[]) => void;
  className?: string;
}

export default function ToolLinks({
  links,
  onChange,
  className,
}: ToolLinksProps) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    url: "",
    tag: "",
    description: "",
  });

  const handleAdd = () => {
    if (!formData.title.trim() || !formData.url.trim()) return;
    const newLink: ToolLink = {
      id: Date.now().toString(),
      title: formData.title.trim(),
      url: formData.url.trim(),
      tag: formData.tag.trim(),
      description: formData.description.trim(),
    };
    onChange([...links, newLink]);
    setFormData({ title: "", url: "", tag: "", description: "" });
    setAdding(false);
  };

  const handleEdit = (link: ToolLink) => {
    setEditingId(link.id);
    setFormData({
      title: link.title,
      url: link.url,
      tag: link.tag,
      description: link.description,
    });
  };

  const handleSaveEdit = () => {
    if (!formData.title.trim() || !formData.url.trim() || !editingId) return;
    onChange(
      links.map((l) =>
        l.id === editingId
          ? {
              ...l,
              title: formData.title.trim(),
              url: formData.url.trim(),
              tag: formData.tag.trim(),
              description: formData.description.trim(),
            }
          : l
      )
    );
    setEditingId(null);
    setFormData({ title: "", url: "", tag: "", description: "" });
  };

  const handleDelete = (id: string) => {
    if (!confirm(t("discover.confirmDelete"))) return;
    onChange(links.filter((l) => l.id !== id));
  };

  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border bg-card p-2.5 shadow-sm ring-1 ring-black/[0.02] dark:ring-white/[0.04]",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 to-rose-500/20 text-amber-600 ring-1 ring-inset ring-white/30 dark:text-amber-300 dark:ring-white/10">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <h3 className="text-sm font-semibold tracking-tight">
            {t("discover.toolLinks")}
          </h3>
        </div>
        <button
          type="button"
          onClick={() => setEditing(!editing)}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          <Pencil className="h-3 w-3" />
          {editing ? t("common.done") : t("common.edit")}
        </button>
      </div>

      <div className="scrollbar-thin flex-1 space-y-1 overflow-auto">
        {links.map((link) => (
          <div key={link.id}>
            {editingId === link.id ? (
              <div className="space-y-1.5 rounded-lg border bg-background p-2">
                <input
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  placeholder={t("discover.quickLinkTitle")}
                  className="w-full rounded border bg-background px-2 py-1 text-xs"
                />
                <input
                  value={formData.url}
                  onChange={(e) =>
                    setFormData({ ...formData, url: e.target.value })
                  }
                  placeholder="URL"
                  className="w-full rounded border bg-background px-2 py-1 text-xs"
                />
                <input
                  value={formData.tag}
                  onChange={(e) =>
                    setFormData({ ...formData, tag: e.target.value })
                  }
                  placeholder={t("discover.toolLinkTag")}
                  className="w-full rounded border bg-background px-2 py-1 text-xs"
                />
                <input
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder={t("discover.toolLinkDescription")}
                  className="w-full rounded border bg-background px-2 py-1 text-xs"
                />
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    className="flex-1 rounded bg-primary p-1 text-xs text-primary-foreground"
                  >
                    <Check className="mx-auto h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setFormData({ title: "", url: "", tag: "", description: "" });
                    }}
                    className="flex-1 rounded bg-muted p-1 text-xs"
                  >
                    <X className="mx-auto h-3 w-3" />
                  </button>
                </div>
              </div>
            ) : (
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer"
                title={link.url}
                onClick={(e) => editing && e.preventDefault()}
                className={cn(
                  "group/item relative grid grid-cols-[28px_1fr_auto] items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 transition",
                  "hover:-translate-y-px hover:border-border/80 hover:bg-accent/60 hover:shadow-sm"
                )}
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary opacity-0 transition group-hover/item:opacity-100"
                />
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-background to-muted/40 ring-1 ring-border/80 transition group-hover/item:ring-primary/30">
                  <CachedFavicon
                    url={link.url}
                    size={32}
                    className="h-3.5 w-3.5 rounded"
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-medium tracking-tight transition group-hover/item:text-primary">
                      {link.title}
                    </span>
                    <span className="hidden shrink-0 rounded-full bg-muted/80 px-1.5 py-0.5 text-[10px] text-muted-foreground ring-1 ring-border/50 sm:inline">
                      {link.tag}
                    </span>
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground/90">
                    {link.description} · {hostnameOf(link.url)}
                  </div>
                </div>
                {editing ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleEdit(link);
                      }}
                      className="rounded bg-muted p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDelete(link.id);
                      }}
                      className="rounded bg-destructive/10 p-1 text-destructive transition hover:bg-destructive/20"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-60 transition group-hover/item:translate-x-0.5 group-hover/item:text-primary group-hover/item:opacity-100" />
                )}
              </a>
            )}
          </div>
        ))}

        {adding && (
          <div className="space-y-1.5 rounded-lg border bg-background p-2">
            <input
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              placeholder={t("discover.quickLinkTitle")}
              className="w-full rounded border bg-background px-2 py-1 text-xs"
              autoFocus
            />
            <input
              value={formData.url}
              onChange={(e) =>
                setFormData({ ...formData, url: e.target.value })
              }
              placeholder="URL"
              className="w-full rounded border bg-background px-2 py-1 text-xs"
            />
            <input
              value={formData.tag}
              onChange={(e) =>
                setFormData({ ...formData, tag: e.target.value })
              }
              placeholder={t("discover.toolLinkTag")}
              className="w-full rounded border bg-background px-2 py-1 text-xs"
            />
            <input
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder={t("discover.toolLinkDescription")}
              className="w-full rounded border bg-background px-2 py-1 text-xs"
            />
            <div className="flex gap-1">
              <button
                type="button"
                onClick={handleAdd}
                className="flex-1 rounded bg-primary p-1 text-xs text-primary-foreground"
              >
                <Check className="mx-auto h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setFormData({ title: "", url: "", tag: "", description: "" });
                }}
                className="flex-1 rounded bg-muted p-1 text-xs"
              >
                <X className="mx-auto h-3 w-3" />
              </button>
            </div>
          </div>
        )}
      </div>

      {!adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-2 flex items-center justify-center gap-1 rounded-lg border border-dashed border-muted-foreground/30 py-2 text-xs text-muted-foreground transition hover:border-primary hover:bg-primary/5 hover:text-primary"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("common.add")}
        </button>
      )}
    </div>
  );
}
