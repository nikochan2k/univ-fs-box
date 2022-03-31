import {
  AbstractDirectory,
  EntryType,
  getName,
  getParentPath,
  Item,
} from "univ-fs";
import { BoxFileSystem, EntryInfo } from "./BoxFileSystem";

export class BoxDirectory extends AbstractDirectory {
  constructor(private bfs: BoxFileSystem, path: string) {
    super(bfs, path);
  }

  async _list(): Promise<Item[]> {
    const bfs = this.bfs;
    const path = this.path;
    try {
      const fullPath = bfs._getFullPath(path);
      const parentPath = getParentPath(fullPath);
      const parent = await bfs._getInfoFromFullPath(parentPath);
      const client = await bfs._getClient();
      const list: EntryInfo[] = await client.folders.getItems(parent?.id);
      const items: Item[] = [];
      for (const info of list) {
        if (info.item_status !== "active") {
          continue;
        }

        const item: Item = { path: path + "/" + info.name };
        const createdDate = new Date(info.created_at as string);
        const created = createdDate.getTime();
        if (!isNaN(created)) {
          item.created = created;
        }
        const modifiedDate = new Date(info.modified_at as string);
        const modified = modifiedDate.getTime();
        if (!isNaN(modified)) {
          item.modified = modified;
        }
        item.etag = info.etag as string;
        if (info.type === "file") {
          item.type = EntryType.File;
          item.size = info.size as number;
        } else {
          item.type = EntryType.Directory;
        }
        items.push(item);
      }
      return items;
    } catch (e) {
      throw bfs._error(path, e, true);
    }
  }

  async _mkcol(): Promise<void> {
    const bfs = this.bfs;
    const path = this.path;
    try {
      const client = await bfs._getClient();
      const name = getName(path);
      const parentPath = getParentPath(path);
      const info = await bfs._getInfo(parentPath);
      await client.folders.create(info.id, name);
    } catch (e) {
      throw bfs._error(path, e, true);
    }
  }

  async _rmdir(): Promise<void> {
    const bfs = this.bfs;
    const path = this.path;
    try {
      const client = await bfs._getClient();
      const info = await bfs._getInfo(path);
      await client.folders.delete(info.id, { recursive: false });
    } catch (e) {
      throw bfs._error(path, e, true);
    }
  }
}
