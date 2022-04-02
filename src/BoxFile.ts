import { Readable } from "stream";
import { Data } from "univ-conv";
import {
  AbstractFile,
  createError,
  getName,
  getParentPath,
  NotFoundError,
  ReadOptions,
  Stats,
  WriteOptions,
} from "univ-fs";
import { BoxFileSystem } from "./BoxFileSystem";

export class BoxFile extends AbstractFile {
  constructor(private bfs: BoxFileSystem, path: string) {
    super(bfs, path);
  }

  protected async _load(_stats: Stats, _options: ReadOptions): Promise<Data> {
    const bfs = this.bfs;
    const path = this.path;
    try {
      const client = await bfs._getClient();
      const info = await bfs._getInfo(path);
      return new Promise<Data>((resolve, reject) => {
        client.files.getReadStream(
          info.id,
          null,
          (err: any, stream: Readable) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(stream);
          }
        );
      });
    } catch (e) {
      throw bfs._error(path, e, true);
    }
  }

  protected async _rm(): Promise<void> {
    const bfs = this.bfs;
    const path = this.path;
    try {
      const client = await bfs._getClient();
      const info = await bfs._getInfo(path);
      await client.files.delete(info.id);
    } catch (e) {
      throw bfs._error(path, e, true);
    }
  }

  protected async _save(
    data: Data,
    _stats: Stats | undefined,
    options: WriteOptions
  ): Promise<void> {
    const bfs = this.bfs;
    const path = this.path;
    try {
      const fullPath = bfs._getFullPath(path);
      const parentPath = getParentPath(fullPath);
      const name = getName(fullPath);
      const info = await bfs._getInfoFromFullPath(parentPath);
      if (!info) {
        throw createError({
          name: NotFoundError.name,
          repository: bfs.repository,
          path,
        });
      }
      const converter = this._getConverter();
      const readable = await converter.toReadable(data, options);
      const content_length = await converter.getSize(data);
      const client = await bfs._getClient();
      await client.files.uploadFile(info.id, name, readable, {
        content_length,
      });
    } catch (e) {
      throw bfs._error(path, e, true);
    }
  }
}
