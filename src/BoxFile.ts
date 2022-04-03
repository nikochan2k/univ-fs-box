import BoxClient from "box-node-sdk/lib/box-client";
import { Readable } from "stream";
import { bufferConverter, Data } from "univ-conv";
import {
  AbstractFile,
  ErrorLike,
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
    const fullPath = bfs._getFullPath(path);

    let client: BoxClient;
    let buffer: Buffer;
    try {
      client = await bfs._getClient();
      buffer = await bufferConverter().convert(data, options);
    } catch (e) {
      throw bfs._error(path, e, true);
    }

    try {
      const info = await bfs._getInfoFromFullPath(fullPath, path);
      if (options.append) {
        const head = await new Promise<Data>((resolve, reject) => {
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
        const converter = this._getConverter();
        buffer = await converter.merge([head, buffer], "buffer", options);
      }
      await client.files.uploadNewFileVersion(info.id, buffer);
      return;
    } catch (e) {
      if ((e as ErrorLike).name !== NotFoundError.name) {
        throw bfs._error(path, e, true);
      }
    }

    try {
      const parentPath = getParentPath(fullPath);
      const name = getName(fullPath);
      const parent = await bfs._getInfoFromFullPath(parentPath, path);
      await client.files.uploadFile(parent.id, name, buffer);
    } catch (e) {
      throw bfs._error(path, e, true);
    }
  }
}
