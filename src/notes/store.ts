/**
 * In-memory notes store. Every note belongs to one owner. The store does not
 * enforce access itself; the API layer checks ownership before reads and writes.
 */

export interface Note {
  id: string;
  ownerId: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface NewNote {
  ownerId: string;
  title: string;
  body?: string;
}

export interface NoteUpdate {
  title?: string;
  body?: string;
}

export class NotesStore {
  private readonly notes = new Map<string, Note>();
  private nextId = 1;

  /** Notes belonging to one owner, oldest first. */
  listByOwner(ownerId: string): Note[] {
    return Array.from(this.notes.values())
      .filter((note) => note.ownerId === ownerId)
      .sort((a, b) => Number(a.id) - Number(b.id));
  }

  get(id: string): Note | undefined {
    return this.notes.get(id);
  }

  create(input: NewNote): Note {
    const now = new Date().toISOString();
    const note: Note = {
      id: String(this.nextId++),
      ownerId: input.ownerId,
      title: input.title,
      body: input.body ?? "",
      createdAt: now,
      updatedAt: now,
    };
    this.notes.set(note.id, note);
    return note;
  }

  update(id: string, patch: NoteUpdate): Note | undefined {
    const existing = this.notes.get(id);
    if (existing === undefined) return undefined;
    const updated: Note = {
      ...existing,
      title: patch.title ?? existing.title,
      body: patch.body ?? existing.body,
      updatedAt: new Date().toISOString(),
    };
    this.notes.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    return this.notes.delete(id);
  }

  get size(): number {
    return this.notes.size;
  }

  clear(): void {
    this.notes.clear();
    this.nextId = 1;
  }
}
