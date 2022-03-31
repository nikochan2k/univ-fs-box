import { Data } from "univ-conv";
import {
  AbstractFile,
  getName,
  getParentPath,
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
        client.files.getReadStream(info.id, null, (err: any, stream: any) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(stream);
        });
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
      const client = await bfs._getClient();
      const name = getName(path);
      const parentPath = getParentPath(path);
      const info = await bfs._getInfo(parentPath);
      const converter = this._getConverter();
      const readable = await converter.toReadable(data, options);
      await client.files.uploadFile(info, name, readable);
    } catch (e) {
      throw bfs._error(path, e, true);
    }
  }
}
