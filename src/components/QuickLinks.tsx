import { useState } from "react";
import { Plus, Pencil, Trash2, X, Check } from "lucide-react";
import { cn, faviconOf, hostnameOf } from "@/lib/utils";
import { useT } from "@/lib/i18n";

interface QuickLink {
  id: string;
  title: string;
  url: string;
}

interface QuickLinksProps {
  links: QuickLink[];
  onChange: (links: QuickLink[]) => void;
  className?: string;
}

export default function QuickLinks({
  links,
  onChange,
  className,
}: QuickLinksProps) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ title: "", url: "" });

  const handleAdd = () => {
    if (!formData.title.trim() || !formData.url.trim()) return;
    const newLink: QuickLink = {
      id: Date.now().toString(),
      title: formData.title.trim(),
      url: formData.url.trim(),
    };
    onChange([...links, newLink]);
    setFormData({ title: "", url: "" });
    setAdding(false);
  };

  const handleEdit = (link: QuickLink) => {
    setEditingId(link.id);
    setFormData({ title: link.title, url: link.url });
  };

  const handleSaveEdit = () => {
    if (!formData.title.trim() || !formData.url.trim() || !editingId) return;
    onChange(
      links.map((l) =>
        l.id === editingId
          ? { ...l, title: formData.title.trim(), url: formData.url.trim() }
          : l
      )
    );
    setEditingId(null);
    setFormData({ title: "", url: "" });
  };

  const handleDelete = (id: string) => {
    if (!confirm(t("discover.confirmDelete"))) return;
    onChange(links.filter((l) => l.id !== id));
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-tight">
          {t("discover.quickLinks")}
        </h3>
        <button
          type="button"
          onClick={() => setEditing(!editing)}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          <Pencil className="h-3 w-3" />
          {editing ? t("common.done") : t("common.edit")}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {links.map((link) => (
          <div
            key={link.id}
            className={cn(
              "group relative flex items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-sm transition",
              editing && "pr-16"
            )}
          >
            {editingId === link.id ? (
              <div className="flex items-center gap-2">
                <input
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  placeholder={t("discover.quickLinkTitle")}
                  className="w-24 rounded border bg-background px-2 py-1 text-xs"
                />
                <input
                  value={formData.url}
                  onChange={(e) =>
                    setFormData({ ...formData, url: e.target.value })
                  }
                  placeholder="URL"
                  className="w-32 rounded border bg-background px-2 py-1 text-xs"
                />
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className="rounded bg-primary p-1 text-primary-foreground"
                >
                  <Check className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setFormData({ title: "", url: "" });
                  }}
                  className="rounded bg-muted p-1"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2"
                  onClick={(e) => editing && e.preventDefault()}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-background to-muted/40 ring-1 ring-border/60">
                    <img
                      src={faviconOf(link.url, 32)}
                      alt=""
                      className="h-4 w-4 rounded"
                      onError={(e) => {
                        const img = e.currentTarget;
                        const u = new URL(link.url);
                        const fallbacks = [
                          `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=32`,
                          `https://icons.duckduckgo.com/ip3/${u.hostname}.ico`,
                        ];
                        const attempt = parseInt(img.dataset.attempt || "0");
                        if (attempt < fallbacks.length) {
                          img.dataset.attempt = String(attempt + 1);
                          img.src = fallbacks[attempt];
                        } else {
                          img.style.visibility = "hidden";
                        }
                      }}
                    />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{link.title}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {hostnameOf(link.url)}
                    </span>
                  </div>
                </a>
                {editing && (
                  <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleEdit(link)}
                      className="rounded bg-muted p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(link.id)}
                      className="rounded bg-destructive/10 p-1 text-destructive transition hover:bg-destructive/20"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        ))}

        {adding ? (
          <div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2">
            <input
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              placeholder={t("discover.quickLinkTitle")}
              className="w-24 rounded border bg-background px-2 py-1 text-xs"
              autoFocus
            />
            <input
              value={formData.url}
              onChange={(e) =>
                setFormData({ ...formData, url: e.target.value })
              }
              placeholder="URL"
              className="w-32 rounded border bg-background px-2 py-1 text-xs"
            />
            <button
              type="button"
              onClick={handleAdd}
              className="rounded bg-primary p-1 text-primary-foreground"
            >
              <Check className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setFormData({ title: "", url: "" });
              }}
              className="rounded bg-muted p-1"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex h-[52px] w-[52px] items-center justify-center rounded-xl border border-dashed border-muted-foreground/30 text-muted-foreground transition hover:border-primary hover:bg-primary/5 hover:text-primary"
          >
            <Plus className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}
