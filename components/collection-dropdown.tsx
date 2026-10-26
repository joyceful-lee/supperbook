"use client";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, FolderPlus, LoaderCircle, Plus } from "lucide-react";
type Props = {
  options: string[];
  value: string[];
  onChange?: (names: string[]) => void;
  onCommit?: (names: string[]) => Promise<void>;
  onBeforeOpen?: () => boolean;
  variant?: "field" | "tile";
  recipeTitle?: string;
  disabled?: boolean;
};
export default function CollectionDropdown({ options, value, onChange, onCommit, onBeforeOpen, variant = "field", recipeTitle, disabled = false }: Props) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const names = [...new Set([...options, ...value, ...pending])].filter(name => name !== "Unfiled").sort((a,b) => a.localeCompare(b));
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!saving && event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, saving]);
  function change(next: string[]) {
    setPending(next);
    onChange?.(next);
  }
  function addCollection() {
    const name = newName.trim().replace(/\s+/g, " ");
    if (!name) return;
    if (["unfiled","all recipes","favorites","archived"].includes(name.toLowerCase())) {
      setError("Please choose a different collection name."); return;
    }
    const existing = names.find(value => value.toLowerCase() === name.toLowerCase()) || name;
    if (!pending.includes(existing)) {
      if (pending.length >= 30) { setError("A recipe can belong to up to 30 collections."); return; }
      change([...pending, existing]);
    }
    setNewName(""); setError("");
  }
  async function done() {
    if (!onCommit) { setOpen(false); trigger.current?.focus(); return; }
    setSaving(true); setError("");
    try { await onCommit(pending); setOpen(false); trigger.current?.focus(); }
    catch (error) { setError(error instanceof Error ? error.message : "Collections could not be saved. Please try again."); }
    finally { setSaving(false); }
  }
  return <div ref={root} className={`collections-dropdown collections-dropdown-${variant}`} data-open={open}
    onKeyDown={(event) => {
      if (open && event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault();
      if (open && event.key === "Escape") {
        event.preventDefault(); event.stopPropagation();
        if (!saving) { setOpen(false); trigger.current?.focus(); }
      }
    }}>
    <button type="button" ref={trigger} disabled={disabled && !open} className="collections-dropdown-trigger" aria-expanded={open} aria-controls={id} aria-haspopup="dialog"
      aria-label={variant === "tile" ? `Add ${recipeTitle || "recipe"} to collections` : "Choose collections"}
      title={variant === "field" ? value.join(", ") : undefined}
      onClick={() => {
        if (open) { if (!saving) setOpen(false); return; }
        if (onBeforeOpen && !onBeforeOpen()) return;
        setPending(value); setSearch(""); setNewName(""); setError(""); setOpen(true);
      }}>
      {variant === "tile" && <FolderPlus size={15} />}
      <span>{variant === "tile" ? "Add to collection" : value.length ? value.join(", ") : "Choose collections"}</span>
      <ChevronDown size={14} />
    </button>
    {open && <div id={id} className="collections-dropdown-panel" role="dialog" aria-label="Choose collections">
      <input className="collection-search" aria-label="Search collections" placeholder="Find a collection" value={search} onChange={event => setSearch(event.target.value)} disabled={saving} />
      <div className="collections-dropdown-options">
        {names.filter(name=>name.toLowerCase().includes(search.toLowerCase())).map(name =>
          <label key={name}><input type="checkbox" checked={pending.includes(name)} disabled={saving || (!pending.includes(name) && pending.length >= 30)}
            onChange={event => change(event.target.checked ? [...pending, name] : pending.filter(value => value !== name))} /><span>{name}</span></label>
        )}
        {!names.filter(name=>name.toLowerCase().includes(search.toLowerCase())).length && <p>No matching collections.</p>}
      </div>
      <div className="collections-dropdown-new">
        <input aria-label="New collection name" maxLength={80} placeholder="New collection name" value={newName} disabled={saving}
          onChange={event=>setNewName(event.target.value)}
          onKeyDown={event=>{ if(event.key==="Enter") { event.preventDefault(); addCollection(); } }} />
        <button type="button" className="icon-button" disabled={saving || !newName.trim()} onClick={addCollection} aria-label="Create and select collection"><Plus size={17} /></button>
      </div>
      {error && <p className="collections-dropdown-error" role="alert">{error}</p>}
      <div className="collections-dropdown-footer">
        <span>{pending.length ? `${pending.length} selected` : "Unfiled"}</span>
        <button type="button" className="primary" onClick={done} disabled={saving}>
          {saving && <LoaderCircle className="spin" size={14} />}{saving ? "Saving…" : onCommit ? "Save collections" : "Done"}
        </button>
      </div>
    </div>}
  </div>;
}
