/**
 * In-memory notes store.
 *
 * Notes are kept in a Map keyed by id. The store is deliberately simple: it
 * exists so the API has something real to read from and write to without
 * pulling in a database for a demo.
 */

export interface Note {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}

export interface NewNote {
  title: string;
  body?: string;
}

export class NotesStore {
  private readonly notes = new Map<string, Note>();
  private nextId = 1;

  list(): Note[] {
    return Array.from(this.notes.values()).sort((a, b) =>
      a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
    );
  }

  get(id: string): Note | undefined {
    return this.notes.get(id);
  }

  create(input: NewNote): Note {
    const note: Note = {
      id: String(this.nextId++),
      title: input.title,
      body: input.body ?? "",
      createdAt: new Date().toISOString(),
    };
    this.notes.set(note.id, note);
    return note;
  }

  clear(): void {
    this.notes.clear();
    this.nextId = 1;
  }
}
